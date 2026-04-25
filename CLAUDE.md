# Academic Salon (Академический Салон)

## Project Overview
Student document library + custom work ordering service.
Live at: https://bibliosaloon.ru/
Server: 94.241.143.29 — credentials are NOT stored in this repo.
SSH password lives in `~/.salon-secrets` (local) and GitHub Secrets `SERVER_PASSWORD` (CI).
Load locally with: `source ~/.salon-secrets` (exports `SALON_SSH_PASS`).

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
Load `SALON_SSH_PASS` first (`source ~/.salon-secrets`), then:
```bash
sshpass -e scp stats_api.py root@94.241.143.29:/opt/bibliosaloon/stats_api.py
sshpass -e ssh root@94.241.143.29 "systemctl restart bibliosaloon-stats"
```
`sshpass -e` reads the password from `$SSHPASS` — never paste it into a command.

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

## Design Ownership & Boundaries

**Design and visual styling are managed by Claude Code (not Codex).**

### Codex: backend & logic only
Codex handles: `api/`, `stats_api.py`, `expo-app/`, backend logic, API endpoints,
notification systems, database, server config. Codex may add new JS logic
(form submission, validation, upload handlers) but **must not**:
- Change CSS / visual styles in `.astro` files
- Add new HTML sections or UI components to existing pages
- Modify layout structure (grid, flex, spacing, typography)
- Add inline styles or override design tokens
- Deploy Astro files directly to prod via SCP (use git → GitHub Actions)

### Claude Code: design & frontend
Claude Code handles: all visual design, CSS, HTML structure in `astro-site/src/`,
component layout, styling, UX, page structure, design tokens.

### Workflow
1. Codex works in its own branch (`claude/evaluate-website-design-*` etc.)
2. Codex commits & pushes to its branch (never directly to main)
3. Claude Code reviews, merges structural changes, fixes any design regressions
4. Claude Code pushes to main → GitHub Actions auto-deploys
5. **No direct SCP deploys** of Astro files — only through git + Actions

### Design decisions (do not change without Claude Code review)
- No custom cursor (removed — interferes with usability)
- Order page: single-column form, inline paperclip file attach (no bulky cards)
- Reviews: only on homepage (not on order page)
- /contribute: standalone page for library submissions
- Navigation: Каталог, Заказать, Поделиться, О нас
