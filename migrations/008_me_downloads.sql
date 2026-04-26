-- Stage 47 — track downloads per logged-in user, so the cabinet can
-- show «Недавно скачано». Anonymous downloads continue going through
-- doc_counters/event_buckets unaffected. PRIMARY KEY (contact, file)
-- means we keep ONE row per (user, file): each subsequent download
-- by the same user updates downloaded_at via INSERT OR REPLACE,
-- so the history list shows distinct works ordered by most-recent
-- access — no clutter from re-downloads.
CREATE TABLE IF NOT EXISTS me_downloads (
    contact        TEXT    NOT NULL,
    file           TEXT    NOT NULL,
    downloaded_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    PRIMARY KEY (contact, file)
);

CREATE INDEX IF NOT EXISTS idx_me_downloads_contact_time
    ON me_downloads(contact, downloaded_at DESC);
