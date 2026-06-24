import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { resolve } from 'node:path';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sandbox: resolve(__dirname, 'src/sandbox/index.html'),
        pathReplace: resolve(__dirname, 'src/path-replace/index.html'),
      },
    },
  },
});
