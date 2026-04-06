import { Linking, Platform } from 'react-native';
import { Document } from '../types/document';
import { API_BASE, CATALOG_URL } from '../constants/api';

/**
 * Fetch the full document catalog from the server.
 * Uses absolute URL to avoid path issues when served from /mobile/
 */
export async function fetchCatalog(): Promise<Document[]> {
  const response = await fetch(CATALOG_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch catalog: ${response.status}`);
  }
  const data: Document[] = await response.json();
  return data;
}

/**
 * Return the best available title for a document.
 */
export function getDocumentTitle(doc: Document): string {
  if (doc.catalogTitle) return doc.catalogTitle;
  if (doc.title) return doc.title;
  // Strip extension from filename
  const name = doc.filename || doc.file;
  return name.replace(/\.[^/.]+$/, '');
}

/**
 * Return the best available description for a document.
 */
export function getDocumentDescription(doc: Document): string {
  return doc.catalogDescription || doc.description || doc.text || '';
}

/**
 * Extract file extension (lowercase, without dot).
 */
export function getFileExtension(filename: string): string {
  const match = filename.match(/\.([^.]+)$/);
  if (!match) return '';
  return match[1].toLowerCase();
}

/**
 * Parse a human-readable size string like "17.2 KB" into bytes,
 * then estimate the number of pages (~3000 bytes per page for docx).
 */
export function estimatePages(size: string): number {
  const bytes = parseSize(size);
  if (bytes <= 0) return 1;
  // Rough estimate: ~3 KB per page for typical docx/doc, ~5 KB for pdf
  const pagesEstimate = Math.max(1, Math.round(bytes / 3000));
  return pagesEstimate;
}

/**
 * Parse a size string like "17.2 KB" or "1.5 MB" into bytes.
 */
function parseSize(size: string): number {
  if (!size) return 0;
  const match = size.match(/([\d.]+)\s*(KB|MB|GB|B)/i);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  switch (unit) {
    case 'B':
      return value;
    case 'KB':
      return value * 1024;
    case 'MB':
      return value * 1024 * 1024;
    case 'GB':
      return value * 1024 * 1024 * 1024;
    default:
      return 0;
  }
}

/**
 * Build the full download URL for a document file path.
 */
export function getDownloadUrl(file: string): string {
  return `${API_BASE}/${encodeURI(file)}`;
}

function triggerWebAnchor(url: string, download?: string) {
  if (typeof document === 'undefined') return;

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.rel = 'noopener noreferrer';
  anchor.target = '_blank';
  if (download) anchor.download = download;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export async function openDocumentFile(file: string): Promise<string> {
  const url = getDownloadUrl(file);

  if (Platform.OS === 'web') {
    triggerWebAnchor(url);
    return url;
  }

  await Linking.openURL(url);
  return url;
}

export async function downloadDocumentFile(file: string): Promise<string> {
  const url = getDownloadUrl(file);
  const filename = file.split('/').pop() || 'document';

  if (Platform.OS === 'web') {
    triggerWebAnchor(url, filename);
    return url;
  }

  await Linking.openURL(url);
  return url;
}

export function inferWorkType(doc: Document): string {
  const category = (doc.category || '').toLowerCase();
  const docType = (doc.docType || '').toLowerCase();

  if (category.includes('вкр') || category.includes('диплом')) return 'ВКР / Дипломная';
  if (category.includes('курсов')) return 'Курсовая работа';
  if (category.includes('реферат')) return 'Реферат';
  if (category.includes('практик')) return 'Отчёт по практике';
  if (docType.includes('эссе') || category.includes('эссе')) return 'Эссе';
  if (docType.includes('контроль') || category.includes('контроль')) return 'Контрольная работа';

  return 'Другое';
}

/**
 * Return an emoji representing the document category.
 */
export function getCategoryEmoji(category: string): string {
  const map: Record<string, string> = {
    'ВКР и дипломы': '\uD83C\uDF93',         // graduation cap
    'Курсовые работы': '\uD83D\uDCDD',        // memo
    'Рефераты': '\uD83D\uDCC4',               // page facing up
    'Контрольные работы': '\u2705',            // check mark
    'Практические работы': '\uD83D\uDD27',    // wrench
    'Лабораторные работы': '\uD83E\uDDEA',    // test tube
    'Отчёты по практике': '\uD83D\uDCCB',     // clipboard
    'Методические материалы': '\uD83D\uDCD6', // open book
    'Презентации': '\uD83D\uDCCA',            // bar chart
    'Эссе': '\u270D\uFE0F',                   // writing hand
    'Доклады': '\uD83C\uDFE4',                // microphone
    'Экзаменационные материалы': '\uD83D\uDCDD',
  };
  return map[category] || '\uD83D\uDCC1'; // file folder fallback
}

/**
 * Score a document against a search query, then filter and sort by relevance.
 * Ported from src/modules/search.js score() function.
 */
export function searchDocuments(docs: Document[], query: string): Document[] {
  if (!query || !query.trim()) return docs;

  const ql = query.toLowerCase();
  const words = ql.split(/\s+/).filter(Boolean);

  type ScoredDoc = Document & { _score: number };

  const scored: ScoredDoc[] = docs.map((d) => {
    let s = 0;

    const fn = (d.catalogTitle || d.title || d.filename || '').toLowerCase();
    const ds = [d.catalogDescription, d.description, d.text, (d.tags || []).join(' ')]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const ca = (d.category || '').toLowerCase();
    const su = (d.subject || '').toLowerCase();
    const tp = (d.docType || '').toLowerCase();
    const nf = (d.newFilename || '').toLowerCase();
    const of_ = (d.oldFilename || d.filename || '').toLowerCase();

    for (const w of words) {
      if (fn.includes(w)) s += 10;
      if (nf.includes(w) || of_.includes(w)) s += 9;
      if (su.includes(w)) s += 8;
      if (tp.includes(w)) s += 7;
      if (ca.includes(w)) s += 5;
      if (ds.includes(w)) s += 3;
    }

    // Fuzzy fallback: try truncated words
    if (s === 0) {
      const all = [fn, ds, ca, su, tp, nf, of_].join(' ');
      let m = 0;
      for (const w of words) {
        if (all.includes(w.slice(0, Math.max(2, w.length - 1)))) m++;
      }
      if (m) s = m * 0.5;
    }

    return { ...d, _score: s };
  });

  return scored
    .filter((d) => d._score > 0)
    .sort((a, b) => b._score - a._score);
}
