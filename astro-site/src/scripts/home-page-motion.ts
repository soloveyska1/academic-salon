type Cleanup = () => void;

declare global {
  interface Window {
    __academicSalonHomeMotionCleanup?: Cleanup;
  }
}

let homeMotionModules:
  | Promise<{
      gsap: typeof import('gsap').gsap;
      ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger;
      SplitText: typeof import('gsap/SplitText').SplitText;
      ScrambleTextPlugin: typeof import('gsap/ScrambleTextPlugin').ScrambleTextPlugin;
    }>
  | undefined;

function shouldEnableHomeMotion() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection && connection.saveData) return false;
  if (navigator.deviceMemory && navigator.deviceMemory < 4) return false;
  return true;
}

function loadHomeMotion() {
  if (!homeMotionModules) {
    homeMotionModules = Promise.all([
      import('gsap'),
      import('gsap/ScrollTrigger'),
      import('gsap/SplitText'),
      import('gsap/ScrambleTextPlugin'),
    ]).then((mods) => {
      const gsap = mods[0].gsap;
      const ScrollTrigger = mods[1].ScrollTrigger;
      const SplitText = mods[2].SplitText;
      const ScrambleTextPlugin = mods[3].ScrambleTextPlugin;

      gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin);
      return { gsap, ScrollTrigger, SplitText, ScrambleTextPlugin };
    });
  }

  return homeMotionModules;
}

function scheduleHomeMotionInit() {
  const run = () => initHomePageMotion().catch(() => {});
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 900 });
  } else {
    window.setTimeout(run, 220);
  }
}

async function initHomePageMotion() {
  if (!document.getElementById('heroTitle')) {
    window.__academicSalonHomeMotionCleanup?.();
    window.__academicSalonHomeMotionCleanup = undefined;
    return;
  }

  window.__academicSalonHomeMotionCleanup?.();

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.innerWidth <= 768) return;
  if (!shouldEnableHomeMotion()) return;

  const cleanups: Cleanup[] = [];
  const registerCleanup = (cleanup?: Cleanup | null) => {
    if (cleanup) cleanups.push(cleanup);
  };

  const { gsap, ScrollTrigger, SplitText } = await loadHomeMotion();

  const cleanupMotion = () => {
    while (cleanups.length) {
      const cleanup = cleanups.pop();
      try {
        cleanup?.();
      } catch (_) {}
    }
  };

  window.__academicSalonHomeMotionCleanup = cleanupMotion;
  document.addEventListener('astro:before-swap', cleanupMotion, { once: true });

  ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
  registerCleanup(() => ScrollTrigger.getAll().forEach((trigger) => trigger.kill()));

  const heroTitle = document.getElementById('heroTitle');
  const eyebrow = document.getElementById('heroEyebrow');
  const heroSub = document.getElementById('heroSub');
  const heroActions = document.getElementById('heroActions');
  const heroRule = document.querySelector('.hero-rule') as HTMLElement | null;

  const heroTL = gsap.timeline({ delay: 0.2 });

  if (eyebrow) {
    eyebrow.style.animation = 'none';
    heroTL.from(eyebrow, { opacity: 0, y: 12, duration: 0.6, ease: 'power2.out' }, 0);
  }

  if (heroTitle) {
    heroTitle.querySelectorAll('.word').forEach((word) => {
      (word as HTMLElement).style.opacity = '1';
      (word as HTMLElement).style.transform = 'none';
      (word as HTMLElement).style.animation = 'none';
    });

    const split = new SplitText(heroTitle, {
      type: 'chars',
      charsClass: 'gsap-char',
    });

    heroTL.from(
      split.chars,
      {
        opacity: 0,
        y: 40,
        rotateX: -60,
        stagger: 0.025,
        duration: 0.9,
        ease: 'power3.out',
      },
      0.3
    );
  }

  if (heroRule) {
    heroRule.style.animation = 'none';
    heroTL.fromTo(
      heroRule,
      { opacity: 0, scaleX: 0 },
      { opacity: 0.25, scaleX: 1, duration: 0.7, ease: 'power3.inOut' },
      0.9
    );
  }

  if (heroSub) {
    heroSub.style.animation = 'none';
    heroTL.from(heroSub, { opacity: 0, y: 14, duration: 0.7, ease: 'power2.out' }, 1.1);
  }

  if (heroActions) {
    heroActions.style.animation = 'none';
    heroTL.from(heroActions, { opacity: 0, y: 18, duration: 0.7, ease: 'power2.out' }, 1.35);
  }

  document.querySelectorAll('.section-title').forEach((title) => {
    const split = new SplitText(title, {
      type: 'words',
      wordsClass: 'gsap-word',
    });

    gsap.from(split.words, {
      opacity: 0,
      y: 24,
      stagger: 0.04,
      duration: 0.7,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: title,
        start: 'top 85%',
        once: true,
      },
    });
  });

  const cardGrid = document.getElementById('bento');
  if (cardGrid) {
    const cards = Array.from(cardGrid.querySelectorAll<HTMLElement>('.card'));
    cards.forEach((card) => {
      card.style.opacity = '1';
      card.style.transform = 'none';
      card.classList.add('anim-done');
    });

    if (!window.matchMedia('(pointer: coarse)').matches) {
      const onMouseMove = (event: MouseEvent) => {
        const card = (event.target as HTMLElement).closest('.card') as HTMLElement | null;
        if (!card) return;
        const rect = card.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const rotateX = -((y / rect.height) - 0.5) * 8;
        const rotateY = ((x / rect.width) - 0.5) * 8;
        card.style.transform =
          'perspective(600px) rotateY(' + rotateY + 'deg) rotateX(' + rotateX + 'deg) translateY(-3px)';
      };

      const leaveHandlers = new Map<HTMLElement, () => void>();
      cardGrid.addEventListener('mousemove', onMouseMove);
      registerCleanup(() => cardGrid.removeEventListener('mousemove', onMouseMove));

      cards.forEach((card) => {
        const onMouseLeave = () => {
          card.style.transition = 'transform 0.5s cubic-bezier(.22,1,.36,1)';
          card.style.transform = '';
          window.setTimeout(() => {
            card.style.transition = '';
          }, 500);
        };
        leaveHandlers.set(card, onMouseLeave);
        card.addEventListener('mouseleave', onMouseLeave);
      });

      registerCleanup(() => {
        leaveHandlers.forEach((handler, card) => {
          card.removeEventListener('mouseleave', handler);
        });
      });
    }

    gsap.from(cards, {
      opacity: 0,
      y: 40,
      scale: 0.97,
      stagger: { each: 0.07, from: 'start' },
      duration: 0.6,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: cardGrid,
        start: 'top 80%',
        once: true,
      },
    });
  }

  const guaranteesGrid = document.querySelector('.guarantees-grid');
  if (guaranteesGrid) {
    gsap.from(guaranteesGrid.querySelectorAll('.guarantee'), {
      opacity: 0,
      y: 30,
      stagger: 0.1,
      duration: 0.6,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: guaranteesGrid,
        start: 'top 80%',
        once: true,
      },
    });
  }

  const steps = document.querySelectorAll('.step');
  if (steps.length) {
    gsap.from(steps, {
      opacity: 0,
      x: -20,
      stagger: 0.15,
      duration: 0.7,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: '.steps',
        start: 'top 80%',
        once: true,
      },
    });
  }

  const faqItems = document.querySelectorAll('.faq-item');
  if (faqItems.length) {
    gsap.from(faqItems, {
      opacity: 0,
      y: 16,
      stagger: 0.08,
      duration: 0.5,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: '.faq-preview-list',
        start: 'top 85%',
        once: true,
      },
    });
  }

  const closingTitle = document.querySelector('.closing-title');
  if (closingTitle) {
    const split = new SplitText(closingTitle, {
      type: 'words',
      wordsClass: 'gsap-word',
    });

    gsap.from(split.words, {
      opacity: 0,
      y: 20,
      stagger: 0.05,
      duration: 0.7,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: closingTitle,
        start: 'top 85%',
        once: true,
      },
    });
  }

  document.querySelectorAll('.metric-value[data-target]').forEach((el) => {
    const target = el.getAttribute('data-target') || '0';
    const suffix = el.getAttribute('data-suffix') || '';

    gsap.to(el, {
      scrambleText: {
        text: target + suffix,
        chars: '0123456789',
        speed: 0.4,
        revealDelay: 0.3,
      },
      duration: 1.8,
      ease: 'power2.inOut',
      scrollTrigger: {
        trigger: el,
        start: 'top 90%',
        once: true,
      },
    });
  });

  const heroSection = document.getElementById('hero');
  const heroInner = document.querySelector('.hero-inner');
  if (heroSection && heroInner) {
    ScrollTrigger.create({
      trigger: heroSection,
      start: 'top top',
      end: '+=40%',
      pin: true,
      pinSpacing: true,
    });

    gsap.to(heroInner, {
      opacity: 0,
      y: -40,
      scale: 0.97,
      ease: 'none',
      scrollTrigger: {
        trigger: heroSection,
        start: 'top top',
        end: '+=40%',
        scrub: true,
      },
    });

    const heroMetrics = document.querySelector('.hero-metrics');
    if (heroMetrics) {
      gsap.to(heroMetrics, {
        opacity: 0,
        y: -20,
        ease: 'none',
        scrollTrigger: {
          trigger: heroSection,
          start: '10% top',
          end: '+=30%',
          scrub: true,
        },
      });
    }
  }

  const heroGlow = document.querySelector('.hero-glow');
  if (heroGlow) {
    gsap.to(heroGlow, {
      y: -80,
      ease: 'none',
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: 'bottom top',
        scrub: true,
      },
    });
  }

  const heroCanvas = document.getElementById('heroCanvas');
  if (heroCanvas) {
    gsap.to(heroCanvas, {
      y: -60,
      opacity: 0.3,
      ease: 'none',
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: 'bottom top',
        scrub: true,
      },
    });
  }

  const reviewsSection = document.querySelector('.reviews-inner');
  if (reviewsSection) {
    gsap.from(reviewsSection, {
      opacity: 0,
      y: 30,
      duration: 0.8,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: '.reviews',
        start: 'top 80%',
        once: true,
      },
    });
  }

  document.querySelectorAll<HTMLImageElement>('.review-img:not([aria-hidden])').forEach((img, index) => {
    const speed = 10 + (index % 3) * 8;
    gsap.to(img, {
      y: -speed,
      ease: 'none',
      scrollTrigger: {
        trigger: '.reviews',
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
      },
    });
  });

  const stepsContainer = document.querySelector('.steps');
  if (stepsContainer && window.innerWidth >= 900) {
    const stepElements = stepsContainer.querySelectorAll('.step');
    if (stepElements.length) {
      gsap.fromTo(
        stepElements,
        { '--step-progress': 0 },
        {
          '--step-progress': 1,
          stagger: 0.3,
          ease: 'none',
          scrollTrigger: {
            trigger: stepsContainer,
            start: 'top 70%',
            end: 'bottom 50%',
            scrub: true,
          },
        }
      );

      stepElements.forEach((step) => {
        const num = step.querySelector('.step-num');
        if (!num) return;
        gsap.fromTo(
          num,
          { opacity: 0.04, scale: 0.9 },
          {
            opacity: 0.08,
            scale: 1,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: step,
              start: 'top 80%',
              end: 'top 50%',
              scrub: true,
            },
          }
        );
      });
    }
  }

  if (heroTitle) {
    gsap.fromTo(
      heroTitle,
      { fontWeight: 300 },
      {
        fontWeight: 500,
        ease: 'none',
        scrollTrigger: {
          trigger: heroSection || heroTitle,
          start: 'top top',
          end: '+=30%',
          scrub: true,
        },
      }
    );
  }

  document.querySelectorAll('.section-divider').forEach((divider) => {
    gsap.from(divider, {
      opacity: 0,
      scaleX: 0,
      duration: 0.8,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: divider,
        start: 'top 90%',
        once: true,
      },
    });
  });

  document.querySelectorAll('.guarantee-icon').forEach((icon, index) => {
    gsap.from(icon, {
      opacity: 0,
      rotate: -15,
      scale: 0.5,
      duration: 0.6,
      delay: index * 0.1,
      ease: 'back.out(1.7)',
      scrollTrigger: {
        trigger: icon,
        start: 'top 85%',
        once: true,
      },
    });
  });

  const closingActions = document.querySelector('.closing-actions');
  if (closingActions) {
    gsap.from(closingActions, {
      opacity: 0,
      y: 24,
      duration: 0.7,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: closingActions,
        start: 'top 85%',
        once: true,
      },
    });
  }

  ScrollTrigger.refresh();
}

let homePageMotionBooted = false;

export function bootHomePageMotion() {
  if (homePageMotionBooted) return;
  homePageMotionBooted = true;

  document.addEventListener('astro:page-load', scheduleHomeMotionInit);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleHomeMotionInit, { once: true });
  } else {
    scheduleHomeMotionInit();
  }
}
