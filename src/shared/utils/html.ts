/**
 * Minimal, dependency-free HTML → plain text normalizer for untrusted
 * content (RSS/Atom descriptions). This never renders HTML and is never
 * passed to `dangerouslySetInnerHTML` — it only produces safe plain text
 * for display in React text nodes.
 *
 * Pure string logic only (no DOM APIs), so it can run in both the browser
 * and a Node.js serverless function.
 */

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

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
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
 * Strips all markup (including script/style contents and HTML comments)
 * and returns normalized, whitespace-collapsed plain text. Safe to render
 * directly as text — never returns markup.
 */
export function htmlToPlainText(html: string | undefined | null): string {
  if (!html) return "";
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, " ");
  const withoutDangerousBlocks = withoutComments
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withoutTags = withoutDangerousBlocks.replace(/<[^>]*>/g, " ");
  const decoded = decodeEntities(withoutTags);
  return decoded.replace(/\s+/g, " ").trim();
}
