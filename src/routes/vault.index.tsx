import { createFileRoute } from "@tanstack/react-router";

import { VaultView } from "@/features/vault/VaultView";

export const Route = createFileRoute("/vault/")({
  head: () => ({
    meta: [
      { title: "Vault — Exam Assistant" },
      { name: "description", content: "All your locally stored study files in one place." },
      { property: "og:title", content: "Vault — Exam Assistant" },
      { property: "og:description", content: "All your locally stored study files in one place." },
    ],
  }),
  component: () => (
    <VaultView
      title="All Files"
      description="Imported notes, generated sheets and saved material — stored locally in IndexedDB."
    />
  ),
});
