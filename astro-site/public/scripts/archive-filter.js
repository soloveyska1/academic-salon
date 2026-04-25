// Archive section runtime — plain JS so Astro v6 actually ships it.
// Toggles visibility of .archive-row by data-category, updates the
// counter, and shows the empty-state when a category has nothing.
(function() {
  function initArchive() {
    var section = document.getElementById('archive');
    if (!section) return;

    var filters = section.querySelectorAll('.archive-filter');
    var rows = section.querySelectorAll('.archive-row');
    var shownEl = section.querySelector('#archiveShown');
    var emptyEl = section.querySelector('#archiveEmpty');
    var listEl = section.querySelector('#archiveList');
    if (!filters.length || !rows.length) return;

    function apply(cat) {
      var shown = 0;
      rows.forEach(function(row) {
        var match = cat === '__all' || row.getAttribute('data-category') === cat;
        row.style.display = match ? '' : 'none';
        if (match) shown += 1;
      });
      if (shownEl) shownEl.textContent = String(shown);
      if (listEl) listEl.style.display = shown === 0 ? 'none' : '';
      if (emptyEl) emptyEl.hidden = shown !== 0;
    }

    filters.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var cat = btn.getAttribute('data-cat') || '__all';
        filters.forEach(function(b) {
          var on = b === btn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        apply(cat);
      });
    });
  }

  initArchive();
  document.addEventListener('astro:page-load', initArchive);
})();
