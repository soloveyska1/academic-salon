/**
 * UI utilities — toasts, search sync, custom selects, viewport state
 */
import { S, $ } from './state.js';
import { isCompactMobile } from './utils.js';

// ===== Search sync =====
export function syncSearchInputs(value, source) {
  const next = value == null ? '' : String(value);
  const si = $('si');
  const heroSearchInput = $('heroSearch');
  if (source !== 'main' && si && si.value !== next) si.value = next;
  if (source !== 'hero' && heroSearchInput && heroSearchInput.value !== next) heroSearchInput.value = next;
}

// ===== Toast notifications =====
export function showGentleToast(msg) {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);z-index:500;max-width:420px;padding:14px 20px;border-radius:14px;background:rgba(10,10,16,.92);border:1px solid rgba(212,175,55,.1);backdrop-filter:blur(16px);color:var(--t2);font-size:13px;line-height:1.6;text-align:center;opacity:0;transition:all .5s ease;pointer-events:none';
  d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(() => { d.style.opacity = '1'; d.style.transform = 'translateX(-50%) translateY(0)'; }, 50);
  setTimeout(() => { d.style.opacity = '0'; d.style.transform = 'translateX(-50%) translateY(20px)'; setTimeout(() => d.remove(), 500); }, 6000);
}

export function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast-msg';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('vis'));
  setTimeout(() => { t.classList.remove('vis'); setTimeout(() => t.remove(), 400); }, 2200);
}

// ===== Custom Selects =====
export function getSelectOptionParts(sel, opt) {
  const raw = (opt && opt.textContent || '').trim();
  if (sel && sel.id === 'fSubj' && opt && opt.value) {
    const label = raw.replace(/\s*\((\d+)\)\s*$/, '').trim();
    const count = (raw.match(/\((\d+)\)\s*$/) || [])[1] || '';
    return { label: label || raw, meta: count };
  }
  if (sel && (sel.id === 'calcUrgency' || sel.id === 'calcUniq')) {
    const match = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (match) return { label: match[1].trim() || raw, meta: match[2].trim() };
  }
  return { label: raw, meta: '' };
}

export function syncCustomSelect(target) {
  const sel = typeof target === 'string' ? $(target) : target;
  if (!sel) return;
  const shell = sel.closest('.sel-shell');
  if (!shell) return;
  const label = shell.querySelector('.sel-btn-label');
  const activeOpt = sel.options[sel.selectedIndex] || sel.options[0];
  const parts = activeOpt ? getSelectOptionParts(sel, activeOpt) : { label: '' };
  if (label && activeOpt) label.textContent = sel.value ? parts.label : activeOpt.textContent.trim();
  shell.classList.toggle('active', !!sel.value);
  shell.querySelectorAll('.sel-option').forEach(btn => {
    const on = btn.dataset.value === sel.value;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}

export function syncCustomSelects() {
  document.querySelectorAll('.sel-shell .sel').forEach(syncCustomSelect);
}

export function closeCustomSelects(except) {
  document.querySelectorAll('.sel-shell.open').forEach(shell => {
    if (shell !== except) {
      shell.classList.remove('open');
      const btn = shell.querySelector('.sel-btn');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
  });
}

function focusCustomOption(shell, dir) {
  const opts = [...shell.querySelectorAll('.sel-option')];
  if (!opts.length) return;
  let idx = opts.indexOf(document.activeElement);
  if (idx < 0) idx = opts.findIndex(btn => btn.classList.contains('on'));
  idx = idx < 0 ? 0 : (idx + dir + opts.length) % opts.length;
  opts[idx].focus();
}

function openCustomSelect(shell, focusMenu) {
  closeCustomSelects(shell);
  shell.classList.add('open');
  const btn = shell.querySelector('.sel-btn');
  if (btn) btn.setAttribute('aria-expanded', 'true');
  if (focusMenu) requestAnimationFrame(() => focusCustomOption(shell, 0));
}

export function initCustomSelects() {
  document.querySelectorAll('.sel-shell .sel').forEach(sel => {
    if (sel.dataset.customReady) return;
    sel.dataset.customReady = '1';
    const shell = sel.closest('.sel-shell');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sel-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', sel.id + 'Menu');
    btn.innerHTML = '<span class="sel-btn-label"></span><span class="sel-caret" aria-hidden="true"></span>';

    const menu = document.createElement('div');
    menu.className = 'sel-menu';
    menu.id = sel.id + 'Menu';
    menu.setAttribute('role', 'listbox');

    [...sel.options].forEach(opt => {
      const parts = getSelectOptionParts(sel, opt);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'sel-option';
      item.dataset.value = opt.value;
      item.tabIndex = -1;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');
      item.innerHTML = '<span class="sel-option-label">' + parts.label + '</span><span class="sel-option-side">' + (parts.meta ? '<span class="sel-option-meta">' + parts.meta + '</span>' : '') + '<span class="sel-option-mark" aria-hidden="true"></span></span>';
      item.addEventListener('click', () => {
        if (sel.value !== opt.value) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          syncCustomSelect(sel);
        }
        closeCustomSelects();
        btn.focus();
      });
      menu.appendChild(item);
    });

    shell.appendChild(btn);
    shell.appendChild(menu);

    btn.addEventListener('click', e => {
      e.preventDefault();
      shell.classList.contains('open') ? closeCustomSelects() : openCustomSelect(shell, false);
    });

    btn.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        openCustomSelect(shell, true);
        if (e.key === 'ArrowUp') focusCustomOption(shell, -1);
      }
    });

    menu.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); focusCustomOption(shell, 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); focusCustomOption(shell, -1); }
      else if (e.key === 'Home') { e.preventDefault(); const first = shell.querySelector('.sel-option'); if (first) first.focus(); }
      else if (e.key === 'End') { e.preventDefault(); const opts = shell.querySelectorAll('.sel-option'); if (opts.length) opts[opts.length - 1].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeCustomSelects(); btn.focus(); }
    });

    sel.addEventListener('change', () => syncCustomSelect(sel));
    syncCustomSelect(sel);
  });
}

// ===== Mobile toolbar =====
export function syncViewButtons() {
  document.querySelectorAll('.vb').forEach(btn => btn.classList.toggle('on', btn.dataset.v === S.view));
}

export function syncMobileToolbarButtons() {
  const filterBtn = $('mfb');
  const catBtn = $('mmb');
  const filterCount = (S.subj ? 1 : 0) + (S.crs ? 1 : 0) + (S.sort !== 'rel' ? 1 : 0) + (S.view !== 'grid' ? 1 : 0);
  const catLabel = S.cat === 'bookmarks' ? 'Избранное' : (S.cat || 'Категории');
  if (filterBtn && !filterBtn.classList.contains('on')) filterBtn.innerHTML = '&#9881; Фильтры' + (filterCount ? ' (' + filterCount + ')' : '');
  if (catBtn && !catBtn.classList.contains('on')) catBtn.innerHTML = '&#9776; ' + catLabel;
}

export function setMobileFilterSheet(open) {
  const bar = $('tb');
  const btn = $('mfb');
  if (!bar || !btn) return;
  const next = !!open && isCompactMobile();
  bar.classList.toggle('mob-open', next);
  btn.classList.toggle('on', next);
  btn.innerHTML = next ? '&#10005; Закрыть' : '';
  document.body.classList.toggle('mob-filters-open', next);
  document.documentElement.classList.toggle('mob-filters-open', next);
  syncMobileToolbarButtons();
}

export function setMobileSidebar(open) {
  const panel = $('sd');
  const btn = $('mmb');
  if (!panel || !btn) return;
  const next = !!open && isCompactMobile();
  panel.classList.toggle('mob', next);
  btn.classList.toggle('on', next);
  btn.innerHTML = next ? '&#10005; Закрыть' : '';
  document.body.classList.toggle('mob-sidebar-open', next);
  document.documentElement.classList.toggle('mob-sidebar-open', next);
  syncMobileToolbarButtons();
}

// ===== Viewport state (scroll, progress bar, sticky CTA) =====
let _slideShown = false;
let _viewportTick = false;

export function syncViewportState() {
  _viewportTick = false;
  const sp = $('sp');
  const tb = $('tb');
  const btt = $('btt');
  const stickyCta = $('stickyCta');
  const slideIn = $('slideIn');
  const orderSectionEl = $('orderSection');

  const h = document.documentElement;
  const scrollTop = window.pageYOffset || h.scrollTop || 0;
  const maxScroll = Math.max(h.scrollHeight - h.clientHeight, 1);
  const scrollPct = (scrollTop / maxScroll) * 100;
  if (sp) sp.style.width = scrollPct + '%';
  if (tb) tb.classList.toggle('stuck', scrollTop > 150);

  const _osr = orderSectionEl ? orderSectionEl.getBoundingClientRect() : null;
  const _nearOrder = !!(_osr && _osr.top < window.innerHeight && _osr.bottom > 0);
  const footerEl = document.querySelector('.ftv2');
  const _fr = footerEl ? footerEl.getBoundingClientRect() : null;
  const _nearFooter = !!(_fr && _fr.top < window.innerHeight * .9 && _fr.bottom > 0);
  const bttVisible = isCompactMobile() ? scrollPct > 72 && !_nearFooter : scrollTop > 400;
  if (btt) btt.classList.toggle('vis', bttVisible);

  const stickyWants = scrollPct > 20 && !_nearOrder && !window._stickyDismissed;
  const slideWants = scrollPct > 50 && !_nearOrder && !window._slideInDismissed;
  let showSticky = false, showSlide = false;
  if (stickyWants && stickyCta) showSticky = true;
  else if (slideWants && slideIn && !stickyWants) { showSlide = true; _slideShown = true; }
  if (stickyCta) stickyCta.classList.toggle('vis', showSticky);
  if (slideIn) {
    if (showSlide) slideIn.classList.add('vis');
    else if (_slideShown && !showSlide) slideIn.classList.remove('vis');
  }
}

export function requestViewportSync() {
  if (_viewportTick) return;
  _viewportTick = true;
  requestAnimationFrame(syncViewportState);
}
