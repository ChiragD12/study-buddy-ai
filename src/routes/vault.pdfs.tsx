import { createFileRoute } from "@tanstack/react-router";

import { VaultPdfView } from "@/features/vault/VaultPdfView";

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
    <VaultPdfView title="PDFs" description="Revision sheets and documents stored on this device." />
  ),
});
