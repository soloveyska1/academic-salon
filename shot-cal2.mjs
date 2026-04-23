import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:4321/admin', { waitUntil: 'networkidle' });

/* Force-reveal the calendar panel for visual preview */
await page.evaluate(() => {
  document.querySelector('.auth-card')?.setAttribute('hidden', '');
  document.getElementById('adminWorkspace')?.removeAttribute('hidden');
  document.querySelectorAll('.panel').forEach(p => p.setAttribute('hidden', ''));
  document.querySelector('.panel[data-panel="calendar"]')?.removeAttribute('hidden');
  document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('is-active'));
  document.querySelector('.admin-nav-btn[data-tab="calendar"]')?.classList.add('is-active');

  /* Seed some demo state */
  const y = new Date().getFullYear();
  const m = new Date().getMonth();
  const pad = (n) => String(n).padStart(2, '0');
  const base = y + '-' + pad(m + 1) + '-';
  const store = {};
  [1, 2, 3, 6, 7, 8, 13, 14, 15].forEach(d => { store[base + pad(d)] = 'busy'; });
  [4, 5, 9, 10, 11, 12, 16, 17, 18, 19, 20].forEach(d => { store[base + pad(d)] = 'tight'; });
  localStorage.setItem('academic-salon:calendar', JSON.stringify(store));
});

/* Reload to pick up seeds + re-hit the init */
await page.reload({ waitUntil: 'networkidle' });
await page.evaluate(() => {
  document.querySelector('.auth-card')?.setAttribute('hidden', '');
  document.getElementById('adminWorkspace')?.removeAttribute('hidden');
  document.querySelectorAll('.panel').forEach(p => p.setAttribute('hidden', ''));
  document.querySelector('.panel[data-panel="calendar"]')?.removeAttribute('hidden');
});
await page.waitForTimeout(300);

await page.screenshot({ path: '/tmp/audit/admin-calendar-tab.png', fullPage: false });
console.log('✓ admin calendar tab captured');

await browser.close();
