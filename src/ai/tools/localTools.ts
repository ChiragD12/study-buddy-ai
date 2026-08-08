import { daysUntil } from "@/ai/context/assistantContext";
import { examRepository } from "@/data/repositories/exams.repository";
import { studyPlanRepository } from "@/data/repositories/knowledge.repository";
import { noteRepository } from "@/data/repositories/notes.repository";
import { settingsRepository } from "@/data/repositories/settings.repository";
import { vaultRepository } from "@/data/repositories/vault.repository";
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

const tools: AITool[] = [
  {
    name: "exams.list",
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
    name: "exams.get",
    description: "Get details for one exam.",
    parameters: object({ examId: string("Exam id") }, ["examId"]),
    async execute(args: { examId: string }) {
      const exam = await examRepository.get(args.examId);
      if (!exam) return { error: "I couldn't find that exam." };
      return exam;
    },
  },
  {
    name: "exams.create",
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
      const name = typeof args.name === "string" ? args.name.trim() : "";
      if (!name) return { error: "An exam name is required." };
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
    name: "exams.update",
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
      if (!(await examRepository.get(args.examId))) return { error: "I couldn't find that exam." };
      await examRepository.update(args.examId, pick(args.patch ?? {}, editableExam));
      return { updated: true, examId: args.examId };
    },
  },
  {
    name: "exams.delete",
    description: "Delete one exam.",
    mutates: true,
    parameters: object({ examId: string("Exam id") }, ["examId"]),
    async execute(args: { examId: string }) {
      if (!(await examRepository.get(args.examId))) return { error: "I couldn't find that exam." };
      await examRepository.remove(args.examId);
      return { deleted: true, examId: args.examId };
    },
  },
  {
    name: "exams.setActive",
    description: "Set an existing exam as active.",
    mutates: true,
    parameters: object({ examId: string("Exam id") }, ["examId"]),
    async execute(args: { examId: string }) {
      if (!(await examRepository.get(args.examId))) return { error: "I couldn't find that exam." };
      await settingsRepository.update({ activeExamId: args.examId });
      return { activeExamId: args.examId };
    },
  },
  {
    name: "notes.search",
    description: "Search note titles, contents and metadata. Returns concise excerpts.",
    parameters: object({
      query: string("Search phrase"),
      examId: string("Optional exam id"),
      subject: string("Optional subject"),
      topic: string("Optional topic"),
      tags: { type: "array", items: { type: "string" } },
    }),
    async execute(args: ToolArgs) {
      let notes = await noteRepository.search(typeof args.query === "string" ? args.query : "");
      if (typeof args.examId === "string") notes = notes.filter((n) => n.examId === args.examId);
      const subject = typeof args.subject === "string" ? args.subject : undefined;
      const topic = typeof args.topic === "string" ? args.topic : undefined;
      if (subject) notes = notes.filter((n) => n.subject?.toLowerCase() === subject.toLowerCase());
      if (topic) notes = notes.filter((n) => n.topic?.toLowerCase() === topic.toLowerCase());
      if (Array.isArray(args.tags))
        notes = notes.filter((n) => (args.tags as string[]).every((tag) => n.tags.includes(tag)));
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
    name: "notes.get",
    description: "Get one explicitly requested note.",
    parameters: object({ noteId: string("Note id") }, ["noteId"]),
    async execute(args: { noteId: string }) {
      const note = await noteRepository.get(args.noteId);
      return note ?? { error: "I couldn't find that note." };
    },
  },
  {
    name: "notes.create",
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
      const title = typeof args.title === "string" ? args.title.trim() : "";
      if (!title) return { error: "A note title is required." };
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
    name: "notes.update",
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
        }),
      },
      ["noteId", "patch"],
    ),
    async execute(args: { noteId: string; patch: Record<string, unknown> }) {
      if (!(await noteRepository.get(args.noteId))) return { error: "I couldn't find that note." };
      await noteRepository.update(args.noteId, pick(args.patch ?? {}, editableNote));
      return { updated: true, noteId: args.noteId };
    },
  },
  {
    name: "notes.delete",
    description: "Delete one note.",
    mutates: true,
    parameters: object({ noteId: string("Note id") }, ["noteId"]),
    async execute(args: { noteId: string }) {
      if (!(await noteRepository.get(args.noteId))) return { error: "I couldn't find that note." };
      await noteRepository.remove(args.noteId);
      return { deleted: true, noteId: args.noteId };
    },
  },
  {
    name: "vault.search",
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
    name: "vault.get",
    description: "Get Vault metadata for one item, without file data.",
    parameters: object({ vaultItemId: string("Vault item id") }, ["vaultItemId"]),
    async execute(args: { vaultItemId: string }) {
      const item = await vaultRepository.get(args.vaultItemId);
      if (!item) return { error: "I couldn't find that file." };
      const { blobKey: _blobKey, ...metadata } = item;
      return metadata;
    },
  },
  {
    name: "vault.save",
    description: "Save supplied text as a local Vault text file.",
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
        return { error: "A file name and text content are required." };
      const item = await vaultRepository.addBlob(
        args.name,
        new Blob([args.content], { type: "text/plain" }),
        {
          kind: "text",
          tags: Array.isArray(args.tags) ? (args.tags as string[]) : [],
          examId: typeof args.examId === "string" ? args.examId : null,
        },
      );
      return { item: { id: item.id, name: item.name, kind: item.kind } };
    },
  },
  {
    name: "studyPlan.list",
    description: "List local study-plan entries.",
    parameters: object({
      examId: string("Optional exam id"),
      date: string("Optional YYYY-MM-DD date"),
    }),
    async execute(args: ToolArgs) {
      let entries = await studyPlanRepository.list();
      if (typeof args.examId === "string")
        entries = entries.filter((e) => e.examId === args.examId);
      if (typeof args.date === "string")
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
    name: "studyPlan.create",
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
    name: "studyPlan.complete",
    description: "Mark one study-plan entry complete or incomplete.",
    mutates: true,
    parameters: object({ entryId: string("Entry id") }, ["entryId"]),
    async execute(args: { entryId: string }) {
      const entry = (await studyPlanRepository.list()).find((item) => item.id === args.entryId);
      if (!entry) return { error: "I couldn't find that study-plan entry." };
      await studyPlanRepository.toggleDone(args.entryId);
      return { updated: true, entryId: args.entryId };
    },
  },
  {
    name: "studyPlan.delete",
    description: "Delete one study-plan entry.",
    mutates: true,
    parameters: object({ entryId: string("Entry id") }, ["entryId"]),
    async execute(args: { entryId: string }) {
      const entry = (await studyPlanRepository.list()).find((item) => item.id === args.entryId);
      if (!entry) return { error: "I couldn't find that study-plan entry." };
      await studyPlanRepository.remove(args.entryId);
      return { deleted: true, entryId: args.entryId };
    },
  },
];

for (const tool of tools) toolRegistry.register(tool);
export const localTools = tools;
