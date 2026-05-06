/**
 * Saved searches — local-only persistence + share-link helpers.
 *
 * Storage shape (localStorage["salon:saved-searches"]):
 *   [{ id, q, cat, subj, label, t }]
 *   - newest first
 *   - capped at MAX (12)
 *   - dedup on (q, cat, subj) tuple
 *
 * Two entry points:
 *   - saveCurrentSearch({ q, cat, subj })       → returns the new entry
 *   - listSavedSearches()                       → array, newest first
 *   - removeSavedSearch(id)                     → mutates storage
 *   - buildSearchUrl({ q, cat, subj })          → URL string with origin
 *   - copySearchLink({ q, cat, subj })          → Promise<boolean>
 */

(function () {
  'use strict';

  const KEY = 'salon:saved-searches';
  const MAX = 12;

  function readSafe() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((x) => x && typeof x === 'object') : [];
    } catch (_) { return []; }
  }

  function writeSafe(arr) {
    try {
      localStorage.setItem(KEY, JSON.stringify(arr.slice(0, MAX)));
    } catch (_) { /* quota — silent */ }
  }

  function makeLabel(s) {
    const parts = [];
    if (s.q) parts.push(`«${s.q}»`);
    if (s.cat && s.cat !== 'all' && s.cat !== '__fav') parts.push(s.cat);
    if (s.subj && s.subj !== 'all') parts.push(s.subj);
    return parts.join(' · ') || 'Весь каталог';
  }

  window.salonSavedSearches = {
    save(s) {
      const q = (s.q || '').trim();
      const cat = (s.cat && s.cat !== 'all' && s.cat !== '__fav') ? s.cat : '';
      const subj = (s.subj && s.subj !== 'all') ? s.subj : '';
      if (!q && !cat && !subj) return null;

      const entry = {
        id: 'ss_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        q, cat, subj,
        label: makeLabel({ q, cat, subj }),
        t: Date.now(),
      };

      const next = [entry];
      const sig = (e) => [e.q, e.cat, e.subj].join('|');
      const newSig = sig(entry);
      for (const v of readSafe()) {
        if (sig(v) !== newSig) next.push(v);
      }
      writeSafe(next);
      return entry;
    },

    list() { return readSafe(); },

    remove(id) {
      writeSafe(readSafe().filter((s) => s.id !== id));
    },

    clear() {
      try { localStorage.removeItem(KEY); } catch (_) {}
    },

    buildUrl(s) {
      const params = new URLSearchParams();
      if (s.q) params.set('q', s.q);
      if (s.cat) params.set('cat', s.cat);
      if (s.subj) params.set('subj', s.subj);
      const qs = params.toString();
      return location.origin + '/catalog/' + (qs ? '?' + qs : '');
    },

    async copyLink(s) {
      const url = this.buildUrl(s);
      try {
        await navigator.clipboard.writeText(url);
        return true;
      } catch (_) {
        // Fallback for older browsers / blocked permissions.
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          document.body.removeChild(ta);
          return true;
        } catch (_) {
          document.body.removeChild(ta);
          return false;
        }
      }
    },
  };
})();
