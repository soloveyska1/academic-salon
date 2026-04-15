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
