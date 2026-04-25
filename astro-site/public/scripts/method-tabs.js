// Method tabs runtime — plain JS (Astro v6 was silently dropping the
// hoisted <script> inside Method.astro, see calendar-runtime.js for the
// same fix). Triggers on click, hover (desktop ≥900 px) and arrow keys.
(function() {
  var METHOD_DESKTOP_HOVER = '(min-width: 900px)';

  function initMethod() {
    var section = document.getElementById('method');
    if (!section) return;

    var tabs = Array.from(section.querySelectorAll('.method-tab'));
    var panels = Array.from(section.querySelectorAll('.method-panel'));
    if (!tabs.length || !panels.length) return;

    function activate(step) {
      tabs.forEach(function(t) {
        var on = t.dataset.step === step;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
      });
      panels.forEach(function(p) {
        var on = p.dataset.step === step;
        p.classList.toggle('is-active', on);
        if (on) p.removeAttribute('hidden');
        else p.setAttribute('hidden', '');
      });
    }

    tabs.forEach(function(tab, i) {
      tab.addEventListener('click', function() {
        if (tab.dataset.step) activate(tab.dataset.step);
      });
      tab.addEventListener('mouseenter', function() {
        if (!window.matchMedia(METHOD_DESKTOP_HOVER).matches) return;
        if (tab.dataset.step) activate(tab.dataset.step);
      });
      tab.addEventListener('keydown', function(e) {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' &&
            e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        var dir = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : -1;
        var next = tabs[(i + dir + tabs.length) % tabs.length];
        if (next && next.dataset.step) {
          activate(next.dataset.step);
          next.focus();
        }
      });
    });
  }

  initMethod();
  document.addEventListener('astro:page-load', initMethod);
})();
