/**
 * may9 / slots cascade
 * Последовательное «зажигание» 20 кружков-слотов слева направо
 * при появлении секции в viewport. Один раз за сессию.
 * Уважает prefers-reduced-motion.
 */

const STORAGE_KEY = 'salon:may9:slots-cascade-shown';

function init() {
  const grid = document.querySelector<HTMLElement>('[data-m9-slots]');
  if (!grid) return;

  const slots = Array.from(grid.querySelectorAll<HTMLElement>('.m9-slot'));
  if (!slots.length) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let shown = false;
  try {
    shown = sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    /* ignore */
  }

  if (reduceMotion || shown || !('IntersectionObserver' in window)) {
    return; // Слоты появятся обычным reveal
  }

  // Спрятать все слоты сразу
  slots.forEach((s) => {
    s.style.opacity = '0';
    s.style.transform = 'scale(0.85)';
    s.style.transition = 'opacity .5s ease, transform .5s ease';
  });

  const cascade = () => {
    slots.forEach((s, i) => {
      setTimeout(() => {
        s.style.opacity = '';
        s.style.transform = '';
      }, i * 60);
    });

    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          cascade();
          io.disconnect();
          return;
        }
      }
    },
    { threshold: 0.4 }
  );

  io.observe(grid);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export {};
