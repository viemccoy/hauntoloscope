export type TimelineEntry = {
  id: string;
  era: string;
  title: string;
  summary: string;
  tone?: string;
  anchorDate?: string;
  threads?: string[];
};

export type TimelineResponse = {
  timeline_title: string;
  guiding_principle: string;
  entries: TimelineEntry[];
  example?: unknown;
};

export type ArticleResponse = {
  headline: string;
  dateline: string;
  lede: string; // Markdown-supported string
  body: string[]; // Markdown-supported segments
  sidebar?: {
    title: string;
    items: string[];
  };
  pull_quote?: string;
};

export type HauntoloscopeBundle = {
  seed_event: string;
  seed_summary?: string;
  generated_at: string;
  timeline: TimelineResponse;
  articles: Record<string, ArticleResponse>;
};
