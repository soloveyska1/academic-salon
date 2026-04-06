/**
 * Bottom sheet component — document detail view
 */
import { D } from '../data/catalog-data.js';
import { S, saveBookmarks } from '../modules/state.js';
import { gTitle, gExt, gDesc, escAttr } from '../modules/utils.js';
import { buildDownloadHref } from '../modules/stats.js';
import { initBottomSheetGestures, haptic } from './mobile-gestures.js';

let activeSheet = null;
let activeOverlay = null;

/**
 * Find related documents by matching category or subject
 */
function findRelated(doc, max = 8) {
  return D.filter(d =>
    d.file !== doc.file &&
    (d.category === doc.category || d.subject === doc.subject)
  ).slice(0, max);
}

/**
 * Build the sheet inner HTML
 */
function buildSheetHTML(doc) {
  const title = gTitle(doc);
  const ext = gExt(doc.filename);
  const desc = gDesc(doc);
  const href = buildDownloadHref(doc.file);
  const isBookmarked = S.bk.has(doc.file);
  const related = findRelated(doc);

  let relatedHTML = '';
  if (related.length) {
    relatedHTML = `
      <div class="mob-sheet-related">
        <h4>Похожие работы</h4>
        <div class="mob-sheet-related-scroll">
          ${related.map(r => `
            <button class="mob-sheet-related-item" data-file="${escAttr(r.file)}">
              <span class="mob-sheet-related-ext">${gExt(r.filename)}</span>
              <span class="mob-sheet-related-title">${escAttr(gTitle(r))}</span>
            </button>
          `).join('')}
        </div>
      </div>`;
  }

  return `
    <div class="mob-sheet-handle"><span></span></div>
    <div class="mob-sheet-body">
      <div class="mob-sheet-header">
        <span class="mob-sheet-ext">${ext}</span>
        <h3 class="mob-sheet-title">${escAttr(title)}</h3>
        ${doc.category ? `<span class="mob-sheet-tag">${escAttr(doc.category)}</span>` : ''}
        ${doc.subject ? `<span class="mob-sheet-tag mob-sheet-tag-sub">${escAttr(doc.subject)}</span>` : ''}
        ${doc.course ? `<span class="mob-sheet-tag mob-sheet-tag-crs">${doc.course} курс</span>` : ''}
      </div>

      ${desc ? `<p class="mob-sheet-desc">${escAttr(desc)}</p>` : ''}
      ${doc.size ? `<p class="mob-sheet-meta">${escAttr(doc.size)}</p>` : ''}

      <div class="mob-sheet-stats" id="mobSheetStats"></div>

      <div class="mob-sheet-actions">
        <a class="mob-sheet-dl" href="${escAttr(href)}" download>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Скачать
        </a>

        <div class="mob-sheet-secondary">
          <button class="mob-sheet-btn mob-sheet-bk ${isBookmarked ? 'active' : ''}" data-action="bookmark">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </button>
          <button class="mob-sheet-btn" data-action="preview">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="mob-sheet-btn" data-action="share">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          </button>
        </div>
      </div>

      ${relatedHTML}

      <div class="mob-sheet-upsell">
        <p>Нужна похожая работа?</p>
        <button class="mob-sheet-upsell-btn" data-action="order">Заказать</button>
      </div>
    </div>`;
}

/**
 * Open the bottom sheet for a given document
 */
export function openSheet(doc) {
  if (activeSheet) closeSheet();

  // Overlay
  activeOverlay = document.createElement('div');
  activeOverlay.className = 'mob-sheet-overlay';
  activeOverlay.addEventListener('click', closeSheet);
  document.body.appendChild(activeOverlay);

  // Sheet
  activeSheet = document.createElement('div');
  activeSheet.className = 'mob-sheet';
  activeSheet.innerHTML = buildSheetHTML(doc);
  document.body.appendChild(activeSheet);

  // Prevent body scroll
  document.body.classList.add('mob-sheet-open');

  // Animate in
  requestAnimationFrame(() => {
    activeOverlay.classList.add('visible');
    activeSheet.classList.add('visible');
  });

  // Gestures
  initBottomSheetGestures(activeSheet, closeSheet);

  // Action handlers
  activeSheet.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'bookmark') {
      haptic('light');
      if (S.bk.has(doc.file)) {
        S.bk.delete(doc.file);
        btn.classList.remove('active');
        btn.querySelector('svg').setAttribute('fill', 'none');
      } else {
        S.bk.add(doc.file);
        btn.classList.add('active');
        btn.querySelector('svg').setAttribute('fill', 'currentColor');
      }
      saveBookmarks();
    } else if (action === 'preview') {
      if (typeof window.oMF === 'function') {
        window.oMF(doc.file);
      } else if (typeof window._mobOpenFile === 'function') {
        window._mobOpenFile(doc.file);
      }
    } else if (action === 'share') {
      if (typeof window.shareDoc === 'function') {
        window.shareDoc(doc.file);
      } else if (typeof window._mobShareDoc === 'function') {
        window._mobShareDoc(doc.file);
      }
    } else if (action === 'order') {
      closeSheet();
      if (typeof window._mobSwitchTab === 'function') {
        window._mobSwitchTab('order');
      }
    }
  });

  // Related doc clicks
  activeSheet.addEventListener('click', e => {
    const item = e.target.closest('.mob-sheet-related-item');
    if (!item) return;
    const file = item.dataset.file;
    const related = D.find(d => d.file === file);
    if (related) {
      haptic('light');
      closeSheet();
      requestAnimationFrame(() => openSheet(related));
    }
  });
}

/**
 * Animate sheet closed and clean up
 */
export function closeSheet() {
  if (!activeSheet) return;

  const sheet = activeSheet;
  const overlay = activeOverlay;
  activeSheet = null;
  activeOverlay = null;

  document.body.classList.remove('mob-sheet-open');
  sheet.classList.remove('visible');
  sheet.classList.add('dismissing');
  if (overlay) {
    overlay.classList.remove('visible');
    overlay.classList.add('dismissing');
  }

  sheet.addEventListener('transitionend', () => {
    sheet.remove();
    if (overlay) overlay.remove();
  }, { once: true });

  // Fallback removal in case transitionend doesn't fire
  setTimeout(() => {
    if (sheet.parentNode) sheet.remove();
    if (overlay && overlay.parentNode) overlay.remove();
  }, 400);
}
