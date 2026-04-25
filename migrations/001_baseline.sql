-- Baseline schema for the Academic Salon stats DB.
-- Captures every CREATE TABLE / CREATE INDEX that used to live across
-- api/database.py:init_db, api/routers/orders.py, api/routers/admin.py,
-- api/routers/contribute.py at the moment versioned migrations were
-- introduced. Idempotent: every statement uses IF NOT EXISTS so it is
-- safe to re-apply against an existing prod database.

-- ─────────────────────────── document statistics ──
CREATE TABLE IF NOT EXISTS doc_counters (
    file        TEXT PRIMARY KEY,
    views       INTEGER NOT NULL DEFAULT 0,
    downloads   INTEGER NOT NULL DEFAULT 0,
    likes       INTEGER NOT NULL DEFAULT 0,
    dislikes    INTEGER NOT NULL DEFAULT 0,
    updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS event_buckets (
    file        TEXT NOT NULL,
    client_id   TEXT NOT NULL,
    action      TEXT NOT NULL,
    bucket      INTEGER NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    PRIMARY KEY (file, client_id, action, bucket)
);

CREATE TABLE IF NOT EXISTS reactions (
    file        TEXT NOT NULL,
    client_id   TEXT NOT NULL,
    reaction    INTEGER NOT NULL CHECK (reaction IN (-1, 1)),
    updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    PRIMARY KEY (file, client_id)
);

CREATE INDEX IF NOT EXISTS idx_event_buckets_created_at
    ON event_buckets(created_at);

CREATE INDEX IF NOT EXISTS idx_reactions_file
    ON reactions(file);

-- ─────────────────────────── customer orders ──
CREATE TABLE IF NOT EXISTS orders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    work_type   TEXT,
    topic       TEXT,
    subject     TEXT,
    deadline    TEXT,
    contact     TEXT,
    comment     TEXT,
    ip          TEXT,
    created_at  INTEGER DEFAULT (strftime('%s','now')),
    status      TEXT DEFAULT 'new'
);

-- ─────────────────────────── community contributions ──
CREATE TABLE IF NOT EXISTS contributions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT,
    subject     TEXT,
    category    TEXT,
    contact     TEXT,
    description TEXT,
    filename    TEXT,
    ip          TEXT,
    created_at  INTEGER DEFAULT (strftime('%s','now')),
    status      TEXT DEFAULT 'pending'
);

-- ─────────────────────────── admin-curated calendar ──
CREATE TABLE IF NOT EXISTS calendar_overrides (
    date        TEXT PRIMARY KEY,
    state       TEXT NOT NULL,
    updated_at  INTEGER DEFAULT (strftime('%s','now'))
);
