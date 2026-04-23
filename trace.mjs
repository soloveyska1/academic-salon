/* Capture what the user actually sees frame-by-frame during slow 3G load.
   Screenshots at t=100,200,400,700,1000,1500,2500ms on both themes, both viewports.
   Also dumps computed styles of nav buttons at first paint. */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'fs';

const BASE = 'http://127.0.0.1:4321';
const URL = BASE + '/';
const TIMES = [100, 200, 400, 700, 1000, 1500, 2500];

mkdirSync('/tmp/trace', { recursive: true });

const browser = await chromium.launch({ headless: true });

for (const theme of ['dark', 'light']) {
  for (const vp of [{n:'mobile',w:375,h:812}, {n:'desktop',w:1440,h:900}]) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      bypassCSP: true,
      storageState: undefined, // fresh
    });
    /* Clear cache by using fresh context */
    await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch (_) {} }, theme);

    const page = await ctx.newPage();
    /* Emulate slow 3G: 400kbps down, 400ms RTT */
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: 50 * 1024, // 50 KB/s — slow 3G feel
      uploadThroughput: 50 * 1024,
      latency: 400,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    const reqLog = [];
    page.on('request', (r) => reqLog.push({ url: r.url().slice(0, 90), t: Date.now() }));
    page.on('response', (r) => reqLog.push({ url: r.url().slice(0, 90), status: r.status(), t: Date.now() }));

    const t0 = Date.now();
    const nav = page.goto(URL, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
    /* Fire screenshots at scheduled intervals in parallel */
    const shots = [];
    for (const ms of TIMES) {
      shots.push((async () => {
        await new Promise((r) => setTimeout(r, ms));
        try {
          await page.screenshot({ path: `/tmp/trace/${theme}-${vp.n}-t${ms}.png`, fullPage: false, timeout: 5000 });
        } catch (_) {}
      })());
    }
    await Promise.all(shots);
    await nav;

    /* Also dump computed styles for common buttons at final state */
    const btnStyles = await page.evaluate(() => {
      const pick = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const s = getComputedStyle(el);
        return { sel, bg: s.backgroundColor, color: s.color, border: s.borderColor, display: s.display };
      };
      return {
        body: pick('body'),
        html: (() => { const s = getComputedStyle(document.documentElement); return { bg: s.backgroundColor, color: s.color }; })(),
        nav: pick('.nav'),
        navLink: pick('.nav-link'),
        heroBtn: pick('.prelude-actions .btn'),
        heroBtnGold: pick('.prelude-actions .btn.btn-gold'),
        heroGhost: pick('.prelude-actions .btn-ghost-gold'),
        themeToggle: pick('.theme-toggle'),
      };
    });
    writeFileSync(`/tmp/trace/${theme}-${vp.n}-styles.json`, JSON.stringify(btnStyles, null, 2));

    await ctx.close();
    console.log(`✓ ${theme}/${vp.n} done (elapsed ${Date.now()-t0}ms)`);
  }
}
await browser.close();
