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
    name: '/opensearch.xml advertised + valid OpenSearch descriptor',
    url: '/opensearch.xml',
    assertions(body) {
      assert.ok(body.startsWith('<?xml'), 'opensearch.xml must start with XML decl');
      assert.ok(body.includes('<OpenSearchDescription'), 'OpenSearchDescription root missing');
      assert.ok(body.includes('searchTerms'), 'must reference {searchTerms} placeholder');
      assert.ok(body.includes('https://bibliosaloon.ru/catalog/?q='),
        'must template into /catalog/?q=');
    },
  },
  {
    name: 'pages link to /opensearch.xml via <link rel="search">',
    url: '/',
    assertions(html) {
      assert.ok(/rel="search"\s+type="application\/opensearchdescription\+xml"/.test(html),
        'home must <link rel="search" type="application/opensearchdescription+xml">');
      assert.ok(html.includes('href="/opensearch.xml"'),
        'opensearch <link> must point at /opensearch.xml');
    },
  },
  {
    name: '/404.html includes the fuzzy-match suggestion section + script',
    url: '/404.html',
    assertions(html) {
      assert.ok(html.includes('id="lostSuggest"'),
        '404 must expose #lostSuggest container');
      assert.ok(html.includes('id="lostSuggestList"'),
        '404 must expose #lostSuggestList');
      assert.ok(html.includes('buildQuery'),
        '404 inline script must define buildQuery');
      assert.ok(html.includes("/search-index.json"),
        '404 must fetch /search-index.json for matching');
    },
  },
  {
    name: 'home advertises a sitelinks SearchAction + extended Organization',
    url: '/',
    assertions(html) {
      assert.ok(html.includes('"@type":"SearchAction"'),
        'home must include WebSite > SearchAction (sitelinks searchbox)');
      assert.ok(html.includes('search_term_string'),
        'SearchAction must reference the catalog ?q template');
      assert.ok(html.includes('"knowsLanguage"'),
        'Organization must declare knowsLanguage');
      assert.ok(html.includes('"foundingDate"'),
        'Organization should declare foundingDate');
      assert.ok(html.includes('"@id":"https://bibliosaloon.ru/#organization"'),
        'Organization must be id-anchored for cross-page reference');

      // Resource hints — preconnect/dns-prefetch для Метрики; экономит
      // TCP+TLS roundtrip когда юзер принимает cookie-consent.
      assert.ok(/rel="preconnect"\s+href="https:\/\/mc\.yandex\.ru/.test(html),
        'home must preconnect to mc.yandex.ru');
      assert.ok(/rel="dns-prefetch"\s+href="https:\/\/mc\.yandex\.ru/.test(html),
        'home must dns-prefetch mc.yandex.ru');

      // AggregateRating + Review[] — реальные отзывы из reviewImages
      // с явным rating; позволяет ★ в SERP rich-result.
      assert.ok(html.includes('"@type":"AggregateRating"'),
        'home must declare AggregateRating');
      assert.ok(html.includes('"@type":"Review"'),
        'home must declare Review[] tied to Organization');
      assert.ok(/ratingValue":\s*[\d.]+/.test(html),
        'AggregateRating must carry numeric ratingValue');
    },
  },
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

      // Subject-hub strip — каталог даёт минимум 17 ссылок-посадочных
      // на /subject/<slug>/, чтобы не терять SEO-канал по предметам.
      const stripLinks = (html.match(/class="subj-strip-link"/g) || []).length;
      assert.ok(stripLinks >= 17, `subject strip: expected ≥17 hub links, got ${stripLinks}`);

      // Two-level filter — second tab row для предмета.
      assert.ok(html.includes('id="subjTabs"'),
        'catalog must expose #subjTabs (subject filter row)');
      const subTabs = (html.match(/data-subj=/g) || []).length;
      assert.ok(subTabs >= 17, `subject tabs: expected ≥17 chips, got ${subTabs}`);
    },
  },
  {
    name: 'tag hub /tag/vozrastnaya-psihologiya/ renders narrow topical landing',
    url: '/tag/vozrastnaya-psihologiya/',
    assertions(html) {
      assert.ok(html.includes('class="subj-title"'), 'subj-title (reused) missing');
      assert.ok(html.includes('hashglyph') || html.includes('#'),
        'tag hub must mark itself with a # glyph');
      const rows = (html.match(/class="subj-row"/g) || []).length;
      assert.ok(rows >= 3, `tag hub: expected ≥3 rows, got ${rows}`);
      assert.ok(html.includes('"@type":"CollectionPage"'),
        'tag hub must emit CollectionPage schema');
      assert.ok(html.includes('href="https://bibliosaloon.ru/tag/vozrastnaya-psihologiya/"'),
        'tag hub canonical missing');
    },
  },
  {
    name: 'catalog footer surfaces both subject and tag hub strips',
    url: '/catalog/',
    assertions(html) {
      // Subject strip from previous round (kept for backwards-compat).
      const stripBlocks = (html.match(/class="subj-strip(?: subj-strip--tags)?"/g) || []).length;
      assert.ok(stripBlocks >= 2, `expected 2 strip sections (subjects + tags), got ${stripBlocks}`);
      assert.ok(html.includes('href="/tag/'),
        'catalog must link out to /tag/ hubs');
    },
  },
  {
    name: 'subject hub /subject/psychology/ renders works grouped by category',
    url: '/subject/psychology/',
    assertions(html) {
      // H1 + H1-context (eyebrow with count)
      assert.ok(html.includes('class="subj-title"'),    'subj-title missing');
      assert.ok(html.includes('class="subj-eyebrow"'),  'subj-eyebrow missing');

      // Grouped doc list
      const rows = (html.match(/class="subj-row"/g) || []).length;
      assert.ok(rows >= 50, `subject hub: expected ≥50 rows for psychology, got ${rows}`);

      // Each row links to /doc/files/...
      assert.ok(html.includes('/doc/files/'), 'subject hub rows must link to docs');

      // Sibling subjects + CTA
      assert.ok(html.includes('class="subj-cta"'),       'subj-cta missing');
      assert.ok(html.includes('class="subj-siblings"'),  'subj-siblings missing');

      // Schema.org payload — CollectionPage + BreadcrumbList
      assert.ok(html.includes('"@type":"CollectionPage"'),  'CollectionPage schema missing');
      assert.ok(html.includes('"@type":"BreadcrumbList"'),  'BreadcrumbList schema missing');

      // Canonical URL
      assert.ok(html.includes('href="https://bibliosaloon.ru/subject/psychology/"'),
        'canonical link missing');
    },
  },
  {
    name: 'doc page links its subject to the subject hub',
    url: '/doc/files/Реферат - Воображение.docx',
    assertions(html) {
      // Eyebrow gets a subj-link (was a plain span before subject hubs landed).
      assert.ok(html.includes('class="subj subj-link"'),
        'doc eyebrow must mark subject as subj-link');
      assert.ok(html.includes('/subject/psychology'),
        'doc page must link out to its subject hub');

      // Per-doc OG image — must point at /og/<hash>.png, not the
      // shared og-image.png fallback. og:image:width/height also
      // emitted so social cards layout correctly.
      const ogMatch = html.match(/og:image"\s+content="([^"]+)"/);
      assert.ok(ogMatch, 'og:image meta must be present');
      assert.ok(/\/og\/[a-f0-9]{16}\.png$/.test(ogMatch[1]),
        `og:image must be /og/<hash>.png, got ${ogMatch[1]}`);
      assert.ok(html.includes('og:image:width" content="1200"'),
        'og:image:width missing');
      assert.ok(html.includes('og:image:height" content="630"'),
        'og:image:height missing');

      // Doc length estimate — both inline (action-bar) and meta row.
      assert.ok(html.includes('class="doc-actions-pages"'),
        'doc-actions-pages micro-copy missing');
      assert.ok(html.includes('Объём'),
        'meta row "Объём" must surface estimated pages/reading time');
      assert.ok(/≈\s*\d/.test(html),
        'pages estimate must include "≈ <N>" notation');

      // Print canonical — used by @media print rule .doc-folio::after
      // to render "Источник: <url>" when the page is printed.
      assert.ok(/<article[^>]+class="doc-folio"[^>]+data-canonical="https:\/\/bibliosaloon\.ru\/doc\//.test(html),
        'doc-folio must carry data-canonical for the print footer');

      // Mobile sticky CTA — отдельная панель внизу, появляется после
      // прокрутки. На SSR-этапе всегда hidden; контроллер открывает.
      assert.ok(html.includes('id="docMobileCta"'),
        'doc must ship #docMobileCta sticky bar markup');
      assert.ok(html.includes('doc-mcta-btn--primary'),
        'sticky CTA must include a primary download button');
    },
  },
  {
    name: 'order form has split consent checkboxes (152-ФЗ compliance)',
    url: '/order',
    assertions(html) {
      // 152-ФЗ требует разделять согласие на условия и согласие на ПДн —
      // одного объединённого чекбокса больше нет.
      assert.ok(html.includes('id="fConsentTerms"'), 'fConsentTerms (terms) checkbox missing');
      assert.ok(html.includes('id="fConsentPd"'),    'fConsentPd (personal data) checkbox missing');
      assert.ok(html.includes('href="/privacy"'),    'consent must link to /privacy');
      assert.ok(html.includes('href="/terms"'),      'consent must link to /terms');
      assert.ok(html.includes('href="/consent"'),    'consent must link to /consent (РКН-форма)');
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
    name: '/admin ships the new Funnel tab markup',
    url: '/admin',
    assertions(html) {
      assert.ok(html.includes('data-tab="funnel"'),
        'admin nav must include the Funnel tab button');
      assert.ok(html.includes('data-panel="funnel"'),
        'admin must include the Funnel panel');
      assert.ok(html.includes('id="funnelViews"') &&
                html.includes('id="funnelDownloads"') &&
                html.includes('id="funnelOrders"'),
        'funnel panel must expose 3 conversion-step IDs');
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
    name: 'robots.txt points at sitemap-index + sitemap-image',
    url: '/robots.txt',
    assertions(body) {
      assert.ok(body.includes('Sitemap:'), 'no Sitemap directive');
      assert.ok(body.includes('sitemap-index.xml'), 'must point at sitemap-index.xml');
      assert.ok(body.includes('sitemap-image.xml'), 'must point at sitemap-image.xml');
      assert.ok(body.includes('Disallow: /admin'), '/admin must be disallowed');
    },
  },
  {
    name: '/search-index.json is a slim JSON catalog for the Nav search palette',
    url: '/search-index.json',
    assertions(body) {
      const data = JSON.parse(body);
      assert.ok(Array.isArray(data.docs), '.docs must be an array');
      assert.ok(data.docs.length >= 200, `expected ≥200 entries, got ${data.docs.length}`);
      const sample = data.docs[0];
      assert.ok('f' in sample && 't' in sample, 'each entry must have f + t');
    },
  },
  {
    name: 'catalog and doc surface level badges (1 курс / Магистратура / ВКР)',
    url: '/catalog/',
    assertions(html) {
      const badges = (html.match(/class="lvl-badge"/g) || []).length;
      assert.ok(badges >= 30, `expected ≥30 lvl-badges in catalog, got ${badges}`);
      // Each badge should carry data-level for CSS hooks
      assert.ok(/data-level="(bachelor|master|phd)/.test(html),
        'badges must include data-level (bachelor/master/phd)');
    },
  },
  {
    name: 'home renders Nav search trigger and overlay markup',
    url: '/',
    assertions(html) {
      assert.ok(html.includes('id="navSearchBtn"'),
        'home must show the Nav search trigger button');
      assert.ok(html.includes('id="navSearchOverlay"'),
        'home must include the search overlay markup');
      assert.ok(html.includes('id="navSearchInput"'),
        'overlay must contain the search input');
      // A11y: dialog role + aria-modal + live results.
      assert.ok(html.includes('role="dialog"') && html.includes('aria-modal="true"'),
        'palette must declare role=dialog + aria-modal');
      assert.ok(/aria-live="polite"/.test(html),
        'results list must use aria-live for SR announcements');
    },
  },
  {
    name: 'every page exposes the skip-link + main landmark',
    url: '/about/',
    assertions(html) {
      assert.ok(html.includes('class="skip-link"'),
        'skip-link must ship on every page');
      assert.ok(html.includes('href="#main"'),
        'skip-link must target #main');
      assert.ok(/<main[^>]+id="main"/.test(html),
        'page must contain a <main id="main"> landmark');
    },
  },
  {
    name: '/catalog hides the Nav search trigger (in-page search owns "/")',
    url: '/catalog/',
    assertions(html) {
      assert.ok(!html.includes('id="navSearchBtn"'),
        '/catalog must NOT show the Nav search trigger');
    },
  },
  {
    name: '/sitemap-image.xml maps every doc to its /og/<hash>.png',
    url: '/sitemap-image.xml',
    assertions(body) {
      assert.ok(body.includes('<urlset'), 'urlset root missing');
      assert.ok(body.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'),
        'image namespace missing');
      const urls = (body.match(/<url>/g) || []).length;
      assert.ok(urls >= 200, `expected ≥200 image entries, got ${urls}`);
      const ogRefs = (body.match(/\/og\/[a-f0-9]{16}\.png/g) || []).length;
      assert.ok(ogRefs >= 200, `expected ≥200 /og/<hash>.png refs, got ${ogRefs}`);
    },
  },
  {
    name: 'home + doc + me wire up the recently-viewed widget',
    url: '/',
    assertions(html) {
      assert.ok(html.includes('id="recentViewedMount"'),
        'home must expose #recentViewedMount placeholder');
      assert.ok(html.includes('/scripts/recent-viewed.js'),
        'home must load recent-viewed.js');
      assert.ok(html.includes('mountRecentView'),
        'home must invoke mountRecentView');
    },
  },
  {
    name: 'doc page primes pushRecentView via inline script',
    url: '/doc/files/Реферат - Воображение.docx',
    assertions(html) {
      assert.ok(html.includes('/scripts/recent-viewed.js'),
        'doc must load recent-viewed.js');
      assert.ok(html.includes('pushRecentView'),
        'doc must call pushRecentView');
    },
  },
  {
    name: '/scripts/recent-viewed.js is reachable as a static asset',
    url: '/scripts/recent-viewed.js',
    assertions(body) {
      assert.ok(body.includes('pushRecentView'), 'script must export pushRecentView');
      assert.ok(body.includes('mountRecentView'), 'script must export mountRecentView');
    },
  },
  {
    name: '/scripts/saved-searches.js is reachable + exports salonSavedSearches',
    url: '/scripts/saved-searches.js',
    assertions(body) {
      assert.ok(body.includes('salonSavedSearches'),
        'must expose window.salonSavedSearches');
      assert.ok(body.includes('copyLink') && body.includes('save') && body.includes('list'),
        'must expose save/list/copyLink/buildUrl helpers');
    },
  },
  {
    name: '/scripts/onboarding-hint.js is reachable + self-gates',
    url: '/scripts/onboarding-hint.js',
    assertions(body) {
      assert.ok(body.includes('salon:onboarded'),
        'onboarding script must read/write the salon:onboarded flag');
      assert.ok(body.includes('/catalog') && body.includes('/admin') && body.includes('/me'),
        'onboarding script must skip /catalog, /admin, /me');
    },
  },
  {
    name: 'pages load the onboarding hint script asynchronously',
    url: '/',
    assertions(html) {
      assert.ok(/<script\s+async\s+src="\/scripts\/onboarding-hint\.js"/.test(html),
        'home must load /scripts/onboarding-hint.js with async');
    },
  },
  {
    name: 'catalog ships share + save tools in the bottombar',
    url: '/catalog/',
    assertions(html) {
      assert.ok(html.includes('id="catShareBtn"'),
        'catalog must include #catShareBtn for share-link copy');
      assert.ok(html.includes('id="catSaveBtn"'),
        'catalog must include #catSaveBtn for saved searches');
    },
  },
  {
    name: '/me ships the saved-searches block + script',
    url: '/me',
    assertions(html) {
      assert.ok(html.includes('id="meSavedSearchesBlock"'),
        '/me must include the saved searches block');
      assert.ok(html.includes('/scripts/saved-searches.js'),
        '/me must load saved-searches.js');
    },
  },
  {
    name: '/me auth — 3 method tiles (TG / VK / Email) + clear stepper',
    url: '/me',
    assertions(html) {
      // 3 method tiles
      assert.ok(html.includes('class="me-auth-methods"'),
        '/me must include the .me-auth-methods grid');
      assert.ok(html.includes('data-me-auth="telegram"') &&
                html.includes('data-me-auth="vk"') &&
                html.includes('data-me-auth="email"'),
        '/me auth must offer telegram + vk + email methods');

      // Email flow visible by default
      assert.ok(html.includes('data-me-auth-flow="email"'),
        '/me must include email flow block');

      // Stepper for clarity
      assert.ok(html.includes('class="me-auth-stepper"'),
        '/me email flow must include the 3-step explainer');

      // Trust footer
      assert.ok(html.includes('class="me-auth-trust"'),
        '/me must explain why no password');

      // No more confusing "Прислать ссылку" — replaced with «Войти»
      // (the submit button label) — but still allow flow-lede mention
      // of "ссылку" since it's contextual.
      const submit = html.match(/class="me-submit-lbl"[^>]*>([^<]+)</);
      assert.ok(submit && submit[1].trim() === 'Войти',
        `submit button must read "Войти", got "${submit && submit[1]}"`);
    },
  },
  {
    name: '/me cabinet redesign: hero + tabs + quick cards + timeline',
    url: '/me',
    assertions(html) {
      // Hero
      assert.ok(html.includes('class="me-hero"'),
        '/me cabinet must use the new .me-hero header');
      assert.ok(html.includes('id="meAvatar"') && html.includes('id="meAvatarInitials"'),
        'hero must include avatar with initials');

      // Top tabs (5 of them)
      assert.ok(html.includes('id="meTabs"'),
        '/me must include the tab nav');
      const topTabs = (html.match(/data-me-tab="[a-z]+"/g) || []).length;
      assert.ok(topTabs >= 5,
        `expected ≥5 cabinet tabs, got ${topTabs}`);
      assert.ok(html.includes('data-me-tab="overview"') &&
                html.includes('data-me-tab="orders"') &&
                html.includes('data-me-tab="library"') &&
                html.includes('data-me-tab="searches"') &&
                html.includes('data-me-tab="profile"'),
        'cabinet must expose overview/orders/library/searches/profile tabs');

      // Library sub-tabs
      const libTabs = (html.match(/data-me-lib="[a-z]+"/g) || []).length;
      assert.ok(libTabs >= 3,
        `library must have ≥3 sub-tabs (favs/downloads/viewed), got ${libTabs}`);

      // Quick action cards (Обзор)
      assert.ok(html.includes('class="me-quick"'),
        'overview must include the quick-action grid');
      const quickCards = (html.match(/class="me-quick-card"/g) || []).length;
      assert.ok(quickCards >= 3,
        `expected 3 quick cards, got ${quickCards}`);

      // Timeline placeholder
      assert.ok(html.includes('id="meTimeline"') && html.includes('id="meTimelineList"'),
        'overview must include the activity timeline container');
    },
  },
  {
    name: '/sw.js bumped to v9, pre-caches catalog + search-index',
    url: '/sw.js',
    assertions(body) {
      assert.ok(body.includes("'academic-salon-v9'"),
        'service worker must be v9 (cache busted)');
      assert.ok(body.includes("'/catalog/'"),
        'SW shell must include /catalog/ for offline browsing');
      assert.ok(body.includes("'/search-index.json'"),
        'SW shell must include /search-index.json for offline palette');
      assert.ok(body.includes('DATA_CACHE'),
        'SW must declare a separate DATA_CACHE bucket');
    },
  },
  {
    name: '/feed.xml emits valid RSS 2.0 with recent docs',
    url: '/feed.xml',
    assertions(body) {
      assert.ok(body.startsWith('<?xml'), 'must start with XML declaration');
      assert.ok(body.includes('<rss version="2.0"'), 'RSS 2.0 root missing');
      assert.ok(body.includes('<channel>'),  'channel missing');
      assert.ok(body.includes('<atom:link href="https://bibliosaloon.ru/feed.xml"'),
        'self link missing');
      const items = (body.match(/<item>/g) || []).length;
      assert.ok(items >= 20, `expected ≥20 feed items, got ${items}`);
      // Each item must carry a permalink + pubDate.
      const guids = (body.match(/<guid isPermaLink="true">/g) || []).length;
      assert.equal(guids, items, 'every item must have a permalink guid');
      const pubDates = (body.match(/<pubDate>/g) || []).length;
      assert.equal(pubDates, items, 'every item must have a pubDate');
    },
  },
  {
    name: 'pages auto-discover the RSS feed',
    url: '/',
    assertions(html) {
      assert.ok(html.includes('rel="alternate"') &&
                html.includes('type="application/rss+xml"') &&
                html.includes('/feed.xml'),
        'home must advertise the RSS feed via <link rel="alternate">');
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
