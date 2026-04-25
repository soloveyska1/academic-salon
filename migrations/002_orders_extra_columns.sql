-- Order extras grown over time as inline ALTER TABLE hacks in
-- api/routers/orders.py and api/routers/admin.py. Codified here so any
-- fresh DB applies them in order, and so existing prod stays unchanged
-- (each ADD COLUMN is wrapped in a feature check inside migrations.py).
ALTER TABLE orders ADD COLUMN attachments         TEXT;
ALTER TABLE orders ADD COLUMN manager_note        TEXT;
ALTER TABLE orders ADD COLUMN response_to_client  TEXT;
ALTER TABLE orders ADD COLUMN response_channel    TEXT;
ALTER TABLE orders ADD COLUMN response_at         INTEGER;
