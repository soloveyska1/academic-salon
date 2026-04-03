/**
 * Initialization and event wiring — the main entry point
 * Replaces inline event listeners from the monolithic index.html
 */
import { D } from '../data/catalog-data.js';
import { S, $, saveBookmarks } from './state.js';
import { PAGE_SIZE } from './constants.js';
import { hardenExternalLinks, isCompactMobile, pluralize } from './utils.js';
import { refreshStatsUI, queueStats, setDocReaction, optimisticDownloadBump } from './stats.js';
import {
  syncSearchInputs, initCustomSelects, syncCustomSelects, closeCustomSelects,
  syncViewButtons, syncMobileToolbarButtons, setMobileFilterSheet, setMobileSidebar,
  syncViewportState, requestViewportSync, toast, showGentleToast,
} from './ui.js';
import { calcPrice, setRenderCallback, applyCollection, submitOrderForm, submitQuickOrder as submitQuickOrderFn, openOrderForm as openOrderFormFn } from './order.js';
import {
  render, showMoreDocs, oM, oMF, openDoc, cM, tBk,
  shareDoc, copyLink, shareVK, shareTG, canNativeShare,
  filterCat, resetFilters, clr, sFor, addRec, rRec,
  setShowCount, showCount, renderSkeletons,
} from './render.js';
import {
  openAdmin, closeAdmin, apTab, apSort, apToggle,
  apDel, apSave, apDoDelete, apDoUpload, apFileSel,
  apDlJSON, apDlCSV, doAdminLogin, doAdminLogout,
} from './admin.js';

// Wire render callback for order.js (circular dependency resolution)
setRenderCallback(function (resetShowCount) {
  if (resetShowCount) setShowCount(resetShowCount);
  render();
});

// ===== Stars background =====
(function () {
  const c = document.getElementById('stars');
  if (!c) return;
  for (let i = 0; i < 40; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    s.style.cssText = 'left:' + Math.random() * 100 + '%;top:' + Math.random() * 100 + '%;--dur:' + (3 + Math.random() * 6) + 's;animation-delay:' + (-Math.random() * 8) + 's;width:' + (1 + Math.random() * 2) + 'px;height:' + (1 + Math.random() * 2) + 'px';
    c.appendChild(s);
  }
})();

// ===== Post-download engagement =====
let _dlCount = parseInt(localStorage.getItem('dlCount') || '0');
document.addEventListener('click', function (e) {
  const dlLink = e.target.closest('[data-dl-file]');
  if (!dlLink) return;
  _dlCount++;
  localStorage.setItem('dlCount', _dlCount + '');
  if (_dlCount === 2) {
    setTimeout(() => showGentleToast('Рады, что материалы полезны! Если знаешь кого-то, кому тоже пригодится — поделись ссылкой ❤️'), 2500);
  }
  if (_dlCount === 5) {
    setTimeout(() => showGentleToast('Ты уже скачал 5 документов бесплатно! Если есть свои материалы — помоги коллекции расти, напиши нам'), 2500);
  }
});

// ===== Event listeners =====
const si = $('si');
const tb = $('tb');

let st;
si.addEventListener('input', () => {
  syncSearchInputs(si.value, 'main');
  clearTimeout(st);
  st = setTimeout(() => { S.q = si.value.trim(); setShowCount(PAGE_SIZE); render(); }, 200);
});

$('fSubj').addEventListener('change', e => { S.subj = e.target.value; render(); });
$('fCrs').addEventListener('change', e => { S.crs = e.target.value; render(); });
$('fSort').addEventListener('change', e => { S.sort = e.target.value; render(); });

document.querySelectorAll('.vb').forEach(b => b.addEventListener('click', () => {
  S.view = b.dataset.v;
  try { localStorage.setItem('as_view', S.view); } catch {}
  syncViewButtons();
  render();
}));

initCustomSelects();
syncViewButtons();
calcPrice();

document.addEventListener('click', e => { if (!e.target.closest('.sel-shell')) closeCustomSelects(); });
$('mfb').addEventListener('click', () => setMobileFilterSheet(!tb.classList.contains('mob-open')));
$('mmb').addEventListener('click', () => { setMobileFilterSheet(false); setMobileSidebar(!$('sd').classList.contains('mob')); });
$('sdClose').addEventListener('click', () => setMobileSidebar(false));

tb.addEventListener('click', e => {
  const wrap = tb.querySelector('.w');
  if ((e.target === tb || e.target === wrap) && tb.classList.contains('mob-open')) setMobileFilterSheet(false);
});

$('sd').addEventListener('click', e => {
  if (e.target === $('sd') && window.innerWidth <= 900) setMobileSidebar(false);
  if (isCompactMobile() && (e.target.closest('.sd-tag') || e.target.closest('.sd-cta-btn'))) setTimeout(() => setMobileSidebar(false), 0);
});

window.addEventListener('resize', () => { if (!isCompactMobile()) { setMobileFilterSheet(false); setMobileSidebar(false); } });

document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); si.focus(); si.select(); }
  if (e.key === 'Escape') { closeCustomSelects(); setMobileFilterSheet(false); setMobileSidebar(false); if ($('mo').classList.contains('open')) cM(); else if (S.q) clr('q'); }
});

// ===== Scroll handler =====
window.addEventListener('scroll', requestViewportSync, { passive: true });
window.addEventListener('resize', requestViewportSync, { passive: true });
requestViewportSync();

// Scroll reveal — show immediately
document.querySelectorAll('.sr').forEach(el => el.classList.add('vis'));

// ===== Theme toggle =====
const thm = $('thm');
const THEME_KEY = 'as_theme';
let dk = (function () { try { const saved = localStorage.getItem(THEME_KEY); if (saved === 'dark') return true; if (saved === 'light') return false; } catch {} return true; })();

function applyTheme() {
  document.documentElement.setAttribute('data-theme', dk ? '' : 'light');
  thm.innerHTML = dk ? '&#x1F319;' : '&#9728;&#65039;';
  try { localStorage.setItem(THEME_KEY, dk ? 'dark' : 'light'); } catch {}
}
applyTheme();
thm.addEventListener('click', () => { dk = !dk; applyTheme(); });

// ===== Animated counters =====
document.querySelectorAll('.hs-n[data-c]').forEach(el => {
  const t = parseInt(el.dataset.c);
  const dur = 1800;
  const s = performance.now();
  function step(now) {
    const e = now - s;
    const p = Math.min(e / dur, 1);
    const ea = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(t * ea);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
});

// ===== Reviews carousel =====
(function () {
  const rev = document.getElementById('osReviews');
  if (!rev) return;
  const items = [...rev.querySelectorAll('.rv2-card')];
  const dots = [...document.querySelectorAll('.rv2-dot')];
  if (items.length < 2 || items.length !== dots.length) return;
  let ci = 0, timer = null, hoverPaused = false;

  function stopRotation() { if (timer) { clearTimeout(timer); timer = null; } }
  function scheduleRotation() { stopRotation(); if (hoverPaused || document.hidden) return; timer = setTimeout(() => showReview((ci + 1) % items.length), 5000); }
  function showReview(idx) {
    items.forEach(i => i.classList.remove('rv2-active'));
    dots.forEach(d => d.classList.remove('rv2-dot-active'));
    items[idx].classList.add('rv2-active');
    dots[idx].classList.add('rv2-dot-active');
    dots[idx].style.width = '24px';
    dots.forEach((d, i) => { if (i !== idx) d.style.width = '8px'; });
    ci = idx;
    scheduleRotation();
  }

  dots.forEach(d => d.addEventListener('click', () => showReview(parseInt(d.dataset.d, 10))));
  rev.addEventListener('mouseenter', () => { hoverPaused = true; stopRotation(); });
  rev.addEventListener('mouseleave', () => { hoverPaused = false; scheduleRotation(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopRotation(); else scheduleRotation(); });
  showReview(ci);
})();

// ===== URL hash state =====
function saveHash() {
  const p = new URLSearchParams();
  if (S.q) p.set('q', S.q);
  if (S.cat) p.set('cat', S.cat);
  if (S.subj) p.set('subj', S.subj);
  if (S.crs) p.set('crs', S.crs);
  if (S.sort !== 'rel') p.set('sort', S.sort);
  const h = p.toString();
  history.replaceState(null, '', h ? '?' + h : location.pathname);
}

function loadHash() {
  const p = new URLSearchParams(location.search);
  if (p.get('q')) { S.q = p.get('q'); syncSearchInputs(S.q); }
  if (p.get('cat')) { S.cat = p.get('cat'); document.querySelectorAll('.cat-btn').forEach(b => { b.classList.toggle('on', b.dataset.cat === S.cat); }); }
  if (p.get('subj')) { S.subj = p.get('subj'); $('fSubj').value = S.subj; }
  if (p.get('crs')) { S.crs = p.get('crs'); $('fCrs').value = S.crs; }
  if (p.get('sort')) { S.sort = p.get('sort'); $('fSort').value = S.sort; }
}

// ===== FAQ =====
function toggleFaqItem(item) {
  if (!item) return;
  const shouldOpen = !item.classList.contains('open');
  document.querySelectorAll('.faq-item.open').forEach(other => {
    if (other !== item) {
      other.classList.remove('open');
      const trigger = other.querySelector('.faq-q');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }
  });
  item.classList.toggle('open', shouldOpen);
  const trigger = item.querySelector('.faq-q');
  if (trigger) trigger.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
}

function initFaq() {
  document.querySelectorAll('.faq-item').forEach((item, idx) => {
    const trigger = item.querySelector('.faq-q');
    const panel = item.querySelector('.faq-a');
    if (!trigger || !panel) return;
    panel.id = panel.id || ('faqPanel' + (idx + 1));
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('tabindex', '0');
    trigger.setAttribute('aria-controls', panel.id);
    trigger.setAttribute('aria-expanded', item.classList.contains('open') ? 'true' : 'false');
    trigger.onclick = () => toggleFaqItem(item);
    trigger.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFaqItem(item); }
    });
  });
}

function syncMobileFaqCompact() {
  const btn = $('faqMoreBtn');
  const faqSection = $('faqSection');
  const expanded = faqSection && faqSection.classList.contains('mob-faq-expanded');
  const items = [...document.querySelectorAll('.faq-item')];
  const compact = isCompactMobile();
  let hiddenCount = 0;
  items.forEach((item, idx) => {
    const shouldHide = compact && !expanded && idx >= 4;
    item.hidden = shouldHide;
    if (shouldHide) {
      item.classList.remove('open');
      const trigger = item.querySelector('.faq-q');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
      hiddenCount++;
    }
  });
  document.querySelectorAll('.faq6-group').forEach(group => {
    const hasVisible = [...group.querySelectorAll('.faq-item')].some(item => !item.hidden);
    group.hidden = !hasVisible;
  });
  if (btn) {
    btn.hidden = !compact || hiddenCount === 0;
    btn.textContent = expanded ? 'Скрыть часть вопросов' : 'Показать все вопросы';
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }
}

// ===== Patch render to save hash and sync stats =====
const _origRender = render;
const patchedRender = function () {
  _origRender();
  syncCustomSelects();
  saveHash();
  refreshStatsUI(document);
  const statFiles = [...new Set([...document.querySelectorAll('[data-stat-file]')].map(node => node.dataset.statFile).filter(Boolean))];
  if (statFiles.length) queueStats(statFiles);
};

// Override render import — re-export patched version
// Since we can't reassign imports, we use a wrapper approach
// The render module's render function is already called, we patch via monkey-patching
// For now, call patchedRender instead of render everywhere

loadHash();
initFaq();
syncMobileFaqCompact();

if ($('faqMoreBtn')) {
  $('faqMoreBtn').addEventListener('click', function () {
    const faqSection = $('faqSection');
    if (!faqSection) return;
    faqSection.classList.toggle('mob-faq-expanded');
    syncMobileFaqCompact();
  });
}
window.addEventListener('resize', syncMobileFaqCompact, { passive: true });

// ===== Deep link =====
(function () {
  const p = new URLSearchParams(location.search);
  const docParam = p.get('doc');
  if (docParam) {
    const found = D.find(d => d.file === docParam);
    if (found) setTimeout(() => openDoc(found), 500);
  }
})();

// Deep link to FAQ item
document.querySelectorAll('a[href="#faq-download"]').forEach(link => {
  link.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.getElementById('faq-download');
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => { if (!target.classList.contains('open')) toggleFaqItem(target); }, 500);
  });
});

// ===== Stats click handlers =====
document.addEventListener('click', e => {
  const reactionBtn = e.target.closest('[data-reaction-btn]');
  if (!reactionBtn) return;
  const scope = reactionBtn.closest('[data-stat-file]');
  if (!scope) return;
  e.preventDefault();
  e.stopPropagation();
  setDocReaction(scope.dataset.statFile, parseInt(reactionBtn.dataset.reactionBtn, 10) || 0);
}, true);

document.addEventListener('click', e => {
  const a = e.target.closest('.cd-dl,.mdl-dl');
  if (!a) return;
  const file = a.dataset.dlFile;
  if (file) optimisticDownloadBump(file);
  setTimeout(() => toast('Скачивание начато'), 200);
});

// ===== Dynamic catalog refresh =====
function syncDocCounts() {
  const n = D.length;
  const cats = {};
  const subjs = {};
  const courses = {};
  D.forEach(d => {
    cats[d.category] = (cats[d.category] || 0) + 1;
    if (d.subject) subjs[d.subject] = 1;
    if (d.course) courses[d.course] = 1;
  });
  const nSubj = Object.keys(subjs).length;
  const nCat = Object.keys(cats).length;
  const nCrs = Object.keys(courses).length;
  const h1 = $('heroDocCount'); if (h1) { h1.dataset.c = n; h1.textContent = n; }
  const h2 = $('heroSubjCount'); if (h2) { h2.dataset.c = nSubj; h2.textContent = nSubj; }
  const h3 = $('heroCatCount'); if (h3) { h3.dataset.c = nCat; h3.textContent = nCat; }
  const h4 = $('heroCrsCount'); if (h4) { h4.dataset.c = nCrs; h4.textContent = nCrs; }
  const allBtn = document.querySelector('.cat-btn[data-cat=""] .cc');
  if (allBtn) allBtn.textContent = n;
  const ftStat = document.querySelector('.ftv2-stat');
  if (ftStat) ftStat.textContent = n + ' документов в библиотеке';
  document.querySelectorAll('.cat-btn[data-cat]').forEach(btn => {
    const cat = btn.dataset.cat; if (!cat) return;
    const cc = btn.querySelector('.cc'); if (cc) cc.textContent = cats[cat] || 0;
    const bar = btn.querySelector('.cat-bar-fill');
    if (bar) bar.style.width = Math.round((cats[cat] || 0) / n * 100) + '%';
  });
}

fetch('/catalog.json').then(r => r.ok ? r.json() : null).then(data => {
  if (data && Array.isArray(data) && data.length !== D.length) {
    D.length = 0;
    data.forEach(d => D.push(d));
    render();
    syncDocCounts();
  }
}).catch(() => {});

// ===== Skeleton → Initial render =====
// Show skeletons briefly, then render real cards
const _grid = $('cds');
if (_grid) {
  _grid.innerHTML = renderSkeletons(6);
}
requestAnimationFrame(() => {
  setTimeout(() => {
    render();
    $('bkc').textContent = S.bk.size;
    hardenExternalLinks(document);
  }, 250);
});

// ===== Button ripple effect =====
document.addEventListener('click', e => {
  const btn = e.target.closest('.mdl-dl, .ap-btn-primary, .os5-panel-btn, .emp-btn-main');
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  const ripple = document.createElement('span');
  ripple.className = 'btn-ripple';
  const size = Math.max(rect.width, rect.height);
  ripple.style.width = ripple.style.height = size + 'px';
  ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
  ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
  btn.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
});

// ===== Hero particles =====
(function () {
  const c = document.getElementById('heroParticles');
  if (!c) return;
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'hero-particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.bottom = '-10px';
    p.style.animationDuration = (4 + Math.random() * 6) + 's';
    p.style.animationDelay = Math.random() * 5 + 's';
    p.style.width = p.style.height = (2 + Math.random() * 4) + 'px';
    c.appendChild(p);
  }
})();

// ===== Hero search sync =====
(function () {
  const hs = document.getElementById('heroSearch');
  if (!hs || !si) return;
  hs.addEventListener('input', function () {
    syncSearchInputs(this.value, 'hero');
    si.dispatchEvent(new Event('input', { bubbles: true }));
  });
  hs.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      syncSearchInputs(this.value, 'hero');
      si.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('tb').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  document.querySelectorAll('.hero-hint').forEach(btn => {
    btn.addEventListener('click', function () {
      const q = this.dataset.q;
      syncSearchInputs(q);
      si.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('tb').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  function resetHeroHintScroll() {
    document.querySelectorAll('.hero-search-hints').forEach(row => { row.scrollLeft = 0; });
  }
  requestAnimationFrame(() => setTimeout(resetHeroHintScroll, 120));
  window.addEventListener('resize', resetHeroHintScroll, { passive: true });
})();

// ===== Trust number count-up =====
(function () {
  const trustNums = document.querySelectorAll('.trust-val[data-count]');
  if (!trustNums.length) return;
  let animated = false;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !animated) {
        animated = true;
        trustNums.forEach(el => {
          const target = parseInt(el.dataset.count);
          const suffix = el.dataset.suffix || '';
          const duration = 1400;
          const start = performance.now();
          function step(now) {
            const p = Math.min((now - start) / duration, 1);
            const ea = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.round(target * ea) + suffix;
            if (p < 1) requestAnimationFrame(step);
          }
          requestAnimationFrame(step);
        });
        observer.disconnect();
      }
    });
  }, { threshold: 0.3 });
  const strip = document.querySelector('.trust-strip');
  if (strip) observer.observe(strip);
})();

// ===== Document preview toggle =====
window._togglePreview = async function (file, filename) {
  const btn = document.getElementById('previewToggle');
  const content = document.getElementById('previewContent');
  if (!btn || !content) return;

  const isOpen = content.classList.contains('open');
  if (isOpen) {
    content.classList.remove('open');
    btn.classList.remove('open');
    return;
  }

  btn.classList.add('open');
  content.classList.add('open');

  // Only load once
  if (content.dataset.loaded) return;
  content.dataset.loaded = '1';

  const { renderPreview } = await import('./preview.js');
  const fileUrl = '/files/' + encodeURIComponent(file.replace(/^files\//, ''));
  await renderPreview(fileUrl, filename, content);
};

// ===== Expose globals for inline onclick handlers =====
// These are needed because HTML has onclick="filterCat(this)" etc.
window.filterCat = filterCat;
window.resetFilters = resetFilters;
window.clr = clr;
window.oM = oM;
window.oMF = oMF;
window.cM = cM;
window.tBk = tBk;
window.showMoreDocs = showMoreDocs;
window.applyCollection = applyCollection;
window.calcPrice = calcPrice;
window.openOrderForm = openOrderFormFn;
window.submitOrderForm = submitOrderForm;
window.submitQuickOrder = submitQuickOrderFn;
window.shareDoc = shareDoc;
window.copyLink = copyLink;
window.shareVK = shareVK;
window.shareTG = shareTG;
window.openAdmin = openAdmin;
window.closeAdmin = closeAdmin;
window.apTab = apTab;
window.apSort = apSort;
window.apToggle = apToggle;
window.apDel = apDel;
window.apSave = apSave;
window.apDoDelete = apDoDelete;
window.apDoUpload = apDoUpload;
window.apFileSel = apFileSel;
window.apDlJSON = apDlJSON;
window.apDlCSV = apDlCSV;
window.doAdminLogin = doAdminLogin;
window.doAdminLogout = doAdminLogout;
window.sFor = sFor;
window.toggleFaqItem = toggleFaqItem;
