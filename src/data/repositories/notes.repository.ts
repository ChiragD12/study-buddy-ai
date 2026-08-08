import { getDb } from "@/data/db/db";
import { newId, now, timestamps } from "@/data/repositories/util";
import type { ID, Note } from "@/shared/types/domain";

export type NoteDraft = Pick<Note, "title"> &
  Partial<Omit<Note, "id" | "createdAt" | "updatedAt" | "title">>;

export interface NoteRepository {
  list(): Promise<Note[]>;
  search(query: string): Promise<Note[]>;
  get(id: ID): Promise<Note | undefined>;
  create(draft: NoteDraft): Promise<Note>;
  update(id: ID, patch: Partial<Note>): Promise<void>;
  remove(id: ID): Promise<void>;
}

export const noteRepository: NoteRepository = {
  async list() {
    return getDb().notes.orderBy("updatedAt").reverse().toArray();
  },
  async search(query) {
    const all = await noteRepository.list();
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((note) =>
      [note.title, note.content, note.subject, note.topic, ...note.tags]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q)),
    );
  },
  get(id) {
    return getDb().notes.get(id);
  },
  async create(draft) {
    const note: Note = {
      id: newId(),
      title: draft.title,
      content: draft.content ?? "",
      examId: draft.examId ?? null,
      subject: draft.subject,
      topic: draft.topic,
      tags: draft.tags ?? [],
      source: draft.source,
      confidence: draft.confidence ?? "medium",
      verification: draft.verification ?? "unverified",
      verificationHistory: draft.verificationHistory ?? [],
      ...timestamps(),
    };
    await getDb().notes.add(note);
    return note;
  },
  async update(id, patch) {
    await getDb().notes.update(id, { ...patch, updatedAt: now() });
  },
  async remove(id) {
    await getDb().notes.delete(id);
  },
};
