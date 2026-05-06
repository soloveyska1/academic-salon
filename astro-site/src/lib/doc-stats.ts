/**
 * Heuristic page/reading-time estimates for catalog docs.
 *
 * We don't extract real text from .docx/.pdf at build time (would slow
 * the build and add chunky deps), so we infer length from file size +
 * extension. The numbers are wrapped as a range and labelled "≈ …" on
 * the page so the user understands it's an estimate, not a measurement.
 *
 * Calibration (KB per page, ~250 words/page):
 *   docx :  8–14   — pure text, occasional formatting
 *   doc  :  9–15   — older format slightly bigger
 *   pdf  : 35–70   — text-only PDF; image-heavy is much higher
 *   rtf  :  6–10
 *   odt  :  9–15
 *   txt  :  2–3.5  — plain text, no overhead
 *
 * Reading speed: 200 words/min — common Russian-prose baseline.
 */

const KB_PER_PAGE: Record<string, [number, number]> = {
  docx: [8, 14],
  doc: [9, 15],
  pdf: [35, 70],
  rtf: [6, 10],
  odt: [9, 15],
  txt: [2.5, 3.5],
};

const WORDS_PER_PAGE = 250;
const WORDS_PER_MIN = 200;

export interface DocStats {
  /** Display string: "8" or "8–12" */
  pages: string;
  /** Display string: "10" or "10–15" */
  minutes: string;
  /** True if both ends collapsed to the same integer (no en dash). */
  isPoint: boolean;
}

function parseSizeKb(size: string | undefined): number | null {
  if (!size) return null;
  // Catalog stores sizes as "17.2 KB", "1.4 MB", "542 B"
  const m = String(size).trim().match(/^([\d.,]+)\s*(B|KB|MB|GB)?$/i);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  if (!isFinite(n) || n <= 0) return null;
  const unit = (m[2] || 'KB').toUpperCase();
  switch (unit) {
    case 'B':  return n / 1024;
    case 'KB': return n;
    case 'MB': return n * 1024;
    case 'GB': return n * 1024 * 1024;
    default:   return n;
  }
}

function getExt(doc: { filename?: string }): string {
  if (!doc.filename) return '';
  const i = doc.filename.lastIndexOf('.');
  return i >= 0 ? doc.filename.slice(i + 1).toLowerCase() : '';
}

export function getDocStats(doc: { size?: string; filename?: string }): DocStats | null {
  const sizeKb = parseSizeKb(doc.size);
  if (sizeKb === null) return null;
  const ext = getExt(doc);
  const [kbLo, kbHi] = KB_PER_PAGE[ext] || [10, 16];

  // size / kbHi gives the FEWER pages estimate (denser pages),
  // size / kbLo gives the MORE pages estimate (sparser pages).
  const pagesLo = Math.max(1, Math.round(sizeKb / kbHi));
  const pagesHi = Math.max(pagesLo, Math.round(sizeKb / kbLo));

  const minLo = Math.max(1, Math.round((pagesLo * WORDS_PER_PAGE) / WORDS_PER_MIN));
  const minHi = Math.max(minLo, Math.round((pagesHi * WORDS_PER_PAGE) / WORDS_PER_MIN));

  const isPoint = pagesLo === pagesHi && minLo === minHi;
  return {
    pages: pagesLo === pagesHi ? `${pagesLo}` : `${pagesLo}–${pagesHi}`,
    minutes: minLo === minHi ? `${minLo}` : `${minLo}–${minHi}`,
    isPoint,
  };
}

/** Plural form of "страница" for an integer count. */
export function pluralPages(n: number): string {
  const m100 = n % 100;
  const m10 = n % 10;
  if (m100 >= 11 && m100 <= 14) return 'страниц';
  if (m10 === 1) return 'страница';
  if (m10 >= 2 && m10 <= 4) return 'страницы';
  return 'страниц';
}

/** Plural form of "минута" for an integer count. */
export function pluralMinutes(n: number): string {
  const m100 = n % 100;
  const m10 = n % 10;
  if (m100 >= 11 && m100 <= 14) return 'минут';
  if (m10 === 1) return 'минута';
  if (m10 >= 2 && m10 <= 4) return 'минуты';
  return 'минут';
}

/**
 * Human-friendly "≈ 8–12 страниц · 10–15 мин чтения" string. The label
 * always uses the upper-bound for the noun form (so 1–2 страницы reads
 * as "страницы", not "страница").
 */
export function formatDocStats(stats: DocStats | null): string | null {
  if (!stats) return null;
  // Take the upper bound for plural agreement.
  const pUpper = Number(stats.pages.split('–').pop());
  const mUpper = Number(stats.minutes.split('–').pop());
  const pages = `${stats.pages} ${pluralPages(pUpper)}`;
  const minutes = `${stats.minutes} ${pluralMinutes(mUpper)} чтения`;
  return `≈ ${pages} · ${minutes}`;
}
