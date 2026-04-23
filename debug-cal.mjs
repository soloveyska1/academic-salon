import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto('http://127.0.0.1:4321/', { waitUntil: 'networkidle' });

/* Seed July 2026 */
await page.evaluate(() => {
  const store = {};
  ['2026-07-01','2026-07-02','2026-07-06','2026-07-11','2026-07-12','2026-07-13'].forEach(k => store[k] = 'tight');
  ['2026-07-03','2026-07-04','2026-07-05','2026-07-08','2026-07-09','2026-07-10'].forEach(k => store[k] = 'busy');
  localStorage.setItem('academic-salon:calendar', JSON.stringify(store));
});

await page.reload({ waitUntil: 'networkidle' });

/* Open month 3 */
const clicked = await page.evaluate(() => {
  const months = document.querySelectorAll('.month');
  if (!months[3]) return { error: 'no month 3', count: months.length };
  months[3].click();
  return { clicked: true, monthState: months[3].getAttribute('data-month-state'), monthIdx: months[3].getAttribute('data-month-index') };
});
console.log('Click:', clicked);

await page.waitForTimeout(400);

const cells = await page.evaluate(() => {
  const grid = document.getElementById('calModalGrid');
  if (!grid) return { error: 'no grid' };
  const out = [];
  grid.querySelectorAll('.cal-day').forEach((c) => {
    out.push({
      day: c.textContent.trim(),
      classes: c.className,
      bg: getComputedStyle(c).backgroundColor,
      bgImg: getComputedStyle(c).backgroundImage.slice(0, 60),
    });
  });
  return out.slice(0, 20);
});
console.log('First 20 cells:');
cells.forEach(c => console.log('  ', c.day.padStart(3), '|', c.classes.padEnd(28), '|', c.bg.padEnd(24), c.bgImg));

/* Dump localStorage state */
const ls = await page.evaluate(() => localStorage.getItem('academic-salon:calendar'));
console.log('localStorage:', ls?.slice(0, 200));

await browser.close();
