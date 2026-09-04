/* Reading the CSS cannot tell you whether the app is legible; only measuring
   the rendered page can. This walks every visible text node on every route, in
   both tones and for every accent, resolves the real composited background
   behind it, and reports anything under the WCAG AA floor for its size. */
import { chromium } from 'playwright';
import { setup, goals, days } from './seed.mjs';

const BASE = 'http://localhost:4193';
const ALL_ROUTES = ['/', '/plan', '/split', '/workout', '/insights', '/history', '/goals', '/coach', '/exercises', '/profile', '/profile?view=settings', '/profile?view=appearance', '/profile?view=billing', '/profile?view=devices', '/profile?view=faq', '/profile?view=coach', '/profile?view=connections'];
const ACCENTS = ['signal', 'flare', 'coral', 'amber', 'tide', 'harbor'];
const GROUNDS = ['carbon', 'midnight', 'ink', 'espresso'];

/* Two passes instead of the full 480-load cross product.
   Pass 1 sweeps every accent over every route on the default ground, because
   component-level pairings are what accents actually break.
   Pass 2 sweeps every ground over a few dense routes, because grounds move only
   hue at fixed lightness — tools/build-grounds.py already proves every rung and
   every accent's type analytically, so this is confirmation, not discovery. */
const PASSES = [
  ...ACCENTS.flatMap(accent => ['light', 'dark'].flatMap(theme =>
    ALL_ROUTES.map(route => ({ accent, theme, route, ground: 'carbon' })))),
  ...GROUNDS.flatMap(ground => ['light', 'dark'].flatMap(theme =>
    ['/', '/insights', '/profile?view=appearance'].map(route => ({ accent: 'signal', theme, route, ground })))),
];

const AUDIT = `(() => {
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  /* Chrome serialises color-mix() as \`color(srgb 0.94 0.95 0.95 / 1)\` — 0-1
     floats, not 0-255 channels. Reading those as bytes turns a near-white
     surface into near-black and invents failures that are not there. */
  const parse = s => {
    const n = (s.match(/[\\d.]+/g) || []).map(Number);
    if (!n.length) return [];
    if (/^color\\(/.test(s)) return [n[0]*255, n[1]*255, n[2]*255, n[3] ?? 1];
    return n;
  };
  const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const over = (fg, bg) => { const a = fg[3] ?? 1; return [0,1,2].map(i => fg[i] * a + bg[i] * (1 - a)); };
  const ratio = (a, b) => { const x = L(a), y = L(b); return (Math.max(x,y) + 0.05) / (Math.min(x,y) + 0.05); };

  /* The painted background is whatever the first non-transparent ancestor
     declares — an element with no background of its own is not white, it is
     whatever is behind it. */
  const groundOf = el => {
    let node = el, stack = [];
    while (node && node !== document.documentElement.parentNode) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg.length && (bg[3] ?? 1) > 0) { stack.push(bg); if ((bg[3] ?? 1) === 1) break; }
      node = node.parentElement;
    }
    let base = [255, 255, 255];
    for (const layer of stack.reverse()) base = over(layer, base);
    return base;
  };

  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!el.childNodes.length) continue;
    const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
    if (!text) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || +style.opacity === 0) continue;
    const box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    const size = parseFloat(style.fontSize);
    const weight = parseInt(style.fontWeight, 10) || 400;
    /* WCAG: 18.66px bold or 24px counts as large text and needs only 3:1. */
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const floor = large ? 3 : 4.5;
    const fg = over(parse(style.color), groundOf(el));
    const r = ratio(fg, groundOf(el));
    if (r < floor) out.push({
      text: text.slice(0, 34), r: +r.toFixed(2), floor, size: +size.toFixed(1), weight,
      sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : ''),
    });
  }
  return out;
})()`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const seen = new Map();
let redirected = 0;
let checked = 0;

for (const { accent, theme, route, ground } of PASSES) {
  const page = await browser.newPage({ viewport: { width: 430, height: 1200 } });
  await page.route('**/*', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
  await page.addInitScript(([s, g, d, t, a, gr]) => {
    localStorage.clear();
    localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
    localStorage.setItem('forge-goals', JSON.stringify(g));
    localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
    /* A mapped split, or the setup gate sends every route to onboarding and the
       audit silently measures the same setup screen 192 times. */
    localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', days: [
      { name: 'Chest & Back', weekday: 'MON', dayType: 'strength', muscles: ['Chest', 'Back'], exercises: ['Bench Press'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
      { name: 'Quality Cardio', weekday: 'TUE', dayType: 'cardio', muscles: [], exercises: [], cardioPolicy: 'forge', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '45', maxDuration: '45' },
    ] }));
    localStorage.setItem('forge-appearance-v5', JSON.stringify({ theme: t, ground: gr, accent: a, icon: 'match' }));
  }, [setup, goals, days, theme, accent, ground]);
  await page.goto(`${BASE}/#${route}${route.includes('?') ? '&' : '?'}t=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  /* An audit that silently got redirected is an audit of the wrong screen. */
  if (!page.url().includes(route.split('?')[0])) { console.log(`REDIRECTED  ${route} -> ${page.url()}`); redirected += 1; }
  for (const hit of await page.evaluate(AUDIT)) {
    const key = `${hit.sel}|${hit.text}`;
    const prev = seen.get(key);
    if (!prev || hit.r < prev.r) seen.set(key, { ...hit, where: `${ground}/${accent}/${theme}${route}` });
  }
  checked++;
  await page.close();
}
await browser.close();

const rows = [...seen.values()].sort((a, b) => a.r - b.r);
console.log(`${checked} page loads audited${redirected ? ` · ${redirected} REDIRECTED (audited the wrong screen)` : ""}`);
if (!rows.length) { console.log('no text below its WCAG AA floor'); process.exit(0); }
for (const r of rows) console.log(`  ${String(r.r).padStart(5)} < ${r.floor}  ${r.size}px/${r.weight}  ${r.sel.padEnd(34)} ${JSON.stringify(r.text)}  [${r.where}]`);
process.exit(1);
