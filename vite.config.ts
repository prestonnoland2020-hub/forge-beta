import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* One id per build, baked into the bundle AND written beside it. The app
   compares the two at runtime: a Home-Screen install that iOS pinned to an
   old shell learns a deploy happened and offers one tap to reload — without
   this, a stale PWA can sit on last week's engine indefinitely. */
const buildId = Date.now().toString(36);

export default defineConfig({
  base: './',
  define: { __FORGE_BUILD__: JSON.stringify(buildId) },
  plugins: [react(), {
    name: 'forge-version-file',
    closeBundle() { writeFileSync(resolve(__dirname, 'dist/version.json'), JSON.stringify({ build: buildId })); },
  }],
});
