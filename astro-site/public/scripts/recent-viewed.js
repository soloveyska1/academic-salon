/**
 * Recently-viewed docs widget — client-side, localStorage-backed.
 *
 * Two entry points:
 *
 *   pushRecentView(doc)
 *     Called on /doc/[slug] to remember the visit.
 *
 *   mountRecentView(targetEl, opts)
 *     Called on / and /me to render the inline section. No-op when
 *     fewer than `min` items remembered (avoids an empty editorial
 *     section for first-time visitors).
 *
 * Storage shape (localStorage["salon:viewed"]):
 *   [{ file, title, subject, type, year, t }]
 *   - newest first
 *   - capped at MAX (12)
 *   - identical `file` deduped on push
 */

(function () {
  'use strict';

  const KEY = 'salon:viewed';
  const MAX = 12;

  function readSafe() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((x) => x && x.file && x.title) : [];
    } catch (_) {
      return [];
    }
  }

  function writeSafe(arr) {
    try {
      localStorage.setItem(KEY, JSON.stringify(arr.slice(0, MAX)));
    } catch (_) { /* quota — silent */ }
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Trim a string to N chars, with ellipsis. */
  function clip(s, n) {
    if (!s) return '';
    return s.length > n ? s.slice(0, n - 1).trim() + '…' : s;
  }

  window.pushRecentView = function pushRecentView(doc) {
    if (!doc || !doc.file || !doc.title) return;
    const next = [{
      file: doc.file,
      title: clip(doc.title, 140),
      subject: clip(doc.subject || '', 40),
      type: clip(doc.type || '', 30),
      year: doc.year || '',
      t: Date.now(),
    }];
    for (const v of readSafe()) {
      if (v.file !== doc.file) next.push(v);
    }
    writeSafe(next);
  };

  /**
   * Render the recently-viewed section into `target`. Returns true if
   * something was rendered, false otherwise.
   *
   * opts:
   *   min   — don't render unless we have at least this many items (default 3)
   *   limit — show at most this many (default 6)
   *   variant — 'home' | 'cabinet' (subtly different copy)
   */
  window.mountRecentView = function mountRecentView(target, opts) {
    if (!target) return false;
    const o = opts || {};
    const min = o.min || 3;
    const limit = o.limit || 6;
    const variant = o.variant || 'home';

    const items = readSafe().slice(0, limit);
    if (items.length < min) return false;

    const eyebrow = variant === 'cabinet' ? 'История просмотров' : 'Вы возвращались';
    const heading = variant === 'cabinet'
      ? 'Что вы <em>открывали</em>'
      : 'К чему вы <em>возвращались</em>';
    const note = variant === 'cabinet'
      ? 'Хранится только у вас в браузере, не покидает устройство.'
      : 'История работ, которые вы открывали в этом браузере.';

    const html = `
      <section class="recent-viewed rv" aria-label="Недавние работы">
        <header class="recent-viewed-head">
          <span class="eyebrow">${escapeHtml(eyebrow)}</span>
          <h2 class="recent-viewed-h">${heading}</h2>
          <p class="recent-viewed-note">${escapeHtml(note)}</p>
        </header>
        <ol class="recent-viewed-list" role="list">
          ${items.map((item, i) => `
            <a href="/doc/${escapeHtml(item.file)}" class="recent-viewed-row">
              <span class="rv-no">№&nbsp;${String(i + 1).padStart(2, '0')}</span>
              <span class="rv-title">${escapeHtml(item.title)}</span>
              <span class="rv-meta">${escapeHtml([item.type, item.subject].filter(Boolean).join(' · '))}</span>
            </a>
          `).join('')}
        </ol>
        <footer class="recent-viewed-foot">
          <button type="button" class="recent-viewed-clear" aria-label="Очистить историю">
            Очистить историю
          </button>
        </footer>
      </section>
    `;

    target.innerHTML = html;
    target.hidden = false;

    const clearBtn = target.querySelector('.recent-viewed-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        try { localStorage.removeItem(KEY); } catch (_) {}
        target.innerHTML = '';
        target.hidden = true;
      });
    }

    // Trigger reveal animation if Couture observer is around.
    requestAnimationFrame(() => {
      target.querySelector('.recent-viewed')?.classList.add('vis');
    });

    return true;
  };
})();
