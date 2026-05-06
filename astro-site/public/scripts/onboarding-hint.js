/**
 * One-shot onboarding hint for first-time visitors.
 *
 * Shows a small floating tip about the global search palette on the
 * sixth second of the first session, dismissible. localStorage flag
 * "salon:onboarded" gates it — set on dismiss, on Esc, or on any
 * deliberate use of "/" / Cmd-K.
 *
 * Skip rules:
 *   · /catalog (there's an in-page search input)
 *   · /admin, /me (already power-user surfaces)
 *   · prefers-reduced-motion (we still show, sans animation)
 *   · localStorage flag set
 *
 * Markup is injected lazily — no SSR cost on every page.
 */

(function () {
  'use strict';

  const KEY = 'salon:onboarded';
  const DELAY_MS = 6000;
  const AUTO_DISMISS_MS = 14000;

  function isSeen() {
    try { return localStorage.getItem(KEY) === '1'; }
    catch (_) { return true; /* if storage blocked, treat as seen */ }
  }
  function markSeen() {
    try { localStorage.setItem(KEY, '1'); } catch (_) {}
  }

  const path = location.pathname.replace(/\/$/, '');
  if (
    path === '/catalog' ||
    path.startsWith('/admin') ||
    path.startsWith('/me') ||
    path === '/404'
  ) return;

  if (isSeen()) return;

  const isMac = /Mac|iP(hone|od|ad)/.test(navigator.platform || '');
  const shortcut = isMac ? '⌘K' : 'Ctrl K';

  let timer = 0;
  let autoDismissTimer = 0;
  let host = null;

  function dismiss(opts = {}) {
    markSeen();
    if (autoDismissTimer) { clearTimeout(autoDismissTimer); autoDismissTimer = 0; }
    if (timer) { clearTimeout(timer); timer = 0; }
    if (host) {
      host.classList.remove('is-visible');
      const el = host;
      setTimeout(() => { el.remove(); }, opts.fast ? 0 : 200);
      host = null;
    }
    document.removeEventListener('keydown', onAnyKey, true);
  }

  function onAnyKey(e) {
    // Any deliberate trigger of search counts as "onboarded".
    if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
      dismiss({ fast: true });
    }
  }

  function show() {
    if (host) return;
    host = document.createElement('aside');
    host.className = 'salon-onboard';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    host.innerHTML = `
      <div class="salon-onboard-body">
        <span class="salon-onboard-eyebrow">Подсказка</span>
        <p class="salon-onboard-text">
          Найдём работу за секунду — нажмите
          <kbd class="salon-onboard-kbd">/</kbd>
          <span class="salon-onboard-or">или</span>
          <kbd class="salon-onboard-kbd">${shortcut}</kbd>
          в любой странице.
        </p>
      </div>
      <button type="button" class="salon-onboard-close" aria-label="Закрыть подсказку">×</button>
    `;
    document.body.appendChild(host);
    requestAnimationFrame(() => host.classList.add('is-visible'));
    host.querySelector('.salon-onboard-close').addEventListener('click', () => dismiss());
    autoDismissTimer = window.setTimeout(() => dismiss(), AUTO_DISMISS_MS);
  }

  function start() {
    timer = window.setTimeout(show, DELAY_MS);
    document.addEventListener('keydown', onAnyKey, true);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    start();
  } else {
    window.addEventListener('DOMContentLoaded', start, { once: true });
  }
})();
