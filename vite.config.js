import { defineConfig } from 'vite';
import { resolve } from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
    target: 'esnext',
  },
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.svg', 'icon-512.svg'],
      manifest: {
        name: 'Академический Салон',
        short_name: 'АкадСалон',
        description: 'Библиотека студенческих работ — 235+ документов бесплатно',
        theme_color: '#09080c',
        background_color: '#09080c',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'ru',
        categories: ['education', 'reference'],
        icons: [
          {
            src: 'icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/api\/doc-stats\/batch/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'stats-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
            },
          },
          {
            urlPattern: /\/catalog\.json/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'catalog-cache',
              expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/files': {
        target: 'https://bibliosaloon.ru',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
