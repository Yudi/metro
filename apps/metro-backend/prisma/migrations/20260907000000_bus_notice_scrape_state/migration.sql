CREATE TABLE public.bus_notice_scrape_state (
  id TEXT PRIMARY KEY,
  "attemptedWindow" TEXT NOT NULL DEFAULT '',
  "successfulWindow" TEXT NOT NULL DEFAULT '',
  "lastSuccessAt" TIMESTAMPTZ,
  notices JSONB NOT NULL DEFAULT '[]',
  "detailCache" JSONB NOT NULL DEFAULT '{}'
);
INSERT INTO public.bus_notice_scrape_state (id) VALUES ('sptrans');
