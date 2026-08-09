import type { IncomingMessage, ServerResponse } from "node:http";
import { XMLParser } from "fast-xml-parser";

import { CURRENT_AFFAIRS_FEEDS } from "../../src/features/current-affairs/feeds";
import { htmlToPlainText } from "../../src/shared/utils/html";

/**
 * Server-side RSS/Atom retrieval + normalization for the Current Affairs
 * feature.
 *
 * This exists purely to work around browser CORS restrictions on arbitrary
 * RSS endpoints — publishers do not send `Access-Control-Allow-Origin`
 * headers on their feeds, so the client cannot fetch them directly. It is a
 * thin, stateless proxy/parser: no database, no auth, no third-party
 * service. Deployed as a Vercel serverless function at
 * `/api/current-affairs/feeds`, matching this project's existing
 * `api/**` TypeScript config and its planned Vercel-function architecture
 * for server-side work (see README's notifications section).
 *
 * Only URLs already present in the app's own feed registry may be fetched
 * (an allowlist), so this cannot be used as an open URL-fetching proxy.
 */

const FETCH_TIMEOUT_MS = 10_000;
const MAX_SUMMARY_LENGTH = 600;
const REQUEST_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; ExamAssistantCurrentAffairs/1.0; +https://lovable.dev)",
  Accept:
    "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
};

interface NormalizedFeedItem {
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

function summarize(html: unknown): string {
  return truncate(htmlToPlainText(textOf(html)), MAX_SUMMARY_LENGTH);
}

/** Returns the first candidate whose extracted text is non-empty. */
function firstNonEmpty(...candidates: unknown[]): unknown {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    if (textOf(candidate).trim()) return candidate;
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

/** RSS `<link>` is a plain string; Atom `<link>` is one or more elements with `href`/`rel`. */
function extractLink(item: Record<string, unknown>): string {
  const link = item["link"];
  if (typeof link === "string") return link.trim();
  if (link && typeof link === "object" && "#text" in (link as Record<string, unknown>)) {
    return textOf(link);
  }
  if (Array.isArray(link)) {
    const entries = link.filter(
      (entry): entry is Record<string, unknown> => !!entry && typeof entry === "object",
    );
    const alternate = entries.find((entry) => textOf(entry["@_rel"]) === "alternate");
    const first = entries.find((entry) => !entry["@_rel"] || textOf(entry["@_rel"]) === "");
    const chosen = alternate ?? first ?? entries[0];
    if (chosen) return textOf(chosen["@_href"]) || textOf(chosen);
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
  return firstNonEmpty(
    item["description"],
    item["summary"],
    item["content:encoded"],
    item["content"],
    item["dc:description"],
  );
}

function normalizeItems(items: Record<string, unknown>[]): NormalizedFeedItem[] {
  const normalized: NormalizedFeedItem[] = [];
  for (const item of items) {
    try {
      const url = extractLink(item);
      const title = htmlToPlainText(textOf(item["title"]));
      if (!url || !title) continue;
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
    }
  }
  return normalized;
}

function parseFeed(xml: string): { source?: string | undefined; items: NormalizedFeedItem[] } {
  const document = xmlParser.parse(xml) as Record<string, unknown>;
  const rss = document["rss"] as Record<string, unknown> | undefined;
  const channel = rss?.["channel"] as Record<string, unknown> | undefined;
  if (channel) {
    const items = Array.isArray(channel["item"])
      ? (channel["item"] as Record<string, unknown>[])
      : [];
    const source = textOf(channel["title"]) || undefined;
    return { ...(source !== undefined ? { source } : {}), items: normalizeItems(items) };
  }
  const feed = document["feed"] as Record<string, unknown> | undefined;
  if (feed) {
    const entries = Array.isArray(feed["entry"])
      ? (feed["entry"] as Record<string, unknown>[])
      : [];
    const source = textOf(feed["title"]) || undefined;
    return { ...(source !== undefined ? { source } : {}), items: normalizeItems(entries) };
  }
  throw new Error("Unrecognized feed format (expected RSS 2.0 or Atom).");
}

async function fetchFeedXml(url: string): Promise<string> {
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

  const allowed = CURRENT_AFFAIRS_FEEDS.some((feed) => feed.url === feedUrl);
  if (!allowed) {
    sendJson(res, 403, { error: "This URL is not a configured Current Affairs feed." });
    return;
  }

  try {
    const xml = await fetchFeedXml(feedUrl);
    const { source, items } = parseFeed(xml);
    sendJson(res, 200, { source, items });
  } catch (error) {
    sendJson(res, 502, {
      error: error instanceof Error ? error.message : "Failed to retrieve or parse this feed.",
    });
  }
}
