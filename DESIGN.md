# Academic Salon — Design System

> Dark-first student document library with a "luxury stationery" aesthetic.
> Gold-on-obsidian dark theme, warm parchment light theme. Stripe/Linear visual language.

---

## 1. Visual Theme & Atmosphere

- **Dark theme (default):** Deep obsidian backgrounds (`#09080c`) with gold accent hierarchy. Floating orbs with subtle animated glow create depth. Noise texture overlay at 2% opacity. Star particles twinkle in the background.
- **Light theme:** Warm parchment (`#faf8f2`) with aged-gold accents (`#b8942a`). Clean, airy — "luxury stationery" feel. No orbs or stars.
- **Glass morphism:** Panels use `backdrop-filter: blur(24px) saturate(1.4)` with semi-transparent backgrounds.
- **Motion philosophy:** Smooth, understated — `cubic-bezier(.4, 0, .2, 1)` easing. Cards lift on hover (`translateY(-5px)`). Scroll-reveal entrance (`translateY(24px)` → `0`). Shimmer gradients on gold elements (8s infinite cycle). Respect `prefers-reduced-motion`.
- **Decorative elements:** Diamond ornaments (`◆`), gradient divider lines (`transparent → gold → transparent`), conic-gradient rainbow borders on card hover.

---

## 2. Color Palette & Roles

### Dark Theme (default)

| Token     | Value                        | Role                           |
|-----------|------------------------------|--------------------------------|
| `--bg`    | `#09080c`                    | Page background                |
| `--bg2`   | `#0e0d14`                    | Surface / input background     |
| `--bg3`   | `#14121d`                    | Elevated surface               |
| `--bg4`   | `#1a1726`                    | Highest elevation              |
| `--t1`    | `#f5f0e6`                    | Primary text                   |
| `--t2`    | `#a89e88`                    | Secondary text                 |
| `--t3`    | `#6e6454`                    | Tertiary / muted text          |
| `--ac`    | `#d4af37`                    | Primary accent (gold)          |
| `--ac2`   | `#ecc94b`                    | Accent hover / emphasis        |
| `--ac3`   | `#f6e27a`                    | Light gold highlight           |
| `--ac4`   | `#fef3c7`                    | Pale gold tint                 |
| `--purple`| `#a78bfa`                    | Secondary accent               |
| `--green` | `#34d399`                    | Success / positive             |
| `--red`   | `#f87171`                    | Error / negative               |

**Semantic surfaces:**
| Token      | Value                          | Role                         |
|------------|--------------------------------|------------------------------|
| `--card`   | `rgba(212,175,55,.02)`         | Card background              |
| `--card-h` | `rgba(212,175,55,.055)`        | Card hover background        |
| `--brd`    | `rgba(212,175,55,.07)`         | Border default               |
| `--brd-h`  | `rgba(212,175,55,.2)`          | Border hover                 |
| `--ac-g`   | `rgba(212,175,55,.1)`          | Gold tint (tags, active)     |
| `--ac-g2`  | `rgba(212,175,55,.05)`         | Gold tint subtle             |
| `--ac-glow`| `rgba(212,175,55,.18)`         | Gold glow                    |
| `--glass`  | `rgba(14,13,20,.7)`           | Glass panel background       |
| `--shadow` | `0 8px 32px rgba(0,0,0,.5)`   | Elevation shadow             |

### Light Theme

| Token     | Value                        | Role                           |
|-----------|------------------------------|--------------------------------|
| `--bg`    | `#faf8f2`                    | Page background (parchment)    |
| `--bg2`   | `#ffffff`                    | Surface / card background      |
| `--bg3`   | `#f5f1e8`                    | Elevated surface               |
| `--bg4`   | `#ede8db`                    | Highest elevation              |
| `--t1`    | `#1a1610`                    | Primary text                   |
| `--t2`    | `#6b6050`                    | Secondary text                 |
| `--t3`    | `#998e78`                    | Tertiary / muted text          |
| `--ac`    | `#b8942a`                    | Primary accent (aged gold)     |
| `--ac2`   | `#d4af37`                    | Accent hover                   |
| `--ac3`   | `#ecc94b`                    | Light gold                     |
| `--purple`| `#7c3aed`                    | Secondary accent               |
| `--green` | `#059669`                    | Success                        |
| `--red`   | `#dc2626`                    | Error                          |
| `--shadow`| `0 4px 24px rgba(100,80,30,.08)` | Light elevation shadow     |
| `--glass` | `rgba(255,255,255,.75)`      | Glass panel background         |

### Gold Shimmer Gradient (headings)
```css
background: linear-gradient(120deg, #916a12, #d4af37, #f6e27a, #fffbe6, #f6e27a, #d4af37);
background-size: 300-400% auto;
animation: shimmer 8s ease infinite;
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
```

---

## 3. Typography Rules

### Font Stack
| Variable | Font                                        | Role                  |
|----------|---------------------------------------------|-----------------------|
| `--fd`   | `'Playfair Display', Georgia, serif`        | Display / headings    |
| `--fi`   | `'Inter', -apple-system, system-ui, sans-serif` | Body / UI text    |
| `--fb`   | `'Inter', -apple-system, system-ui, sans-serif` | Body (alias)      |
| `--fm`   | `'JetBrains Mono', monospace`               | Code / numbers / tags |

### Google Fonts Import
```
Playfair Display: 700, 800, 900
Inter: 300, 400, 500, 600, 700
JetBrains Mono: 400, 500
```

### Scale & Weights
| Element               | Font        | Size                           | Weight | Extra                    |
|-----------------------|-------------|--------------------------------|--------|--------------------------|
| Hero H1               | Playfair    | `clamp(3.2rem, 8vw, 6rem)`    | 900    | Gold shimmer gradient, `letter-spacing: -.02em` |
| Section title (order) | Playfair    | `clamp(2.8rem, 5.6vw, 4.8rem)`| 900    | `letter-spacing: -.04em` |
| Accent italic span    | Playfair    | inherited                      | 900    | `font-style: italic`, gold shimmer |
| Panel title           | Playfair    | `clamp(1.55rem, 2.5vw, 2rem)` | 800    | `letter-spacing: -.02em` |
| Kicker / eyebrow      | Inter       | `11px`                         | 600-700| `letter-spacing: 2-4px`, uppercase |
| Card title            | Inter       | `15px`                         | 600    | `line-height: 1.38`     |
| Body text             | Inter       | `15px`                         | 400    | `line-height: 1.6-1.8`  |
| Small text / meta     | Inter       | `12-13px`                      | 500-600| —                        |
| Tags / badges         | JetBrains   | `10-11px`                      | 700    | `letter-spacing: .4px`, uppercase |
| Stat numbers          | Playfair/JBM| `18-28px`                      | 700-900| Gold gradient fill       |

### Anti-aliasing
```css
-webkit-font-smoothing: antialiased;
```

---

## 4. Component Stylings

### Buttons
**Primary CTA (gold gradient):**
```css
padding: 16px 32px;
border-radius: 14px;
background: linear-gradient(135deg, var(--ac), var(--ac2));
color: #1a1410;
font-size: 15px; font-weight: 700;
box-shadow: 0 8px 30px rgba(212,175,55,.2), 0 0 60px rgba(212,175,55,.06);
/* Shimmer overlay on ::after */
```
Hover: `translateY(-3px)`, increased shadow.

**Secondary / ghost:**
```css
padding: 11px 16px;
border-radius: 10px;
background: var(--card);
border: 1px solid var(--brd);
color: var(--t2);
font-size: 12px; font-weight: 600;
```
Hover: border brightens, text lightens.

**Pill button (tags, CTA bar):**
```css
padding: 10px 28px;
border-radius: 100px; /* full pill */
background: linear-gradient(135deg, var(--ac), var(--ac2));
color: #1a1410;
```

### Cards (Document)
```css
border-radius: var(--r); /* 18px */
padding: 22px;
background: var(--card); /* rgba gold 2% */
border: 1px solid var(--brd); /* rgba gold 7% */
backdrop-filter: blur(4px);
min-height: 326px;
```
Hover: lifts `-5px`, conic-gradient rainbow border fades in, sweep shimmer left→right, shadow intensifies.

**Card grid:** `grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 16px`

### File Type Icons
```css
width: 46px; height: 46px; border-radius: 12px;
font-family: var(--fm); font-size: 11px; font-weight: 700;
```
- DOCX: `linear-gradient(135deg, #2b5797, #5a94d4)`, white text
- PDF: `linear-gradient(135deg, #b83024, #e04a3c)`, white text
- DOC: `linear-gradient(135deg, #1e4478, #3a78b8)`, light blue text

### Tags / Badges
```css
padding: 3px 10px;
border-radius: 100px;
font-size: 10px; font-weight: 700;
letter-spacing: .4px; text-transform: uppercase;
```
- Category (gold): `background: var(--ac-g); color: var(--ac2); border: 1px solid rgba(212,175,55,.1)`
- Subject (purple): `background: var(--purp-g); color: var(--purple); border: 1px solid rgba(167,139,250,.1)`
- Keyword (green): `background: var(--green-g); color: var(--green); border: 1px solid rgba(52,211,153,.1)`

### Inputs (Search / Select)
```css
height: 54px;
border-radius: 16px;
background: var(--bg3);
border: 1px solid var(--brd);
font-size: 14px;
box-shadow: inset 0 1px 0 rgba(255,255,255,.02);
```
Focus: border lightens, background to `--bg2`, outer shadow `0 10px 28px rgba(0,0,0,.16)`.

### Filter Chips
```css
padding: 8px 10px 8px 14px;
border-radius: 999px;
background: linear-gradient(135deg, rgba(212,175,55,.09), rgba(212,175,55,.04));
border: 1px solid rgba(212,175,55,.16);
backdrop-filter: blur(8px);
```

### Modal
```css
border-radius: 24px;
background: rgba(14,13,20,.96);
border: 1px solid rgba(255,255,255,.06);
backdrop-filter: blur(16px);
```
Entrance: `scale(.92) translateY(20px)` → `scale(1) translateY(0)`, 350ms.

### Toast Notifications
```css
border-radius: 14px;
background: rgba(10,10,16,.94);
border: 1px solid rgba(212,175,55,.12);
backdrop-filter: blur(20px);
/* Gold progress bar at bottom, 2.2s countdown */
```

### Pricing Panel (Glass)
```css
border-radius: 24px;
background: rgba(255,255,255,.02);
border: 1px solid rgba(255,255,255,.06);
box-shadow: 0 32px 80px rgba(0,0,0,.2);
backdrop-filter: blur(16px) saturate(1.3);
/* Gold line across top via ::before */
```

### Sidebar Category Button
```css
border-radius: var(--rs); /* 12px */
display: grid; grid-template-columns: 22px 1fr auto;
padding: 10px 12px;
```
Active: gold left indicator bar via `::before`, gold-tinted background. Progress bar shows document count proportion.

---

## 5. Layout Principles

### Container
```css
max-width: 1360px;
margin: 0 auto;
padding: 0 32px;
```

### Main Grid
```css
display: grid;
grid-template-columns: 240px 1fr;
gap: 24px;
```
Sidebar (240px) + main content area. Sidebar is `position: sticky`.

### Card Grid
```css
grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
gap: 16px;
```

### Spacing Scale
- Micro: `4px`
- XS: `6-8px` (gaps between tags, meta)
- SM: `10-14px` (inner card gaps)
- MD: `16-22px` (card padding, section gaps)
- LG: `24-32px` (section margins)
- XL: `48-64px` (major section separators)
- Hero padding: `100px 0 10px`

### Border Radii
| Token   | Value  | Usage                              |
|---------|--------|------------------------------------|
| `--r`   | `18px` | Cards, major containers            |
| `--rm`  | `16px` | Inputs, select menus, sidebar CTA  |
| `--rs`  | `12px` | Tags/labels, category buttons      |
| `--rx`  | `8px`  | Small elements, inline controls    |
| `100px` / `999px` | Full pill for tags, chips, badges |

### Section Dividers
Diamond ornament between sections:
```html
<span class="line"></span><span class="diamond">◆</span><span class="line"></span>
```

---

## 6. Depth & Elevation

| Level          | Shadow / Treatment                                              | Usage                    |
|----------------|-----------------------------------------------------------------|--------------------------|
| Flat (L0)      | No shadow                                                       | Backgrounds, text        |
| Surface (L1)   | `inset 0 1px 0 rgba(255,255,255,.02)`                          | Inputs, selects          |
| Card (L2)      | `0 8px 32px rgba(0,0,0,.5)` + gold glow on hover               | Document cards           |
| Panel (L3)     | `0 32px 80px rgba(0,0,0,.2)` + `backdrop-filter: blur(16px)`   | Pricing panel, modals    |
| Overlay (L4)   | `0 24px 56px rgba(0,0,0,.36)` + full blur                      | Dropdowns, sheet modals  |
| Sticky (L5)    | `backdrop-filter: blur(20px)` + top border glow                | Sticky CTA, toolbar      |

### Glassmorphism Pattern
```css
background: var(--glass); /* rgba(14,13,20,.7) dark / rgba(255,255,255,.75) light */
backdrop-filter: var(--glass-b); /* blur(24px) saturate(1.4) */
border: 1px solid rgba(255,255,255,.06); /* subtle edge */
```

### Glow Effects
- Card hover: `0 0 40px rgba(212,175,55,.04)` + conic border
- Button hover: `0 0 60-80px rgba(212,175,55,.06-08)`
- Background orbs: `filter: blur(100px)`, 800px diameter, animated position

---

## 7. Do's and Don'ts

### Do
- Use the gold shimmer gradient on primary headings (Playfair Display 900)
- Keep card backgrounds nearly transparent — gold at 2% opacity
- Use `backdrop-filter: blur()` for floating panels
- Animate with `cubic-bezier(.4, 0, .2, 1)` — smooth, not bouncy
- Keep borders very subtle (gold at 7% opacity default)
- Use uppercase + wide letter-spacing for labels/kickers
- Apply `overflow-wrap: anywhere` on user-facing text to prevent overflow
- Match the obsidian/parchment duality between themes

### Don't
- Use pure white (`#fff`) as text in dark mode — use `#f5f0e6` (warm cream)
- Use pure black (`#000`) as text in light mode — use `#1a1610` (warm charcoal)
- Apply heavy box-shadows in dark theme — rely on glow + border
- Use bright saturated colors for large areas — gold is the only vibrant color
- Make borders visible at default state — they appear on hover
- Use bouncy/springy easing — keep it smooth and elegant
- Add excessive animation duration — max 500ms for UI, 8s for decorative shimmer
- Use `!important` for new styles in `order.css` section — specificity is already scoped

---

## 8. Responsive Behavior

### Breakpoints
| Breakpoint      | Behavior                                              |
|-----------------|-------------------------------------------------------|
| `> 900px`       | Full layout: 240px sidebar + content grid             |
| `<= 900px`      | Sidebar hidden → fullscreen overlay on demand; single column cards |
| `<= 760px`      | Filter chips stack full-width; catalog legal stacks   |
| `<= 640px`      | Hero shrinks; order section single column; footer stacks |
| `<= 480px`      | Ultra-compact: smaller fonts, tighter padding          |

### Mobile (auto-redirect)
Phones (`<= 768px`) auto-redirect to `/app/` — separate React Native (Expo) PWA.

### Key responsive patterns
- Card grid: `minmax(330px, 1fr)` naturally reflows
- Hero title: `clamp(3.2rem, 8vw, 6rem)` — fluid scaling
- Order section: 2-column grid collapses to stacked
- Toolbar inputs maintain 54px height, selects reflow via flex-wrap
- Sidebar becomes a slide-in overlay sheet on mobile

---

## 9. Agent Prompt Guide

When generating UI for Academic Salon:

1. **Always start with dark theme.** It is the default. Gold on obsidian.
2. **Typography hierarchy:** Playfair Display for headings/display (900 weight, shimmer gradient). Inter for everything else. JetBrains Mono for numbers, file sizes, code.
3. **Gold is the only brand color.** Purple is secondary (used sparingly for subject tags). Green/red are semantic only.
4. **Borders are nearly invisible by default** (`rgba(212,175,55,.07)`), becoming visible on hover (`rgba(212,175,55,.2)`).
5. **Surfaces are barely there** — card backgrounds at 2% gold opacity. Glass panels blur the background behind them.
6. **Buttons:** Primary = gold gradient pill/rounded rect with shimmer overlay. Secondary = ghost with subtle border. Never use outlined primary buttons.
7. **Spacing:** Generous but not wasteful. Cards have 22px padding, 16px gaps. Sections separated by 48-64px.
8. **Animation:** Smooth and subtle. Cards lift and glow on hover. Use scroll-reveal for sections entering viewport.
9. **Text colors in dark mode:** `#f5f0e6` (primary), `#a89e88` (secondary), `#6e6454` (tertiary). Never pure white.
10. **Russian language.** All UI text is in Russian. Font must support Cyrillic.
