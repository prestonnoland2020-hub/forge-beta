import { createHash } from 'node:crypto';
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
let outDir = 'dist';

export default defineConfig({
  base: './',
  define: { __FORGE_BUILD__: JSON.stringify(buildId) },
  plugins: [react(), {
    /* A CONTENT SECURITY POLICY, BECAUSE THE HOST CANNOT SEND ONE. GitHub
       Pages sets no response headers we control, so the policy rides in a
       <meta> tag. It is what stops injected markup from running script or
       shipping the session (kept in localStorage) to another host: scripts
       come only from this origin, plus the one inline theme script by its
       exact hash; the network reaches only this origin and Supabase.

       BUILD ONLY. The dev server injects its own inline scripts for hot
       reload, and a hash cannot follow them. frame-ancestors is not honoured
       in a <meta> tag, so it is not claimed here. */
    name: 'forge-content-security-policy',
    apply: 'build' as const,
    transformIndexHtml: {
      order: 'post' as const,
      handler(html: string) {
        const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
          .map(match => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
        const policy = [
          "default-src 'self'",
          `script-src 'self' ${inline.join(' ')}`.trim(),
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https:",
          "font-src 'self' data:",
          /* The coach's voice plays from in-memory audio (blob:/data:). With no
             media-src this fell back to default-src 'self', which blocked every
             line, and iPhone fell back to the robot voice. */
          "media-src 'self' blob: data: https:",
          "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
          "worker-src 'self'",
          "manifest-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          'upgrade-insecure-requests',
        ].join('; ');
        return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />`);
      },
    },
  }, {
    /* WRITTEN INTO THE DIRECTORY THAT WAS ACTUALLY BUILT. This hardcoded
       'dist', so building any other outDir — the signed-in build the test
       suite serves from dist-auth, for one — stamped ITS id over dist's
       version file. The preview at dist then compared the id baked into its
       bundle against a different one and told every visitor "Forge updated,
       tap to refresh", which is both a lie and, in a browser test, a banner
       over the thing being asserted. */
    name: 'forge-version-file',
    configResolved(config) { outDir = config.build.outDir || 'dist'; },
    closeBundle() { writeFileSync(resolve(__dirname, outDir, 'version.json'), JSON.stringify({ build: buildId })); },
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
