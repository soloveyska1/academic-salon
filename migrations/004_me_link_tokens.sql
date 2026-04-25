-- Magic-link tokens for cabinet sign-in. Issued by /api/me/request-link
-- (one row per click), redeemed exactly once by /api/me/verify within
-- the TTL window. Successful redemption mints a session row in
-- migrations/005_me_sessions.sql and clears used_at on the token so a
-- replay is rejected.
CREATE TABLE IF NOT EXISTS me_link_tokens (
    token       TEXT    PRIMARY KEY,            -- 64-char hex
    contact     TEXT    NOT NULL,
    channel     TEXT    NOT NULL CHECK (channel IN ('telegram', 'email')),
    expires_at  INTEGER NOT NULL,
    used_at     INTEGER,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_me_link_tokens_contact
    ON me_link_tokens(contact);
CREATE INDEX IF NOT EXISTS idx_me_link_tokens_expires_at
    ON me_link_tokens(expires_at);
