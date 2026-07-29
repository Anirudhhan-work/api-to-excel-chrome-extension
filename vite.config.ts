import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import fs from 'fs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-manifest-and-assets',
      writeBundle() {
        if (fs.existsSync('manifest.json')) {
          fs.copyFileSync('manifest.json', 'dist/manifest.json');
        }
        if (!fs.existsSync('dist/icons')) {
          fs.mkdirSync('dist/icons', { recursive: true });
        }
        if (fs.existsSync('public/icons')) {
          fs.cpSync('public/icons', 'dist/icons', { recursive: true });
        }
      }
    }
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'index.html'),
        content: resolve(__dirname, 'src/content/content.ts'),
        background: resolve(__dirname, 'src/background/background.ts')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'content' || chunkInfo.name === 'background') {
            return '[name].js';
          }
          return 'assets/[name]-[hash].js';
        }
      }
    }
  }
});
