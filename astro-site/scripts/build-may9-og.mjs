#!/usr/bin/env node
/**
 * Конвертирует public/may9/og-may9.svg → public/may9/og-may9.png (1200×630).
 * Запускать вручную после правки SVG: `node scripts/build-may9-og.mjs`.
 * Не подключён к pipeline build — PNG лежит в public/ как статика.
 */

import { Resvg } from '@resvg/resvg-js';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'public/may9/og-may9.svg');
const OUT = resolve(ROOT, 'public/may9/og-may9.png');

const svg = await readFile(SRC, 'utf8');

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
  font: {
    loadSystemFonts: true,
    defaultFontFamily: 'Cormorant Garamond',
    serifFamily: 'Cormorant Garamond',
    sansSerifFamily: 'Inter Tight',
    monospaceFamily: 'JetBrains Mono',
  },
  background: '#0d0a07',
});

const png = resvg.render().asPng();
await writeFile(OUT, png);
console.log(`✓ ${OUT} (${png.length} bytes)`);
