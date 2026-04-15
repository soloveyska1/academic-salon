type Cleanup = () => void;

declare global {
  interface Window {
    __academicSalonHomeRuntimeCleanup?: Cleanup;
    showToast?: (message: string, type?: string, duration?: number) => void;
  }
}

function shouldUseMetricFallback() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
  if (window.innerWidth <= 768) return true;
  if (connection && connection.saveData) return true;
  if (navigator.deviceMemory && navigator.deviceMemory < 4) return true;
  return false;
}

function createHomePageRuntimeCleanupBag() {
  const cleanups: Cleanup[] = [];
  return {
    add(cleanup?: Cleanup | null) {
      if (!cleanup) return;
      cleanups.push(cleanup);
    },
    run() {
      while (cleanups.length) {
        const cleanup = cleanups.pop();
        try {
          cleanup?.();
        } catch (_) {}
      }
    },
  };
}

function initReveal(registerCleanup: (cleanup?: Cleanup | null) => void) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const items = Array.from(document.querySelectorAll<HTMLElement>('.metric, .card'));
  if (!items.length) return;

  if (reduced) {
    items.forEach((el) => {
      el.classList.add('is-visible', 'anim-done');
    });
    return;
  }

  items.forEach((el) => {
    const handleAnimationEnd = () => {
      el.classList.add('anim-done');
      el.removeEventListener('animationend', handleAnimationEnd);
    };
    el.addEventListener('animationend', handleAnimationEnd);
    registerCleanup(() => el.removeEventListener('animationend', handleAnimationEnd));
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );

  items.forEach((el) => observer.observe(el));
  registerCleanup(() => observer.disconnect());
}

function initMetricCounters(registerCleanup: (cleanup?: Cleanup | null) => void) {
  if (!shouldUseMetricFallback()) return;

  const metrics = Array.from(document.querySelectorAll<HTMLElement>('.metric-value[data-target], .reviews-stat-value[data-target]'));
  if (!metrics.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        const el = entry.target as HTMLElement;
        if (el.dataset.metricAnimated === '1') {
          observer.unobserve(el);
          return;
        }

        el.dataset.metricAnimated = '1';
        observer.unobserve(el);

        const target = parseInt(el.getAttribute('data-target') || '0', 10);
        const suffix = el.getAttribute('data-suffix') || '';
        const duration = 1100;
        const start = performance.now();

        function tick(now: number) {
          const t = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - t, 3);
          el.textContent = Math.round(eased * target) + suffix;
          if (t < 1) window.requestAnimationFrame(tick);
        }

        window.requestAnimationFrame(tick);
      });
    },
    { threshold: 0.3 }
  );

  metrics.forEach((metric) => observer.observe(metric));
  registerCleanup(() => observer.disconnect());
}

function initStepsLine(registerCleanup: (cleanup?: Cleanup | null) => void) {
  const line = document.getElementById('stepsLine');
  if (!line) return;
  if (CSS.supports('animation-timeline: view()')) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        line.classList.add('is-drawn');
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.2 }
  );

  observer.observe(line);
  registerCleanup(() => observer.disconnect());
}

function initFilters(registerCleanup: (cleanup?: Cleanup | null) => void) {
  const chips = Array.from(document.querySelectorAll<HTMLElement>('.chip'));
  const cards = Array.from(document.querySelectorAll<HTMLElement>('.card'));
  if (!chips.length || !cards.length) return;

  function getColumns() {
    if (window.matchMedia('(min-width: 900px)').matches) return 3;
    if (window.matchMedia('(min-width: 640px)').matches) return 2;
    return 1;
  }

  function apply(key: string) {
    cards.forEach((card) => {
      const group = card.getAttribute('data-group') || '';
      card.hidden = !(key === 'Все' || group === key);
      card.style.gridColumn = '';
    });

    const visible = cards.filter((card) => !card.hidden);
    const columns = getColumns();
    if (columns <= 1 || !visible.length) return;

    const remainder = visible.length % columns;
    if (!remainder) return;
    visible[visible.length - 1].style.gridColumn = 'span ' + (columns - remainder + 1);
  }

  function getActiveFilter() {
    return (
      chips.find((chip) => chip.classList.contains('chip--active'))?.getAttribute('data-filter') ||
      'Все'
    );
  }

  chips.forEach((chip) => {
    const onClick = () => {
      chips.forEach((current) => {
        current.classList.remove('chip--active');
        current.setAttribute('aria-selected', 'false');
      });

      chip.classList.add('chip--active');
      chip.setAttribute('aria-selected', 'true');
      apply(chip.getAttribute('data-filter') || 'Все');
    };

    chip.addEventListener('click', onClick);
    registerCleanup(() => chip.removeEventListener('click', onClick));
  });

  const onResize = () => apply(getActiveFilter());
  window.addEventListener('resize', onResize, { passive: true });
  registerCleanup(() => window.removeEventListener('resize', onResize));

  apply(getActiveFilter());
}

function initCarousel(registerCleanup: (cleanup?: Cleanup | null) => void) {
  const carousel = document.getElementById('carousel');
  const track = document.getElementById('carouselTrack');
  if (!carousel || !track) return;

  let isDragging = false;
  let startX = 0;
  let scrollStart = 0;
  let didDrag = false;

  function getTranslateX() {
    const style = getComputedStyle(track);
    const matrix = new DOMMatrix(style.transform);
    return matrix.m41;
  }

  function onPointerDown(clientX: number) {
    isDragging = true;
    didDrag = false;
    startX = clientX;
    scrollStart = getTranslateX();
    track.classList.add('is-dragging');
    carousel.classList.add('is-dragging');
    track.style.animation = 'none';
    track.style.transform = 'translateX(' + scrollStart + 'px)';
  }

  function onPointerMove(clientX: number) {
    if (!isDragging) return;
    const diff = clientX - startX;
    if (Math.abs(diff) > 5) didDrag = true;
    const half = track.scrollWidth / 2;
    let next = scrollStart + diff;
    if (next > 0) next -= half;
    if (next < -half) next += half;
    track.style.transform = 'translateX(' + next + 'px)';
  }

  function onPointerUp() {
    if (!isDragging) return;
    isDragging = false;
    track.classList.remove('is-dragging');
    carousel.classList.remove('is-dragging');

    const currentX = getTranslateX();
    const half = track.scrollWidth / 2;
    const pct = ((currentX % half) + half) % half;
    const offsetPct = (pct / half) * 100;

    track.style.transform = '';
    track.style.animation = '';
    track.style.animationDelay = '-' + 60 * (1 - offsetPct / 100) + 's';
  }

  const handlePointerDown = (event: PointerEvent) => onPointerDown(event.clientX);
  const handlePointerMove = (event: PointerEvent) => onPointerMove(event.clientX);
  const handleTouchStart = (event: TouchEvent) => onPointerDown(event.touches[0]?.clientX || 0);
  const handleTouchMove = (event: TouchEvent) => {
    if (!isDragging) return;
    onPointerMove(event.touches[0]?.clientX || 0);
  };

  carousel.addEventListener('pointerdown', handlePointerDown);
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', onPointerUp);
  carousel.addEventListener('touchstart', handleTouchStart, { passive: true });
  window.addEventListener('touchmove', handleTouchMove, { passive: true });
  window.addEventListener('touchend', onPointerUp);

  registerCleanup(() => {
    carousel.removeEventListener('pointerdown', handlePointerDown);
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    carousel.removeEventListener('touchstart', handleTouchStart);
    window.removeEventListener('touchmove', handleTouchMove);
    window.removeEventListener('touchend', onPointerUp);
  });

  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg') as HTMLImageElement | null;
  const lightboxClose = document.getElementById('lightboxClose');
  if (!lightbox || !lightboxImg) return;

  function closeLightbox() {
    lightbox.classList.remove('is-open');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  const onCarouselClick = (event: Event) => {
    if (didDrag) return;
    const target = event.target as HTMLElement | null;
    const img = target?.closest('.review-img') as HTMLImageElement | null;
    if (!img) return;
    lightboxImg.src = img.src;
    lightbox.classList.add('is-open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };

  const onLightboxClick = (event: Event) => {
    if (event.target === lightbox) closeLightbox();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && lightbox.classList.contains('is-open')) {
      closeLightbox();
    }
  };

  carousel.addEventListener('click', onCarouselClick);
  lightboxClose?.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', onLightboxClick);
  document.addEventListener('keydown', onKeyDown);

  registerCleanup(() => {
    closeLightbox();
    carousel.removeEventListener('click', onCarouselClick);
    lightboxClose?.removeEventListener('click', closeLightbox);
    lightbox.removeEventListener('click', onLightboxClick);
    document.removeEventListener('keydown', onKeyDown);
  });
}

function initFloatCta(registerCleanup: (cleanup?: Cleanup | null) => void) {
  const cta = document.getElementById('floatCta');
  const hero = document.getElementById('hero');
  if (!cta || !hero) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        cta.classList.toggle('is-visible', !entry.isIntersecting);
      });
    },
    { threshold: 0.1 }
  );

  observer.observe(hero);
  registerCleanup(() => observer.disconnect());
}

function readRandomPool() {
  try {
    return JSON.parse(document.getElementById('randomPool')?.textContent || '[]');
  } catch (_) {
    return [];
  }
}

function encodeDocHref(file: string) {
  return (
    '/doc/' +
    String(file || '')
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/')
  );
}

function navigateToHref(href: string) {
  if (!href) return;
  window.location.assign(href);
}

function shouldOpenRandomDocumentDirectly() {
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (typeof navigator !== 'undefined' && (navigator as Navigator & { standalone?: boolean }).standalone === true);

  return standalone || window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 900;
}

function bindTapIntent(node: HTMLElement | null, handler: (event: Event) => void) {
  if (!node) return () => {};

  let lastGestureAt = -1000;

  const runFromGesture = (event: Event) => {
    const now = performance.now();
    if (now - lastGestureAt < 280) {
      event.preventDefault?.();
      return;
    }
    lastGestureAt = now;
    event.preventDefault?.();
    handler(event);
  };

  const onClick = (event: Event) => {
    if (performance.now() - lastGestureAt < 420) {
      event.preventDefault?.();
      return;
    }
    handler(event);
  };

  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') return;
    runFromGesture(event);
  };

  const onTouchEnd = (event: TouchEvent) => {
    runFromGesture(event);
  };

  node.addEventListener('click', onClick);
  node.addEventListener('pointerup', onPointerUp);
  node.addEventListener('touchend', onTouchEnd, { passive: false });

  return () => {
    node.removeEventListener('click', onClick);
    node.removeEventListener('pointerup', onPointerUp);
    node.removeEventListener('touchend', onTouchEnd);
  };
}

function initRandomDocument(registerCleanup: (cleanup?: Cleanup | null) => void) {
  const btn = document.getElementById('randomBtn');
  if (!btn || (btn as HTMLElement).dataset.randomReady === '1') return;

  let currentOverlay: HTMLElement | null = null;
  let currentOverlayCleanup: Cleanup | null = null;

  function removeRandomOverlay() {
    currentOverlayCleanup?.();
    currentOverlayCleanup = null;
    if (!currentOverlay) return;
    currentOverlay.remove();
    currentOverlay = null;
    document.removeEventListener('keydown', handleOverlayKeyDown);
  }

  function handleOverlayKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') removeRandomOverlay();
  }

  function renderRandomOverlay(doc: Record<string, string>) {
    removeRandomOverlay();

    const overlay = document.createElement('div');
    overlay.className = 'random-overlay';
    overlay.innerHTML =
      '<div class="random-overlay-bg"></div>' +
      '<div class="random-modal">' +
      '<span class="random-type"></span>' +
      '<h3 class="random-title"></h3>' +
      '<p class="random-subject"></p>' +
      '<div class="random-actions">' +
      '<button class="btn btn--primary random-open-link" type="button">Открыть</button>' +
      '<a href="/order" class="btn btn--ghost">Заказать похожую</a>' +
      '</div>' +
      '<button class="random-shuffle" id="reshuffleBtn" type="button">Другой документ ↻</button>' +
      '</div>';

    (overlay.querySelector('.random-type') as HTMLElement).textContent = doc.type || 'Документ';
    (overlay.querySelector('.random-title') as HTMLElement).textContent = doc.title || 'Без названия';
    (overlay.querySelector('.random-subject') as HTMLElement).textContent =
      doc.subject || 'Академический архив';
    const openButton = overlay.querySelector('.random-open-link') as HTMLButtonElement | null;
    const href = encodeDocHref(doc.file || '');
    openButton?.setAttribute('data-href', href);

    const overlayCleanups: Cleanup[] = [];
    const trackOverlayCleanup = (cleanup?: Cleanup | null) => {
      if (!cleanup) return;
      overlayCleanups.push(cleanup);
    };

    trackOverlayCleanup(
      bindTapIntent(overlay.querySelector('.random-overlay-bg') as HTMLElement | null, () => {
        removeRandomOverlay();
      })
    );
    trackOverlayCleanup(
      bindTapIntent(overlay.querySelector('#reshuffleBtn') as HTMLElement | null, () => {
        showRandomDocument();
      })
    );
    trackOverlayCleanup(bindTapIntent(openButton, () => {
      removeRandomOverlay();
      navigateToHref(href);
    }));

    currentOverlay = overlay;
    currentOverlayCleanup = () => {
      while (overlayCleanups.length) {
        const cleanup = overlayCleanups.pop();
        cleanup?.();
      }
    };
    document.body.appendChild(overlay);
    document.addEventListener('keydown', handleOverlayKeyDown);

    if (navigator.vibrate) navigator.vibrate(10);
  }

  function showRandomDocument() {
    const pool = readRandomPool();
    const showGlobalToast = window.showToast || (() => {});
    if (!pool.length) {
      showGlobalToast('Каталог временно недоступен', 'warning', 2400);
      return;
    }

    const doc = pool[Math.floor(Math.random() * pool.length)];
    if (shouldOpenRandomDocumentDirectly()) {
      navigateToHref(encodeDocHref(doc.file || ''));
      return;
    }
    renderRandomOverlay(doc);
  }

  (btn as HTMLElement).dataset.randomReady = '1';
  const releaseRandomTrigger = bindTapIntent(btn as HTMLElement, () => {
    showRandomDocument();
  });

  registerCleanup(() => {
    removeRandomOverlay();
    releaseRandomTrigger();
    delete (btn as HTMLElement).dataset.randomReady;
  });
}

function initHomePageRuntime() {
  if (!document.getElementById('hero')) {
    window.__academicSalonHomeRuntimeCleanup?.();
    window.__academicSalonHomeRuntimeCleanup = undefined;
    return;
  }

  window.__academicSalonHomeRuntimeCleanup?.();

  const bag = createHomePageRuntimeCleanupBag();
  window.__academicSalonHomeRuntimeCleanup = () => bag.run();

  initReveal((cleanup) => bag.add(cleanup));
  initMetricCounters((cleanup) => bag.add(cleanup));
  initStepsLine((cleanup) => bag.add(cleanup));
  initFilters((cleanup) => bag.add(cleanup));
  initCarousel((cleanup) => bag.add(cleanup));
  initFloatCta((cleanup) => bag.add(cleanup));
  initRandomDocument((cleanup) => bag.add(cleanup));

  document.addEventListener('astro:before-swap', window.__academicSalonHomeRuntimeCleanup, { once: true });
}

let homePageRuntimeBooted = false;

export function bootHomePageRuntime() {
  if (homePageRuntimeBooted) return;
  homePageRuntimeBooted = true;

  document.addEventListener('astro:page-load', initHomePageRuntime);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHomePageRuntime, { once: true });
  } else {
    initHomePageRuntime();
  }
}
