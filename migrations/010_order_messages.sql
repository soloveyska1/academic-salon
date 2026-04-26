-- Stage 59 — встроенный чат по заявке.
-- Сейчас вся переписка между клиентом и куратором живёт во
-- внешних мессенджерах (Telegram/VK), что разрывает контекст
-- между заявкой и обсуждением. Этот thread позволяет вести
-- лог по конкретной order_id прямо в кабинете и админке.
CREATE TABLE IF NOT EXISTS order_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id    INTEGER NOT NULL,
    author      TEXT    NOT NULL,
    body        TEXT    NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    read_at     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_order_messages_order_time
    ON order_messages(order_id, created_at);
