/**
 * Mobile app shell — main container, navigation, tab switching
 */
import { renderCatalogScreen, renderCategoriesScreen, renderFavoritesScreen, renderOrderScreen } from './mobile-screens.js';

const TABS = ['catalog', 'categories', 'favorites', 'order'];

const NAV_ICONS = {
  catalog: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    <line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="13" y2="11"/>
  </svg>`,
  categories: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
  </svg>`,
  favorites: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>`,
  order: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>`
};

const TAB_LABELS = {
  catalog: 'Каталог',
  categories: 'Разделы',
  favorites: 'Избранное',
  order: 'Заказать'
};

let currentTab = 'catalog';
let screensEl = null;

/**
 * Detect mobile device by viewport width or touch capability
 */
export function isMobile() {
  return window.innerWidth <= 768 || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
}

/**
 * Apply saved theme from localStorage
 */
function applyTheme() {
  const saved = localStorage.getItem('as_theme');
  // Default is dark theme (no data-theme attribute = dark)
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

/**
 * Build a single nav button
 */
function buildNavItem(tab) {
  const btn = document.createElement('button');
  btn.className = 'mob-nav-item' + (tab === currentTab ? ' active' : '');
  btn.dataset.tab = tab;
  btn.innerHTML = NAV_ICONS[tab] + `<span>${TAB_LABELS[tab]}</span>`;
  btn.addEventListener('click', () => switchTab(tab));
  return btn;
}

/**
 * Initialize the mobile app shell — replaces desktop content
 */
export function initMobileApp() {
  applyTheme();
  document.body.classList.add('mob-active');

  // Hide ALL desktop content immediately
  const wrapper = document.querySelector('.w');
  if (wrapper) wrapper.style.display = 'none';
  document.querySelectorAll('.bg-mesh, .stars, .sp, .thm, .btt, .sticky-cta, .slide-in, .mo, .admin-overlay, noscript').forEach(el => {
    el.style.display = 'none';
  });
  document.body.style.overflow = '';
  document.body.style.background = 'var(--bg)';

  const app = document.createElement('div');
  app.className = 'mob-app';
  app.id = 'mobApp';

  // Status bar spacer
  const status = document.createElement('div');
  status.className = 'mob-status';
  app.appendChild(status);

  // Screens container
  screensEl = document.createElement('div');
  screensEl.className = 'mob-screens';
  screensEl.id = 'mobScreens';
  app.appendChild(screensEl);

  // Bottom navigation
  const nav = document.createElement('nav');
  nav.className = 'mob-nav';
  nav.id = 'mobNav';
  TABS.forEach(tab => nav.appendChild(buildNavItem(tab)));
  app.appendChild(nav);

  document.body.appendChild(app);

  // Render initial tab
  switchTab(currentTab);
}

/**
 * Switch between tabs with slide animation
 */
export function switchTab(tabName) {
  if (!TABS.includes(tabName)) return;

  const prevIndex = TABS.indexOf(currentTab);
  const nextIndex = TABS.indexOf(tabName);
  const direction = nextIndex >= prevIndex ? 'left' : 'right';

  currentTab = tabName;

  // Update nav active state
  const nav = document.getElementById('mobNav');
  if (nav) {
    nav.querySelectorAll('.mob-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
  }

  if (!screensEl) return;

  // Animate out old content
  const oldScreen = screensEl.querySelector('.mob-screen');
  if (oldScreen) {
    oldScreen.classList.add('mob-screen-exit', `mob-slide-${direction}`);
    oldScreen.addEventListener('animationend', () => oldScreen.remove(), { once: true });
  }

  // Create new screen
  const screen = document.createElement('div');
  screen.className = `mob-screen mob-screen-enter mob-slide-${direction}`;
  screen.dataset.tab = tabName;

  // Render tab content
  switch (tabName) {
    case 'catalog':    renderCatalogScreen(screen); break;
    case 'categories': renderCategoriesScreen(screen); break;
    case 'favorites':  renderFavoritesScreen(screen); break;
    case 'order':      renderOrderScreen(screen); break;
  }

  screensEl.appendChild(screen);

  // Remove animation class after it finishes
  screen.addEventListener('animationend', () => {
    screen.classList.remove('mob-screen-enter', `mob-slide-${direction}`);
  }, { once: true });
}
