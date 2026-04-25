-- Cabinet sessions. One row per /api/me/verify success. The cookie
-- value is the session token (HttpOnly, Secure, SameSite=Lax). Sessions
-- live ~30 days from creation, /api/me/logout deletes the row.
CREATE TABLE IF NOT EXISTS me_sessions (
    token       TEXT    PRIMARY KEY,            -- 64-char hex
    contact     TEXT    NOT NULL,
    channel     TEXT    NOT NULL,
    expires_at  INTEGER NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_me_sessions_contact
    ON me_sessions(contact);
CREATE INDEX IF NOT EXISTS idx_me_sessions_expires_at
    ON me_sessions(expires_at);
