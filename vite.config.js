import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The app is static: no SSR, no API routes, no proxy. Everything it knows about a
// visa application is already in the browser, so a full Node server would add
// nothing but a process to keep alive during a demo.
//
// base: './' makes the built output relocatable — it can be opened from any
// subdirectory or dropped on a static host without rewriting asset paths.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, host: true },
  build: {
    // pdf.js is vendored and lazy-loaded, but it is still the largest thing here.
    // A single self-contained bundle is easier to drop on Netlify or serve from a
    // thumb drive than a tree of hashed chunks.
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 1200,
    // No manualChunks here: this Vite build uses Rolldown, where manualChunks must
    // be a function rather than an object map. The app has two entries (index.html
    // and the lazily-imported pdf.js) so the default splitting is already right,
    // and a single bundle is what a demo wants anyway.
  },
});