import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ headless: true });

/* Homepage calendar modal */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4321/', { waitUntil: 'networkidle' });
  /* Seed some admin-saved overrides so we see real state */
  await page.evaluate(() => {
    const y = new Date().getFullYear();
    const m = new Date().getMonth() + 3;  /* 3 months ahead */
    const mm = ((m > 11) ? m - 12 : m) + 1;
    const pad = (n) => String(n).padStart(2, '0');
    const base = y + '-' + pad(mm) + '-';
    const store = {};
    [3, 4, 5, 8, 9, 10, 14, 15].forEach(d => { store[base + pad(d)] = 'busy'; });
    [1, 2, 6, 11, 12, 13, 16, 17, 18, 19, 20, 21, 22, 23, 24].forEach(d => { store[base + pad(d)] = 'tight'; });
    localStorage.setItem('academic-salon:calendar', JSON.stringify(store));
  });
  /* Reload to pick up the seeded overrides */
  await page.reload({ waitUntil: 'networkidle' });
  /* Click the 3rd month in the strip */
  await page.evaluate(() => {
    const months = document.querySelectorAll('.month');
    if (months[3]) (months[3]).click();
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/audit/home-calendar-modal.png', fullPage: false });
  console.log('✓ homepage modal captured');
  await ctx.close();
}

/* Admin calendar tab — mock login by seeding token */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem('academic-salon:admin:token', 'fake-dev-token'); } catch (_) {}
    try { sessionStorage.setItem('academic-salon:admin:tab', 'calendar'); } catch (_) {}
  });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4321/admin', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/audit/admin-calendar-tab.png', fullPage: true });
  console.log('✓ admin tab captured');
  await ctx.close();
}

await browser.close();
