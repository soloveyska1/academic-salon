# Handoff for Claude Code: order packages / study scenarios

## What Codex already built

This branch adds the technical substrate for service packages. It is intentionally not a finished visual design.

The idea is not "buy five works and get a discount". The product language is "study scenarios": one curator, one plan, one style, several related tasks handled without chaos.

## Stable frontend data source

Package definitions live in:

`astro-site/src/data/orderPackages.ts`

Current package codes:

- `week` — "Закрыть неделю"
- `defense` — "Текст + защита"
- `semester` — "Семестровый запас"
- `rescue` — "Довести до сдачи"

Each object has:

- `code`
- `name`
- `short`
- `audience`
- `priceFrom`
- `timeline`
- `topicPlaceholder`
- `items`
- `outcome`

Keep `code` stable. Text and visual presentation can change.

## Existing /order contract

`astro-site/src/pages/order.astro` now supports a third calculator mode:

- `standard`
- `anti-ai`
- `package`

Deep links:

- `/order?package=week`
- `/order?package=defense`
- `/order?package=semester`
- `/order?package=rescue`
- `/order?service=package&package=defense` also works.

When a package is selected, the form sends these fields to `/api/order/`:

```json
{
  "source": "site_package",
  "sourceLabel": "Сайт · пакет услуг",
  "sourcePath": "/order?package=defense",
  "entryUrl": "https://bibliosaloon.ru/order?package=defense",
  "estimatedPrice": 22000,
  "packageCode": "defense",
  "packageName": "Текст + защита",
  "packageItems": ["..."],
  "packagePriceFrom": 22000,
  "packageTimeline": "от 7 дней",
  "packageAudience": "...",
  "packageOutcome": "...",
  "packageVersion": "2026-05-07"
}
```

Multipart submissions with files send the same fields.

## Backend behavior

Backend files updated:

- `stats_api.py` — production runtime path.
- `api/routers/orders.py` — FastAPI/dev/test runtime.
- `migrations/011_orders_attribution_packages.sql` — FastAPI schema alignment.

The backend stores package data in `orders.meta_json`.

Admin/VK/Telegram/email notification gets a visible block:

```text
📦 Пакет
• Сценарий: Текст + защита · defense
• Ориентир пакета: 22 000 ₽
• Срок пакета: от 7 дней
• Курсовая / ВКР ...
```

No new public endpoint is needed.

## Claude design scope

You can safely own:

- homepage section that imports `ORDER_PACKAGES`;
- visual polish of package mode in `/order`;
- text tone and microcopy;
- animations/interactions for selecting a package;
- any CSS classes around the current technical scaffold.

Avoid changing:

- package codes;
- `/api/order/` field names listed above;
- `stats_api.py` package parsing/storage unless coordinating with Codex;
- migration version numbers.

## Suggested UX

Homepage:

Place "Учебные сценарии" after `Calendar` and before `Formula`.

Cards should deep-link to `/order?package=<code>`.

Recommended framing:

> Не скидочный набор, а способ собрать учебную нагрузку в один план.

Good CTA labels:

- `Собрать пакет`
- `Обсудить сценарий`
- `Открыть в заявке`

Avoid:

- "скидка"
- "халява"
- "5 работ дешевле"
- loud sale language

## Verification Codex ran

Codex added backend test coverage for JSON package metadata persistence in `tests/test_orders.py`.

Before handoff, run:

```bash
cd astro-site && npm run build
cd .. && pytest tests/test_orders.py
```
