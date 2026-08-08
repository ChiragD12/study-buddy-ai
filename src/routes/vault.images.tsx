import { createFileRoute } from "@tanstack/react-router";

import { VaultView } from "@/features/vault/VaultView";

export const Route = createFileRoute("/vault/images")({
  head: () => ({
    meta: [
      { title: "Images — Exam Assistant" },
      { name: "description", content: "Images and printable sheets in your local vault." },
      { property: "og:title", content: "Images — Exam Assistant" },
      { property: "og:description", content: "Images and printable sheets in your local vault." },
    ],
  }),
  component: () => (
    <VaultView
      title="Images"
      description="Printable sheets and screenshots stored on this device."
      kind="image"
    />
  ),
});
