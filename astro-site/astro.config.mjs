import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://bibliosaloon.ru',
  output: 'static',
  build: {
    assets: '_assets',
  },
});
