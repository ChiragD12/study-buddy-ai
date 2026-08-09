/**
 * Core domain models. These are storage-agnostic: repositories map them to
 * Dexie tables, backups serialise them, and AI tools consume narrow slices.
 */

export type ID = string;
export type ISODate = string;

export type ExamPriority = "low" | "medium" | "high";

export interface Exam {
  id: ID;
  name: string;
  examDate: ISODate | null;
  description?: string | undefined;
  priority: ExamPriority;
  syllabus?: string | undefined;
  sourceUrl?: string | undefined;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type NoteVerification = "unverified" | "pending" | "verified" | "flagged";
export type NoteConfidence = "low" | "medium" | "high";

/** Only ever produced for a claim the verifier is confident is wrong or stale. */
export type NoteVerificationFindingStatus = "incorrect" | "outdated";

export interface NoteVerificationFinding {
  /** Short excerpt of the user's original wording the finding applies to. */
  claim: string;
  status: NoteVerificationFindingStatus;
  /** Compact correction, e.g. "India became a republic on 26 January 1950." */
  correction: string;
}

export interface NoteVerificationEntry {
  at: ISODate;
  status: NoteVerification;
  summary?: string | undefined;
  provider?: string | undefined;
  /**
   * Per-claim results for an automatic factual-verification run (see
   * ai/context/noteVerification.ts). Only "incorrect"/"outdated" claims are
   * ever recorded — a clean note gets an entry with no findings, never a
   * "this looks correct" annotation. Absent for manual status changes and
   * for entries written before this field existed.
   */
  findings?: NoteVerificationFinding[] | undefined;
  /**
   * Hash of the exact title+content this entry verified, so a later run can
   * tell the note hasn't changed and skip re-verifying it. Absent for
   * manual status changes.
   */
  contentHash?: string | undefined;
}

export interface Note {
  id: ID;
  title: string;
  content: string;
  examId?: ID | null | undefined;
  subject?: string | undefined;
  topic?: string | undefined;
  tags: string[];
  source?: string | undefined;
  confidence: NoteConfidence;
  verification: NoteVerification;
  verificationHistory: NoteVerificationEntry[];
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type WritingTrack = "english" | "civil-services";
export type WritingFormat =
  "letter" | "precis" | "essay" | "comprehension" | "gs-answer" | "structured-answer" | "other";

/** Simple manual lifecycle for a writing prompt's working answer. */
export type WritingStatus = "not-started" | "in-progress" | "completed";

export interface WritingPrompt {
  id: ID;
  title: string;
  brief?: string | undefined;
  track: WritingTrack;
  format: WritingFormat;
  /** Free-text subject/topic tag, e.g. "Polity", "Economy". */
  topic?: string | undefined;
  status: WritingStatus;
  wordLimit?: number | undefined;
  timeLimitMinutes?: number | undefined;
  examId?: ID | null | undefined;
  /**
   * The live working answer, autosaved as the user types so it survives a
   * refresh or navigating away. Distinct from the append-only attempt
   * history below, which only grows when the user explicitly saves a
   * snapshot.
   */
  draftContent?: string | undefined;
  draftUpdatedAt?: ISODate | undefined;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface WritingAttempt {
  id: ID;
  promptId: ID;
  content: string;
  wordCount: number;
  durationSeconds: number;
  /** Populated later by an optional AI evaluation run. Never overwritten silently. */
  evaluation?: {
    provider: string;
    at: ISODate;
    summary: string;
    strengths: string[];
    improvements: string[];
  };
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type VaultKind = "pdf" | "image" | "text" | "note-export" | "other";

/**
 * Fixed subject taxonomy for the Vault's subject tabs (see
 * `features/vault/VaultView.tsx`). Metadata on `VaultItem` only — subject
 * does not change how/where a file is physically stored.
 */
export type VaultSubject =
  | "history"
  | "polity"
  | "geography"
  | "economy"
  | "environment"
  | "science-tech"
  | "current-affairs"
  | "haryana"
  | "punjab";

/** Display order for subject tabs. */
export const VAULT_SUBJECTS: VaultSubject[] = [
  "history",
  "polity",
  "geography",
  "economy",
  "environment",
  "science-tech",
  "current-affairs",
  "haryana",
  "punjab",
];

export const VAULT_SUBJECT_LABELS: Record<VaultSubject, string> = {
  history: "History",
  polity: "Polity",
  geography: "Geography",
  economy: "Economy",
  environment: "Environment",
  "science-tech": "Science & Technology",
  "current-affairs": "Current Affairs",
  haryana: "Haryana",
  punjab: "Punjab",
};

/**
 * How a Vault PDF's bytes came to exist. Only meaningful for
 * `kind === "pdf"`; this is what the AI PDF editor (see
 * features/vault/VaultPdfView.tsx) uses to decide whether an
 * application-owned, re-editable source exists for a given PDF:
 *  - "generated": rendered by this app itself from structured content it
 *    owns (e.g. Notes content, or the result of a previous AI edit) via
 *    features/vault/pdfDoc.ts. The one kind the AI editor can regenerate.
 *  - "image": produced by converting an uploaded image into a PDF wrapper.
 *    Viewable/downloadable, but there's no editable text source — never
 *    semantically editable.
 *  - "external": an arbitrary uploaded PDF (or a scan), whose bytes were
 *    never produced by this app. Viewable/downloadable, never editable.
 */
export type VaultPdfSourceType = "generated" | "image" | "external";

export interface VaultItem {
  id: ID;
  name: string;
  kind: VaultKind;
  mimeType: string;
  sizeBytes: number;
  tags: string[];
  examId?: ID | null | undefined;
  favorite: boolean;
  /** Key into the blobs table; absent for metadata-only records. */
  blobKey?: string | undefined;
  /**
   * Provenance for `kind === "pdf"` items — see `VaultPdfSourceType`.
   * Undefined for non-PDF items, and for PDFs that predate this field
   * (treated the same as "external": not assumed editable).
   */
  sourceType?: VaultPdfSourceType | undefined;
  /**
   * Best-effort subject classification (see `VaultSubject`), used by the
   * Vault's subject tabs. Undefined for items that predate this field or
   * that automatic classification couldn't confidently place — those items
   * remain fully valid and are shown under the "Uncategorized" tab rather
   * than being hidden or forced into a guessed subject.
   */
  subject?: VaultSubject | undefined;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface VaultBlob {
  key: string;
  blob: Blob;
}

/**
 * Editable structured representation of a Vault PDF's text content.
 *
 * Only exists for PDFs the app generated itself (`VaultItem.sourceType ===
 * "generated"`) — it is written directly by whatever produced the PDF
 * (Notes → PDF generation, or a previous AI edit) and is always the
 * authoritative source, never re-derived from the rendered PDF bytes. Every
 * subsequent AI edit reads and rewrites this record, then a real PDF is
 * regenerated from it via features/vault/pdfDoc.ts. One record per Vault
 * PDF item (keyed by vaultItemId). PDFs without a matching row here (image
 * conversions, arbitrary uploads) have no editable source and the AI editor
 * does not attempt to fabricate one for them.
 */
export interface VaultPdfSection {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface VaultPdfDoc {
  /** Primary key — the owning VaultItem's id. One doc per Vault PDF item. */
  vaultItemId: ID;
  title: string;
  /** Optional secondary line under the title (e.g. the source template's label, or exam context). */
  subtitle?: string | undefined;
  /** Layout hint carried through from generation; not yet rendered by either the print/HTML path or the PDF renderer. */
  columns?: 1 | 2 | undefined;
  sections: VaultPdfSection[];
  updatedAt: ISODate;
}

/** How VaultContent.text was obtained. */
export type VaultContentMethod = "text" | "pdf-text" | "ocr" | "pdf-ocr";

/**
 * Cached plain-text reading of a Vault file's actual contents, used by the
 * AI assistant to answer questions about what a PDF/image contains (see
 * `vaultReadContent` in ai/tools/localTools.ts). Lazily populated on first
 * read, never on upload. One row per Vault item, keyed by vaultItemId.
 *
 * `sourceUpdatedAt` pins this cache to the `VaultItem.updatedAt` that was
 * current at extraction time — a mismatch means the underlying blob has
 * since changed (e.g. replaced), so the cache is stale and must be
 * re-extracted rather than served.
 */
export interface VaultContent {
  vaultItemId: ID;
  text: string;
  method: VaultContentMethod;
  extractedAt: ISODate;
  sourceUpdatedAt: ISODate;
}

export type ChatRole = "user" | "assistant" | "system";
export type ChatMessageState = "complete" | "streaming" | "error";

/**
 * File types the AI chat composer can attach. Mirrors what
 * `ai/context/vaultContent.ts` knows how to extract from — "image" and
 * "pdf" go to Gemini as inline binary input, "text" is extracted and
 * injected into the prompt as plain text (see attachments.ts).
 */
export type ChatAttachmentKind = "image" | "pdf" | "text";

/**
 * Metadata-only reference to a chat attachment. The actual bytes live in
 * the Vault (see data/repositories/vault.repository.ts) — chat messages
 * never carry base64 payloads, only a pointer to the stored VaultItem.
 */
export interface ChatAttachmentRef {
  id: ID;
  /** The Vault item holding the actual file bytes. */
  vaultItemId: ID;
  name: string;
  mimeType: string;
  sizeBytes: number;
  kind: ChatAttachmentKind;
  /**
   * Best-effort subject classification applied when this attachment was
   * saved to the Vault (see `features/assistant/vaultClassification.ts`).
   * The same value is also written into the underlying VaultItem's
   * `subject` field. Absent when classification didn't find a confident
   * match — the file is still saved in full, just left "Uncategorized".
   */
  subject?: VaultSubject | undefined;
}

export interface ChatMessage {
  id: ID;
  conversationId: ID;
  role: ChatRole;
  content: string;
  state: ChatMessageState;
  error?: string | undefined;
  /** Placeholder for artifacts (PDF, image sheet, note draft) produced by tools. */
  artifacts?: ChatArtifact[] | undefined;
  /** Files the user attached to this message, if any. See ChatAttachmentRef. */
  attachments?: ChatAttachmentRef[] | undefined;
  createdAt: ISODate;
}

export interface ChatArtifact {
  id: ID;
  type: "document" | "image-sheet" | "note-draft" | "chatgpt-prompt";
  title: string;
  status: "pending" | "ready" | "unavailable";
  vaultItemId?: ID | undefined;
  payload?: string | undefined;
}

export interface Conversation {
  id: ID;
  title: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface CurrentAffairsItem {
  id: ID;
  title: string;
  summary: string;
  url?: string | undefined;
  source: string;
  author?: string | undefined;
  imageUrl?: string | undefined;
  publishedAt: ISODate;
  sourceUrl?: string | undefined;
  fetchedAt?: ISODate | undefined;
  categories?: string[] | undefined;
  tags: string[];
  relatedExamIds?: ID[] | undefined;
  /** Internal ordering signal only — never surfaced as a rating in the UI. */
  relevanceScore?: number | undefined;
  savedAt?: ISODate | undefined;
  readAt?: ISODate | undefined;
}

export interface StudyPlanEntry {
  id: ID;
  examId?: ID | null | undefined;
  date: ISODate;
  title: string;
  description?: string | undefined;
  priority: ExamPriority;
  done: boolean;
  completedAt?: ISODate | null | undefined;
  minutes?: number | undefined;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type Appearance = "light" | "dark" | "system";

export interface AppSettings {
  id: "app";
  appearance: Appearance;
  showStudySnapshotOnLaunch: boolean;
  activeExamId?: ID | null | undefined;
  aiProvider: "gemini" | "none";
  geminiModel: string;
  reduceMotion: boolean;
  updatedAt: ISODate;
}
