type Cleanup = () => void;

declare global {
  interface Window {
    __academicSalonHomeRuntimeCleanup?: Cleanup;
  }
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
        try { cleanup?.(); } catch (_) {}
      }
    },
  };
}

function initReveal(registerCleanup: (cleanup?: Cleanup | null) => void) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const items = Array.from(document.querySelectorAll<HTMLElement>('.rv'));
  if (!items.length) return;

  if (reduced) {
    items.forEach((el) => el.classList.add('vis'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('vis');
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );

  items.forEach((el) => observer.observe(el));
  registerCleanup(() => observer.disconnect());
}

function initHeroSearch(registerCleanup: (cleanup?: Cleanup | null) => void) {
  const input = document.getElementById('heroSearchInput') as HTMLInputElement | null;
  if (!input) return;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== '/') return;
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable)) return;
    event.preventDefault();
    input.focus();
  };

  document.addEventListener('keydown', onKeyDown);
  registerCleanup(() => document.removeEventListener('keydown', onKeyDown));
}

function initReviewShowcase(registerCleanup: (cleanup?: Cleanup | null) => void) {
  const showcase = document.getElementById('reviewsShowcase');
  const dotsContainer = document.getElementById('reviewDots');
  const counterCurrent = document.getElementById('reviewCurrent');
  const prevBtn = document.getElementById('reviewPrev');
  const nextBtn = document.getElementById('reviewNext');
  if (!showcase || !dotsContainer || !counterCurrent) return;

  const images = Array.from(showcase.querySelectorAll<HTMLImageElement>('.review-img'));
  const total = images.length;
  if (total < 2) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let current = 0;

  // Generate dots
  dotsContainer.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const dot = document.createElement('button');
    dot.className = 'dot' + (i === 0 ? ' active' : '');
    dot.setAttribute('aria-label', `Отзыв ${i + 1}`);
    dot.dataset.i = String(i);
    dotsContainer.appendChild(dot);
  }
  const dots = Array.from(dotsContainer.querySelectorAll<HTMLElement>('.dot'));

  function goTo(index: number) {
    // Wrap around
    let next = index % total;
    if (next < 0) next = total + next;

    images[current].classList.remove('active');
    dots[current]?.classList.remove('active');
    current = next;
    images[current].classList.add('active');
    dots[current]?.classList.add('active');
    if (counterCurrent) counterCurrent.textContent = String(current + 1);
  }

  // Auto-advance every 5s
  let interval: number | undefined;
  function startAutoAdvance() {
    if (reduced) return;
    stopAutoAdvance();
    interval = window.setInterval(() => goTo(current + 1), 5000);
  }
  function stopAutoAdvance() {
    if (interval !== undefined) {
      window.clearInterval(interval);
      interval = undefined;
    }
  }
  function resetAutoAdvance() {
    stopAutoAdvance();
    startAutoAdvance();
  }

  startAutoAdvance();
  registerCleanup(() => stopAutoAdvance());

  // Prev / Next buttons
  if (prevBtn) {
    const onPrev = () => { goTo(current - 1); resetAutoAdvance(); };
    prevBtn.addEventListener('click', onPrev);
    registerCleanup(() => prevBtn.removeEventListener('click', onPrev));
  }
  if (nextBtn) {
    const onNext = () => { goTo(current + 1); resetAutoAdvance(); };
    nextBtn.addEventListener('click', onNext);
    registerCleanup(() => nextBtn.removeEventListener('click', onNext));
  }

  // Dot clicks
  dots.forEach((dot, i) => {
    const onClick = () => { goTo(i); resetAutoAdvance(); };
    dot.addEventListener('click', onClick);
    registerCleanup(() => dot.removeEventListener('click', onClick));
  });

  // Touch swipe on the review stage
  const stage = showcase.querySelector('.review-stage') as HTMLElement | null;
  if (stage) {
    let touchStartX = 0;
    let touchStartY = 0;

    const onTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      // Only count horizontal swipes (not vertical scrolling)
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) {
        goTo(current + 1);
      } else {
        goTo(current - 1);
      }
      resetAutoAdvance();
    };

    stage.addEventListener('touchstart', onTouchStart, { passive: true });
    stage.addEventListener('touchend', onTouchEnd, { passive: true });
    registerCleanup(() => {
      stage.removeEventListener('touchstart', onTouchStart);
      stage.removeEventListener('touchend', onTouchEnd);
    });
  }
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
  initHeroSearch((cleanup) => bag.add(cleanup));
  initReviewShowcase((cleanup) => bag.add(cleanup));

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
