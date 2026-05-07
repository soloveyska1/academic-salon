# Handoff: order packages / study scenarios

## Product idea

This is not "buy five works and get a discount".

The product language is "study scenarios": one curator, one plan, one style, several related tasks handled without chaos. We sell relief from scattered deadlines, not a bulk discount.

The feature now has two layers:

- Codex contract/backend layer: package data, `/order` payload, backend storage, notification block, tests.
- Claude presentation layer: homepage chapter "Учебные сценарии" and polished package card inside `/order`.

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

## Homepage presentation

New component:

`astro-site/src/components/home/Scenarios.astro`

It imports `ORDER_PACKAGES` and renders four scenario cards. Each card links to:

```text
/order?package=<code>
```

The component is inserted in:

`astro-site/src/pages/index.astro`

Current homepage chapter order:

- I — Manifesto
- II — Calendar
- III — Scenarios
- IV — Genres
- V — Formula
- VI — Archive
- VII — Method
- VIII — Testimonia
- IX — FAQ

The later chapters were renumbered to keep the book structure continuous.

## /order contract

`astro-site/src/pages/order.astro` supports a third calculator mode:

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

In package mode, `#packageTechnicalSummary` is now a visual `.package-card`.
The `id` is intentionally preserved because the client-side renderer updates this node when the selected package changes.

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

## Design scope for future edits

Safe to edit:

- homepage section that imports `ORDER_PACKAGES`;
- visual polish of package mode in `/order`;
- text tone and microcopy;
- animations/interactions for selecting a package;
- any CSS classes around the current technical scaffold.

Do not change without coordinating with Codex:

- package codes;
- `/api/order/` field names listed above;
- `stats_api.py` package parsing/storage unless coordinating with Codex;
- migration version numbers.

Keep the framing:

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

## Verification

Codex added backend test coverage for JSON and multipart package metadata persistence in `tests/test_orders.py`.

Verified on 2026-05-07:

```bash
cd astro-site && npm run build
cd .. && python3.12 -m py_compile stats_api.py api/routers/orders.py
cd .. && uv run --python 3.12 --with fastapi --with 'uvicorn[standard]' --with bcrypt --with python-multipart --with pytest --with httpx pytest tests/test_orders.py
```

Result:

- `npm run build` passed, 289 pages. The remaining CSS warnings are pre-existing warnings in old home styles.
- `py_compile` passed.
- `tests/test_orders.py` passed, 11 tests.
