import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: { manualChunks: { ethereum: ['viem'], react: ['react', 'react-dom'] } },
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
