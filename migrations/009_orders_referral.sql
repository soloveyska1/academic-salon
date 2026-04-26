-- Stage 58 — referral attribution.
-- Каждый кабинет-юзер получает детерминированный 6-символьный код
-- (хеш от contact). Если кто-то приходит по ?ref=CODE и оставляет
-- заявку, она помечается referral_code'ом. Награды — на owner'а
-- вручную, этот стейдж только трекинг.
ALTER TABLE orders ADD COLUMN referral_code TEXT;
ALTER TABLE orders ADD COLUMN referral_first_seen_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_orders_referral_code
    ON orders(referral_code) WHERE referral_code IS NOT NULL;
