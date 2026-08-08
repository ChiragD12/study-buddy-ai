import { createFileRoute } from "@tanstack/react-router";

import { VaultView } from "@/features/vault/VaultView";

export const Route = createFileRoute("/vault/saved")({
  head: () => ({
    meta: [
      { title: "Saved Material — Exam Assistant" },
      { name: "description", content: "Material you marked as favorite in the vault." },
      { property: "og:title", content: "Saved Material — Exam Assistant" },
      { property: "og:description", content: "Material you marked as favorite in the vault." },
    ],
  }),
  component: () => (
    <VaultView
      title="Saved Material"
      description="Everything you starred for quick access."
      favoritesOnly
    />
  ),
});
