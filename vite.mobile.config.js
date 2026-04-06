import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  base: '/app/',
  build: {
    outDir: 'mobile-dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'mobile.html',
    },
    target: 'esnext',
  },
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
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
