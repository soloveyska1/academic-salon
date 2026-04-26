// Stage 57 — /compare runtime. Reads ?files=… from URL, resolves each
// against window.__compareIndex (slim catalog injected at build time),
// renders side-by-side table. Stats fetched async via /api/doc-stats/batch.
//
// Plain JS in /public/scripts/ — same pattern as other runtime files
// (calendar/popular/etc.) to avoid Astro v6 bundler quirks.

(function () {
  function init() {
    var index = window.__compareIndex || {};
    var params = new URLSearchParams(window.location.search);
    var raw = (params.get('files') || '').trim();

    var files = raw
      ? raw.split(',').map(function (s) { return decodeURIComponent(s.trim()); }).filter(Boolean)
      : [];
    // Also fall back to localStorage when ?files= empty (set by ⫶ buttons
    // elsewhere — picker code lives in catalog/me).
    if (!files.length) {
      try {
        var ls = JSON.parse(localStorage.getItem('compare:files') || '[]');
        if (Array.isArray(ls)) files = ls.filter(Boolean);
      } catch (_) {}
    }
    // Cap at 4 — beyond that the table becomes unreadable.
    files = files.slice(0, 4).filter(function (f) { return !!index[f]; });

    var emptyEl = document.getElementById('cmpEmpty');
    var wrapEl = document.getElementById('cmpTableWrap');
    var tableEl = document.getElementById('cmpTable');
    var ledeEl = document.getElementById('cmpLede');

    if (!files.length) {
      if (emptyEl) emptyEl.hidden = false;
      if (wrapEl) wrapEl.hidden = true;
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    if (wrapEl) wrapEl.hidden = false;
    if (ledeEl) ledeEl.textContent = files.length + ' ' + plural(files.length, ['работа', 'работы', 'работ']) + ' в сравнении.';

    // Persist (so user can come back).
    try { localStorage.setItem('compare:files', JSON.stringify(files)); } catch (_) {}

    renderTable(tableEl, files, index);
    fetchStats(files, tableEl);
    bindRemove(tableEl, files, index);
    bindClear();
  }

  function plural(n, forms) {
    var mod10 = n % 10, mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 19) return forms[2];
    if (mod10 === 1) return forms[0];
    if (mod10 >= 2 && mod10 <= 4) return forms[1];
    return forms[2];
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) {
      return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c];
    });
  }

  function renderTable(tableEl, files, index) {
    if (!tableEl) return;
    tableEl.style.setProperty('--cols', String(files.length + 1));

    var theadHtml = '<tr><th class="cmp-th-label" scope="col">Работа</th>' +
      files.map(function (f) {
        var d = index[f];
        return '<th scope="col" data-cmp-file="' + escHtml(f) + '">' +
          '<div class="cmp-th-title"><a href="/doc/' + encodeURI(f) + '">' + escHtml(d.title) + '</a></div>' +
          '<button type="button" class="cmp-th-rm" data-cmp-rm="' + escHtml(f) + '" aria-label="Убрать из сравнения">убрать</button>' +
          '</th>';
      }).join('') +
      '</tr>';

    var rows = [
      ['Тип',      function (d) { return d.docType; }],
      ['Предмет',  function (d) { return d.subject; }],
      ['Категория',function (d) { return d.category; }],
      ['Размер',   function (d) { return d.size; }],
      ['Описание', function (d) { return d.description; },  /*isLong*/ true],
      ['Статистика', function (d, f) { return '<span class="cmp-stat" data-cmp-stat="' + escHtml(f) + '">—</span>'; }, false, true],
    ];

    var tbodyHtml = rows.map(function (row) {
      var label = row[0], getter = row[1], isLong = row[2], isHtml = row[3];
      return '<tr>' +
        '<td class="cmp-td-label" scope="row">' + escHtml(label) + '</td>' +
        files.map(function (f) {
          var d = index[f];
          var val = getter(d, f);
          if (!val) return '<td><span class="cmp-empty-cell">—</span></td>';
          var cls = isLong ? ' cmp-td-desc' : '';
          if (isHtml) return '<td class="' + cls.trim() + '">' + val + '</td>';
          return '<td class="' + cls.trim() + '">' + escHtml(val) + '</td>';
        }).join('') +
        '</tr>';
    }).join('');

    tableEl.querySelector('thead').innerHTML = theadHtml;
    tableEl.querySelector('tbody').innerHTML = tbodyHtml;
  }

  function fetchStats(files, tableEl) {
    if (!files.length || !tableEl) return;
    fetch('/api/doc-stats/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: files }),
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.ok || !data.stats) return;
        Object.keys(data.stats).forEach(function (file) {
          var s = data.stats[file];
          var cell = tableEl.querySelector('[data-cmp-stat="' + cssEscape(file) + '"]');
          if (!cell) return;
          var dl = (s.downloads || 0) | 0;
          var v = (s.views || 0) | 0;
          var bits = [];
          if (dl) bits.push(dl + ' скач.');
          if (v) bits.push(v + ' просм.');
          cell.textContent = bits.join(' · ') || '—';
        });
      })
      .catch(function () { /* silent */ });
  }

  function cssEscape(s) {
    if (window.CSS && window.CSS.escape) return CSS.escape(s);
    return String(s).replace(/["\\]/g, '\\$&');
  }

  function bindRemove(tableEl, files, index) {
    tableEl.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-cmp-rm]');
      if (!btn) return;
      var file = btn.getAttribute('data-cmp-rm');
      var next = files.filter(function (f) { return f !== file; });
      try { localStorage.setItem('compare:files', JSON.stringify(next)); } catch (_) {}
      // Rebuild URL
      var qs = next.length ? '?files=' + next.map(encodeURIComponent).join(',') : '';
      window.location.replace('/compare' + qs);
    });
  }

  function bindClear() {
    var btn = document.getElementById('cmpClear');
    if (!btn) return;
    btn.addEventListener('click', function () {
      try { localStorage.removeItem('compare:files'); } catch (_) {}
      window.location.replace('/compare');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
