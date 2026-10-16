import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

/** Chỉ khi chạy dev: POST /__save-character?name=ca-xxx.png (body = PNG) → docs/characters/ */
function saveCharacterImages() {
  return {
    name: 'save-character-images',
    configureServer(server) {
      server.middlewares.use('/__save-character', (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const name = (url.searchParams.get('name') || '').replace(/[^a-z0-9._-]/gi, '');
        if (req.method !== 'POST' || !/^[a-z0-9_-]+\.png$/i.test(name)) {
          res.statusCode = 400;
          res.end('bad request');
          return;
        }
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          const dir = resolve(__dirname, 'docs/characters');
          mkdirSync(dir, { recursive: true });
          writeFileSync(resolve(dir, name), Buffer.concat(chunks));
          res.end('ok');
        });
      });
    },
  };
}

/** File .glb lớn bị khóa khi đang copy vào public/models → watcher báo EBUSY và làm sập server (Windows). */
function surviveWatchErrors() {
  return {
    name: 'survive-watch-errors',
    configureServer(server) {
      server.watcher.on('error', (err) => server.config.logger.warn(`[watch] bỏ qua lỗi: ${err.code || err.message} ${err.path || ''}`));
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [saveCharacterImages(), surviveWatchErrors()],
  build: {
    // Phaser + Three.js là thư viện lớn — cảnh báo kích thước chunk là bình thường
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        showcase: resolve(__dirname, 'showcase.html'),
      },
    },
  },
});
