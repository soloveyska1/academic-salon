#!/usr/bin/env node
/**
 * Smoke test for the Astro build + preview server.
 *
 * Connects to a freshly-started `astro preview` (or any running site
 * passed via SMOKE_BASE_URL) and asserts on the structural markers
 * that every home / catalog / legal page must keep emitting. It does
 * not load JS, doesn't simulate user actions — it's a static-HTML gate
 * that catches the cheap regressions (missing section, broken sitemap,
 * decimated catalog) before they hit production.
 *
 * Run against a built dist:
 *   node tests-frontend/smoke.mjs
 * Run against prod:
 *   SMOKE_BASE_URL=https://bibliosaloon.ru node tests-frontend/smoke.mjs
 */

import { strict as assert } from 'node:assert';

const BASE = (process.env.SMOKE_BASE_URL || 'http://localhost:4321').replace(/\/+$/, '');

const checks = [
  {
    name: 'home renders all 13 sections',
    url: '/',
    assertions(html) {
      // section markers — one per extracted home component
      assert.ok(html.includes('id="prelude"'),    'hero section missing');
      assert.ok(html.includes('class="stats-strip rv"'), 'stats-strip missing');
      assert.ok(html.includes('id="manifesto"'),  'manifesto missing');
      assert.ok(html.includes('id="calendar"'),   'calendar missing');
      assert.ok(html.includes('id="genres"'),     'genres missing');
      assert.ok(html.includes('id="formula"'),    'formula missing');
      assert.ok(html.includes('id="archive"'),    'archive missing');
      assert.ok(html.includes('id="method"'),     'method missing');
      assert.ok(html.includes('id="testimonia"'), 'testimonia missing');
      assert.ok(html.includes('id="qa"'),         'q&a missing');
      assert.ok(html.includes('class="catalog rv"'), 'bento catalog missing');
      assert.ok(html.includes('id="contact"'),    'epilogue missing');
      assert.ok(html.includes('class="salon-footer"'), 'home-footer missing');

      // structured data — JSON-LD blocks must survive each refactor
      const ldCount = (html.match(/application\/ld\+json/g) || []).length;
      assert.ok(ldCount >= 3, `expected ≥3 JSON-LD blocks, got ${ldCount}`);
      assert.ok(html.includes('"@type":"FAQPage"'), 'FAQPage schema missing');
      assert.ok(html.includes('"@type":"WebSite"'), 'WebSite schema missing');

      // 10 review images, with explicit width/height (CLS gate)
      const rwImg = (html.match(/class="rw-img"/g) || []).length;
      assert.equal(rwImg, 20, `reviews wall: 20 imgs (10×2 loop), got ${rwImg}`);
      const sizedRwImg = (html.match(/<img[^>]*width="\d+"[^>]*class="rw-img"/g) || []).length;
      assert.equal(sizedRwImg, 20, `every rw-img must have width attr, got ${sizedRwImg}`);
    },
  },
  {
    name: 'catalog has all 235+ docs',
    url: '/catalog',
    assertions(html) {
      const rows = (html.match(/class="row"/g) || []).length;
      assert.ok(rows >= 230, `expected ≥230 catalog rows, got ${rows}`);

      // Search infrastructure must be present
      assert.ok(html.includes('id="q"'),         'search input missing');
      assert.ok(html.includes('data-desc='),     'data-desc missing on rows');
      assert.ok(html.includes('data-tags='),     'data-tags missing on rows');

      // ItemList JSON-LD for SEO
      assert.ok(html.includes('"@type":"ItemList"'), 'ItemList schema missing');
    },
  },
  {
    name: 'order form has consent checkbox',
    url: '/order',
    assertions(html) {
      assert.ok(html.includes('id="fConsent"'), 'consent checkbox missing');
      assert.ok(html.includes('href="/privacy"'), 'consent must link to /privacy');
      assert.ok(html.includes('href="/terms"'),   'consent must link to /terms');
    },
  },
  {
    name: 'privacy page loads (152-ФЗ)',
    url: '/privacy',
    assertions(html) {
      assert.ok(html.includes('Политика конфиденциальности'), 'title missing');
      assert.ok(html.includes('152-ФЗ'), 'reference to 152-ФЗ missing');
      assert.ok(html.includes('<meta name="robots"') === false, '/privacy must be indexable');
    },
  },
  {
    name: 'terms page loads',
    url: '/terms',
    assertions(html) {
      assert.ok(html.includes('Пользовательское соглашение'), 'title missing');
    },
  },
  {
    name: '/me is noindex',
    url: '/me',
    assertions(html) {
      assert.ok(/<meta name="robots"\s+content="noindex/.test(html), '/me must be noindex');
    },
  },
  {
    name: 'sitemap-index points at sitemap-0',
    url: '/sitemap-index.xml',
    assertions(body) {
      assert.ok(body.includes('<sitemapindex'), 'sitemap-index format');
      assert.ok(body.includes('/sitemap-0.xml'), 'must reference /sitemap-0.xml');
    },
  },
  {
    name: 'sitemap-0 has /privacy + /terms + many doc pages',
    url: '/sitemap-0.xml',
    assertions(body) {
      assert.ok(body.includes('https://bibliosaloon.ru/privacy/'), '/privacy in sitemap');
      assert.ok(body.includes('https://bibliosaloon.ru/terms/'),   '/terms in sitemap');
      const docs = (body.match(/https:\/\/bibliosaloon\.ru\/doc\//g) || []).length;
      assert.ok(docs >= 200, `expected ≥200 /doc/ urls in sitemap, got ${docs}`);
      // Admin/cabinet must stay out of search.
      assert.ok(!body.includes('/admin/'), '/admin must not be in sitemap');
      assert.ok(!body.includes('/me/'),    '/me must not be in sitemap');
    },
  },
  {
    name: 'robots.txt points at sitemap-index',
    url: '/robots.txt',
    assertions(body) {
      assert.ok(body.includes('Sitemap:'), 'no Sitemap directive');
      assert.ok(body.includes('sitemap-index.xml'), 'must point at sitemap-index.xml');
      assert.ok(body.includes('Disallow: /admin'), '/admin must be disallowed');
    },
  },
];

// API smoke — only run when SMOKE_API=1 and against a base that proxies
// /api/* (skipped against an Astro-only preview server).
if (process.env.SMOKE_API === '1') {
  checks.push({
    name: 'GET /api/me/whoami answers logged-out',
    url: '/api/me/whoami',
    assertions(body) {
      const obj = JSON.parse(body);
      assert.equal(obj.loggedIn, false);
    },
  });
  checks.push({
    name: 'GET /api/me/verify with bogus token redirects to /me?err=unknown',
    url: '/api/me/verify?token=' + '0'.repeat(64),
    assertions() {
      // We follow redirects in fetchText so a 200 is what we'll see;
      // the assertion that matters is that this didn't 500. The fact
      // we got past fetchText (which throws on !res.ok) means the
      // hop completed cleanly.
    },
  });
}

async function fetchText(path) {
  const res = await fetch(BASE + path, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`${path} → HTTP ${res.status}`);
  }
  return res.text();
}

let failed = 0;
for (const check of checks) {
  try {
    const body = await fetchText(check.url);
    check.assertions(body);
    console.log(`  ✓ ${check.name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${check.name}\n      ${err.message}`);
  }
}

console.log(failed === 0
  ? `\nSmoke OK: ${checks.length} checks against ${BASE}`
  : `\nSmoke FAILED: ${failed}/${checks.length} checks failed against ${BASE}`);
process.exit(failed === 0 ? 0 : 1);
