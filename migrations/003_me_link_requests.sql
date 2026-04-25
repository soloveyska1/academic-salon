-- /api/me/request-link writes one row per cabinet-access request from
-- the homepage form. Operators handle each one manually for now —
-- there's no real magic-link token flow yet (Phase 2 will add token +
-- /api/me/verify endpoints + a session cookie). Keeping the row gives
-- us an audit trail and rate-limit material in the meantime.
CREATE TABLE IF NOT EXISTS me_link_requests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    contact     TEXT    NOT NULL,
    channel     TEXT    NOT NULL CHECK (channel IN ('telegram', 'email')),
    ip          TEXT,
    user_agent  TEXT,
    status      TEXT    NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'sent', 'used', 'expired')),
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_me_link_requests_created_at
    ON me_link_requests(created_at);
