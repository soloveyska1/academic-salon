/**
 * Mobile entry point — detects mobile and boots the native-like mobile UI
 * Imported conditionally from main.js
 */
import { isMobile, initMobileApp } from './mobile-app.js';

// Import mobile styles
import '../styles/mobile/mobile-base.css';
import '../styles/mobile/mobile-nav.css';
import '../styles/mobile/mobile-cards.css';
import '../styles/mobile/mobile-sheet.css';
import '../styles/mobile/mobile-search.css';
import '../styles/mobile/mobile-screens.css';

export function bootMobile() {
  if (!isMobile()) return false;
  initMobileApp();
  return true;
}
