/**
 * Mobile screen renderers — catalog, categories, favorites, order, search
 */
import { D } from '../data/catalog-data.js';
import { S, $, saveBookmarks } from '../modules/state.js';
import { gTitle, gExt, gDesc, escAttr, pluralize, getCatPrice, hardenExternalLinks } from '../modules/utils.js';
import { score, getF } from '../modules/search.js';
import { buildDownloadHref, queueStats } from '../modules/stats.js';
import { openSheet } from './mobile-sheet.js';
import { haptic } from './mobile-gestures.js';
import { switchTab } from './mobile-app.js';

const CATEGORY_EMOJIS = {
  'ВКР и дипломы': '🎓', 'Самостоятельные работы': '📝', 'Отчёты по практике': '📋',
  'Методические материалы': '📖', 'Курсовые': '📚', 'Конспекты лекций': '📑',
  'НПР': '🔬', 'Рефераты': '📄', 'Эссе': '✍️', 'Другое': '📁',
};

// ===== Shared: render a mobile card =====
function renderMobCard(d, opts = {}) {
  const ext = gExt(d.filename);
  const title = opts.highlight ? highlightText(gTitle(d), opts.highlight) : gTitle(d);
  const meta = [d.category, d.subject !== 'Общее' ? d.subject : '', d.course].filter(Boolean).join(' · ');
  const safeFile = escAttr(d.file);
  const bk = S.bk.has(d.file);

  return `<div class="mob-card" data-file="${safeFile}">
    <div class="mob-card-fi fi-${ext}">${ext.toUpperCase()}</div>
    <div class="mob-card-body">
      <div class="mob-card-title">${title}</div>
      <div class="mob-card-meta">${meta}</div>
      <div class="mob-card-size">${d.size}</div>
    </div>
    <div class="mob-card-actions">
      <button class="mob-card-bk ${bk ? 'active' : ''}" data-bk="${safeFile}" aria-label="Избранное">${bk ? '★' : '☆'}</button>
      <a class="mob-card-dl" href="${buildDownloadHref(d.file)}" data-dl-file="${safeFile}" download onclick="event.stopPropagation()" aria-label="Скачать">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </a>
    </div>
  </div>`;
}

function highlightText(text, query) {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp('(' + escaped + ')', 'gi'), '<mark>$1</mark>');
}

// Wire card click events (delegated)
function wireCardEvents(container) {
  container.addEventListener('click', e => {
    // Bookmark toggle
    const bkBtn = e.target.closest('[data-bk]');
    if (bkBtn) {
      e.stopPropagation();
      const file = bkBtn.dataset.bk;
      if (S.bk.has(file)) S.bk.delete(file); else S.bk.add(file);
      saveBookmarks();
      bkBtn.classList.toggle('active');
      bkBtn.textContent = S.bk.has(file) ? '★' : '☆';
      haptic('light');
      return;
    }
    // Card click → open sheet
    const card = e.target.closest('.mob-card');
    if (card && !e.target.closest('.mob-card-dl')) {
      const file = card.dataset.file;
      const doc = D.find(d => d.file === file);
      if (doc) { haptic('light'); openSheet(doc); }
    }
  });
}

function renderSkeletons(count = 5) {
  let h = '';
  for (let i = 0; i < count; i++) {
    h += `<div class="mob-card mob-card-skeleton">
      <div class="mob-card-fi sk-circle"></div>
      <div class="mob-card-body"><div class="sk-line" style="width:80%"></div><div class="sk-line" style="width:55%"></div><div class="sk-line" style="width:35%"></div></div>
    </div>`;
  }
  return h;
}

// ===== CATALOG SCREEN =====
let catalogPage = 0;
const CATALOG_PAGE_SIZE = 15;
let catalogScrollHandler = null;

export function renderCatalogScreen(container) {
  catalogPage = 0;
  container.className = 'mob-screen mob-screen-enter';

  container.innerHTML = `
    <div class="mob-screen-header">
      <div class="mob-screen-title">Каталог</div>
      <button class="mob-screen-action" id="mobThemeToggle">🌙</button>
    </div>
    <div class="mob-catalog-search" id="mobCatalogSearch">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <span>Поиск документов...</span>
      <div class="mob-catalog-search-kbd">⌘K</div>
    </div>
    <div class="mob-quick-filters" id="mobQuickFilters"></div>
    <div class="mob-card-list" id="mobCardList"></div>
  `;

  // Theme toggle
  const themeBtn = container.querySelector('#mobThemeToggle');
  const dk = localStorage.getItem('as_theme') !== 'light';
  themeBtn.textContent = dk ? '🌙' : '☀️';
  themeBtn.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    document.documentElement.setAttribute('data-theme', isDark ? 'light' : '');
    localStorage.setItem('as_theme', isDark ? 'light' : 'dark');
    themeBtn.textContent = isDark ? '☀️' : '🌙';
  });

  // Search bar → opens full search
  container.querySelector('#mobCatalogSearch').addEventListener('click', () => openMobileSearch());

  // Quick filters
  const quickFilters = [
    { label: 'Все', cat: '' },
    { label: 'Курсовые', cat: 'Курсовые' },
    { label: 'ВКР', cat: 'ВКР и дипломы' },
    { label: 'Рефераты', cat: 'Рефераты' },
    { label: 'Практика', cat: 'Отчёты по практике' },
    { label: 'Самостоят.', cat: 'Самостоятельные работы' },
    { label: 'Конспекты', cat: 'Конспекты лекций' },
  ];
  const filtersEl = container.querySelector('#mobQuickFilters');
  filtersEl.innerHTML = quickFilters.map(f =>
    `<button class="mob-quick-filter ${S.cat === f.cat ? 'active' : ''}" data-cat="${escAttr(f.cat)}">${f.label}</button>`
  ).join('');
  filtersEl.addEventListener('click', e => {
    const btn = e.target.closest('.mob-quick-filter');
    if (!btn) return;
    S.cat = btn.dataset.cat;
    filtersEl.querySelectorAll('.mob-quick-filter').forEach(b => b.classList.toggle('active', b.dataset.cat === S.cat));
    catalogPage = 0;
    loadCatalogCards(container.querySelector('#mobCardList'), true);
    haptic('light');
  });

  // Cards
  const cardList = container.querySelector('#mobCardList');
  cardList.innerHTML = renderSkeletons(5);
  setTimeout(() => loadCatalogCards(cardList, true), 150);
  wireCardEvents(cardList);

  // Infinite scroll
  if (catalogScrollHandler) container.removeEventListener('scroll', catalogScrollHandler);
  catalogScrollHandler = () => {
    if (container.scrollTop + container.clientHeight > container.scrollHeight - 200) {
      loadCatalogCards(cardList, false);
    }
  };
  container.addEventListener('scroll', catalogScrollHandler, { passive: true });
}

function loadCatalogCards(cardList, reset) {
  const docs = getF();
  if (reset) { catalogPage = 0; cardList.innerHTML = ''; }
  const start = catalogPage * CATALOG_PAGE_SIZE;
  const end = start + CATALOG_PAGE_SIZE;
  const batch = docs.slice(start, end);
  if (!batch.length && reset) {
    cardList.innerHTML = `<div class="mob-favorites-empty">
      <div class="mob-favorites-empty-ico">🔍</div>
      <div class="mob-favorites-empty-title">Ничего не найдено</div>
      <div class="mob-favorites-empty-desc">Попробуйте другие фильтры или закажите работу</div>
      <button class="mob-order-btn mob-order-btn-primary" style="max-width:240px;margin-top:12px" onclick="window._mobSwitchTab && window._mobSwitchTab('order')">Заказать работу</button>
    </div>`;
    return;
  }
  if (!batch.length) return;
  const html = batch.map(d => renderMobCard(d)).join('');
  cardList.insertAdjacentHTML('beforeend', html);
  catalogPage++;
  // Queue stats for visible docs
  queueStats(batch.map(d => d.file));
}

// ===== CATEGORIES SCREEN =====
export function renderCategoriesScreen(container) {
  container.className = 'mob-screen mob-screen-enter';
  const cats = {};
  D.forEach(d => { if (d.exists !== false) cats[d.category] = (cats[d.category] || 0) + 1; });

  let html = `<div class="mob-screen-header"><div class="mob-screen-title">Разделы</div></div>`;
  html += '<div class="mob-categories-grid">';
  Object.entries(cats).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
    const emoji = CATEGORY_EMOJIS[cat] || '📁';
    html += `<div class="mob-cat-card" data-cat="${escAttr(cat)}">
      <div class="mob-cat-emoji">${emoji}</div>
      <div class="mob-cat-name">${cat}</div>
      <div class="mob-cat-count">${count} ${pluralize(count, 'документ', 'документа', 'документов')}</div>
    </div>`;
  });
  html += '</div>';

  // Courses
  html += `<div class="mob-courses-section">
    <div class="mob-courses-title">Подборки по курсам</div>
    <div class="mob-courses-row">
      <button class="mob-course-pill" data-course="1 курс">1 курс</button>
      <button class="mob-course-pill" data-course="2 курс">2 курс</button>
      <button class="mob-course-pill" data-course="3 курс">3 курс</button>
      <button class="mob-course-pill" data-course="Магистратура">Магистр.</button>
    </div>
  </div>`;

  container.innerHTML = html;

  // Events
  container.addEventListener('click', e => {
    const catCard = e.target.closest('.mob-cat-card');
    if (catCard) {
      S.cat = catCard.dataset.cat;
      S.subj = ''; S.crs = ''; S.q = '';
      haptic('light');
      switchTab('catalog');
      return;
    }
    const coursePill = e.target.closest('.mob-course-pill');
    if (coursePill) {
      S.crs = coursePill.dataset.course;
      S.cat = ''; S.subj = ''; S.q = '';
      haptic('light');
      switchTab('catalog');
    }
  });
}

// ===== FAVORITES SCREEN =====
export function renderFavoritesScreen(container) {
  container.className = 'mob-screen mob-screen-enter';
  const favDocs = D.filter(d => d.exists !== false && S.bk.has(d.file));

  let html = `<div class="mob-screen-header">
    <div class="mob-screen-title">Избранное${favDocs.length ? ' (' + favDocs.length + ')' : ''}</div>
  </div>`;

  if (!favDocs.length) {
    html += `<div class="mob-favorites-empty">
      <div class="mob-favorites-empty-ico">⭐</div>
      <div class="mob-favorites-empty-title">Нет сохранённых работ</div>
      <div class="mob-favorites-empty-desc">Нажмите ☆ на карточке документа,<br>чтобы добавить в избранное</div>
    </div>`;
  } else {
    html += '<div class="mob-card-list">';
    html += favDocs.map(d => renderMobCard(d)).join('');
    html += '</div>';
  }

  container.innerHTML = html;
  wireCardEvents(container);
}

// ===== ORDER SCREEN =====
let orderStep = 0;

export function renderOrderScreen(container) {
  orderStep = 0;
  container.className = 'mob-screen mob-screen-enter';
  renderOrderStep(container);
}

function renderOrderStep(container) {
  const steps = [
    { title: 'Что нужно?', fields: 'topic_type' },
    { title: 'Контакты', fields: 'contacts' },
    { title: 'Детали', fields: 'details' },
  ];

  let html = `<div class="mob-screen-header"><div class="mob-screen-title">Заказать работу</div></div>`;

  // Step indicator
  html += '<div class="mob-order-steps">';
  for (let i = 0; i < 3; i++) {
    if (i > 0) html += `<div class="mob-order-step-line ${i <= orderStep ? 'done' : ''}"></div>`;
    html += `<div class="mob-order-step-dot ${i === orderStep ? 'active' : i < orderStep ? 'done' : ''}">${i < orderStep ? '✓' : i + 1}</div>`;
  }
  html += '</div>';

  html += '<div class="mob-order-form" id="mobOrderForm">';

  if (orderStep === 0) {
    html += `
      <div><div class="mob-order-label">Тема работы</div>
      <input class="mob-order-input" id="mobOrdTopic" placeholder="Например: Девиантное поведение подростков" value="${escAttr(_orderData.topic)}"></div>
      <div><div class="mob-order-label">Тип работы</div>
      <select class="mob-order-input" id="mobOrdType">
        <option value="">Выберите тип</option>
        <option ${_orderData.type === 'Контрольная' ? 'selected' : ''}>Контрольная</option>
        <option ${_orderData.type === 'Курсовая' ? 'selected' : ''}>Курсовая</option>
        <option ${_orderData.type === 'Дипломная / ВКР' ? 'selected' : ''}>Дипломная / ВКР</option>
        <option ${_orderData.type === 'Магистерская' ? 'selected' : ''}>Магистерская</option>
        <option ${_orderData.type === 'Реферат' ? 'selected' : ''}>Реферат</option>
        <option ${_orderData.type === 'Отчёт по практике' ? 'selected' : ''}>Отчёт по практике</option>
        <option ${_orderData.type === 'Другое' ? 'selected' : ''}>Другое</option>
      </select></div>
    `;
  } else if (orderStep === 1) {
    html += `
      <div><div class="mob-order-label">Срок сдачи</div>
      <input class="mob-order-input" id="mobOrdDeadline" placeholder="Например: через 2 недели" value="${escAttr(_orderData.deadline)}"></div>
      <div class="mob-order-label" style="margin-top:4px">Как с вами связаться?</div>
      <div class="mob-order-row">
        <input class="mob-order-input" id="mobOrdVK" placeholder="VK" value="${escAttr(_orderData.vk)}">
        <input class="mob-order-input" id="mobOrdTG" placeholder="Telegram" value="${escAttr(_orderData.tg)}">
      </div>
      <div class="mob-order-row">
        <input class="mob-order-input" id="mobOrdPhone" placeholder="Телефон" value="${escAttr(_orderData.phone)}">
        <input class="mob-order-input" id="mobOrdEmail" placeholder="Email" value="${escAttr(_orderData.email)}">
      </div>
    `;
  } else if (orderStep === 2) {
    html += `
      <div><div class="mob-order-label">Комментарий (необязательно)</div>
      <textarea class="mob-order-textarea" id="mobOrdComment" placeholder="Пожелания, требования преподавателя...">${escAttr(_orderData.comment)}</textarea></div>
      <div style="padding:12px 0;font-size:13px;color:var(--t3);text-align:center">Обычно отвечаем за 15 минут. Без обязательств.</div>
    `;
  }

  html += '</div>';

  // Navigation
  html += '<div class="mob-order-nav">';
  if (orderStep > 0) html += '<button class="mob-order-btn mob-order-btn-secondary" id="mobOrdBack">Назад</button>';
  if (orderStep < 2) html += '<button class="mob-order-btn mob-order-btn-primary" id="mobOrdNext">Далее</button>';
  if (orderStep === 2) html += '<button class="mob-order-btn mob-order-btn-primary" id="mobOrdSubmit">Отправить заявку</button>';
  html += '</div>';

  container.innerHTML = html;

  // Wire events
  const backBtn = container.querySelector('#mobOrdBack');
  const nextBtn = container.querySelector('#mobOrdNext');
  const submitBtn = container.querySelector('#mobOrdSubmit');

  if (backBtn) backBtn.addEventListener('click', () => { saveOrderFields(container); orderStep--; renderOrderStep(container); });
  if (nextBtn) nextBtn.addEventListener('click', () => { saveOrderFields(container); orderStep++; renderOrderStep(container); haptic('light'); });
  if (submitBtn) submitBtn.addEventListener('click', () => { saveOrderFields(container); submitMobileOrder(container); });
}

const _orderData = { topic: '', type: '', deadline: '', vk: '', tg: '', phone: '', email: '', comment: '' };

function saveOrderFields(container) {
  const v = id => { const el = container.querySelector('#' + id); return el ? el.value : ''; };
  if (orderStep === 0) { _orderData.topic = v('mobOrdTopic'); _orderData.type = v('mobOrdType'); }
  if (orderStep === 1) { _orderData.deadline = v('mobOrdDeadline'); _orderData.vk = v('mobOrdVK'); _orderData.tg = v('mobOrdTG'); _orderData.phone = v('mobOrdPhone'); _orderData.email = v('mobOrdEmail'); }
  if (orderStep === 2) { _orderData.comment = v('mobOrdComment'); }
}

async function submitMobileOrder(container) {
  const contacts = [];
  if (_orderData.vk.trim()) contacts.push('VK: ' + _orderData.vk.trim());
  if (_orderData.tg.trim()) contacts.push('TG: ' + _orderData.tg.trim());
  if (_orderData.phone.trim()) contacts.push('Тел: ' + _orderData.phone.trim());
  if (_orderData.email.trim()) contacts.push('Email: ' + _orderData.email.trim());

  if (!contacts.length) {
    haptic('heavy');
    alert('Заполните хотя бы один контакт для связи');
    orderStep = 1;
    renderOrderStep(container);
    return;
  }

  const submitBtn = container.querySelector('#mobOrdSubmit');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Отправляю...'; }

  try {
    const res = await fetch('/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: _orderData.topic, workType: _orderData.type, subject: '',
        deadline: _orderData.deadline, contact: contacts.join(' | '), comment: _orderData.comment,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      haptic('medium');
      container.innerHTML = `
        <div class="mob-order-success">
          <div class="mob-order-success-ico">✅</div>
          <div class="mob-order-success-title">Заявка отправлена!</div>
          <div class="mob-order-success-desc">Мы свяжемся с вами в течение 15 минут.<br>Проверьте сообщения в ВК или Telegram.</div>
          <button class="mob-order-btn mob-order-btn-primary" style="max-width:200px;margin-top:16px" onclick="window._mobSwitchTab && window._mobSwitchTab('catalog')">К каталогу</button>
        </div>`;
      Object.keys(_orderData).forEach(k => _orderData[k] = '');
      orderStep = 0;
    } else {
      alert(data.error || 'Ошибка');
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Отправить заявку'; }
    }
  } catch {
    alert('Ошибка сети');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Отправить заявку'; }
  }
}

// ===== SEARCH OVERLAY =====
const RECENT_KEY = 'as_mob_recent';
let searchOverlay = null;

export function openMobileSearch() {
  if (searchOverlay) return;

  searchOverlay = document.createElement('div');
  searchOverlay.className = 'mob-search-overlay open';
  searchOverlay.innerHTML = `
    <div class="mob-search-bar">
      <input class="mob-search-input" id="mobSearchInput" placeholder="Поиск документов..." autocomplete="off" autofocus>
      <button class="mob-search-cancel" id="mobSearchCancel">Отмена</button>
    </div>
    <div class="mob-search-results" id="mobSearchResults"></div>
  `;

  document.body.appendChild(searchOverlay);
  const input = searchOverlay.querySelector('#mobSearchInput');
  const results = searchOverlay.querySelector('#mobSearchResults');
  const cancelBtn = searchOverlay.querySelector('#mobSearchCancel');

  // Show initial state (recent + hints)
  renderSearchInitial(results);

  let debounce;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const q = input.value.trim();
      if (!q) { renderSearchInitial(results); return; }
      renderSearchResults(results, q);
    }, 200);
  });

  cancelBtn.addEventListener('click', closeMobileSearch);
  requestAnimationFrame(() => input.focus());
}

function closeMobileSearch() {
  if (!searchOverlay) return;
  searchOverlay.classList.remove('open');
  setTimeout(() => { searchOverlay.remove(); searchOverlay = null; }, 200);
}

function renderSearchInitial(container) {
  const recent = loadRecent();
  let html = '';

  if (recent.length) {
    html += '<div class="cmd-group-label">Недавние</div>';
    html += '<div class="mob-quick-filters" style="padding:4px 16px 8px">';
    recent.forEach(q => {
      html += `<button class="mob-quick-filter mob-recent-q">${escAttr(q)}</button>`;
    });
    html += '</div>';
  }

  html += '<div class="cmd-group-label">Популярное</div>';
  html += '<div class="mob-quick-filters" style="padding:4px 16px 8px">';
  ['психология', 'курсовая', 'диплом', 'практика', 'социальная работа', 'реферат'].forEach(q => {
    html += `<button class="mob-quick-filter mob-hint-q">${q}</button>`;
  });
  html += '</div>';

  container.innerHTML = html;

  container.querySelectorAll('.mob-recent-q, .mob-hint-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.querySelector('#mobSearchInput');
      if (input) { input.value = btn.textContent; input.dispatchEvent(new Event('input')); }
    });
  });
}

function renderSearchResults(container, query) {
  const docs = D.filter(d => d.exists !== false)
    .map(d => ({ ...d, _s: score(d, query) }))
    .filter(d => d._s > 0)
    .sort((a, b) => b._s - a._s)
    .slice(0, 20);

  if (!docs.length) {
    container.innerHTML = `<div class="mob-favorites-empty" style="padding:40px 20px">
      <div class="mob-favorites-empty-ico">🔍</div>
      <div class="mob-favorites-empty-title">Ничего не найдено</div>
    </div>`;
    return;
  }

  container.innerHTML = '<div class="cmd-group-label">Результаты</div>' +
    docs.map(d => renderMobCard(d, { highlight: query })).join('');

  wireCardEvents(container);
  // Save to recent
  saveRecent(query);
}

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, 8); } catch { return []; }
}

function saveRecent(query) {
  const recent = loadRecent().filter(q => q !== query);
  recent.unshift(query);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 8))); } catch {}
}

// Expose switchTab globally for onclick handlers
window._mobSwitchTab = switchTab;
