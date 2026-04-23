import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ headless: true });

const TABS = ['overview', 'upload', 'submissions', 'catalog', 'orders', 'calendar', 'delivery'];

for (const vp of [{n:'desktop', w:1440, h:900}, {n:'mobile', w:375, h:812}]) {
  for (const tab of TABS) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:4321/admin', { waitUntil: 'networkidle' });
    await page.evaluate((t) => {
      document.querySelector('.auth-card')?.setAttribute('hidden', '');
      document.getElementById('adminWorkspace')?.removeAttribute('hidden');
      document.querySelectorAll('.panel').forEach(p => p.setAttribute('hidden', ''));
      document.querySelector(`.panel[data-panel="${t}"]`)?.removeAttribute('hidden');
      document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('is-active'));
      document.querySelector(`.admin-nav-btn[data-tab="${t}"]`)?.classList.add('is-active');
    }, tab);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `/tmp/audit/admin-${vp.n}-${tab}.png`, fullPage: true });
    await ctx.close();
  }
  console.log(`✓ ${vp.n} done`);
}
await browser.close();
