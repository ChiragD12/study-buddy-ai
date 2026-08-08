import {
  Archive,
  BellRing,
  BookOpen,
  CalendarDays,
  FileText,
  Files,
  Image,
  Newspaper,
  NotebookPen,
  Palette,
  PenLine,
  ShieldCheck,
  Sparkle,
  Star,
  TrendingUp,
  DatabaseBackup,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    title: "Assistant",
    items: [{ label: "Chat", to: "/", icon: Sparkle }],
  },
  {
    title: "Study",
    items: [
      { label: "Exams", to: "/exams", icon: CalendarDays },
      { label: "Notes", to: "/notes", icon: NotebookPen },
      { label: "Current Affairs", to: "/current-affairs", icon: Newspaper },
      { label: "Answer Writing", to: "/answer-writing", icon: PenLine },
    ],
  },
  {
    title: "Vault",
    items: [
      { label: "All Files", to: "/vault", icon: Archive },
      { label: "PDFs", to: "/vault/pdfs", icon: FileText },
      { label: "Images", to: "/vault/images", icon: Image },
      { label: "Saved Material", to: "/vault/saved", icon: Star },
    ],
  },
  {
    title: "Progress",
    items: [
      { label: "Study Plan", to: "/plan", icon: BookOpen },
      { label: "Progress", to: "/progress", icon: TrendingUp },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Notifications", to: "/settings/notifications", icon: BellRing },
      { label: "AI / Gemini", to: "/settings/ai", icon: Sparkle },
      { label: "Appearance", to: "/settings/appearance", icon: Palette },
      { label: "Data & Backup", to: "/settings/data", icon: DatabaseBackup },
      { label: "Privacy", to: "/settings/privacy", icon: ShieldCheck },
    ],
  },
];

export const allNavItems: NavItem[] = navSections.flatMap((section) => section.items);

export function titleForPath(pathname: string): string {
  const exact = allNavItems.find((item) => item.to === pathname);
  if (exact) return exact.label;
  const prefix = allNavItems
    .filter((item) => item.to !== "/" && pathname.startsWith(item.to))
    .sort((a, b) => b.to.length - a.to.length)[0];
  return prefix?.label ?? "Exam Assistant";
}

export { Files };
