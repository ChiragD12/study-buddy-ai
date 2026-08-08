import type { AITool } from "@/ai/types";

/**
 * Tool registry for the future assistant orchestrator.
 *
 * Each tool must be a narrow, explicit capability (read one note, list exam
 * dates, save one document). Nothing here may pass the full database to a
 * model — callers select the minimum context required.
 */
class ToolRegistry {
  private readonly tools = new Map<string, AITool<never, unknown>>();

  register<Args, Result>(tool: AITool<Args, Result>): void {
    this.tools.set(tool.name, tool as unknown as AITool<never, unknown>);
  }

  get(name: string): AITool<never, unknown> | undefined {
    return this.tools.get(name);
  }

  list(): AITool<never, unknown>[] {
    return [...this.tools.values()];
  }
}

export const toolRegistry = new ToolRegistry();

/**
 * Planned tool namespaces. Implementations land in the matching feature
 * folders (notes, exams, current-affairs, vault, writing, documents,
 * progress, notifications) rather than in one monolithic AI service.
 */
export const PLANNED_TOOLS = [
  "notes.getById",
  "notes.search",
  "notes.verify",
  "exams.listUpcoming",
  "currentAffairs.today",
  "vault.saveDocument",
  "writing.evaluateAttempt",
  "documents.generateRevisionSheet",
  "progress.summary",
  "notifications.schedule",
] as const;
