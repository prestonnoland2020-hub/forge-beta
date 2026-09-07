/* CONTRAST ON THE PARTNER SCREEN, EVERY ACCENT AND GROUND.

   The new picker paints an active segment on a sunken tray and an active pill
   in the athlete's accent — two surfaces the general sweep never reaches,
   because it has no partner to open. Both kinds of selector, both themes, all
   six accents, all four grounds. */
import { chromium } from 'playwright';
import { setup, goals, days } from './seed.mjs';
const BASE = 'http://localhost:4194';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ACCENTS = ['signal', 'flare', 'coral', 'amber', 'tide', 'harbor'];
const GROUNDS = ['carbon', 'midnight', 'ink', 'espresso'];
const METRICS = [
  { key: 'run:pace', label: 'Best sustained pace', kind: 'endurance', mine: true, theirs: true },
  { key: 'run:miles', label: 'Weekly miles', kind: 'endurance', mine: true, theirs: true },
  { key: 'lift:bench', label: 'Bench', kind: 'strength', mine: true, theirs: true },
  { key: 'lift:squat', label: 'Squat', kind: 'strength', mine: true, theirs: true },
  { key: 'body:weight', label: 'Body weight', kind: 'body', mine: true, theirs: true },
];
const FEED = [{ friend_id: 'a1', username: 'adamgomez', display_name: 'Adam Gomez', block_week: 1, block_weeks: 10, wave_slot: 4,
  trained_today: true, last_trained: '2026-09-07', top_lift: null, top_weight: null, top_reps: null, cardio_summary: 'Run · 2.27 mi' }];
const WEEK = [{ side: 'mine', days_trained: 1, miles: 1.0, top_sets: 1, streak: 2 }, { side: 'theirs', days_trained: 1, miles: 2.3, top_sets: 0, streak: 8 }];
const SERIES = [
  ['2026-06-15', null, '7.3'], ['2026-06-22', '8.1', '7.4'], ['2026-06-29', '7.9', '5.7'],
  ['2026-07-06', '8.5', '6.8'], ['2026-07-13', '7.7', '6.3'], ['2026-07-20', '8.4', '7.9'],
  ['2026-07-27', '5.3', '7.8'], ['2026-08-03', '10.0', '7.5'], ['2026-08-17', '7.1', '5.9'],
  ['2026-08-24', '5.8', '6.1'], ['2026-08-31', '7.5', '6.4'], ['2026-09-07', '6.9', '9.3'],
].map(([bucket, mine, theirs]) => ({ bucket, mine, theirs }));

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
    /* A 0px glyph is a decorative mark, not text anyone reads. */
    if (!(size >= 1)) continue;
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

const browser = await chromium.launch({ executablePath: CHROME });
const seen = new Map(); let checked = 0;
const PASSES = [
  ...ACCENTS.flatMap(accent => ['light', 'dark'].map(theme => ({ accent, theme, ground: 'carbon' }))),
  ...GROUNDS.flatMap(ground => ['light', 'dark'].map(theme => ({ accent: 'signal', theme, ground }))),
];
for (const { accent, theme, ground } of PASSES) {
  for (const kind of ['Endurance', 'Strength', 'Body']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 1400 } });
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith(BASE)) return route.continue();
      const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.includes('/rpc/forge_partner_feed')) return json(FEED);
      if (url.includes('/rpc/forge_partner_week')) return json(WEEK);
      if (url.includes('/rpc/forge_partner_metrics')) return json(METRICS);
      if (url.includes('/rpc/forge_partner_series')) return json(SERIES);
      if (url.includes('/rest/v1/profiles')) return json({ username: 'preston', display_name: 'Preston Noland', unit_system: 'imperial', onboarding_completed: true, updated_at: new Date().toISOString() });
      if (url.includes('/rest/v1/') || url.includes('/rpc/')) return json([]);
      if (url.includes('/auth/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
      return route.abort();
    });
    await page.addInitScript(([s, g, d, t, a, gr]) => {
      localStorage.clear();
      const user = { id: 'preview-user', aud: 'authenticated', role: 'authenticated', email: 'p@e.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
      localStorage.setItem('sb-test-auth-token', JSON.stringify({ access_token: 't', refresh_token: 't', token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user }));
      localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
      localStorage.setItem('forge-goals', JSON.stringify(g));
      localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
      localStorage.setItem('forge-appearance-v5', JSON.stringify({ theme: t, ground: gr, accent: a, icon: 'match' }));
    }, [setup, goals, days, theme, accent, ground]);
    await page.goto(`${BASE}/#/partners/a1?t=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);
    await page.evaluate(label => [...document.querySelectorAll('.partner-kind')].find(b => b.textContent.trim() === label)?.click(), kind);
    await page.waitForTimeout(400);
    for (const hit of await page.evaluate(AUDIT)) {
      const key = `${hit.sel}|${hit.text}`;
      const prev = seen.get(key);
      if (!prev || hit.r < prev.r) seen.set(key, { ...hit, where: `${ground}/${accent}/${theme}/${kind}` });
    }
    checked++;
    await page.close();
  }
}
await browser.close();
const rows = [...seen.values()].sort((a, b) => a.r - b.r);
console.log(`${checked} partner loads audited`);
if (!rows.length) { console.log('no text below its WCAG AA floor'); process.exit(0); }
for (const r of rows) console.log(`  ${String(r.r).padStart(5)} < ${r.floor}  ${r.size}px/${r.weight}  ${r.sel.padEnd(30)} ${JSON.stringify(r.text)}  [${r.where}]`);
process.exit(1);
