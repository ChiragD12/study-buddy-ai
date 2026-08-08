import { getDb } from "@/data/db/db";
import { newId, now, timestamps } from "@/data/repositories/util";
import type { CurrentAffairsItem, ID, StudyPlanEntry } from "@/shared/types/domain";

export interface CurrentAffairsRepository {
  list(): Promise<CurrentAffairsItem[]>;
  saveMany(items: CurrentAffairsItem[]): Promise<void>;
  toggleSaved(id: ID): Promise<void>;
  clear(): Promise<void>;
}

export const currentAffairsRepository: CurrentAffairsRepository = {
  async list() {
    const items = await getDb().currentAffairs.toArray();
    return items.sort(
      (a, b) =>
        (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0) ||
        b.publishedAt.localeCompare(a.publishedAt),
    );
  },
  async saveMany(items) {
    await getDb().currentAffairs.bulkPut(items);
  },
  async toggleSaved(id) {
    const item = await getDb().currentAffairs.get(id);
    if (!item) return;
    await getDb().currentAffairs.update(id, { savedAt: item.savedAt ? undefined : now() });
  },
  async clear() {
    await getDb().currentAffairs.clear();
  },
};

export interface StudyPlanRepository {
  list(): Promise<StudyPlanEntry[]>;
  create(input: Pick<StudyPlanEntry, "title" | "date"> & Partial<StudyPlanEntry>): Promise<StudyPlanEntry>;
  toggleDone(id: ID): Promise<void>;
  remove(id: ID): Promise<void>;
}

export const studyPlanRepository: StudyPlanRepository = {
  async list() {
    const entries = await getDb().studyPlan.toArray();
    return entries.sort((a, b) => a.date.localeCompare(b.date));
  },
  async create(input) {
    const entry: StudyPlanEntry = {
      id: newId(),
      examId: input.examId ?? null,
      date: input.date,
      title: input.title,
      done: false,
      minutes: input.minutes,
      ...timestamps(),
    };
    await getDb().studyPlan.add(entry);
    return entry;
  },
  async toggleDone(id) {
    const entry = await getDb().studyPlan.get(id);
    if (!entry) return;
    await getDb().studyPlan.update(id, { done: !entry.done, updatedAt: now() });
  },
  async remove(id) {
    await getDb().studyPlan.delete(id);
  },
};
