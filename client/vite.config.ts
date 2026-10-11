import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const target = process.env.SERVER_URL ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    fs: { allow: ['..'] },
    proxy: { '/socket.io': { target, ws: true } },
  },
});
