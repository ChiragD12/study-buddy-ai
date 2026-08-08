import { getDb } from "@/data/db/db";
import { newId, now, timestamps } from "@/data/repositories/util";
import type { CurrentAffairsItem, ID, StudyPlanEntry } from "@/shared/types/domain";

export interface CurrentAffairsRepository {
  list(): Promise<CurrentAffairsItem[]>;
  saveMany(items: CurrentAffairsItem[]): Promise<void>;
  toggleSaved(id: ID): Promise<void>;
  markRead(id: ID): Promise<void>;
  clear(): Promise<void>;
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function normalizeItem(item: CurrentAffairsItem): CurrentAffairsItem {
  const sourceUrl = item.sourceUrl ?? item.url;
  const categories = item.categories ?? item.tags;
  return {
    ...item,
    id: item.id || `current-affairs-${hash(sourceUrl ?? item.title.trim().toLowerCase())}`,
    sourceUrl,
    url: item.url ?? sourceUrl,
    categories,
    tags: item.tags.length ? item.tags : categories,
    fetchedAt: item.fetchedAt ?? now(),
    relatedExamIds: item.relatedExamIds ?? [],
  };
}

export const currentAffairsRepository: CurrentAffairsRepository = {
  async list() {
    const items = (await getDb().currentAffairs.toArray()).map(normalizeItem);
    return items.sort(
      (a, b) =>
        (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0) ||
        b.publishedAt.localeCompare(a.publishedAt),
    );
  },
  async saveMany(items) {
    const db = getDb();
    const normalized: CurrentAffairsItem[] = [];
    for (const item of items.map(normalizeItem)) {
      const existing = item.sourceUrl
        ? await db.currentAffairs.where("sourceUrl").equals(item.sourceUrl).first()
        : undefined;
      normalized.push(existing ? { ...item, id: existing.id } : item);
    }
    await db.currentAffairs.bulkPut(normalized);
  },
  async toggleSaved(id) {
    const item = await getDb().currentAffairs.get(id);
    if (!item) return;
    await getDb().currentAffairs.update(id, { savedAt: item.savedAt ? undefined : now() });
  },
  async markRead(id) {
    if (await getDb().currentAffairs.get(id))
      await getDb().currentAffairs.update(id, { readAt: now() });
  },
  async clear() {
    await getDb().currentAffairs.clear();
  },
};

export interface StudyPlanRepository {
  list(): Promise<StudyPlanEntry[]>;
  get(id: ID): Promise<StudyPlanEntry | undefined>;
  create(
    input: Pick<StudyPlanEntry, "title" | "date"> & Partial<StudyPlanEntry>,
  ): Promise<StudyPlanEntry>;
  update(id: ID, patch: Partial<StudyPlanEntry>): Promise<void>;
  toggleDone(id: ID): Promise<void>;
  remove(id: ID): Promise<void>;
  removeForExam(examId: ID): Promise<void>;
}

export const studyPlanRepository: StudyPlanRepository = {
  async list() {
    const entries = (await getDb().studyPlan.toArray()).map((entry) => ({
      ...entry,
      priority: entry.priority ?? "medium",
      completedAt: entry.completedAt ?? (entry.done ? entry.updatedAt : null),
    }));
    const priority = { high: 0, medium: 1, low: 2 };
    return entries.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        Number(a.done) - Number(b.done) ||
        priority[a.priority ?? "medium"] - priority[b.priority ?? "medium"],
    );
  },
  get(id) {
    return getDb().studyPlan.get(id);
  },
  async create(input) {
    const entry: StudyPlanEntry = {
      id: newId(),
      examId: input.examId ?? null,
      date: input.date,
      title: input.title,
      description: input.description,
      priority: input.priority ?? "medium",
      done: false,
      completedAt: null,
      minutes: input.minutes,
      ...timestamps(),
    };
    await getDb().studyPlan.add(entry);
    return entry;
  },
  async update(id, patch) {
    await getDb().studyPlan.update(id, { ...patch, updatedAt: now() });
  },
  async toggleDone(id) {
    const entry = await getDb().studyPlan.get(id);
    if (!entry) return;
    const done = !entry.done;
    await getDb().studyPlan.update(id, {
      done,
      completedAt: done ? now() : null,
      updatedAt: now(),
    });
  },
  async remove(id) {
    await getDb().studyPlan.delete(id);
  },
  async removeForExam(examId) {
    await getDb().studyPlan.where("examId").equals(examId).delete();
  },
};
