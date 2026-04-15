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

function initTestimonials(registerCleanup: (cleanup?: Cleanup | null) => void) {
  const container = document.getElementById('testimonials');
  const dotsContainer = document.getElementById('testimonialDots');
  if (!container || !dotsContainer) return;

  const items = Array.from(container.querySelectorAll<HTMLElement>('.testimonial'));
  const dots = Array.from(dotsContainer.querySelectorAll<HTMLElement>('.dot'));
  if (items.length < 2) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let current = 0;

  function goTo(index: number) {
    items[current].classList.remove('active');
    dots[current]?.classList.remove('active');
    current = index % items.length;
    items[current].classList.add('active');
    dots[current]?.classList.add('active');
  }

  // Auto-rotate every 4s
  let interval: number | undefined;
  if (!reduced) {
    interval = window.setInterval(() => goTo(current + 1), 4000);
    registerCleanup(() => window.clearInterval(interval));
  }

  // Click on dots
  dots.forEach((dot, i) => {
    const onClick = () => {
      goTo(i);
      // Reset auto-rotation timer
      if (interval) {
        window.clearInterval(interval);
        interval = window.setInterval(() => goTo(current + 1), 4000);
      }
    };
    dot.addEventListener('click', onClick);
    registerCleanup(() => dot.removeEventListener('click', onClick));
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
  initHeroSearch((cleanup) => bag.add(cleanup));
  initTestimonials((cleanup) => bag.add(cleanup));

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
