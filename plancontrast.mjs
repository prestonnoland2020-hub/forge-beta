/* Contrast audit of the PLAN TAB WITH A STORED BLOCK, every accent, both
   tones, with the block, a week inside it, and a row all expanded — the
   surfaces the general sweep never reaches because it has no stored plan. */
import { chromium } from 'playwright';
import { setup, goals, days } from './seed.mjs';
const BASE = 'http://localhost:4193';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ACCENTS = ['signal', 'flare', 'coral', 'amber', 'tide', 'harbor'];
const GROUNDS = ['carbon', 'midnight', 'ink', 'espresso'];
const today = new Date().toISOString().slice(0, 10);
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
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
const splitDays = [
  { name: 'Chest & Back', weekday: 'MON', dayType: 'strength', muscles: ['Chest', 'Back'], exercises: ['Bench Press', 'Pull Ups'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
  { name: 'Easy Run', weekday: 'TUE', dayType: 'cardio', muscles: [], exercises: [], cardioPolicy: 'forge', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '45', maxDuration: '45' },
  { name: 'Legs', weekday: 'WED', dayType: 'strength', muscles: ['Quads', 'Hamstrings', 'Glutes'], exercises: ['Squat'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
  { name: 'Long Run', weekday: 'THU', dayType: 'cardio', muscles: [], exercises: [], cardioPolicy: 'forge', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '45', maxDuration: '45' },
  { name: 'Rest', weekday: 'FRI', dayType: 'rest', muscles: [], exercises: [], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '' },
];
const week = (index) => ({
  week: index + 1, phase: index % 5 === 3 ? 'Deload' : index < 4 ? 'Base' : 'Build', mileage: 14 + index, longRunMiles: 5 + Math.floor(index / 2), longRunPace: '9:05–9:45/mi', longRunDay: 'Long Run',
  quality: '6 × 400 m', qualityPace: '1:38/rep', qualityDay: 'Easy Run', easyDays: ['Easy Run'], easyMinutes: 35, easyPace: '9:15–10:00/mi',
  topSets: [
    { splitDay: 'Chest & Back', exercise: 'Bench Press', weight: 300, reps: 8 },
    { splitDay: 'Chest & Back', exercise: 'Pull Ups', weight: 110, reps: 8 },
    { splitDay: 'Legs', exercise: 'Squat', weight: 410, reps: 8 },
  ], note: '',
});
/* Block started 15 days ago so today lands in week 3. */
const startDate = daysAgo(15);
const plan = { plan: { summary: '', easyPace: '9:30', weeks: Array.from({ length: 10 }, (_, i) => week(i)), adjustmentNote: 'Kept the long run on Thursday as asked.' }, generatedAt: new Date(Date.now() - 15 * 86400000).toISOString(), startDate, fingerprint: 'x', blockWeeks: 10, saved: true, savedAt: new Date().toISOString(), adjustments: 'Keep the long run on Thursday and go heavier on squats.', waveOffset: 0 };

const history = [
  ...days,
  { id: 'd1', date: daysAgo(14), title: 'Chest & Back', muscles: ['Chest', 'Back'], hasCardio: false, topSets: [{ id: 's1', muscle: 'Chest', lift: 'Bench Press', weight: 300, reps: 8, calculatedMax: 380, completed: true }, { id: 's2', muscle: 'Back', lift: 'Pull Ups', weight: 110, reps: 8, calculatedMax: 139, completed: true }] },
  { id: 'd2', date: daysAgo(12), title: 'Legs', muscles: ['Quads'], hasCardio: false, topSets: [{ id: 's3', muscle: 'Quads', lift: 'Squat', weight: 410, reps: 8, calculatedMax: 519, completed: true }] },
  { id: 'd3', date: daysAgo(7), title: 'Chest & Back', muscles: ['Chest', 'Back'], hasCardio: false, topSets: [{ id: 's4', muscle: 'Chest', lift: 'Bench Press', weight: 320, reps: 6, calculatedMax: 384, completed: true }] },
];


const browser = await chromium.launch({ executablePath: CHROME });
const seen = new Map(); let checked = 0;
const PASSES = [
  ...ACCENTS.flatMap(accent => ['light', 'dark'].map(theme => ({ accent, theme, ground: 'carbon' }))),
  ...GROUNDS.flatMap(ground => ['light', 'dark'].map(theme => ({ accent: 'signal', theme, ground }))),
];
for (const { accent, theme, ground } of PASSES) {
  for (const logged of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 430, height: 1200 } });
    await page.route('**/*', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
    const hist = logged ? [...history, { id: 'today', date: today, title: 'Chest & Back', muscles: ['Chest'], hasCardio: false, topSets: [{ id: 't1', muscle: 'Chest', lift: 'Bench Press', weight: 330, reps: 4, calculatedMax: 374, completed: true }] }] : history;
    await page.addInitScript(([s, g, d, sd, t, a, gr, p]) => {
      localStorage.clear();
      localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
      localStorage.setItem('forge-goals', JSON.stringify(g));
      localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
      localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'weekly', minWeeklyMileage: 12, maxWeeklyMileage: 30, days: sd }));
      localStorage.setItem('forge-appearance-v5', JSON.stringify({ theme: t, ground: gr, accent: a, icon: 'match' }));
      localStorage.setItem('forge-ai-plan-v1', JSON.stringify(p));
    }, [setup, goals, hist, splitDays, theme, accent, ground, plan]);
    await page.goto(`${BASE}/#/plan?t=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    if (!page.url().includes('/plan')) console.log(`REDIRECTED -> ${page.url()}`);
    await page.locator('.pv-block-toggle').click(); await page.waitForTimeout(200);
    await page.locator('.pv-block-row').nth(4).click(); await page.waitForTimeout(200);
    await page.locator('.pv-row-main').first().click().catch(() => {}); await page.waitForTimeout(200);
    await page.locator('.pv-request .text-button').click().catch(() => {}); await page.waitForTimeout(200);
    for (const hit of await page.evaluate(AUDIT)) {
      const key = `${hit.sel}|${hit.text}`;
      const prev = seen.get(key);
      if (!prev || hit.r < prev.r) seen.set(key, { ...hit, where: `${ground}/${accent}/${theme}${logged ? '/logged' : ''}` });
    }
    checked++;
    await page.close();
  }
}
await browser.close();
const rows = [...seen.values()].sort((a, b) => a.r - b.r);
console.log(`${checked} plan loads audited`);
if (!rows.length) { console.log('no text below its WCAG AA floor'); process.exit(0); }
for (const r of rows) console.log(`  ${String(r.r).padStart(5)} < ${r.floor}  ${r.size}px/${r.weight}  ${r.sel.padEnd(34)} ${JSON.stringify(r.text)}  [${r.where}]`);
process.exit(1);
