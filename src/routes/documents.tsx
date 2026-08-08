import { createFileRoute } from "@tanstack/react-router";
import { Download, FileText, Printer, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  a4PdfGenerator,
  type DocumentSection,
  type DocumentSpec,
  type DocumentTemplate,
  type GeneratedDocument,
} from "@/features/documents/documentGenerator";
import { examRepository } from "@/data/repositories/exams.repository";
import { noteRepository } from "@/data/repositories/notes.repository";
import { writingRepository } from "@/data/repositories/writing.repository";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, PageContainer, PageHeader } from "@/shared/components/Page";
import { useRepoQuery } from "@/shared/hooks/useRepoQuery";
import type { Exam, Note, WritingPrompt } from "@/shared/types/domain";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "Documents — Exam Assistant" },
      { name: "description", content: "Create printable study documents from local data." },
    ],
  }),
  component: DocumentsPage,
});

const TEMPLATES: { value: DocumentTemplate; label: string; description: string }[] = [
  {
    value: "printable-notes",
    label: "Study Notes",
    description: "Selected notes in a clean printable layout.",
  },
  {
    value: "revision-sheet",
    label: "Exam Revision Sheet",
    description: "Exam details plus selected notes for revision.",
  },
  {
    value: "writing-exercise",
    label: "Answer-Writing Compilation",
    description: "Selected writing prompts and briefs.",
  },
];

function DocumentsPage() {
  const exams = useRepoQuery(() => examRepository.list());
  const notes = useRepoQuery(() => noteRepository.list());
  const prompts = useRepoQuery(() => writingRepository.listPrompts());
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState<DocumentTemplate>("printable-notes");
  const [selectedExam, setSelectedExam] = useState("");
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
  const [selectedPrompts, setSelectedPrompts] = useState<string[]>([]);
  const [document, setDocument] = useState<GeneratedDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const available = exams !== undefined && notes !== undefined && prompts !== undefined;

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const selectedExamRecord = useMemo(
    () => exams?.find((exam) => exam.id === selectedExam),
    [exams, selectedExam],
  );

  function toggleSelection(value: string, values: string[], setValues: (next: string[]) => void) {
    setValues(
      values.includes(value) ? values.filter((item) => item !== value) : [...values, value],
    );
  }

  function buildSections(): DocumentSection[] {
    const sections: DocumentSection[] = [];
    if (template === "revision-sheet" && selectedExamRecord)
      sections.push(examSection(selectedExamRecord));
    if (template !== "writing-exercise") {
      for (const note of (notes ?? []).filter((item) => selectedNotes.includes(item.id)))
        sections.push(noteSection(note));
    }
    if (template === "writing-exercise") {
      for (const prompt of (prompts ?? []).filter((item) => selectedPrompts.includes(item.id)))
        sections.push(promptSection(prompt));
    }
    return sections;
  }

  async function generate() {
    const sections = buildSections();
    if (!title.trim()) {
      toast.error("Give the document a title first.");
      return;
    }
    if (!sections.length) {
      toast.error("There's no content available for this document.");
      return;
    }
    try {
      const subtitle = TEMPLATES.find((item) => item.value === template)?.label;
      const result = await a4PdfGenerator.generate({
        title: title.trim(),
        template,
        sections,
        ...(subtitle ? { subtitle } : {}),
      });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setDocument(result);
      setPreviewUrl(URL.createObjectURL(result.blob));
      toast.success("Document generated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to generate the document.");
    }
  }

  function download() {
    if (!document) return;
    const url = URL.createObjectURL(document.blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = document.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Documents"
        description="Create a printable document from data you select on this device."
      />
      {!available ? <p className="text-sm text-muted-foreground">Loading local sources…</p> : null}
      {available && !exams?.length && !notes?.length && !prompts?.length ? (
        <EmptyState
          icon={<FileText className="size-6" />}
          title="No source data yet"
          description="Add an exam, note, or answer-writing prompt before creating a document."
        />
      ) : null}
      <div className="surface-card space-y-5 p-5">
        <div className="space-y-2">
          <Label htmlFor="document-title">Document title</Label>
          <Input
            id="document-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Polity revision notes"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="document-template">Document type</Label>
          <select
            id="document-template"
            value={template}
            onChange={(event) => setTemplate(event.target.value as DocumentTemplate)}
            className="tap-target w-full rounded-xl border bg-surface px-3 text-sm"
          >
            {TEMPLATES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <p className="text-sm text-muted-foreground">
            {TEMPLATES.find((item) => item.value === template)?.description}
          </p>
        </div>
        {template === "revision-sheet" ? (
          <SourceExam exams={exams ?? []} value={selectedExam} onChange={setSelectedExam} />
        ) : null}
        {template !== "writing-exercise" ? (
          <SourceNotes
            notes={notes ?? []}
            selected={selectedNotes}
            onToggle={(id) => toggleSelection(id, selectedNotes, setSelectedNotes)}
          />
        ) : null}
        {template === "writing-exercise" ? (
          <SourcePrompts
            prompts={prompts ?? []}
            selected={selectedPrompts}
            onToggle={(id) => toggleSelection(id, selectedPrompts, setSelectedPrompts)}
          />
        ) : null}
        <Button className="tap-target" onClick={() => void generate()} disabled={!available}>
          <FileText className="size-4" /> Generate document
        </Button>
      </div>
      {document && previewUrl ? (
        <Preview
          document={document}
          previewUrl={previewUrl}
          onDownload={download}
          onClose={() => setDocument(null)}
        />
      ) : null}
    </PageContainer>
  );
}

function SourceExam({
  exams,
  value,
  onChange,
}: {
  exams: Exam[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="document-exam">Exam source</Label>
      {exams.length ? (
        <select
          id="document-exam"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="tap-target w-full rounded-xl border bg-surface px-3 text-sm"
        >
          <option value="">Choose an exam</option>
          {exams.map((exam) => (
            <option key={exam.id} value={exam.id}>
              {exam.name}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-sm text-muted-foreground">No exams available to include.</p>
      )}
    </div>
  );
}

function SourceNotes({
  notes,
  selected,
  onToggle,
}: {
  notes: Note[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Note sources</Label>
      {notes.length ? (
        <div className="max-h-64 space-y-2 overflow-auto rounded-xl border p-3">
          {notes.map((note) => (
            <label key={note.id} className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(note.id)}
                onChange={() => onToggle(note.id)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                <strong>{note.title || "Untitled note"}</strong>
                <span className="block text-muted-foreground">
                  {note.subject || note.topic || "Local note"}
                </span>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No notes available to include.</p>
      )}
    </div>
  );
}

function SourcePrompts({
  prompts,
  selected,
  onToggle,
}: {
  prompts: WritingPrompt[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Answer-writing sources</Label>
      {prompts.length ? (
        <div className="max-h-64 space-y-2 overflow-auto rounded-xl border p-3">
          {prompts.map((prompt) => (
            <label key={prompt.id} className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(prompt.id)}
                onChange={() => onToggle(prompt.id)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                <strong>{prompt.title}</strong>
                <span className="block text-muted-foreground">{prompt.brief || prompt.format}</span>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No answer-writing content available.</p>
      )}
    </div>
  );
}

function examSection(exam: Exam): DocumentSection {
  return {
    heading: exam.name,
    paragraphs: [
      `Exam date: ${exam.examDate ?? "Not set"}`,
      `Priority: ${exam.priority}`,
      ...(exam.description ? [exam.description] : []),
    ],
    ...(exam.syllabus ? { bullets: [exam.syllabus] } : {}),
  };
}
function noteSection(note: Note): DocumentSection {
  return {
    heading: note.title || "Untitled note",
    paragraphs: [note.content],
    bullets: [
      note.subject,
      note.topic,
      note.tags.length ? `Tags: ${note.tags.join(", ")}` : "",
    ].filter(Boolean) as string[],
  };
}
function promptSection(prompt: WritingPrompt): DocumentSection {
  return {
    heading: prompt.title,
    paragraphs: [prompt.brief || "No brief provided."],
    bullets: [
      `Track: ${prompt.track}`,
      `Format: ${prompt.format}`,
      ...(prompt.wordLimit ? [`Word limit: ${prompt.wordLimit}`] : []),
    ],
  };
}

function Preview({
  document,
  previewUrl,
  onDownload,
  onClose,
}: {
  document: GeneratedDocument;
  previewUrl: string;
  onDownload: () => void;
  onClose: () => void;
}) {
  return (
    <div className="surface-card mt-6 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b p-4">
        <div>
          <h2 className="font-semibold">Preview</h2>
          <p className="text-xs text-muted-foreground">{document.filename} · print-ready HTML</p>
        </div>
        <button
          type="button"
          aria-label="Close preview"
          onClick={onClose}
          className="tap-target inline-flex items-center justify-center rounded-xl hover:bg-accent"
        >
          <X className="size-4" />
        </button>
      </div>
      <iframe title="Document preview" src={previewUrl} className="h-[70dvh] w-full bg-white" />
      <div className="flex flex-wrap gap-2 border-t p-4">
        <Button className="tap-target" onClick={onDownload}>
          <Download className="size-4" /> Download
        </Button>
        <Button variant="secondary" className="tap-target" onClick={() => window.print()}>
          <Printer className="size-4" /> Print / save as PDF
        </Button>
      </div>
    </div>
  );
}
