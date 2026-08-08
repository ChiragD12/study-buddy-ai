import { daysUntil } from "@/ai/context/assistantContext";
import { getVaultContent, VaultContentUnavailableError } from "@/ai/context/vaultContent";
import { examRepository } from "@/data/repositories/exams.repository";
import { studyPlanRepository } from "@/data/repositories/knowledge.repository";
import { currentAffairsRepository } from "@/data/repositories/knowledge.repository";
import { noteRepository } from "@/data/repositories/notes.repository";
import { settingsRepository } from "@/data/repositories/settings.repository";
import { vaultRepository } from "@/data/repositories/vault.repository";
import { writingRepository } from "@/data/repositories/writing.repository";
import { toolRegistry } from "@/ai/tools/registry";
import type { AITool } from "@/ai/types";
import type { ExamPriority, VaultKind } from "@/shared/types/domain";

const object = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
});
const string = (description: string) => ({ type: "string", description });
const excerpt = (text: string) => text.replace(/\s+/g, " ").slice(0, 280);
const editableExam = [
  "name",
  "examDate",
  "description",
  "priority",
  "syllabus",
  "sourceUrl",
] as const;
const editableNote = [
  "title",
  "content",
  "examId",
  "subject",
  "topic",
  "tags",
  "source",
  "confidence",
  "verification",
] as const;

interface ToolArgs extends Record<string, unknown> {
  name?: unknown;
  priority?: unknown;
  query?: unknown;
  examId?: unknown;
  subject?: unknown;
  topic?: unknown;
  tags?: unknown;
  title?: unknown;
  content?: unknown;
  kind?: unknown;
  favoritesOnly?: unknown;
  date?: unknown;
  minutes?: unknown;
}

function pick(source: Record<string, unknown>, keys: readonly string[]) {
  return Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]));
}

function requiredString(args: Record<string, unknown>, key: string, label: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${key} must be text.`);
  return value.trim() || undefined;
}

function stringArray(args: Record<string, unknown>, key: string): string[] {
  const value = args[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    throw new Error(`${key} must be a list of text values.`);
  return value.map((item) => item.trim()).filter(Boolean);
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("A patch object is required.");
  return value as Record<string, unknown>;
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`));
}

function vaultResults(items: Awaited<ReturnType<typeof vaultRepository.list>>) {
  return items
    .slice(0, 20)
    .map(({ id, name, kind, mimeType, sizeBytes, tags, favorite, examId }) => ({
      id,
      name,
      kind,
      mimeType,
      sizeBytes,
      tags,
      favorite,
      examId,
    }));
}

const tools: AITool[] = [
  {
    name: "examsList",
    description: "List the user's exams with active status and countdown.",
    parameters: object({}),
    async execute() {
      const settings = await settingsRepository.get();
      const exams = await examRepository.list();
      return {
        results: exams.map((e) => ({
          id: e.id,
          name: e.name,
          examDate: e.examDate,
          priority: e.priority,
          active: e.id === settings.activeExamId,
          daysRemaining: daysUntil(e.examDate),
        })),
      };
    },
  },
  {
    name: "examsActive",
    description: "Get the user's currently active exam.",
    parameters: object({}),
    async execute() {
      const settings = await settingsRepository.get();
      if (!settings.activeExamId) return { error: "There is no active exam selected." };
      const exam = await examRepository.get(settings.activeExamId);
      return exam ?? { error: "The active exam could not be found." };
    },
  },
  {
    name: "examsNearest",
    description: "Get the nearest upcoming exam and its countdown.",
    parameters: object({}),
    async execute() {
      const exam = await examRepository.nearestUpcoming();
      if (!exam) return { error: "There are no upcoming exams." };
      return { ...exam, daysRemaining: daysUntil(exam.examDate) };
    },
  },
  {
    name: "examsGet",
    description: "Get details for one exam.",
    parameters: object({ examId: string("Exam id") }, ["examId"]),
    async execute(args: { examId: string }) {
      const exam = await examRepository.get(requiredString(args, "examId", "Exam id"));
      if (!exam) return { error: "I couldn't find that exam." };
      return exam;
    },
  },
  {
    name: "examsCreate",
    description: "Create an exam.",
    mutates: true,
    parameters: object(
      {
        name: string("Exam name"),
        examDate: string("YYYY-MM-DD, optional"),
        description: string("Optional description"),
        priority: { type: "string", enum: ["low", "medium", "high"] },
        syllabus: string("Optional syllabus"),
        sourceUrl: string("Optional source URL"),
      },
      ["name"],
    ),
    async execute(args: ToolArgs) {
      const name = optionalString(args, "name") ?? "";
      if (!name) return { error: "An exam name is required." };
      if (args.priority !== undefined && !["low", "medium", "high"].includes(String(args.priority)))
        return { error: "Priority must be low, medium or high." };
      return {
        exam: await examRepository.create({
          ...pick(args, editableExam),
          name,
          priority: args.priority as ExamPriority | undefined,
        } as never),
      };
    },
  },
  {
    name: "examsUpdate",
    description: "Update editable fields on an existing exam.",
    mutates: true,
    parameters: object(
      {
        examId: string("Exam id"),
        patch: object({
          name: string("Name"),
          examDate: string("Date"),
          description: string("Description"),
          priority: { type: "string", enum: ["low", "medium", "high"] },
          syllabus: string("Syllabus"),
          sourceUrl: string("Source URL"),
        }),
      },
      ["examId", "patch"],
    ),
    async execute(args: { examId: string; patch: Record<string, unknown> }) {
      const examId = requiredString(args, "examId", "Exam id");
      if (!(await examRepository.get(examId))) return { error: "I couldn't find that exam." };
      await examRepository.update(examId, pick(objectRecord(args.patch), editableExam));
      return { updated: true, examId };
    },
  },
  {
    name: "examsDelete",
    description: "Delete one exam.",
    mutates: true,
    parameters: object({ examId: string("Exam id") }, ["examId"]),
    async execute(args: { examId: string }) {
      const examId = requiredString(args, "examId", "Exam id");
      if (!(await examRepository.get(examId))) return { error: "I couldn't find that exam." };
      await examRepository.remove(examId);
      return { deleted: true, examId };
    },
  },
  {
    name: "examsSetActive",
    description: "Set an existing exam as active.",
    mutates: true,
    parameters: object({ examId: string("Exam id") }, ["examId"]),
    async execute(args: { examId: string }) {
      const examId = requiredString(args, "examId", "Exam id");
      if (!(await examRepository.get(examId))) return { error: "I couldn't find that exam." };
      await settingsRepository.update({ activeExamId: examId });
      return { activeExamId: examId };
    },
  },
  {
    name: "examsClearActive",
    description: "Clear the user's active exam selection.",
    mutates: true,
    parameters: object({}),
    async execute() {
      await settingsRepository.update({ activeExamId: null });
      return { activeExamId: null };
    },
  },
  {
    name: "notesSearch",
    description: "Search or list note titles, contents and metadata. Returns concise excerpts.",
    parameters: object(
      {
        query: string("Search phrase"),
        examId: string("Optional exam id"),
        subject: string("Optional subject"),
        topic: string("Optional topic"),
        tags: { type: "array", items: { type: "string" } },
      },
      [],
    ),
    async execute(args: ToolArgs) {
      let notes = await noteRepository.search(typeof args.query === "string" ? args.query : "");
      if (typeof args.examId === "string") notes = notes.filter((n) => n.examId === args.examId);
      const subject = typeof args.subject === "string" ? args.subject : undefined;
      const topic = typeof args.topic === "string" ? args.topic : undefined;
      if (subject) notes = notes.filter((n) => n.subject?.toLowerCase() === subject.toLowerCase());
      if (topic) notes = notes.filter((n) => n.topic?.toLowerCase() === topic.toLowerCase());
      const tags = stringArray(args, "tags");
      if (tags.length) notes = notes.filter((n) => tags.every((tag) => n.tags.includes(tag)));
      return {
        results: notes.slice(0, 12).map((n) => ({
          id: n.id,
          title: n.title,
          subject: n.subject,
          topic: n.topic,
          tags: n.tags,
          excerpt: excerpt(n.content),
        })),
      };
    },
  },
  {
    name: "notesGet",
    description: "Get one explicitly requested note.",
    parameters: object({ noteId: string("Note id") }, ["noteId"]),
    async execute(args: { noteId: string }) {
      const note = await noteRepository.get(requiredString(args, "noteId", "Note id"));
      return note ?? { error: "I couldn't find that note." };
    },
  },
  {
    name: "notesCreate",
    description: "Create a local note.",
    mutates: true,
    parameters: object(
      {
        title: string("Title"),
        content: string("Note content"),
        examId: string("Optional exam id"),
        subject: string("Optional subject"),
        topic: string("Optional topic"),
        tags: { type: "array", items: { type: "string" } },
        source: string("Optional source"),
      },
      ["title", "content"],
    ),
    async execute(args: ToolArgs) {
      const title = optionalString(args, "title") ?? "";
      if (!title) return { error: "A note title is required." };
      if (typeof args.content !== "string" || !args.content.trim())
        return { error: "Note content is required." };
      return {
        note: await noteRepository.create({
          ...pick(args, editableNote),
          title,
          content: typeof args.content === "string" ? args.content : "",
        } as never),
      };
    },
  },
  {
    name: "notesUpdate",
    description: "Update selected editable fields on a note.",
    mutates: true,
    parameters: object(
      {
        noteId: string("Note id"),
        patch: object({
          title: string("Title"),
          content: string("Content"),
          examId: string("Exam id"),
          subject: string("Subject"),
          topic: string("Topic"),
          tags: { type: "array", items: { type: "string" } },
          source: string("Source"),
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          verification: { type: "string", enum: ["unverified", "pending", "verified", "flagged"] },
        }),
      },
      ["noteId", "patch"],
    ),
    async execute(args: { noteId: string; patch: Record<string, unknown> }) {
      const noteId = requiredString(args, "noteId", "Note id");
      const note = await noteRepository.get(noteId);
      if (!note) return { error: "I couldn't find that note." };
      const patch = objectRecord(args.patch);
      if (
        patch["confidence"] !== undefined &&
        !["low", "medium", "high"].includes(String(patch["confidence"]))
      )
        return { error: "Confidence must be low, medium or high." };
      if (
        patch["verification"] !== undefined &&
        !["unverified", "pending", "verified", "flagged"].includes(String(patch["verification"]))
      )
        return { error: "Verification must be unverified, pending, verified or flagged." };
      const updatePatch = pick(patch, editableNote);
      if (patch["tags"] !== undefined)
        updatePatch["tags"] = stringArray({ tags: patch["tags"] }, "tags");
      if (patch["verification"] && patch["verification"] !== note.verification) {
        updatePatch["verificationHistory"] = [
          ...note.verificationHistory,
          {
            at: new Date().toISOString(),
            status: patch["verification"],
            summary: "Set manually by the user.",
          },
        ];
      }
      await noteRepository.update(noteId, updatePatch);
      return { updated: true, noteId };
    },
  },
  {
    name: "notesDelete",
    description: "Delete one note.",
    mutates: true,
    parameters: object({ noteId: string("Note id") }, ["noteId"]),
    async execute(args: { noteId: string }) {
      const noteId = requiredString(args, "noteId", "Note id");
      if (!(await noteRepository.get(noteId))) return { error: "I couldn't find that note." };
      await noteRepository.remove(noteId);
      return { deleted: true, noteId };
    },
  },
  {
    name: "vaultSearch",
    description: "Search Vault metadata only; never returns file contents.",
    parameters: object({
      query: string("Search phrase"),
      kind: { type: "string", enum: ["pdf", "image", "text", "note-export", "other"] },
      favoritesOnly: { type: "boolean" },
    }),
    async execute(args: ToolArgs) {
      const items = await vaultRepository.list({
        query: typeof args.query === "string" ? args.query : "",
        ...(typeof args.kind === "string" ? { kind: args.kind as VaultKind } : {}),
        favoritesOnly: args.favoritesOnly === true,
      });
      return {
        results: items
          .slice(0, 20)
          .map(({ id, name, kind, mimeType, sizeBytes, tags, favorite, examId }) => ({
            id,
            name,
            kind,
            mimeType,
            sizeBytes,
            tags,
            favorite,
            examId,
          })),
      };
    },
  },
  {
    name: "vaultListPdfs",
    description: "List PDF metadata in the user's Vault without reading file contents.",
    parameters: object({}),
    async execute() {
      return { results: vaultResults(await vaultRepository.list({ kind: "pdf" })) };
    },
  },
  {
    name: "vaultListImages",
    description: "List image metadata in the user's Vault without reading file contents.",
    parameters: object({}),
    async execute() {
      return { results: vaultResults(await vaultRepository.list({ kind: "image" })) };
    },
  },
  {
    name: "vaultListSaved",
    description: "List favorited Vault metadata without reading file contents.",
    parameters: object({}),
    async execute() {
      return { results: vaultResults(await vaultRepository.list({ favoritesOnly: true })) };
    },
  },
  {
    name: "vaultGet",
    description: "Get Vault metadata for one item, without file data.",
    parameters: object({ vaultItemId: string("Vault item id") }, ["vaultItemId"]),
    async execute(args: { vaultItemId: string }) {
      const item = await vaultRepository.get(requiredString(args, "vaultItemId", "Vault item id"));
      if (!item) return { error: "I couldn't find that file." };
      const { blobKey: _blobKey, ...metadata } = item;
      return metadata;
    },
  },
  {
    name: "vaultReadContent",
    description:
      "Read the actual text/content of a Vault file. Use this when answering questions about " +
      "what a PDF or image contains. This may perform PDF text extraction or OCR.",
    parameters: object({ vaultItemId: string("Vault item id") }, ["vaultItemId"]),
    async execute(args: { vaultItemId: string }) {
      const vaultItemId = requiredString(args, "vaultItemId", "Vault item id");
      try {
        const { text, method, cached, truncated } = await getVaultContent(vaultItemId);
        return { vaultItemId, method, cached, truncated, content: text };
      } catch (error) {
        return {
          error:
            error instanceof VaultContentUnavailableError
              ? error.message
              : "Unable to extract readable text from this file.",
        };
      }
    },
  },
  {
    name: "vaultSave",
    description:
      "Save supplied text as a local Vault text file. On success, returns " +
      "{ saved: 1, results: [item] }; the saved count is always 1 for this tool " +
      "(it saves exactly one file per call). On failure, returns { saved: 0, error }.",
    mutates: true,
    parameters: object(
      {
        name: string("File name"),
        content: string("Text content"),
        tags: { type: "array", items: { type: "string" } },
        examId: string("Optional exam id"),
      },
      ["name", "content"],
    ),
    async execute(args: ToolArgs) {
      if (typeof args.name !== "string" || typeof args.content !== "string")
        return { saved: 0, error: "A file name and text content are required." };
      const item = await vaultRepository.addBlob(
        args.name,
        new Blob([args.content], { type: "text/plain" }),
        {
          kind: "text",
          tags: Array.isArray(args.tags) ? (args.tags as string[]) : [],
          examId: typeof args.examId === "string" ? args.examId : null,
        },
      );
      // Mirror the { results: [...] } shape every other vault tool returns
      // (see vaultResults() above) so the model has one consistent, countable
      // convention to read from instead of inferring a count from a bare
      // { item } object — that mismatch was the source of the tool reporting
      // "Saved 0 file(s)" even when the save succeeded.
      return { saved: 1, results: [{ id: item.id, name: item.name, kind: item.kind }] };
    },
  },
  {
    name: "vaultToggleFavorite",
    description: "Favorite or unfavorite one Vault item.",
    mutates: true,
    parameters: object({ vaultItemId: string("Vault item id") }, ["vaultItemId"]),
    async execute(args: { vaultItemId: string }) {
      const vaultItemId = requiredString(args, "vaultItemId", "Vault item id");
      const item = await vaultRepository.get(vaultItemId);
      if (!item) return { error: "I couldn't find that file." };
      await vaultRepository.toggleFavorite(vaultItemId);
      return { vaultItemId, favorite: !item.favorite };
    },
  },
  {
    name: "vaultDelete",
    description: "Delete one Vault item and its local file data.",
    mutates: true,
    parameters: object({ vaultItemId: string("Vault item id") }, ["vaultItemId"]),
    async execute(args: { vaultItemId: string }) {
      const vaultItemId = requiredString(args, "vaultItemId", "Vault item id");
      if (!(await vaultRepository.get(vaultItemId))) return { error: "I couldn't find that file." };
      await vaultRepository.remove(vaultItemId);
      return { deleted: true, vaultItemId };
    },
  },
  {
    name: "currentAffairsSaved",
    description: "List saved current-affairs metadata from the local database.",
    parameters: object({}),
    async execute() {
      const items = (await currentAffairsRepository.list()).filter((item) => item.savedAt);
      return {
        results: items
          .slice(0, 20)
          .map(({ id, title, summary, source, publishedAt, categories }) => ({
            id,
            title,
            summary: excerpt(summary),
            source,
            publishedAt,
            categories,
          })),
      };
    },
  },
  {
    name: "studyPlanList",
    description: "List local study-plan entries.",
    parameters: object({
      examId: string("Optional exam id"),
      date: string("Optional YYYY-MM-DD date"),
    }),
    async execute(args: ToolArgs) {
      let entries = await studyPlanRepository.list();
      if (typeof args.examId === "string")
        entries = entries.filter((e) => e.examId === args.examId);
      if (typeof args.date === "string" && validDate(args.date))
        entries = entries.filter((e) => e.date.slice(0, 10) === args.date);
      return {
        results: entries.map((e) => ({
          id: e.id,
          title: e.title,
          date: e.date,
          minutes: e.minutes,
          examId: e.examId,
          done: e.done,
        })),
      };
    },
  },
  {
    name: "progressSummary",
    description:
      "Summarize actual local study-plan completion and exam counts; no invented metrics.",
    parameters: object({}),
    async execute() {
      const [entries, exams, notes, prompts] = await Promise.all([
        studyPlanRepository.list(),
        examRepository.list(),
        noteRepository.list(),
        writingRepository.listPrompts(),
      ]);
      const today = new Date().toISOString().slice(0, 10);
      return {
        exams: {
          total: exams.length,
          upcoming: exams.filter((exam) => exam.examDate && exam.examDate >= today).length,
        },
        notes: { total: notes.length },
        writingPrompts: { total: prompts.length },
        studyPlan: {
          total: entries.length,
          completed: entries.filter((entry) => entry.done).length,
          upcoming: entries.filter((entry) => !entry.done && entry.date.slice(0, 10) >= today)
            .length,
        },
      };
    },
  },
  {
    name: "studyPlanCreate",
    description: "Create a local study-plan entry.",
    mutates: true,
    parameters: object(
      {
        title: string("Task title"),
        date: string("YYYY-MM-DD"),
        minutes: { type: "number" },
        examId: string("Optional exam id"),
      },
      ["title", "date"],
    ),
    async execute(args: ToolArgs) {
      if (typeof args.title !== "string" || typeof args.date !== "string")
        return { error: "A title and date are required." };
      if (!args.title.trim() || !validDate(args.date))
        return { error: "A non-empty title and valid YYYY-MM-DD date are required." };
      return {
        entry: await studyPlanRepository.create({
          title: args.title,
          date: args.date,
          minutes: typeof args.minutes === "number" ? args.minutes : undefined,
          examId: typeof args.examId === "string" ? args.examId : null,
        }),
      };
    },
  },
  {
    name: "studyPlanComplete",
    description: "Mark one study-plan entry complete or incomplete.",
    mutates: true,
    parameters: object({ entryId: string("Entry id") }, ["entryId"]),
    async execute(args: { entryId: string }) {
      const entryId = requiredString(args, "entryId", "Study-plan entry id");
      const entry = (await studyPlanRepository.list()).find((item) => item.id === entryId);
      if (!entry) return { error: "I couldn't find that study-plan entry." };
      await studyPlanRepository.toggleDone(entryId);
      return { updated: true, entryId };
    },
  },
  {
    name: "studyPlanDelete",
    description: "Delete one study-plan entry.",
    mutates: true,
    parameters: object({ entryId: string("Entry id") }, ["entryId"]),
    async execute(args: { entryId: string }) {
      const entryId = requiredString(args, "entryId", "Study-plan entry id");
      const entry = (await studyPlanRepository.list()).find((item) => item.id === entryId);
      if (!entry) return { error: "I couldn't find that study-plan entry." };
      await studyPlanRepository.remove(entryId);
      return { deleted: true, entryId };
    },
  },
];

for (const tool of tools) toolRegistry.register(tool);
export const localTools = tools;
