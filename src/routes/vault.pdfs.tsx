import { createFileRoute } from "@tanstack/react-router";

import { VaultView } from "@/features/vault/VaultView";

export const Route = createFileRoute("/vault/pdfs")({
  head: () => ({
    meta: [
      { title: "PDFs — Exam Assistant" },
      { name: "description", content: "PDF documents saved in your local vault." },
      { property: "og:title", content: "PDFs — Exam Assistant" },
      { property: "og:description", content: "PDF documents saved in your local vault." },
    ],
  }),
  component: () => (
    <VaultView
      title="PDFs"
      description="Revision sheets and documents stored on this device."
      kind="pdf"
    />
  ),
});
