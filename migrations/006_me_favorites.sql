-- Cabinet favourites — saved works tied to a contact (not to a session)
-- so logging out + back in on a different device keeps the list intact.
-- The "file" column stores the catalog slug, e.g. "files/курсовая.docx".
CREATE TABLE IF NOT EXISTS me_favorites (
    contact     TEXT    NOT NULL,
    file        TEXT    NOT NULL,
    added_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    PRIMARY KEY (contact, file)
);

CREATE INDEX IF NOT EXISTS idx_me_favorites_contact
    ON me_favorites(contact);
