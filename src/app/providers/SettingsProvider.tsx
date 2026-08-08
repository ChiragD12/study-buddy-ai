import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { DEFAULT_SETTINGS, settingsRepository } from "@/data/repositories/settings.repository";
import { isBrowser } from "@/data/db/db";
import type { AppSettings } from "@/shared/types/domain";

interface SettingsContextValue {
  settings: AppSettings;
  ready: boolean;
  update: (patch: Partial<AppSettings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isBrowser) return;
    let cancelled = false;
    settingsRepository
      .get()
      .then((stored) => {
        if (!cancelled) setSettings(stored);
      })
      .catch((error) => console.error("Failed to load settings", error))
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(async (patch: Partial<AppSettings>) => {
    const next = await settingsRepository.update(patch);
    setSettings(next);
  }, []);

  const value = useMemo(() => ({ settings, ready, update }), [settings, ready, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used inside SettingsProvider");
  return context;
}
