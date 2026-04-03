/**
 * Application state management
 */
import { D } from '../data/catalog-data.js';

// Bookmarks persistence
const loadBookmarks = () => {
  try {
    const saved = localStorage.getItem('as_bk');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  } catch {
    return new Set();
  }
};

const loadView = () => {
  try {
    const v = localStorage.getItem('as_view');
    return v === 'grid' || v === 'list' ? v : '';
  } catch {
    return '';
  }
};

// Mark duplicate filenames and titles for disambiguation
(function markDuplicates() {
  const filenameCounts = {};
  const titleCounts = {};
  D.forEach(d => {
    const fk = (d.filename || '').toLowerCase();
    const tk = (d.catalogTitle || d.title || d.filename || '').trim().toLowerCase();
    filenameCounts[fk] = (filenameCounts[fk] || 0) + 1;
    titleCounts[tk] = (titleCounts[tk] || 0) + 1;
  });
  D.forEach(d => {
    if (filenameCounts[(d.filename || '').toLowerCase()] > 1) d._dup = true;
    if (titleCounts[(d.catalogTitle || d.title || d.filename || '').trim().toLowerCase()] > 1) d._dupTitle = true;
  });
})();

/** Global app state */
export const S = {
  q: '',
  cat: '',
  subj: '',
  crs: '',
  sort: 'rel',
  view: loadView() || (window.innerWidth <= 640 ? 'list' : 'grid'),
  bk: loadBookmarks(),
  rec: [],
};

export function saveBookmarks() {
  try {
    localStorage.setItem('as_bk', JSON.stringify([...S.bk]));
  } catch {}
}

/** Shorthand DOM lookup */
export const $ = id => document.getElementById(id);
