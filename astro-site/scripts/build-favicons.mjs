#!/usr/bin/env node
/**
 * Конвертирует public/favicon.svg в растровые PNG разных размеров
 * для лучшей совместимости с Яндекс, Google и legacy-браузерами.
 *
 * Запускать вручную после правки SVG-логотипа:
 *   node scripts/build-favicons.mjs
 *
 * Не подключён к build-pipeline — растры лежат в public/ как статика.
 */

import { Resvg } from '@resvg/resvg-js';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_FAVICON = resolve(ROOT, 'public/favicon.svg');
const SRC_APPLE = resolve(ROOT, 'public/apple-touch-icon.svg');
const SRC_192 = resolve(ROOT, 'public/icon-192.svg');
const SRC_512 = resolve(ROOT, 'public/icon-512.svg');

const TARGETS = [
  { src: SRC_FAVICON, out: 'favicon-16x16.png',  size: 16  },
  { src: SRC_FAVICON, out: 'favicon-32x32.png',  size: 32  },
  { src: SRC_FAVICON, out: 'favicon-48x48.png',  size: 48  },
  { src: SRC_FAVICON, out: 'favicon-96x96.png',  size: 96  },
  { src: SRC_FAVICON, out: 'favicon-120x120.png', size: 120 },
  { src: SRC_APPLE,   out: 'apple-touch-icon.png', size: 180 },
  { src: SRC_192,     out: 'icon-192.png',  size: 192 },
  { src: SRC_512,     out: 'icon-512.png',  size: 512 },
];

for (const t of TARGETS) {
  const svg = await readFile(t.src, 'utf8');
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: t.size },
    background: 'rgba(0,0,0,0)', // прозрачный фон
  });
  const png = resvg.render().asPng();
  const outPath = resolve(ROOT, 'public', t.out);
  await writeFile(outPath, png);
  console.log(`✓ ${t.out} (${png.length} B)`);
}

console.log('\nГотово. Теперь обновится фавиконка для Яндекса/Google.');
