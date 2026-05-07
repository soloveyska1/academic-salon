-- Order attribution and package metadata used by the package/scenario flow.
-- stats_api.py can add these columns at runtime, but the FastAPI runtime and
-- tests should get the same schema through migrations.

ALTER TABLE orders ADD COLUMN source TEXT;
ALTER TABLE orders ADD COLUMN source_label TEXT;
ALTER TABLE orders ADD COLUMN source_path TEXT;
ALTER TABLE orders ADD COLUMN entry_url TEXT;
ALTER TABLE orders ADD COLUMN referrer TEXT;
ALTER TABLE orders ADD COLUMN user_agent TEXT;
ALTER TABLE orders ADD COLUMN contact_channel TEXT;
ALTER TABLE orders ADD COLUMN estimated_price INTEGER;
ALTER TABLE orders ADD COLUMN pages INTEGER;
ALTER TABLE orders ADD COLUMN originality TEXT;
ALTER TABLE orders ADD COLUMN sample_title TEXT;
ALTER TABLE orders ADD COLUMN sample_type TEXT;
ALTER TABLE orders ADD COLUMN sample_subject TEXT;
ALTER TABLE orders ADD COLUMN sample_category TEXT;
ALTER TABLE orders ADD COLUMN meta_json TEXT;
