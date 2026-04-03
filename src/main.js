/**
 * Academic Salon — main entry point
 * Detects mobile and boots the appropriate UI
 */
const isMobile = window.innerWidth <= 768 ||
  ('ontouchstart' in window && window.innerWidth <= 1024);

if (isMobile) {
  // Mobile-first: load native-like mobile UI
  import('./mobile/index.js').then(({ bootMobile }) => {
    const booted = bootMobile();
    if (!booted) {
      // Fallback to desktop if mobile boot fails
      loadDesktop();
    }
  }).catch(() => loadDesktop());
} else {
  loadDesktop();
}

function loadDesktop() {
  import('./styles/index.css');
  import('./modules/init.js');
  import('./modules/command-palette.js');
}
