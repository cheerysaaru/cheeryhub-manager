import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/personal-productivity-manager/',
  server: { port: 5173 },
});