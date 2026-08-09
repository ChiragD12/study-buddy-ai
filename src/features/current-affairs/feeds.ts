export interface FeedSource {
  id: string;
  name: string;
  url: string;
  category?: string;
  enabled: boolean;
}

/** Verified public RSS/Atom sources used by the generic ingestion pipeline. */
export const CURRENT_AFFAIRS_FEEDS: FeedSource[] = [
  {
    id: "indian-express-upsc-current-affairs",
    name: "Indian Express — UPSC Current Affairs",
    url: "https://indianexpress.com/section/upsc-current-affairs/feed/",
    category: "UPSC Current Affairs",
    enabled: true,
  },
  {
    id: "indian-express-explained",
    name: "Indian Express — Explained",
    url: "https://indianexpress.com/section/explained/feed/",
    category: "Explained",
    enabled: true,
  },
  {
    id: "pib-government-press-releases",
    name: "PIB — Government of India Press Releases",
    url: "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=5",
    category: "Government / Polity",
    enabled: true,
  },
];
