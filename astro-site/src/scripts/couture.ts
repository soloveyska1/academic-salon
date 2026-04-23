// ════════════════════════════════════════════════════════════════
// COUTURE runtime — scroll-progress + reveal-on-scroll (Phase 3.1)
// ────────────────────────────────────────────────────────────────
// * scroll-progress: single fixed bar (.scroll-progress) whose width
//   tracks page scroll. Modern browsers get CSS scroll-timeline for
//   free (see design-tokens.css); this JS is the fallback.
// * reveal: IntersectionObserver toggles .in on [data-reveal] when
//   the element enters the viewport.
// ════════════════════════════════════════════════════════════════

const BAR_CLASS = 'scroll-progress';

function ensureBar(): HTMLElement {
  let bar = document.querySelector<HTMLElement>('.' + BAR_CLASS);
  if (!bar) {
    bar = document.createElement('div');
    bar.className = BAR_CLASS;
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
  }
  return bar;
}

let scrollRafId: number | null = null;
function updateBar(bar: HTMLElement) {
  const h = document.documentElement.scrollHeight - window.innerHeight;
  const p = h > 0 ? (window.scrollY / h) * 100 : 0;
  bar.style.width = p.toFixed(2) + '%';
}

function supportsScrollTimeline(): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
    && CSS.supports('animation-timeline: scroll()');
}

function initScrollProgress() {
  const bar = ensureBar();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // Per design-tokens.css, the bar is already display:none in reduce mode.
    return;
  }
  if (supportsScrollTimeline()) {
    // CSS handles it; nothing to do here.
    return;
  }
  const onScroll = () => {
    if (scrollRafId !== null) return;
    scrollRafId = requestAnimationFrame(() => {
      updateBar(bar);
      scrollRafId = null;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  updateBar(bar);
}

function initReveal() {
  const targets = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (!targets.length) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches
      || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('in'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.08,
    rootMargin: '0px 0px -40px 0px',
  });

  targets.forEach((el) => {
    if (!el.classList.contains('in')) io.observe(el);
  });
}

function initCurtain() {
  /* Curtain overlay removed — no-op. Add `curtain-gone` to body so any legacy
     CSS that depends on it resolves to the "revealed" state. */
  document.body.classList.add('curtain-gone');
}

// ── Secret admin entry: 7 rapid clicks on the footer copyright line. ──
// The /admin page is not linked anywhere in public navigation. Owner-only
// convention carried over from the legacy SPA (see CLAUDE.md).
function initSecretAdminEntry() {
  const target = document.getElementById('sfCopy');
  if (!target) return;
  let count = 0;
  let lastAt = 0;
  const WINDOW_MS = 2500;
  const openAdmin = () => { window.location.href = '/admin'; };
  const bump = () => {
    const now = Date.now();
    if (now - lastAt > WINDOW_MS) count = 0;
    lastAt = now;
    count += 1;
    if (count >= 7) {
      count = 0;
      openAdmin();
    }
  };
  target.addEventListener('click', bump);
  target.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
      (e as KeyboardEvent).preventDefault();
      bump();
    }
  });
}

export function bootCouture() {
  initScrollProgress();
  initReveal();
  initCurtain();
  initSecretAdminEntry();
}

// Run on first load and on Astro view-transition swap.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootCouture, { once: true });
} else {
  bootCouture();
}
document.addEventListener('astro:page-load', bootCouture);
