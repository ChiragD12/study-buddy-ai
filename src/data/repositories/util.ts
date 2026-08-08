import type { ISODate } from "@/shared/types/domain";

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function now(): ISODate {
  return new Date().toISOString();
}

export function timestamps() {
  const at = now();
  return { createdAt: at, updatedAt: at };
}
