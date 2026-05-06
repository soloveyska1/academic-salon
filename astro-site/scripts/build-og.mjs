#!/usr/bin/env node
/**
 * Per-doc Open Graph image generator.
 *
 * Reads the catalog from src/data/catalog.js, then renders one 1200×630
 * PNG per document into dist/og/<encoded-slug>.png. Resvg-js does the
 * SVG→PNG conversion; fonts fall back to whatever the OS ships (DejaVu
 * Serif / Sans on the GH Actions runner) so this script stays portable
 * without bundling webfonts.
 *
 * Run as a postbuild step (see package.json scripts.build).
 *
 * Layout — premium dark editorial:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ АС                              ACADEMIC SALON · BIBLIO  │
 *   │ ──────────────                                           │
 *   │                                                          │
 *   │ ТИП · ПРЕДМЕТ · ГОД                                      │
 *   │ Заголовок работы, занимает до трёх строк ──────         │
 *   │                                                          │
 *   │ ──────────────────────────────────────────────────────── │
 *   │ bibliosaloon.ru                  Бесплатно · без рег.    │
 *   └──────────────────────────────────────────────────────────┘
 */

import { Resvg } from '@resvg/resvg-js';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getOgSlug } from '../src/lib/og-slug.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST_OG_DIR = join(ROOT, 'dist', 'og');
const CATALOG_URL = pathToFileURL(join(ROOT, 'src', 'data', 'catalog.js')).href;

const W = 1200;
const H = 630;
const PADDING = 80;

// Approximate character width used for greedy line-wrapping. Cyrillic
// glyphs in Liberation/DejaVu Serif at 48px run ~26px wide; we err on
// the narrow side so titles stay inside the gutter, and any leftover
// overflow gets squeezed via textLength on render.
const TITLE_FONT_PX = 48;
const TITLE_AVG_CHAR_PX = 26;
const MAX_TITLE_LINES = 4;
const MAX_TITLE_CHARS_PER_LINE = Math.floor((W - PADDING * 2) / TITLE_AVG_CHAR_PX);
const TITLE_BLOCK_WIDTH = W - PADDING * 2;

const COLORS = {
  bg: '#09080a',
  bgGlow: '#1a140a',
  gold: '#d4af37',
  goldSoft: '#ecc94b',
  text: '#f0ede8',
  mute: '#9b9590',
  hairline: '#2a261c',
};

function escapeXml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapTitle(raw, maxChars = MAX_TITLE_CHARS_PER_LINE, maxLines = MAX_TITLE_LINES) {
  const words = String(raw || '').replace(/\s+/g, ' ').trim().split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (lines.length === maxLines - 1) {
        // Last line — append the rest, ellipsize if needed.
        const tail = words.slice(words.indexOf(word)).join(' ');
        lines.push(tail.length > maxChars ? tail.slice(0, maxChars - 1).trim() + '…' : tail);
        current = '';
        break;
      }
      current = word;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

const SHORT_TYPE = {
  'Самостоятельная работа': 'Самостоятельная',
  'Выпускная квалификационная работа': 'ВКР',
  'Экзаменационные материалы': 'Экзамен',
  'Контрольная работа': 'Контрольная',
  'Курсовая работа': 'Курсовая',
  'Отчет по практике': 'Отчёт',
  'Отчет о научно-практической работе': 'НПР',
  'Справочный материал': 'Справочник',
  'Нормативный документ': 'Нормативный',
  'Шаблон документа': 'Шаблон',
  'Аналитический документ': 'Аналитика',
  'Методические материалы': 'Методичка',
};

function getYear(doc, fallback) {
  const blob = [doc.filename, doc.newFilename, doc.title, doc.catalogTitle, doc.text]
    .filter(Boolean)
    .join(' ');
  const m = blob.match(/(?:19|20)\d{2}/);
  return m ? m[0] : fallback;
}

function buildSvg(doc) {
  const title = doc.catalogTitle || doc.title || doc.filename || 'Студенческая работа';
  const docType = SHORT_TYPE[doc.docType || ''] || doc.docType || doc.category || '';
  const subject = doc.subject || '';
  const year = getYear(doc, String(new Date().getFullYear()));

  const eyebrowParts = [docType, subject, year].filter(Boolean);
  const eyebrow = eyebrowParts.join(' · ').toUpperCase();
  const titleLines = wrapTitle(title);

  // Anchor the title block higher when the title spans more lines so
  // the eyebrow/title pair stays vertically centered.
  const titleLineHeight = TITLE_FONT_PX * 1.18;
  const titleBlockHeight = titleLines.length * titleLineHeight;
  const titleStartY = Math.round((H - titleBlockHeight) / 2 + TITLE_FONT_PX * 0.85);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" fill="none">
  <defs>
    <radialGradient id="glow" cx="14%" cy="78%" r="80%">
      <stop offset="0%" stop-color="${COLORS.bgGlow}" stop-opacity="0.7"/>
      <stop offset="60%" stop-color="${COLORS.bg}" stop-opacity="1"/>
    </radialGradient>
    <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${COLORS.gold}"/>
      <stop offset="100%" stop-color="${COLORS.goldSoft}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${COLORS.bg}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <!-- Top-left: monogram АС -->
  <g transform="translate(${PADDING}, ${PADDING})">
    <rect x="0" y="0" width="56" height="56" rx="8" fill="none" stroke="url(#goldGrad)" stroke-width="1.5"/>
    <text x="28" y="40" text-anchor="middle"
          font-family="Georgia, 'Times New Roman', 'Liberation Serif', 'DejaVu Serif', serif"
          font-size="26" font-style="italic" font-weight="400"
          fill="url(#goldGrad)">АС</text>
  </g>

  <!-- Top-right: brand line -->
  <text x="${W - PADDING}" y="${PADDING + 36}" text-anchor="end"
        font-family="'Helvetica Neue', Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif"
        font-size="14" font-weight="400" letter-spacing="3"
        fill="${COLORS.gold}" opacity="0.85">ACADEMIC SALON · BIBLIO</text>

  <!-- Hairline under monogram -->
  <line x1="${PADDING}" y1="${PADDING + 84}" x2="${PADDING + 80}" y2="${PADDING + 84}"
        stroke="${COLORS.gold}" stroke-width="1" opacity="0.6"/>

  <!-- Eyebrow: тип · предмет · год -->
  ${eyebrow ? `<text x="${PADDING}" y="${titleStartY - TITLE_FONT_PX - 12}"
        font-family="'Helvetica Neue', Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif"
        font-size="18" font-weight="500" letter-spacing="3"
        fill="${COLORS.gold}">${escapeXml(eyebrow)}</text>` : ''}

  <!-- Title — up to 4 lines, with textLength as a safety net so any
       residual overflow gets gently squeezed instead of clipped. -->
  ${titleLines.map((line, i) => {
    const naturalWidth = line.length * TITLE_AVG_CHAR_PX;
    const needsSqueeze = naturalWidth > TITLE_BLOCK_WIDTH;
    const lengthAttrs = needsSqueeze
      ? ` textLength="${TITLE_BLOCK_WIDTH}" lengthAdjust="spacingAndGlyphs"`
      : '';
    return `
    <text x="${PADDING}" y="${titleStartY + i * titleLineHeight}"
          font-family="Georgia, 'Times New Roman', 'Liberation Serif', 'DejaVu Serif', serif"
          font-size="${TITLE_FONT_PX}" font-weight="400"
          fill="${COLORS.text}"${lengthAttrs}>${escapeXml(line)}</text>`;
  }).join('')}

  <!-- Bottom hairline -->
  <line x1="${PADDING}" y1="${H - PADDING - 48}" x2="${W - PADDING}" y2="${H - PADDING - 48}"
        stroke="${COLORS.hairline}" stroke-width="1"/>

  <!-- Footer left: domain -->
  <text x="${PADDING}" y="${H - PADDING}"
        font-family="'Helvetica Neue', Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif"
        font-size="20" font-weight="500" letter-spacing="1"
        fill="${COLORS.text}">bibliosaloon.ru</text>

  <!-- Footer right: tagline -->
  <text x="${W - PADDING}" y="${H - PADDING}" text-anchor="end"
        font-family="Georgia, 'Times New Roman', 'Liberation Serif', 'DejaVu Serif', serif"
        font-size="20" font-style="italic" font-weight="400"
        fill="${COLORS.mute}">бесплатно · без регистрации</text>
</svg>`;
}

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const dist = await fileExists(join(ROOT, 'dist'));
  if (!dist) {
    console.error('[og] dist/ does not exist — run `npm run build` first.');
    process.exit(1);
  }

  const { D } = await import(CATALOG_URL);
  await mkdir(DIST_OG_DIR, { recursive: true });

  const t0 = Date.now();
  let written = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of D) {
    if (!doc?.file) {
      skipped += 1;
      continue;
    }
    const slug = getOgSlug(doc.file);
    const out = join(DIST_OG_DIR, `${slug}.png`);

    try {
      const svg = buildSvg(doc);
      const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: W },
        font: {
          loadSystemFonts: true,
          // System defaults handle Cyrillic on the GH Actions Ubuntu image
          // (DejaVu / Liberation are pre-installed via fontconfig).
        },
      });
      const png = resvg.render().asPng();
      await writeFile(out, png);
      written += 1;
    } catch (err) {
      failed += 1;
      console.error(`[og] FAIL ${doc.file}: ${err.message}`);
    }
  }

  const ms = Date.now() - t0;
  console.log(`[og] ${written} png · ${skipped} skipped · ${failed} failed · ${ms}ms · → dist/og/`);
  if (failed > 0) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('[og] fatal:', err);
    process.exit(1);
  });
}
