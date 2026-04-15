type Cleanup = () => void;

declare global {
  interface Window {
    __academicSalonHomeRuntimeCleanup?: Cleanup;
  }
}

function initReveal(cleanups: Cleanup[]) {
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
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' },
  );

  items.forEach((el) => observer.observe(el));
  cleanups.push(() => observer.disconnect());
}

function initHeroSearch(cleanups: Cleanup[]) {
  const input = document.getElementById('heroSearchInput') as HTMLInputElement | null;
  if (!input) return;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== '/') return;
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || (a as HTMLElement).isContentEditable)) return;
    e.preventDefault();
    input.focus();
  };

  document.addEventListener('keydown', onKeyDown);
  cleanups.push(() => document.removeEventListener('keydown', onKeyDown));
}

function initHomePageRuntime() {
  if (!document.getElementById('hero')) {
    window.__academicSalonHomeRuntimeCleanup?.();
    window.__academicSalonHomeRuntimeCleanup = undefined;
    return;
  }

  window.__academicSalonHomeRuntimeCleanup?.();

  const cleanups: Cleanup[] = [];
  window.__academicSalonHomeRuntimeCleanup = () => {
    while (cleanups.length) {
      try { cleanups.pop()?.(); } catch (_) {}
    }
  };

  initReveal(cleanups);
  initHeroSearch(cleanups);

  document.addEventListener('astro:before-swap', window.__academicSalonHomeRuntimeCleanup, { once: true });
}

let booted = false;

export function bootHomePageRuntime() {
  if (booted) return;
  booted = true;

  document.addEventListener('astro:page-load', initHomePageRuntime);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHomePageRuntime, { once: true });
  } else {
    initHomePageRuntime();
  }
}
