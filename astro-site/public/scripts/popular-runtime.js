// Stage 54 — Popular widget runtime. Markup ships hidden in dist/*;
// this script fetches /api/doc-stats/popular, resolves filenames against
// the catalog index, and unhides + populates the list. If anything
// goes wrong, the section stays hidden — silent degradation.
//
// Plain JS in /public/scripts/ to dodge the Astro v6 bundler quirk that
// silently drops <script> blocks in some component shapes.

(function () {
  function init() {
    var section = document.querySelector('.popular-now');
    if (!section) return;
    var listEl = section.querySelector('#popularList') || section.querySelector('.popular-now-list');
    if (!listEl) return;

    var limit = parseInt(section.getAttribute('data-popular-limit') || '6', 10);
    if (!isFinite(limit) || limit < 1) limit = 6;

    var bySlug = (window.academicSalonPopular && window.academicSalonPopular.bySlug) || {};

    fetch('/api/doc-stats/popular?limit=' + encodeURIComponent(limit), {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.ok || !Array.isArray(data.items) || !data.items.length) return;
        renderItems(data.items);
      })
      .catch(function () { /* silent — widget stays hidden */ });

    function renderItems(items) {
      var rendered = items
        .map(function (it) {
          var d = bySlug[it.file];
          if (!d) return null; // file no longer in catalog — skip
          var title = d.t || it.file;
          var subj = d.s || '';
          var dl = it.downloads | 0;
          var v = it.views | 0;
          var stat = dl >= 5 ? (dl + ' скач.') : (v >= 20 ? (v + ' просм.') : '');
          return (
            '<li class="popular-now-item">' +
              '<a class="popular-now-item-link" href="/doc/' + encodeURI(it.file) + '">' +
                '<span class="popular-now-item-title">' + escapeHtml(title) + '</span>' +
                '<span class="popular-now-item-meta">' +
                  (subj ? escapeHtml(subj) : 'Из архива') +
                  (stat ? ' <span class="pop-stat">' + stat + '</span>' : '') +
                '</span>' +
              '</a>' +
            '</li>'
          );
        })
        .filter(Boolean)
        .join('');
      if (!rendered) return;
      listEl.innerHTML = rendered;
      section.hidden = false;
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) {
      return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c];
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
