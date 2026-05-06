/**
 * Image sitemap — surfaces the per-doc OG cards for Google Images.
 *
 * Astro's @astrojs/sitemap covers URLs but not images, so we ship this
 * as a sibling sitemap and link it separately from robots.txt
 * ("Sitemap: …/sitemap-image.xml"). Each <url> wraps a doc landing
 * with one <image:image> entry pointing at /og/<hash>.png plus a
 * caption / title for richer indexing.
 *
 * Spec: https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps
 */

import type { APIRoute } from 'astro';
import { D } from '../data/catalog.js';
import { getOgSlug } from '../lib/og-slug.js';

const SITE = 'https://bibliosaloon.ru';

function escapeXml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function shortType(raw: string): string {
  const map: Record<string, string> = {
    'Самостоятельная работа': 'Самост.',
    'Выпускная квалификационная работа': 'ВКР',
    'Курсовая работа': 'Курсовая',
    'Отчет по практике': 'Практика',
    'Отчет о научно-практической работе': 'НПР',
    'Методические материалы': 'Методичка',
    'Экзаменационные материалы': 'Экзамен',
  };
  return map[raw] || raw;
}

function getYear(doc: any, fallback: string): string {
  const blob = [doc.filename, doc.newFilename, doc.title, doc.catalogTitle, doc.text]
    .filter(Boolean)
    .join(' ');
  const m = blob.match(/(?:19|20)\d{2}/);
  return m ? m[0] : fallback;
}

export const GET: APIRoute = () => {
  const fallbackYear = String(new Date().getFullYear());

  const urls = (D as any[])
    .filter((doc) => doc?.file)
    .map((doc) => {
      const title = doc.catalogTitle || doc.title || doc.filename || 'Студенческая работа';
      const docType = shortType(doc.docType || doc.category || '');
      const subject = doc.subject || '';
      const year = getYear(doc, fallbackYear);
      const caption = [docType, subject, year].filter(Boolean).join(' · ');
      const docUrl = `${SITE}/doc/${encodeURI(doc.file)}`;
      const imgUrl = `${SITE}/og/${getOgSlug(doc.file)}.png`;

      return `  <url>
    <loc>${escapeXml(docUrl)}</loc>
    <image:image>
      <image:loc>${escapeXml(imgUrl)}</image:loc>
      <image:title>${escapeXml(title)}</image:title>
      <image:caption>${escapeXml(caption || title)}</image:caption>
    </image:image>
  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
