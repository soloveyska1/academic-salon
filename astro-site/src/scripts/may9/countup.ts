/**
 * may9 / count-up
 * Анимация чисел в ArchiveOutlook (20 / 100) от 0 до целевого значения.
 * Запускается, когда блок попадает в viewport. Один раз.
 * Уважает prefers-reduced-motion.
 */

function init() {
  const els = document.querySelectorAll<HTMLElement>('[data-count-to]');
  if (!els.length) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduceMotion) {
    // Показываем сразу финальные значения
    els.forEach((el) => {
      const target = parseInt(el.dataset.countTo ?? '0', 10);
      el.textContent = String(target);
    });
    return;
  }

  // Стартовое значение — 0
  els.forEach((el) => {
    el.textContent = '0';
  });

  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => {
      const target = parseInt(el.dataset.countTo ?? '0', 10);
      el.textContent = String(target);
    });
    return;
  }

  const animate = (el: HTMLElement) => {
    const target = parseInt(el.dataset.countTo ?? '0', 10);
    if (!target) return;

    const duration = 1200; // ms
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const value = Math.round(eased * target);
      el.textContent = String(value);
      if (t < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          animate(entry.target as HTMLElement);
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.6 }
  );

  els.forEach((el) => io.observe(el));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export {};
