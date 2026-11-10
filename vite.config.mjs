import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Folder /api tetap fungsi serverless Vercel (CommonJS) — tidak disentuh Vite.
// Jalankan lokal dengan `vercel dev` supaya /api/* ikut hidup.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
});
