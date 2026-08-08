import { getDb } from "@/data/db/db";
import { now } from "@/data/repositories/util";
import type { AppSettings } from "@/shared/types/domain";

export const DEFAULT_SETTINGS: AppSettings = {
  id: "app",
  appearance: "system",
  showStudySnapshotOnLaunch: true,
  activeExamId: null,
  aiProvider: "none",
  geminiModel: "gemini-2.5-flash",
  reduceMotion: false,
  updatedAt: new Date(0).toISOString(),
};

export interface SettingsRepository {
  get(): Promise<AppSettings>;
  update(patch: Partial<AppSettings>): Promise<AppSettings>;
}

export const settingsRepository: SettingsRepository = {
  async get() {
    const stored = await getDb().settings.get("app");
    return { ...DEFAULT_SETTINGS, ...stored, id: "app" };
  },
  async update(patch) {
    const next: AppSettings = {
      ...(await settingsRepository.get()),
      ...patch,
      id: "app",
      updatedAt: now(),
    };
    await getDb().settings.put(next);
    return next;
  },
};
