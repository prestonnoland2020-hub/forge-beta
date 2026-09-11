import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* One id per build, baked into the bundle AND written beside it. The app
   compares the two at runtime: a Home-Screen install that iOS pinned to an
   old shell learns a deploy happened and offers one tap to reload — without
   this, a stale PWA can sit on last week's engine indefinitely. */
const buildId = Date.now().toString(36);
let demoBuild = false;

export default defineConfig({
  base: './',
  define: { __FORGE_BUILD__: JSON.stringify(buildId) },
  plugins: [react(), {
    name: 'forge-version-file',
    closeBundle() { writeFileSync(resolve(__dirname, 'dist/version.json'), JSON.stringify({ build: buildId })); },
  }, {
    /* .env CARRIES VITE_DEMO_MODE=true FOR LOCAL WORK, and the deploy workflow
       overrides it, so production is safe. A local `npm run build` is not: it
       produces the preview shell, with the fake session and nothing saving
       anywhere, under the same filename as the real thing. The app now wears a
       banner in that state so it cannot be mistaken for the real one once it is
       open — this is the other half, said at the moment the artifact is made,
       in the terminal the person is already looking at. */
    name: 'forge-preview-build-warning',
    apply: 'build' as const,
    /* Read the same env Vite hands the app, not process.env — the whole trap is
       that the flag lives in a .env file, which never reaches process.env, so a
       check against that would have stayed quiet in exactly the case it exists
       for. */
    configResolved(config) { demoBuild = config.env.VITE_DEMO_MODE === 'true'; },
    closeBundle() {
      if (!demoBuild) return;
      const rule = '─'.repeat(66);
      console.log(`\n\x1b[33m${rule}\n  THIS IS A PREVIEW BUILD (VITE_DEMO_MODE=true).\n  It ships the fake session. Nothing it logs is saved to an account.\n  Do not deploy it. Build with VITE_DEMO_MODE=false for a real one.\n${rule}\x1b[0m\n`);
    },
  }],
});
