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

function initLightbox(cleanups: Cleanup[]) {
  const lightbox = document.getElementById('reviewLightbox');
  const lbImg = document.getElementById('lbImg') as HTMLImageElement | null;
  const lbClose = document.getElementById('lbClose');
  const lbPrev = document.getElementById('lbPrev');
  const lbNext = document.getElementById('lbNext');
  const lbCounter = document.getElementById('lbCounter');
  if (!lightbox || !lbImg) return;

  // Collect all unique review image sources (skip aria-hidden duplicates)
  const allImages = Array.from(document.querySelectorAll<HTMLImageElement>('.rw-img:not([aria-hidden="true"])'));
  const srcs = allImages.map(img => img.src);
  let current = 0;

  function show(index: number) {
    current = ((index % srcs.length) + srcs.length) % srcs.length;
    lbImg!.src = srcs[current];
    if (lbCounter) lbCounter.textContent = `${current + 1} / ${srcs.length}`;
  }

  function open(index: number) {
    show(index);
    lightbox!.classList.add('is-open');
    lightbox!.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    lightbox!.classList.remove('is-open');
    lightbox!.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // Click on any review image to open
  allImages.forEach((img, i) => {
    const onClick = () => open(i);
    img.addEventListener('click', onClick);
    cleanups.push(() => img.removeEventListener('click', onClick));
  });

  // Nav
  lbClose?.addEventListener('click', close);
  lbPrev?.addEventListener('click', () => show(current - 1));
  lbNext?.addEventListener('click', () => show(current + 1));

  // Close on backdrop
  const onBackdrop = (e: Event) => { if (e.target === lightbox) close(); };
  lightbox.addEventListener('click', onBackdrop);

  // Keyboard
  const onKey = (e: KeyboardEvent) => {
    if (!lightbox.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(current - 1);
    if (e.key === 'ArrowRight') show(current + 1);
  };
  document.addEventListener('keydown', onKey);

  cleanups.push(
    () => lbClose?.removeEventListener('click', close),
    () => lightbox.removeEventListener('click', onBackdrop),
    () => document.removeEventListener('keydown', onKey),
  );
}

function initHomePageRuntime() {
  // Home page is detected by the new #prelude section (the old #hero
  // id was retired during the editorial redesign in 2.1).
  if (!document.getElementById('prelude')) {
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
  initLightbox(cleanups);

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
