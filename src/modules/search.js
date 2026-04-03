/**
 * Search, filtering, and sorting
 */
import { D } from '../data/catalog-data.js';
import { S } from './state.js';
import { pSz, gTitle } from './utils.js';

/** Score a document against search query */
export function score(d, q) {
  if (!q) return 1;
  const ql = q.toLowerCase();
  const ws = ql.split(/\s+/).filter(Boolean);
  let s = 0;
  const fn = (d.catalogTitle || d.title || d.filename || '').toLowerCase();
  const ds = [d.catalogDescription, d.description, d.text, (d.tags || []).join(' ')].filter(Boolean).join(' ').toLowerCase();
  const ca = (d.category || '').toLowerCase();
  const su = (d.subject || '').toLowerCase();
  const tp = (d.docType || '').toLowerCase();
  const nf = (d.newFilename || '').toLowerCase();
  const of_ = (d.oldFilename || d.filename || '').toLowerCase();

  for (const w of ws) {
    if (fn.includes(w)) s += 10;
    if (nf.includes(w) || of_.includes(w)) s += 9;
    if (su.includes(w)) s += 8;
    if (tp.includes(w)) s += 7;
    if (ca.includes(w)) s += 5;
    if (ds.includes(w)) s += 3;
  }
  if (s === 0) {
    const all = [fn, ds, ca, su, tp, nf, of_].join(' ');
    let m = 0;
    for (const w of ws) {
      if (all.includes(w.slice(0, Math.max(2, w.length - 1)))) m++;
    }
    if (m) s = m * .5;
  }
  return s;
}

/** Get filtered and sorted documents */
export function getF() {
  let r = D.filter(d => d.exists !== false);
  if (S.cat === 'bookmarks') r = r.filter(d => S.bk.has(d.file));
  else if (S.cat) r = r.filter(d => d.category === S.cat);
  if (S.subj) r = r.filter(d => d.subject === S.subj);
  if (S.crs) r = r.filter(d => d.course === S.crs);
  if (S.q) r = r.map(d => ({ ...d, _s: score(d, S.q) })).filter(d => d._s > 0);

  switch (S.sort) {
    case 'az': r.sort((a, b) => gTitle(a).localeCompare(gTitle(b), 'ru')); break;
    case 'za': r.sort((a, b) => gTitle(b).localeCompare(gTitle(a), 'ru')); break;
    case 'sd': r.sort((a, b) => pSz(b.size) - pSz(a.size)); break;
    case 'sa': r.sort((a, b) => pSz(a.size) - pSz(b.size)); break;
    case 'rel':
      if (S.q) r.sort((a, b) => (b._s || 0) - (a._s || 0));
      else r.sort((a, b) => gTitle(a).localeCompare(gTitle(b), 'ru'));
      break;
  }
  return r;
}
