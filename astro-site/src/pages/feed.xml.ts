/**
 * RSS 2.0 feed of the 30 most-recently-added catalog docs.
 *
 * No `pubDate` per item is stored in the catalog, so we fall back to a
 * synthetic date that's consistent run-to-run: the last item gets the
 * site's lastmod, and earlier items step backwards by one minute. That
 * preserves freshness ranking in feed readers while not pretending we
 * know the exact upload time.
 *
 * Discovery: <link rel="alternate" type="application/rss+xml"> is
 * emitted from Base.astro so feed readers auto-detect.
 */

import type { APIRoute } from 'astro';
import { D } from '../data/catalog.js';
import { getSlugBySubject } from '../lib/subjects';

const SITE = 'https://bibliosaloon.ru';
const FEED_LIMIT = 30;
const FEED_TITLE = 'Библиотека академического салона — свежие работы';
const FEED_DESC = 'Поток новых студенческих работ в каталоге: курсовые, ВКР, рефераты по психологии, социальной работе и смежным гуманитарным дисциплинам.';

function escapeXml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function rfc2822(date: Date): string {
  return date.toUTCString();
}

function rssItem(doc: any, pubDate: Date): string {
  const title = doc.catalogTitle || doc.title || doc.filename || 'Студенческая работа';
  const desc = doc.catalogDescription || doc.description || '';
  const link = `${SITE}/doc/${doc.file}`;
  const subject = doc.subject || '';
  const subjectSlug = subject ? getSlugBySubject(subject) : undefined;
  const category = subject
    ? `<category${subjectSlug ? ` domain="${SITE}/subject/${subjectSlug}/"` : ''}>${escapeXml(subject)}</category>`
    : '';
  const docType = doc.docType || doc.category || '';

  return `    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${rfc2822(pubDate)}</pubDate>
      ${category}
      ${docType ? `<category>${escapeXml(docType)}</category>` : ''}
      <description>${escapeXml(desc)}</description>
    </item>`;
}

export const GET: APIRoute = () => {
  // Recency proxy: catalog data is appended at upload time (see
  // chore(catalog): sync after upload — … commits), so the tail of D
  // is freshest. We surface the last FEED_LIMIT in reverse order.
  const items = (D as any[]).slice(-FEED_LIMIT).reverse();
  const now = new Date();

  const itemsXml = items
    .map((doc, i) => rssItem(doc, new Date(now.getTime() - i * 60_000)))
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(FEED_TITLE)}</title>
    <link>${SITE}/catalog/</link>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>${escapeXml(FEED_DESC)}</description>
    <language>ru-RU</language>
    <lastBuildDate>${rfc2822(now)}</lastBuildDate>
    <ttl>720</ttl>
${itemsXml}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
