/**
 * may9 / reveal-on-scroll
 * Лёгкий IntersectionObserver, ставит data-shown="true" на .m9-reveal,
 * когда элемент попадает в viewport. CSS делает остальное.
 */

function init() {
  const els = document.querySelectorAll<HTMLElement>('.m9-reveal');
  if (!els.length) return;

  // Если браузер не любит motion — показываем сразу
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    els.forEach((el) => (el.dataset.shown = 'true'));
    return;
  }

  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => (el.dataset.shown = 'true'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          (entry.target as HTMLElement).dataset.shown = 'true';
          io.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.05 }
  );

  els.forEach((el) => io.observe(el));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export {};
