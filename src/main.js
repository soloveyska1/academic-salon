/**
 * Academic Salon — main entry point
 * Always loads desktop first (safe), then enhances with mobile UI on phones
 */

// Always load desktop styles and app — this is the safe baseline
import './styles/index.css';
import './modules/init.js';
import './modules/command-palette.js';

// On small screens, layer the mobile UI on top
const isMobileDevice = window.innerWidth <= 768 &&
  'ontouchstart' in window &&
  /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

if (isMobileDevice) {
  import('./mobile/index.js').then(({ bootMobile }) => {
    bootMobile();
  }).catch(err => {
    console.warn('Mobile UI failed to load, using desktop:', err);
  });
}
