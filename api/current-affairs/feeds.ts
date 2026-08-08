import { XMLParser } from "fast-xml-parser";

interface ApiRequest {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
}
interface ApiResponse {
  status(code: number): ApiResponse;
  json(payload: unknown): void;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const MAX_ITEMS = 30;
const TIMEOUT_MS = 12_000;

function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) return String(value["#text"] ?? "");
  return "";
}

function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeLink(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return text((value as { "@_href"?: unknown })["@_href"]);
  return "";
}

function clean(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "GET") {
    response.status(405).json({ ok: false, error: "GET required." });
    return;
  }
  const rawUrl = request.query?.["url"];
  const url = Array.isArray(rawUrl) ? rawUrl[0] : rawUrl;
  if (!url || !/^https:\/\//i.test(url)) {
    response.status(400).json({ ok: false, error: "A public HTTPS feed URL is required." });
    return;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const feedResponse = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
    });
    clearTimeout(timeout);
    if (!feedResponse.ok) throw new Error(`Feed returned HTTP ${feedResponse.status}.`);
    const parsed = parser.parse(await feedResponse.text()) as Record<string, unknown>;
    const rss = parsed["rss"] as Record<string, unknown> | undefined;
    const channel = rss?.["channel"] as Record<string, unknown> | undefined;
    const atom = parsed["feed"] as Record<string, unknown> | undefined;
    const source = clean(text(first(channel?.["title"] ?? atom?.["title"])));
    const rawItems = channel?.["item"] ?? atom?.["entry"] ?? [];
    const items = (Array.isArray(rawItems) ? rawItems : [rawItems])
      .slice(0, MAX_ITEMS)
      .map((item) => {
        const record = item as Record<string, unknown>;
        const link = normalizeLink(first(record["link"]) ?? record["guid"]);
        const title = clean(text(record["title"]));
        const summary = clean(
          text(record["description"] ?? record["summary"] ?? record["content"]),
        );
        const publishedAt = text(record["pubDate"] ?? record["published"] ?? record["updated"]);
        return {
          title,
          summary: summary.slice(0, 1200),
          url: link,
          source,
          publishedAt,
          guid: text(record["guid"] ?? record["id"]),
        };
      })
      .filter((item) => item.title && /^https?:\/\//i.test(item.url));
    response.status(200).json({ ok: true, source, items });
  } catch (error) {
    response.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : "Feed could not be read.",
    });
  }
}
