/**
 * may9 / typewriter
 * Анимирует появление эпиграфа Hero word-by-word, один раз за сессию.
 * Без мигающего курсора. Уважает prefers-reduced-motion.
 */

const STORAGE_KEY = 'salon:may9:typewriter-shown';

function init() {
  const epi = document.querySelector<HTMLElement>('[data-typewriter]');
  if (!epi) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Показывали в этой сессии — выходим
  let shown = false;
  try {
    shown = sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    /* private mode etc. */
  }

  if (reduceMotion || shown) {
    return; // Эпиграф появится через стандартный reveal
  }

  // Сначала скрываем целиком — чтобы не было flicker
  epi.style.opacity = '0';

  // Когда reveal сработает (data-shown="true") — запустим typewriter
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.attributeName !== 'data-shown') continue;
      if (epi.dataset.shown !== 'true') continue;

      observer.disconnect();
      runTypewriter(epi);
      return;
    }
  });

  observer.observe(epi, { attributes: true, attributeFilter: ['data-shown'] });

  // Fallback на случай если reveal не сработает (нет IntersectionObserver)
  setTimeout(() => {
    if (epi.dataset.shown !== 'true' && !reduceMotion) {
      observer.disconnect();
      runTypewriter(epi);
    }
  }, 1500);
}

function runTypewriter(epi: HTMLElement) {
  const original = epi.textContent ?? '';
  const words = original.split(' ').filter(Boolean);
  if (!words.length) return;

  // Очищаем и собираем по словам
  epi.textContent = '';
  epi.style.opacity = '1';

  const wordSpans: HTMLSpanElement[] = words.map((w) => {
    const span = document.createElement('span');
    span.textContent = w;
    span.style.opacity = '0';
    span.style.transition = 'opacity .5s ease';
    span.style.display = 'inline';
    return span;
  });

  wordSpans.forEach((span, i) => {
    epi.appendChild(span);
    if (i < wordSpans.length - 1) {
      epi.appendChild(document.createTextNode(' '));
    }
  });

  // Поэтапно проявляем
  wordSpans.forEach((span, i) => {
    setTimeout(() => {
      span.style.opacity = '1';
    }, i * 90);
  });

  // Помечаем сессию как показанную
  try {
    sessionStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export {};
