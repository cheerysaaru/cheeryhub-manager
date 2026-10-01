import fs from 'fs';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages has no server-side rewrites: it serves 404.html for unknown
// paths. Copying index.html there makes refresh on a deep link boot the SPA.
function spaFallback404(): Plugin {
  return {
    name: 'spa-404-fallback',
    closeBundle() {
      const candidates = [
        path.resolve(process.cwd(), 'dist'),
        path.resolve(process.cwd(), 'frontend/dist'),
      ];
      for (const dir of candidates) {
        const indexFile = path.join(dir, 'index.html');
        if (fs.existsSync(indexFile)) {
          fs.copyFileSync(indexFile, path.join(dir, '404.html'));
          return;
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), spaFallback404()],
  base: process.env.VITE_BASE ?? '/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:4000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
