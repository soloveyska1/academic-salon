# Academic Salon (Академический Салон)

## Project Overview
Student document library + custom work ordering service.
Live at: https://bibliosaloon.ru/
Server: 94.241.143.29 (root / oFp?P3QTjAtF+s)

## Architecture (CURRENT — April 2026)

The site has TWO frontends. **Both are active:**

### 1. Astro Site (NEW — primary, multi-page)
- **Location:** `astro-site/` in repo
- **Stack:** Astro v6, static SSG, View Transitions API
- **Pages:** `/` (home), `/catalog`, `/doc/[slug]` (235 pages), `/order`, `/about`, `/faq`
- **Deploy:** GitHub Actions auto-deploy on push to main → builds & SCPs to server
- **Server path:** Files go to `/var/www/salon/` (index.html, about/, catalog/, doc/, order/, _assets/)
- **Design system:** `astro-site/src/styles/design-tokens.css` — CSS variables, 8px grid
- **Fonts:** Playfair Display (headings), Inter (body), JetBrains Mono (data)
- **Colors:** Gold (#d4af37) on obsidian (#09080c) dark, warm parchment (#faf8f2) light

### 2. Legacy Vite SPA (OLD — being phased out)
- **Location:** `index.html`, `src/`, `vite.config.js` in repo root
- **Stack:** Vanilla JS + Vite + modular CSS
- **Note:** This was the original single-page app. Astro replaced it.
- **DO NOT deploy** the old `index.html` over the Astro version.

### 3. Mobile (Expo/React Native — Codex manages this)
- **Location:** `expo-app/` in repo
- **Server path:** `/var/www/salon/mobile/`
- **Note:** Codex bot works on mobile. It may create symlinks in `/var/www/salon/`.
  If deploying Astro, use `scp` which overwrites symlinks, or `rm` them first.

### 4. Backend API (FastAPI)
- **Location:** `api/` in repo, `stats_api.py` (legacy)
- **Server:** /opt/bibliosaloon/stats_api.py
- **Service:** bibliosaloon-stats.service
- **DB:** /var/lib/bibliosaloon/doc_stats.sqlite3
- **Endpoints:** /api/doc-stats/*, /api/admin/*, /api/order/

## Server Paths
- Site root: /var/www/salon/
- Document files: /var/www/salon/files/
- Mobile app: /var/www/salon/mobile/
- API: /opt/bibliosaloon/stats_api.py
- Nginx: /etc/nginx/sites-available/salon
- Backups: /var/backups/bibliosaloon/ (cron daily 3:17 AM)

## Deploy (Automated)

### Astro site (auto on push to main)
GitHub Actions workflow `.github/workflows/deploy-astro.yml`:
1. Triggers on push to `main` when `astro-site/**` changes
2. Builds static site (240 pages in ~2s)
3. SCPs dist/ to server via SSH
4. Requires GitHub Secrets: `SSH_HOST`, `SSH_PASS`
5. Also triggerable manually via workflow_dispatch

### Manual deploy (if Actions fails)
```bash
cd astro-site && npm run build && scp -r dist/* root@94.241.143.29:/var/www/salon/
```

### Deploy API
```bash
sshpass -p 'oFp?P3QTjAtF+s' scp -o StrictHostKeyChecking=no stats_api.py root@94.241.143.29:/opt/bibliosaloon/stats_api.py
sshpass -p 'oFp?P3QTjAtF+s' ssh root@94.241.143.29 "systemctl restart bibliosaloon-stats"
```

## Design System (DESIGN.md)
Full design documentation is in `DESIGN.md` and visual previews in `preview.html` / `preview-dark.html`.

### Key tokens
- Dark bg: #09080c, Light bg: #faf8f2
- Gold accent: #d4af37 → #ecc94b → #f6e27a → #fef3c7
- Text: #f5f0e6 (dark), #1a1610 (light)
- Border radii: 18px / 16px / 12px / 8px
- Spacing: 8px base grid
- Motion: cubic-bezier(.4,0,.2,1), 150-400ms

### Icons
- `astro-site/public/favicon.svg` — browser tab (32x32)
- `astro-site/public/icon-192.svg` — PWA (192x192)
- `astro-site/public/icon-512.svg` — PWA splash (512x512)
- `astro-site/public/og-image.svg` — social sharing (1200x630)
- Monogram: **АС** with gold gradient on obsidian

## Admin Panel
- Access: 7 rapid clicks on footer copyright (legacy SPA only)
- Password: hwafl7WCJMJgyvwr8O
- Auth: bcrypt server-side, session tokens

## Contacts on Site
- VK: vk.com/academicsaloon
- TG: t.me/academicsaloon
- MAX: max.ru/join/lvaRhM9GTze3JfqgW9GsTisLfz-o_IOdVK-ev-_AsH0
- Email: academsaloon@mail.ru
- Owner VK: vk.com/imsaay

## Important Rules
- **Astro site is the primary frontend.** Edit `astro-site/src/` for changes.
- **DO NOT overwrite** Astro's index.html with the old Vite SPA.
- **Codex manages mobile** (`expo-app/`, `/var/www/salon/mobile/`). Don't break its symlinks unless deploying Astro.
- **Dark theme is default.**
- **Style:** Stripe/Linear premium. Gold is functional, not decorative.
- **Always push to main** to trigger auto-deploy. Or use workflow_dispatch.
- **Catalog data:** `astro-site/src/data/catalog.js` — exported as `D` array.
- **After editing astro-site/**, commit & push to main → GitHub Actions deploys automatically.
- **Yandex.Metrika:** 108363627

## Memory & Context Management

### Persistent Memory (MCP server-memory)
MCP memory server хранит граф знаний в `/home/user/.claude/memory.jsonl`.
В начале каждой сессии — загрузи релевантную память через `search_nodes`.
При получении новой информации о пользователе, проекте, предпочтениях — сохраняй через `create_entities` / `add_observations`.

Запоминай:
- Предпочтения пользователя (стиль, формат, язык)
- Ключевые решения по проекту и их причины
- Часто используемые документы и их содержание
- Контакты, даты, повторяющиеся задачи

### Compact Instructions (приоритет при сжатии контекста)
При компакции контекста ОБЯЗАТЕЛЬНО сохрани:
1. Текущую задачу пользователя и её контекст
2. Все цитаты и ссылки на документы (страницы, номера)
3. Стайлгайд ниже
4. Структуру проекта (Astro = primary frontend)

## Document Work Rules

### Работа с документами
- **Используй /research-docs** для анализа документов с визуальными цитатами
- При цитировании — **дословно**, символ в символ из исходного текста
- **Всегда указывай**: файл, страницу, точную цитату
- Формат: «цитата» (файл.pdf, с. XX)
- Не перефразируй цитаты — копируй как есть, даже с опечатками
- Для больших PDF (>20 стр.) — читай порциями по 20 страниц, не пропуская

### Скилл /research-docs (LiteParse)
Установлен в `/root/.claude/skills/research-docs/`.
Парсит PDF/DOCX/PPTX/XLSX с bounding boxes, генерирует HTML-отчёт с подсветкой цитат на страницах.
Использование: `/research-docs ./путь/к/документам Вопрос по содержанию`

## Writing Style Guide (Стайлгайд)

### Общие правила
- Академический стиль, но живой и читаемый
- Без канцеляризмов: НЕ «данный», «является», «осуществляется», «в рамках»
- Предпочитай простые конструкции сложным
- Абзацы: 3-5 предложений
- Одна мысль — один абзац

### Цитирование
- Формат: «текст цитаты» (Автор, год, с. XX)
- Цитаты — дословные, не пересказ
- Ссылки на источник — с точным номером страницы

### Структура текста
- Тезис → аргументы → доказательства (цитаты) → вывод
- Каждое утверждение подкреплено источником
- Переходы между абзацами логичные, не механические

### Язык
- Основной язык: русский
- Термины: при первом упоминании — оригинал в скобках
- Числа до 10 — словами, от 10 — цифрами
