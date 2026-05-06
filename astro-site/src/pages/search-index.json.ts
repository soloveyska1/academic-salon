/**
 * Slim search index for the global Nav search palette.
 *
 * Only the bytes the client needs to filter live: title, type, subject,
 * file slug. Full text + descriptions stay in catalog.js (used by /catalog
 * and /doc) so we don't pay 500KB on every search-overlay open.
 *
 * Each entry:
 *   { f: file, t: title, s: subject, c: category, k: type }
 *
 * Lazy-loaded when the user actually opens the palette — no impact on
 * the critical path of any other page.
 */

import type { APIRoute } from 'astro';
import { D } from '../data/catalog.js';

export const GET: APIRoute = () => {
  const items = (D as any[])
    .filter((doc) => doc?.file)
    .map((doc) => ({
      f: doc.file,
      t: doc.catalogTitle || doc.title || doc.filename || 'Документ',
      s: doc.subject || '',
      c: doc.category || '',
      k: doc.docType || '',
    }));

  return new Response(JSON.stringify({ docs: items }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
