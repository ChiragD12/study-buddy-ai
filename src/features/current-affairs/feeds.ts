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
  {
    id: "the-hindu-national",
    name: "The Hindu — National",
    url: "https://www.thehindu.com/news/national/feeder/default.rss",
    category: "Polity",
    enabled: true,
  },
  {
    id: "the-hindu-international",
    name: "The Hindu — International",
    url: "https://www.thehindu.com/news/international/feeder/default.rss",
    category: "International",
    enabled: true,
  },
  {
    id: "the-hindu-sport",
    name: "The Hindu — Sport",
    url: "https://www.thehindu.com/sport/feeder/default.rss",
    category: "Sports",
    enabled: true,
  },
  {
    id: "the-hindu-business",
    name: "The Hindu — Business",
    url: "https://www.thehindu.com/business/feeder/default.rss",
    category: "Economy",
    enabled: true,
  },
  {
    id: "the-hindu-sci-tech",
    name: "The Hindu — Sci-Tech",
    url: "https://www.thehindu.com/sci-tech/feeder/default.rss",
    category: "Science & Technology",
    enabled: true,
  },
  {
    id: "the-hindu-energy-environment",
    name: "The Hindu — Energy & Environment",
    url: "https://www.thehindu.com/sci-tech/energy-and-environment/feeder/default.rss",
    category: "Environment",
    enabled: true,
  },
];
