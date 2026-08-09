import type { IncomingMessage, ServerResponse } from "node:http";
import { XMLParser } from "fast-xml-parser";

/**
 * Server-side RSS/Atom retrieval + normalization for the Current Affairs
 * feature.
 *
 * This exists purely to work around browser CORS restrictions on arbitrary
 * RSS endpoints — publishers do not send `Access-Control-Allow-Origin`
 * headers on their feeds, so the client cannot fetch them directly. It is a
 * thin, stateless proxy/parser: no database, no auth, no third-party
 * service. Deployed as a Vercel serverless function at
 * `/api/current-affairs/feeds`.
 *
 * IMPORTANT — this file is deployed by Vercel as an isolated serverless
 * function and must be fully self-contained at runtime. It must NOT import
 * anything from `../../src/**`: those files are part of the frontend
 * application bundle, not the deployed function's dependency graph, and
 * importing them causes `ERR_MODULE_NOT_FOUND` in production. The feed
 * allowlist and the HTML-to-plain-text sanitizer are therefore inlined
 * below rather than imported. If the app-side feed registry
 * (`src/features/current-affairs/feeds.ts`) ever changes, mirror the
 * change here too.
 *
 * Only URLs already present in the allowlist below may be fetched, so this
 * cannot be used as an open URL-fetching proxy.
 */

const FETCH_TIMEOUT_MS = 10_000;
const MAX_SUMMARY_LENGTH = 600;
const REQUEST_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; ExamAssistantCurrentAffairs/1.0; +https://lovable.dev)",
  Accept:
    "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
};

/**
 * Verified public RSS/Atom sources used by the generic ingestion pipeline.
 * Mirrors `src/features/current-affairs/feeds.ts` — kept as a local,
 * inlined allowlist so this serverless function has no runtime dependency
 * on the frontend source tree (see file header).
 */
export const CURRENT_AFFAIRS_FEED_URLS: readonly string[] = [
  "https://indianexpress.com/section/upsc-current-affairs/feed/",
  "https://indianexpress.com/section/explained/feed/",
  "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=5",
  "https://www.thehindu.com/news/national/feeder/default.rss",
  "https://www.thehindu.com/news/international/feeder/default.rss",
  "https://www.thehindu.com/sport/feeder/default.rss",
  "https://www.thehindu.com/business/feeder/default.rss",
  "https://www.thehindu.com/sci-tech/feeder/default.rss",
  "https://www.thehindu.com/sci-tech/energy-and-environment/feeder/default.rss",
];

export interface NormalizedFeedItem {
  guid?: string | undefined;
  title: string;
  url: string;
  summary: string;
  publishedAt?: string | undefined;
  author?: string | undefined;
  imageUrl?: string | undefined;
}

interface FeedResponseBody {
  source?: string | undefined;
  items?: NormalizedFeedItem[] | undefined;
  error?: string | undefined;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  cdataPropName: false,
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (tagName) => tagName === "item" || tagName === "entry" || tagName === "link",
});

function sendJson(res: ServerResponse, status: number, body: FeedResponseBody): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

// ---------------------------------------------------------------------------
// HTML → plain text sanitization (inlined from src/shared/utils/html.ts so
// this function has no runtime dependency on the frontend source tree).
// Pure string logic only — no DOM APIs, never renders HTML, never used with
// `dangerouslySetInnerHTML`. Only produces plain text for the JSON response.
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

const ENTITY_PATTERN = /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g;

/** Decodes one layer of named/numeric HTML entities. */
function decodeEntitiesOnce(value: string): string {
  return value.replace(ENTITY_PATTERN, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith("#")) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

/**
 * Decodes HTML entities, including entities that have been double-encoded
 * by an upstream feed (e.g. `&amp;#124;` → `&#124;` → `|`). Bounded to a
 * handful of passes so it can never loop indefinitely on malformed input,
 * and stops as soon as a pass makes no further change.
 */
function decodeEntities(value: string): string {
  let current = value;
  for (let pass = 0; pass < 5; pass++) {
    const next = decodeEntitiesOnce(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

/**
 * Strips all markup (including script/style contents and HTML comments)
 * and returns normalized, whitespace-collapsed plain text. Never executes
 * or otherwise trusts the input — safe to include directly in the JSON
 * response as plain text.
 */
function htmlToPlainText(html: string | undefined | null): string {
  if (!html) return "";
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, " ");
  const withoutDangerousBlocks = withoutComments
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withoutTags = withoutDangerousBlocks.replace(/<[^>]*>/g, " ");
  const decoded = decodeEntities(withoutTags);
  return decoded.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// XML node helpers
// ---------------------------------------------------------------------------

/**
 * Unwraps fast-xml-parser's `{ "#text": ... }` shape, plain strings/numbers,
 * and arrays of any of the above (joining multiple text nodes, which can
 * occur for repeated elements or mixed-content nodes).
 */
function textOf(node: unknown): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) {
    return node
      .map((entry) => textOf(entry))
      .filter((text) => text.length > 0)
      .join(" ");
  }
  if (typeof node === "object") {
    const record = node as Record<string, unknown>;
    if ("#text" in record) return textOf(record["#text"]);
    // Some feeds wrap CDATA/mixed content without a `#text` key (e.g. a
    // `content:encoded` node that only ever contains character data ends up
    // parsed as a bare string already handled above; this guards other
    // object shapes fast-xml-parser may produce for the same tag).
    if ("__cdata" in record) return textOf(record["__cdata"]);
  }
  return "";
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max).trimEnd()}…`;
}

/**
 * Recursively extracts all human-readable text from a parsed XML node, for
 * use specifically by summary/description extraction (see `summarize` /
 * `extractDescriptionSource` below). This is deliberately separate from
 * `textOf` above, which other fields (guid, author, dates, links) rely on
 * and which only unwraps the single-level `#text`/CDATA shapes those simple
 * fields ever take — changing it would risk affecting logic outside summary
 * extraction.
 *
 * Summary/description fields, unlike those simple fields, commonly arrive
 * in shapes `textOf` does not unwrap:
 *   - a plain string (handled the same as `textOf`)
 *   - `{ "#text": ... }` (handled the same as `textOf`)
 *   - arrays of either of the above (handled the same as `textOf`)
 *   - a genuinely nested XML parser object — e.g. a feed that emits
 *     `<description><p>...</p></description>` as real child elements
 *     instead of an escaped string or CDATA blob, which fast-xml-parser
 *     parses into `{ p: "..." }` (or deeper) with *no* top-level `#text`
 *     key at all. `textOf` returns "" for this shape since it only looks
 *     for `#text`/`__cdata`; this function instead walks every own
 *     property of the node (skipping `@_`-prefixed attributes, which are
 *     structural, not prose) and concatenates whatever text it finds at
 *     any depth.
 */
function deepTextOf(node: unknown): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) {
    return node
      .map((entry) => deepTextOf(entry))
      .filter((text) => text.length > 0)
      .join(" ");
  }
  if (typeof node === "object") {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key.startsWith("@_")) continue; // attributes are structural, not prose text
      const text = deepTextOf(value);
      if (text) parts.push(text);
    }
    return parts.join(" ");
  }
  return "";
}

function summarize(html: unknown): string {
  return truncate(htmlToPlainText(deepTextOf(html)), MAX_SUMMARY_LENGTH);
}

/** Returns the first candidate whose extracted text is non-empty. */
function firstNonEmpty(...candidates: unknown[]): unknown {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    if (textOf(candidate).trim()) return candidate;
  }
  return undefined;
}

/**
 * Same selection logic as `firstNonEmpty`, but used only for picking among
 * summary/description candidate fields, where emptiness must be judged by
 * `deepTextOf` rather than `textOf` — otherwise a candidate whose text only
 * exists in a nested XML sub-element (see `deepTextOf` above) would be
 * wrongly skipped as empty, and a later, worse candidate (or nothing) would
 * be picked instead. Left as a separate function so `firstNonEmpty` itself
 * — shared with non-summary logic like image extraction — is untouched.
 */
function firstNonEmptySummarySource(...candidates: unknown[]): unknown {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    if (deepTextOf(candidate).trim()) return candidate;
  }
  return undefined;
}

function parseDate(value: unknown): string | undefined {
  const raw = textOf(value);
  if (!raw) return undefined;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function isImageUrl(url: string | undefined, type: string | undefined): boolean {
  if (!url) return false;
  if (type && type.toLowerCase().startsWith("image")) return true;
  return /\.(jpe?g|png|gif|webp|avif)(\?.*)?$/i.test(url);
}

/**
 * Best-effort fallback: pulls the first `<img src="...">` out of an
 * HTML fragment (e.g. `content:encoded` or `description`). Only ever
 * returns an absolute http(s) URL — never renders or otherwise trusts the
 * surrounding markup.
 */
function extractImageFromHtml(html: unknown): string | undefined {
  const text = textOf(html);
  if (!text) return undefined;
  const match = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i.exec(text);
  if (!match) return undefined;
  const url = match[1]?.trim();
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

/** Best-effort image extraction from common RSS/Atom media conventions. */
function extractImage(item: Record<string, unknown>): string | undefined {
  const enclosure = item["enclosure"] as Record<string, unknown> | undefined;
  if (enclosure) {
    const url = textOf(enclosure["@_url"]);
    if (isImageUrl(url, textOf(enclosure["@_type"]))) return url;
  }
  const mediaContent = item["media:content"];
  const mediaCandidates = Array.isArray(mediaContent) ? mediaContent : [mediaContent];
  for (const candidate of mediaCandidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    const url = textOf(record["@_url"]);
    if (isImageUrl(url, textOf(record["@_type"] ?? record["@_medium"]))) return url;
  }
  const mediaThumbnail = item["media:thumbnail"] as Record<string, unknown> | undefined;
  if (mediaThumbnail) {
    const url = textOf(mediaThumbnail["@_url"]);
    if (url) return url;
  }
  const links = item["link"];
  if (Array.isArray(links)) {
    for (const link of links) {
      if (!link || typeof link !== "object") continue;
      const record = link as Record<string, unknown>;
      const rel = textOf(record["@_rel"]);
      const type = textOf(record["@_type"]);
      const href = textOf(record["@_href"]);
      if (rel === "enclosure" && isImageUrl(href, type)) return href;
      // Some Atom feeds tag a preview image via rel="image" or type="image/*"
      // on a plain <link> without marking it as an enclosure.
      if (rel === "image" && isImageUrl(href, type)) return href;
    }
  }
  // Fall back to any <img> found in the item's HTML body content.
  return extractImageFromHtml(
    firstNonEmpty(item["content:encoded"], item["content"], item["description"], item["summary"]),
  );
}

/**
 * RSS `<link>` is plain text; Atom `<link>` is one or more elements with
 * `href`/`rel` attributes.
 *
 * The XML parser's `isArray` option forces every `link` tag into an array
 * (required so multiple Atom `<link>` elements aren't collapsed into one),
 * which means RSS's single plain-text `<link>url</link>` also arrives here
 * as an array — but of bare strings/`#text` nodes, not `@_href` objects.
 * This must handle both array shapes, not just the Atom one, or every RSS
 * item silently loses its URL and gets filtered out downstream.
 */
function extractLink(item: Record<string, unknown>): string {
  const link = item["link"];
  if (typeof link === "string") return link.trim();
  if (
    link &&
    typeof link === "object" &&
    !Array.isArray(link) &&
    "#text" in (link as Record<string, unknown>)
  ) {
    return textOf(link);
  }
  if (Array.isArray(link)) {
    const entries = link.filter((entry): entry is unknown => entry !== null && entry !== undefined);

    // Prefer a proper Atom-style link object (rel="alternate", or the first
    // one with no rel at all — both conventionally the canonical article URL).
    const objectEntries = entries.filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === "object" && !Array.isArray(entry),
    );
    const alternate = objectEntries.find((entry) => textOf(entry["@_rel"]) === "alternate");
    const first = objectEntries.find((entry) => !entry["@_rel"] || textOf(entry["@_rel"]) === "");
    const chosenObject = alternate ?? first ?? objectEntries[0];
    if (chosenObject) {
      const href = textOf(chosenObject["@_href"]) || textOf(chosenObject);
      if (href) return href;
    }

    // Fall back to a bare string/`#text` entry — the RSS 2.0 shape, where
    // `<link>` has no attributes and the array only exists because of the
    // parser's isArray option.
    for (const entry of entries) {
      const text = textOf(entry);
      if (text) return text.trim();
    }
  }
  return "";
}

function extractGuid(item: Record<string, unknown>): string | undefined {
  if ("guid" in item) {
    const value = textOf(item["guid"]);
    if (value) return value;
  }
  if ("id" in item) {
    const value = textOf(item["id"]);
    if (value) return value;
  }
  return undefined;
}

function extractAuthor(item: Record<string, unknown>): string | undefined {
  const dcCreator = textOf(item["dc:creator"]);
  if (dcCreator) return dcCreator;
  const author = item["author"];
  if (typeof author === "string") {
    // RSS often uses "email@example.com (Display Name)".
    const match = /\(([^)]+)\)/.exec(author);
    return (match?.[1] ?? author).trim() || undefined;
  }
  if (author && typeof author === "object") {
    const name = textOf((author as Record<string, unknown>)["name"]);
    return name || textOf(author) || undefined;
  }
  return undefined;
}

/**
 * Picks the best available description/body field for the item summary.
 * `description`/`summary` are preferred (they're already summary-length in
 * most feeds); `content:encoded`/`content`/`dc:description` are fallbacks
 * for feeds that only populate the full-body field.
 */
function extractDescriptionSource(item: Record<string, unknown>): unknown {
  return firstNonEmptySummarySource(
    item["description"],
    item["summary"],
    item["content:encoded"],
    item["content"],
    item["dc:description"],
  );
}

/**
 * Normalizes a raw `item`/`entry` node (or nodes) into a plain array of
 * object records, regardless of whether the parser produced an array, a
 * single bare object, or nothing at all. The `isArray` option on the
 * parser already forces `item`/`entry` to be arrays in practice, but this
 * does not assume that — a differently-shaped or single-element feed must
 * still parse correctly.
 */
function asRecordArray(node: unknown): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    return node.filter(
      (entry): entry is Record<string, unknown> => !!entry && typeof entry === "object",
    );
  }
  if (node && typeof node === "object") return [node as Record<string, unknown>];
  return [];
}

interface NormalizeResult {
  items: NormalizedFeedItem[];
  /** Raw entry count before filtering, for internal diagnostics only. */
  rawCount: number;
  /** Per-reason counts of why a raw entry didn't make it into `items`. */
  skipped: { missingUrl: number; missingTitle: number; error: number };
}

function normalizeItems(rawItems: unknown): NormalizeResult {
  const items = asRecordArray(rawItems);
  const normalized: NormalizedFeedItem[] = [];
  const skipped = { missingUrl: 0, missingTitle: 0, error: 0 };

  for (const item of items) {
    try {
      const url = extractLink(item);
      const title = htmlToPlainText(textOf(item["title"]));
      if (!url) {
        skipped.missingUrl += 1;
        continue;
      }
      if (!title) {
        skipped.missingTitle += 1;
        continue;
      }
      const guid = extractGuid(item);
      const publishedAt = parseDate(
        item["pubDate"] ?? item["dc:date"] ?? item["published"] ?? item["updated"],
      );
      const author = extractAuthor(item);
      const imageUrl = extractImage(item);
      normalized.push({
        ...(guid !== undefined ? { guid } : {}),
        title,
        url,
        summary: summarize(extractDescriptionSource(item)),
        ...(publishedAt !== undefined ? { publishedAt } : {}),
        ...(author !== undefined ? { author } : {}),
        ...(imageUrl !== undefined ? { imageUrl } : {}),
      });
    } catch {
      // One malformed entry must not break the rest of the feed.
      skipped.error += 1;
    }
  }
  return { items: normalized, rawCount: items.length, skipped };
}

/**
 * Logs internal diagnostics (server logs only — never part of the JSON
 * response) when a feed had raw entries but none of them survived
 * normalization, so an unexpected/malformed upstream XML shape can be
 * identified from Vercel function logs rather than failing silently.
 */
function logIfSuspiciouslyEmpty(feedUrl: string, result: NormalizeResult): void {
  if (result.rawCount > 0 && result.items.length === 0) {
    console.error(
      `[current-affairs] Parsed 0 items from ${result.rawCount} raw entries for ${feedUrl}. ` +
        `Skipped — missingUrl: ${result.skipped.missingUrl}, missingTitle: ${result.skipped.missingTitle}, error: ${result.skipped.error}.`,
    );
  }
}

/**
 * Exported so api/notifications/run.ts can parse the same feeds with
 * identical normalization instead of a second, drifting implementation.
 */
export function parseFeed(
  xml: string,
  feedUrl: string,
): { source?: string | undefined; items: NormalizedFeedItem[] } {
  const document = xmlParser.parse(xml) as Record<string, unknown>;
  const rss = document["rss"] as Record<string, unknown> | undefined;
  const channel = rss?.["channel"] as Record<string, unknown> | undefined;
  if (channel) {
    const source = textOf(channel["title"]) || undefined;
    const result = normalizeItems(channel["item"]);
    logIfSuspiciouslyEmpty(feedUrl, result);
    return { ...(source !== undefined ? { source } : {}), items: result.items };
  }
  const feed = document["feed"] as Record<string, unknown> | undefined;
  if (feed) {
    const source = textOf(feed["title"]) || undefined;
    const result = normalizeItems(feed["entry"]);
    logIfSuspiciouslyEmpty(feedUrl, result);
    return { ...(source !== undefined ? { source } : {}), items: result.items };
  }
  throw new Error("Unrecognized feed format (expected RSS 2.0 or Atom).");
}

/** Exported for reuse by api/notifications/run.ts (see parseFeed above). */
export async function fetchFeedXml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: REQUEST_HEADERS,
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Upstream feed responded with ${response.status}.`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method && req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  const requestUrl = new URL(req.url ?? "", "http://localhost");
  const feedUrl = requestUrl.searchParams.get("url");
  if (!feedUrl) {
    sendJson(res, 400, { error: "Missing required `url` query parameter." });
    return;
  }

  const allowed = CURRENT_AFFAIRS_FEED_URLS.includes(feedUrl);
  if (!allowed) {
    sendJson(res, 403, { error: "This URL is not a configured Current Affairs feed." });
    return;
  }

  try {
    const xml = await fetchFeedXml(feedUrl);
    const { source, items } = parseFeed(xml, feedUrl);
    sendJson(res, 200, { source, items });
  } catch (error) {
    sendJson(res, 502, {
      error: error instanceof Error ? error.message : "Failed to retrieve or parse this feed.",
    });
  }
}
