/**
 * Command Palette — quick access to everything via Cmd+K / Ctrl+K
 */
import { D } from '../data/catalog-data.js';
import { S, $ } from './state.js';
import { gTitle, gDesc, gExt, hl, escAttr } from './utils.js';
import { score } from './search.js';

let overlay = null;
let input = null;
let resultsEl = null;
let activeIdx = -1;
let currentItems = [];

const ACTIONS = [
  { id: 'order', icon: '&#9997;&#65039;', title: 'Заказать работу', meta: 'Оставить заявку на индивидуальную работу', action: () => { window.openOrderForm && window.openOrderForm(); } },
  { id: 'dark', icon: '&#127769;', title: 'Переключить тему', meta: 'Тёмная / светлая', action: () => { const t = $('thm'); if (t) t.click(); } },
  { id: 'top', icon: '&#11014;&#65039;', title: 'Наверх', meta: 'Вернуться к началу страницы', action: () => { window.scrollTo({ top: 0, behavior: 'smooth' }); } },
  { id: 'faq', icon: '&#10067;', title: 'Частые вопросы', meta: 'Перейти к разделу FAQ', action: () => { const el = $('faqSection'); if (el) el.scrollIntoView({ behavior: 'smooth' }); } },
  { id: 'prices', icon: '&#128176;', title: 'Цены на заказ', meta: 'Калькулятор стоимости', action: () => { const el = $('orderSection'); if (el) el.scrollIntoView({ behavior: 'smooth' }); } },
  { id: 'reset', icon: '&#128260;', title: 'Сбросить фильтры', meta: 'Очистить все фильтры и поиск', action: () => { window.resetFilters && window.resetFilters(); } },
];

function createOverlay() {
  if (overlay) return;

  overlay = document.createElement('div');
  overlay.className = 'cmd-overlay';
  overlay.innerHTML = `
    <div class="cmd-box">
      <div class="cmd-input-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="cmd-input" id="cmdInput" placeholder="Поиск документов, действия..." autocomplete="off" spellcheck="false">
        <div class="cmd-kbd"><kbd>Esc</kbd></div>
      </div>
      <div class="cmd-results" id="cmdResults"></div>
      <div class="cmd-footer">
        <div class="cmd-footer-item"><kbd>↑</kbd><kbd>↓</kbd> навигация</div>
        <div class="cmd-footer-item"><kbd>↵</kbd> выбрать</div>
        <div class="cmd-footer-item"><kbd>Esc</kbd> закрыть</div>
      </div>
    </div>
  `;

  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);

  input = document.getElementById('cmdInput');
  resultsEl = document.getElementById('cmdResults');

  input.addEventListener('input', () => search(input.value));
  input.addEventListener('keydown', handleKeydown);
}

function open() {
  createOverlay();
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  input.value = '';
  activeIdx = -1;
  search('');
  requestAnimationFrame(() => input.focus());
}

function close() {
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function isOpen() {
  return overlay && overlay.classList.contains('open');
}

function search(query) {
  const q = (query || '').trim();
  currentItems = [];
  let html = '';

  // Actions that match query
  const matchedActions = ACTIONS.filter(a => {
    if (!q) return true;
    const ql = q.toLowerCase();
    return a.title.toLowerCase().includes(ql) || a.meta.toLowerCase().includes(ql);
  });

  if (matchedActions.length && (!q || matchedActions.length < ACTIONS.length)) {
    html += '<div class="cmd-group-label">Действия</div>';
    matchedActions.forEach(a => {
      const idx = currentItems.length;
      currentItems.push({ type: 'action', data: a });
      html += `<button class="cmd-item" data-idx="${idx}">
        <div class="cmd-item-ico action">${a.icon}</div>
        <div class="cmd-item-body">
          <div class="cmd-item-title">${a.title}</div>
          <div class="cmd-item-meta">${a.meta}</div>
        </div>
      </button>`;
    });
  }

  // Document search
  let docs = D.filter(d => d.exists !== false);
  if (q) {
    docs = docs.map(d => ({ ...d, _s: score(d, q) })).filter(d => d._s > 0).sort((a, b) => b._s - a._s);
  } else {
    docs = docs.slice(0, 8); // Show first 8 when no query
  }
  docs = docs.slice(0, 12);

  if (docs.length) {
    html += '<div class="cmd-group-label">Документы</div>';
    docs.forEach(d => {
      const idx = currentItems.length;
      const ext = gExt(d.filename);
      const title = q ? hl(gTitle(d), q) : gTitle(d);
      const meta = [d.category, d.subject !== 'Общее' ? d.subject : '', d.course].filter(Boolean).join(' · ');
      currentItems.push({ type: 'doc', data: d });
      html += `<button class="cmd-item" data-idx="${idx}">
        <div class="cmd-item-ico ${ext}">${ext.toUpperCase()}</div>
        <div class="cmd-item-body">
          <div class="cmd-item-title">${title}</div>
          <div class="cmd-item-meta">${meta} · ${d.size}</div>
        </div>
        <span class="cmd-item-hint">↵</span>
      </button>`;
    });
  }

  if (!currentItems.length) {
    html = `<div class="cmd-empty">
      <div class="cmd-empty-ico">&#128270;</div>
      Ничего не найдено по «${escAttr(q)}»
    </div>`;
  }

  resultsEl.innerHTML = html;
  activeIdx = -1;

  // Attach click handlers
  resultsEl.querySelectorAll('.cmd-item').forEach(el => {
    el.addEventListener('click', () => {
      selectItem(parseInt(el.dataset.idx, 10));
    });
  });
}

function setActive(idx) {
  const items = resultsEl.querySelectorAll('.cmd-item');
  items.forEach(el => el.classList.remove('active'));
  if (idx >= 0 && idx < items.length) {
    activeIdx = idx;
    items[idx].classList.add('active');
    items[idx].scrollIntoView({ block: 'nearest' });
  }
}

function handleKeydown(e) {
  const total = currentItems.length;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setActive(activeIdx < total - 1 ? activeIdx + 1 : 0);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setActive(activeIdx > 0 ? activeIdx - 1 : total - 1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (activeIdx >= 0) {
      selectItem(activeIdx);
    } else if (total > 0) {
      selectItem(0);
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
}

function selectItem(idx) {
  const item = currentItems[idx];
  if (!item) return;
  close();

  if (item.type === 'action') {
    setTimeout(() => item.data.action(), 100);
  } else if (item.type === 'doc') {
    setTimeout(() => {
      const docIdx = D.indexOf(item.data);
      if (docIdx >= 0 && window.oM) window.oM(docIdx);
      else if (window.oMF) window.oMF(item.data.file);
    }, 100);
  }
}

// Global keyboard shortcut
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    if (isOpen()) close();
    else open();
  }
  if (e.key === 'Escape' && isOpen()) {
    e.preventDefault();
    e.stopPropagation();
    close();
  }
}, true);

export { open, close, isOpen };
