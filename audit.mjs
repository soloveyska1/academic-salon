#!/usr/bin/env node
/* Objective audit — renders each key page in headless Chromium, collects real metrics. */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'fs';

const BASE = 'http://127.0.0.1:4321';
const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1440, height: 900 },
];
const THEMES = ['dark', 'light'];
const PAGES = [
  { path: '/', name: 'home' },
  { path: '/catalog', name: 'catalog' },
  { path: '/order', name: 'order' },
  { path: '/about', name: 'about' },
  { path: '/contribute', name: 'contribute' },
  { path: '/me', name: 'me' },
  { path: '/doc/files/%D0%94%D0%BE%D0%BA%D0%BB%D0%B0%D0%B4%20%D0%BA%20%D0%92%D0%9A%D0%A0%20%D0%BE%20%D1%81%D0%BE%D1%86%D0%B8%D0%B0%D0%BB%D1%8C%D0%BD%D0%BE%D0%B9%20%D0%B0%D0%B4%D0%B0%D0%BF%D1%82%D0%B0%D1%86%D0%B8%D0%B8%20%D0%B4%D0%B5%D1%82%D0%B5%D0%B9-%D1%81%D0%B8%D1%80%D0%BE%D1%82.docx', name: 'doc' },
];

mkdirSync('/tmp/audit', { recursive: true });
const findings = [];

function note(severity, page, theme, viewport, category, message, details) {
  findings.push({ severity, page, theme, viewport, category, message, details });
}

const browser = await chromium.launch({ headless: true });

for (const { path, name } of PAGES) {
  for (const theme of THEMES) {
    for (const viewport of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      });
      const page = await ctx.newPage();

      const consoleMsgs = [];
      const pageErrors = [];
      const failedReqs = [];

      page.on('console', (msg) => {
        if (msg.type() === 'error' || msg.type() === 'warning') {
          consoleMsgs.push({ type: msg.type(), text: msg.text() });
        }
      });
      page.on('pageerror', (err) => pageErrors.push(err.message));
      page.on('requestfailed', (req) => {
        if (!req.url().includes('mc.yandex') && !req.url().includes('unpkg.com')) {
          failedReqs.push({ url: req.url(), failure: req.failure()?.errorText });
        }
      });

      /* Set theme BEFORE navigating so FOUC/theme logic runs correctly */
      await ctx.addInitScript((t) => {
        try { localStorage.setItem('theme', t); } catch (_) {}
      }, theme);

      const t0 = Date.now();
      let resp;
      try {
        resp = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 15000 });
      } catch (e) {
        note('CRIT', name, theme, viewport.name, 'nav', 'page failed to load', e.message);
        await ctx.close();
        continue;
      }
      const loadTime = Date.now() - t0;

      if (!resp || !resp.ok()) {
        note('CRIT', name, theme, viewport.name, 'http', `HTTP ${resp?.status()}`, resp?.statusText());
      }

      /* Core metrics via Performance API */
      const metrics = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const paint = performance.getEntriesByType('paint');
        const fcp = paint.find(p => p.name === 'first-contentful-paint')?.startTime;
        const fp = paint.find(p => p.name === 'first-paint')?.startTime;
        return {
          fcp: fcp ? Math.round(fcp) : null,
          fp: fp ? Math.round(fp) : null,
          dom: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : null,
          load: nav ? Math.round(nav.loadEventEnd - nav.startTime) : null,
        };
      });

      /* Overflow-x check */
      const overflowX = await page.evaluate(() => {
        const docW = document.documentElement.scrollWidth;
        const winW = window.innerWidth;
        return docW > winW + 1 ? { docW, winW } : null;
      });
      if (overflowX) {
        note('HIGH', name, theme, viewport.name, 'layout',
          `horizontal scroll (doc ${overflowX.docW} > viewport ${overflowX.winW})`);
      }

      /* Computed theme check */
      const computed = await page.evaluate(() => {
        const body = getComputedStyle(document.body);
        const html = getComputedStyle(document.documentElement);
        return {
          bodyBg: body.backgroundColor,
          bodyColor: body.color,
          htmlBg: html.backgroundColor,
          theme: document.documentElement.getAttribute('data-theme') || 'dark',
          colorScheme: html.colorScheme,
        };
      });
      /* Light theme check: body background should NOT be dark */
      if (theme === 'light' && /^rgb\((\d+),\s*(\d+),\s*(\d+)\)/.test(computed.bodyBg)) {
        const [, r, g, b] = computed.bodyBg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        const lum = (parseInt(r) + parseInt(g) + parseInt(b)) / 3;
        if (lum < 128) {
          note('HIGH', name, theme, viewport.name, 'theme',
            `light theme body bg is dark (${computed.bodyBg})`);
        }
      }
      /* Dark theme check: body bg should be dark */
      if (theme === 'dark' && /^rgb\((\d+),\s*(\d+),\s*(\d+)\)/.test(computed.bodyBg)) {
        const [, r, g, b] = computed.bodyBg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        const lum = (parseInt(r) + parseInt(g) + parseInt(b)) / 3;
        if (lum > 100) {
          note('HIGH', name, theme, viewport.name, 'theme',
            `dark theme body bg is light (${computed.bodyBg})`);
        }
      }

      /* Images without dimensions (CLS risk) */
      const clsImgs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('img')).filter(img => {
          if (img.loading === 'lazy') return false;
          return !img.width || !img.height;
        }).map(img => img.src.slice(0, 80));
      });
      if (clsImgs.length) {
        note('LOW', name, theme, viewport.name, 'cls',
          `${clsImgs.length} img(s) without width/height`, clsImgs.slice(0, 3));
      }

      /* Interactive elements without accessible name */
      const unnamed = await page.evaluate(() => {
        const list = [];
        document.querySelectorAll('button,a[href]').forEach((el) => {
          const label = (el.getAttribute('aria-label') || el.textContent || '').trim();
          if (label.length < 1 && !el.querySelector('img[alt]')) {
            list.push({ tag: el.tagName.toLowerCase(), id: el.id, cls: el.className.slice(0, 60) });
          }
        });
        return list;
      });
      if (unnamed.length) {
        note('MED', name, theme, viewport.name, 'a11y',
          `${unnamed.length} button/link without accessible name`, unnamed.slice(0, 5));
      }

      /* Heading hierarchy jump */
      const headings = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
          .map(h => ({ level: parseInt(h.tagName[1]), text: h.textContent.trim().slice(0, 50) }));
      });
      let prevLevel = 0;
      for (const h of headings) {
        if (prevLevel > 0 && h.level > prevLevel + 1) {
          note('LOW', name, theme, viewport.name, 'a11y',
            `heading jump h${prevLevel} → h${h.level}: "${h.text}"`);
          break;
        }
        prevLevel = h.level;
      }

      /* Elements with fixed position count — too many can cause perf issues */
      const fixedCount = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('*')).filter(el => {
          const pos = getComputedStyle(el).position;
          return pos === 'fixed';
        }).length;
      });
      if (fixedCount > 20) {
        note('MED', name, theme, viewport.name, 'perf',
          `${fixedCount} fixed-position elements (heavy compositor work)`);
      }

      /* Console errors */
      for (const msg of consoleMsgs) {
        if (msg.type === 'error') {
          note('HIGH', name, theme, viewport.name, 'console', msg.text.slice(0, 200));
        }
      }
      for (const err of pageErrors) {
        note('HIGH', name, theme, viewport.name, 'jsError', err.slice(0, 200));
      }
      for (const req of failedReqs) {
        note('HIGH', name, theme, viewport.name, 'net', `failed: ${req.url.slice(0, 100)} — ${req.failure}`);
      }

      /* Screenshot for manual review */
      const shotPath = `/tmp/audit/${name}-${theme}-${viewport.name}.png`;
      await page.screenshot({ path: shotPath, fullPage: false });

      /* Perf metrics summary */
      note('INFO', name, theme, viewport.name, 'perf',
        `FCP ${metrics.fcp}ms, DOM ${metrics.dom}ms, Load ${metrics.load}ms, totalNav ${loadTime}ms`);

      await ctx.close();
    }
  }
}

await browser.close();

/* Sort by severity */
const order = { CRIT: 0, HIGH: 1, MED: 2, LOW: 3, INFO: 4 };
findings.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));

writeFileSync('/tmp/audit/findings.json', JSON.stringify(findings, null, 2));

/* Summary to stdout */
console.log('\n═══════ OBJECTIVE AUDIT — REAL-BROWSER MEASUREMENTS ═══════\n');
const groups = {};
for (const f of findings) {
  groups[f.severity] = groups[f.severity] || [];
  groups[f.severity].push(f);
}
for (const sev of ['CRIT', 'HIGH', 'MED', 'LOW', 'INFO']) {
  const items = groups[sev] || [];
  if (!items.length) continue;
  console.log(`\n── ${sev} (${items.length}) ──`);
  for (const f of items) {
    const where = `${f.page}/${f.theme}/${f.viewport}`;
    console.log(`  [${f.category}] ${where.padEnd(28)} ${f.message}${f.details ? ' · ' + JSON.stringify(f.details).slice(0, 120) : ''}`);
  }
}
console.log(`\nScreenshots in /tmp/audit/ (${PAGES.length * THEMES.length * VIEWPORTS.length} total)`);
console.log(`Full findings: /tmp/audit/findings.json\n`);
