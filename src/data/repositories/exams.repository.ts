import { getDb } from "@/data/db/db";
import { studyPlanRepository } from "@/data/repositories/knowledge.repository";
import { newId, now, timestamps } from "@/data/repositories/util";
import type { Exam, ID } from "@/shared/types/domain";

export type ExamDraft = Pick<Exam, "name"> &
  Partial<Omit<Exam, "id" | "createdAt" | "updatedAt" | "name">>;

export interface ExamRepository {
  list(): Promise<Exam[]>;
  get(id: ID): Promise<Exam | undefined>;
  create(draft: ExamDraft): Promise<Exam>;
  update(id: ID, patch: Partial<Exam>): Promise<void>;
  remove(id: ID): Promise<void>;
  nearestUpcoming(): Promise<Exam | undefined>;
}

export const examRepository: ExamRepository = {
  async list() {
    const exams = await getDb().exams.toArray();
    return exams.sort((a, b) => (a.examDate ?? "9999").localeCompare(b.examDate ?? "9999"));
  },
  get(id) {
    return getDb().exams.get(id);
  },
  async create(draft) {
    const exam: Exam = {
      id: newId(),
      name: draft.name,
      examDate: draft.examDate ?? null,
      description: draft.description,
      priority: draft.priority ?? "medium",
      syllabus: draft.syllabus,
      sourceUrl: draft.sourceUrl,
      ...timestamps(),
    };
    await getDb().exams.add(exam);
    return exam;
  },
  async update(id, patch) {
    await getDb().exams.update(id, { ...patch, updatedAt: now() });
  },
  async remove(id) {
    const db = getDb();
    await db.transaction("rw", db.exams, db.settings, async () => {
      await db.exams.delete(id);
      await studyPlanRepository.removeForExam(id);
      const settings = await db.settings.get("app");
      if (settings?.activeExamId === id) {
        await db.settings.update("app", { activeExamId: null, updatedAt: now() });
      }
    });
  },
  async nearestUpcoming() {
    const today = new Date().toISOString().slice(0, 10);
    const exams = await examRepository.list();
    return exams.find((exam) => exam.examDate && exam.examDate >= today);
  },
};
