/**
 * may9 / table of contents
 * IntersectionObserver следит за активной главой,
 * подсвечивает соответствующий пункт оглавления золотом.
 */

function init() {
  const links = document.querySelectorAll<HTMLAnchorElement>('.m9-toc-link');
  if (!links.length) return;

  const sections = Array.from(
    document.querySelectorAll<HTMLElement>('[data-chapter]')
  );
  if (!sections.length) return;

  const linkMap = new Map<string, HTMLAnchorElement>();
  links.forEach((link) => {
    const target = link.dataset.tocTarget;
    if (target) linkMap.set(target, link);
  });

  let activeId: string | null = null;
  const visible = new Map<string, number>();

  const setActive = (id: string | null) => {
    if (activeId === id) return;
    if (activeId) {
      const prev = linkMap.get(activeId);
      prev?.removeAttribute('aria-current');
    }
    if (id) {
      const cur = linkMap.get(id);
      cur?.setAttribute('aria-current', 'true');
    }
    activeId = id;
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const id = entry.target.id;
        if (!id) continue;
        if (entry.isIntersecting) {
          visible.set(id, entry.intersectionRatio);
        } else {
          visible.delete(id);
        }
      }

      // Берём ту секцию, чей кусок виден больше всего
      let bestId: string | null = null;
      let bestRatio = 0;
      for (const [id, ratio] of visible) {
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestId = id;
        }
      }
      setActive(bestId);
    },
    {
      rootMargin: '-30% 0px -50% 0px',
      threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
    }
  );

  sections.forEach((s) => io.observe(s));

  // Smooth-scroll по клику (с уважением к reduce-motion)
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  links.forEach((link) => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href') ?? '';
      if (!href.startsWith('#')) return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      });
      // Обновляем URL без перезагрузки
      history.pushState(null, '', href);
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export {};
