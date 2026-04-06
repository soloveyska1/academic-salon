/**
 * Dedicated /app entry — boots the legacy premium mobile UI without the desktop page.
 */
import './styles/index.css';
import { bootMobile } from './mobile/index.js';
import { D } from './data/catalog-data.js';
import { gTitle } from './modules/utils.js';
import { buildDownloadHref } from './modules/stats.js';

function resolveDocument(file) {
  return D.find((item) => item.file === file);
}

window._mobOpenFile = function mobOpenFile(file) {
  if (!file) return;
  const href = buildDownloadHref(file);
  window.open(href, '_blank', 'noopener,noreferrer');
};

window._mobShareDoc = async function mobShareDoc(file) {
  if (!file) return;
  const doc = resolveDocument(file);
  const title = doc ? gTitle(doc) : 'Документ';
  const url = buildDownloadHref(file);

  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch {
      // Ignore cancel/unsupported flows and fall back to clipboard.
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    if (typeof window.alert === 'function') {
      window.alert('Ссылка скопирована');
    }
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

if (!bootMobile()) {
  document.body.style.margin = '0';
  document.body.style.background = '#09080c';
  document.body.style.color = '#f5f0e6';
  document.body.innerHTML = `
    <div style="min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:32px;text-align:center;font-family:Inter,system-ui,sans-serif">
      <div>
        <div style="font-family:'Playfair Display',serif;font-size:32px;line-height:1.1;margin-bottom:12px">Академический Салон</div>
        <div style="font-size:15px;color:#a89e88;max-width:320px">
          Мобильная версия рассчитана на телефоны и планшеты. Откройте сайт с мобильного устройства.
        </div>
      </div>
    </div>
  `;
}
