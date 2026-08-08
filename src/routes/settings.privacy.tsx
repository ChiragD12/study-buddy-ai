import { createFileRoute } from "@tanstack/react-router";

import { PageContainer, PageHeader } from "@/shared/components/Page";

export const Route = createFileRoute("/settings/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy — Exam Assistant" },
      { name: "description", content: "Exactly what this app stores, and where it stays." },
      { property: "og:title", content: "Privacy — Exam Assistant" },
      { property: "og:description", content: "Exactly what this app stores, and where it stays." },
    ],
  }),
  component: PrivacyPage,
});

const FACTS = [
  {
    title: "No accounts, no cloud database",
    body: "There is no sign-in and no server-side copy of your data. Exams, notes, writing, files and chat history live in this device's IndexedDB.",
  },
  {
    title: "Your Gemini key stays local",
    body: "The key is kept in this device's local storage and used only for direct browser-to-Google requests. It is excluded from backups.",
  },
  {
    title: "AI requests leave the device",
    body: "When you use the assistant, the messages you send go to Google's API. Nothing else is transmitted.",
  },
  {
    title: "Push is opt-in and minimal",
    body: "If you enable notifications, only the browser's push subscription is sent to the endpoint you configure. Your study content is never sent with it.",
  },
  {
    title: "Clearing browser data deletes everything",
    body: "Because storage is local, wiping site data or deleting the installed app removes your study history. Export backups regularly.",
  },
];

function PrivacyPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Privacy"
        description="Short version: your study data does not leave this device unless you ask it to."
      />
      <ul className="flex flex-col gap-3">
        {FACTS.map((fact) => (
          <li key={fact.title} className="surface-card p-5">
            <h2 className="text-sm font-semibold">{fact.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{fact.body}</p>
          </li>
        ))}
      </ul>
    </PageContainer>
  );
}
