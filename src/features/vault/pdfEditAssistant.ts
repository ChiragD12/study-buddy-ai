import { resolveProvider } from "@/ai/providers";
import { AINotConfiguredError, type AIMessage, type AIProvider } from "@/ai/types";
import type { VaultPdfSection } from "@/shared/types/domain";
import type { PdfDocSpec } from "@/features/vault/pdfDoc";

export interface PdfEditResult {
  ok: boolean;
  /** Present when ok is true. */
  spec?: PdfDocSpec;
  /** Present when ok is false, or as an optional status note when ok is true. */
  message: string;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    applied: {
      type: "boolean",
      description: "True only if the instruction was safely and accurately applied.",
    },
    note: {
      type: "string",
      description:
        "One short sentence: what changed if applied is true, or why it couldn't be applied if false.",
    },
    title: { type: "string" },
    subtitle: {
      type: "string",
      description:
        "Optional secondary line under the title. Keep as-is unless the instruction asks to change it.",
    },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          heading: { type: "string" },
          paragraphs: { type: "array", items: { type: "string" } },
          bullets: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
  required: ["applied", "note", "title", "sections"],
};

interface RawResponse {
  applied?: unknown;
  note?: unknown;
  title?: unknown;
  subtitle?: unknown;
  sections?: unknown;
}

function coerceSections(value: unknown): VaultPdfSection[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const record = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const section: VaultPdfSection = {};
    if (typeof record["heading"] === "string" && record["heading"].trim()) {
      section.heading = record["heading"].trim();
    }
    if (Array.isArray(record["paragraphs"])) {
      const paragraphs = record["paragraphs"].filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0,
      );
      if (paragraphs.length) section.paragraphs = paragraphs;
    }
    if (Array.isArray(record["bullets"])) {
      const bullets = record["bullets"].filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0,
      );
      if (bullets.length) section.bullets = bullets;
    }
    return section;
  });
}

/**
 * Sends the current editable content of a Vault PDF plus one instruction to
 * the configured AI provider, and returns either the full updated document
 * (title + sections) or a message explaining why the edit couldn't be
 * applied. Never claims success on a parse failure or an explicit
 * `applied: false` from the model.
 */
export async function generatePdfEdit(
  current: PdfDocSpec,
  instruction: string,
): Promise<PdfEditResult> {
  const trimmedInstruction = instruction.trim();
  if (!trimmedInstruction) return { ok: false, message: "Enter an instruction first." };

  let provider: AIProvider | null;
  try {
    provider = await resolveProvider();
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "No AI provider is configured.",
    };
  }
  if (!provider) return { ok: false, message: new AINotConfiguredError().message };

  const system = [
    "You edit the text content of a document stored as structured JSON: a title,",
    "an optional subtitle, and an ordered list of sections, each with an optional",
    "heading, paragraphs, and bullets. You are given the CURRENT document and ONE",
    "instruction. Apply only what the instruction asks; leave everything else",
    "exactly as-is, including the subtitle if the instruction doesn't mention it.",
    "Always return the COMPLETE updated document (not just the changed part).",
    "If the instruction is unclear, unsafe, or cannot be accurately applied to",
    "this text-only structure (e.g. it asks for something outside plain",
    'text/heading/bullet content), set "applied" to false, leave the document',
    'unchanged in your response, and explain briefly in "note". Never claim',
    "success unless you actually made the requested change.",
  ].join(" ");

  const messages: AIMessage[] = [
    {
      role: "user",
      content: [
        `Current document (JSON):\n${JSON.stringify(current)}`,
        `Instruction: ${trimmedInstruction}`,
      ].join("\n\n"),
    },
  ];

  let raw: string;
  try {
    raw = await provider.generate(messages, { system, responseSchema: RESPONSE_SCHEMA });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "The AI request failed.",
    };
  }

  let parsed: RawResponse;
  try {
    parsed = JSON.parse(raw) as RawResponse;
  } catch {
    return { ok: false, message: "The assistant returned an unreadable response." };
  }

  const note =
    typeof parsed.note === "string" && parsed.note.trim()
      ? parsed.note.trim()
      : "Done — the requested changes were applied.";

  if (parsed.applied !== true) {
    return { ok: false, message: note || "That change couldn't be safely applied." };
  }

  const title =
    typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : current.title;
  const subtitle =
    typeof parsed.subtitle === "string" && parsed.subtitle.trim()
      ? parsed.subtitle.trim()
      : current.subtitle;
  const sections = coerceSections(parsed.sections);
  if (!sections.length) {
    return { ok: false, message: "The assistant returned an empty document." };
  }

  return {
    ok: true,
    spec: {
      title,
      ...(subtitle ? { subtitle } : {}),
      ...(current.columns ? { columns: current.columns } : {}),
      sections,
    },
    message: note,
  };
}
