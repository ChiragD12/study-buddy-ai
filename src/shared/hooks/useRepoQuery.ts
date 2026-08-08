import { useLiveQuery } from "dexie-react-hooks";

import { isBrowser } from "@/data/db/db";

/**
 * Reactive read helper. Returns `undefined` while loading or during SSR, so
 * components can render a skeleton/empty state without touching Dexie.
 */
export function useRepoQuery<T>(query: () => Promise<T>, deps: unknown[] = []): T | undefined {
  return useLiveQuery(() => (isBrowser ? query() : Promise.resolve(undefined as T)), deps);
}
