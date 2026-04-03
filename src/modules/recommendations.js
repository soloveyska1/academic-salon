/**
 * Recommendations — "Вам может понравиться" based on browsing history
 *
 * Algorithm:
 * 1. Track viewed documents in localStorage (last 50)
 * 2. Build preference profile: most viewed categories, subjects, courses
 * 3. Score all documents by how well they match the profile
 * 4. Exclude already-viewed documents
 * 5. Return top N recommendations
 */
import { D } from '../data/catalog-data.js';
import { gTitle, gExt, escAttr } from './utils.js';
import { buildDownloadHref } from './stats.js';
import { $ } from './state.js';

const STORAGE_KEY = 'as_rec_history';
const MAX_HISTORY = 50;

/** Load view history from localStorage */
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Save view history */
function saveHistory(history) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch {}
}

/** Record a document view */
export function recordView(doc) {
  if (!doc || !doc.file) return;
  const history = loadHistory();
  // Remove duplicate, add to front
  const filtered = history.filter(h => h.file !== doc.file);
  filtered.unshift({
    file: doc.file,
    category: doc.category || '',
    subject: doc.subject || '',
    course: doc.course || '',
    ts: Date.now(),
  });
  saveHistory(filtered);
}

/** Build preference profile from history */
function buildProfile(history) {
  const cats = {};
  const subjs = {};
  const courses = {};

  history.forEach((h, i) => {
    // More recent views get higher weight
    const weight = Math.max(1, 10 - i * 0.2);
    if (h.category) cats[h.category] = (cats[h.category] || 0) + weight;
    if (h.subject) subjs[h.subject] = (subjs[h.subject] || 0) + weight;
    if (h.course) courses[h.course] = (courses[h.course] || 0) + weight;
  });

  return { cats, subjs, courses };
}

/** Get recommended documents */
export function getRecommendations(limit = 6) {
  const history = loadHistory();
  if (history.length < 2) return []; // Need at least 2 views for recommendations

  const profile = buildProfile(history);
  const viewedFiles = new Set(history.map(h => h.file));

  // Score each unviewed document
  const scored = D
    .filter(d => d.exists !== false && !viewedFiles.has(d.file))
    .map(d => {
      let score = 0;
      if (d.category && profile.cats[d.category]) score += profile.cats[d.category] * 3;
      if (d.subject && profile.subjs[d.subject]) score += profile.subjs[d.subject] * 2;
      if (d.course && profile.courses[d.course]) score += profile.courses[d.course] * 1;
      // Small random factor to vary recommendations
      score += Math.random() * 2;
      return { ...d, _recScore: score };
    })
    .filter(d => d._recScore > 0)
    .sort((a, b) => b._recScore - a._recScore);

  return scored.slice(0, limit);
}

/** Render recommendations section HTML */
export function renderRecommendations() {
  const recs = getRecommendations(6);
  if (!recs.length) return '';

  let html = '<div class="rec-section" id="recSection">';
  html += '<div class="rec-section-header">';
  html += '<div class="rec-section-title">Вам может понравиться</div>';
  html += '<div class="rec-section-sub">На основе ваших просмотров</div>';
  html += '</div>';
  html += '<div class="rec-grid">';

  recs.forEach(d => {
    const ext = gExt(d.filename);
    const title = gTitle(d);
    const meta = [d.category, d.subject !== 'Общее' ? d.subject : '', d.course].filter(Boolean).join(' · ');
    const safeFile = d.file.replace(/'/g, "\\'");

    html += `<div class="rec-card" onclick="oMF('${safeFile}')">
      <div class="rec-card-top">
        <div class="fi fi-${ext} rec-card-fi">${ext.toUpperCase()}</div>
        <a class="rec-card-dl" href="${buildDownloadHref(d.file)}" data-dl-file="${escAttr(d.file)}" download onclick="event.stopPropagation()" title="Скачать">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </a>
      </div>
      <div class="rec-card-title">${title}</div>
      <div class="rec-card-meta">${meta}</div>
      <div class="rec-card-size">${d.size}</div>
    </div>`;
  });

  html += '</div></div>';
  return html;
}
