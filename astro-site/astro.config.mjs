import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://bibliosaloon.ru',
  output: 'static',
  build: {
    assets: '_assets',
  },
  integrations: [
    sitemap({
      // Admin, personal cabinet and the JS-only /doc/ fallback are noindex.
      filter: (page) =>
        !page.includes('/admin') &&
        !page.includes('/me') &&
        page !== 'https://bibliosaloon.ru/doc/',
      changefreq: 'weekly',
      lastmod: new Date(),
      serialize(item) {
        // Tighter priorities for the most-discovery-relevant URLs.
        if (item.url === 'https://bibliosaloon.ru/') {
          item.priority = 1.0;
          item.changefreq = 'daily';
        } else if (item.url === 'https://bibliosaloon.ru/catalog/') {
          item.priority = 0.9;
        } else if (item.url.startsWith('https://bibliosaloon.ru/doc/')) {
          item.priority = 0.7;
          item.changefreq = 'monthly';
        } else if (
          item.url === 'https://bibliosaloon.ru/privacy/' ||
          item.url === 'https://bibliosaloon.ru/terms/'
        ) {
          item.priority = 0.3;
          item.changefreq = 'yearly';
        } else {
          item.priority = 0.6;
        }
        return item;
      },
    }),
  ],
});
