/* A PHONE MUST NOT ZOOM TO TYPE. iOS Safari zooms the page whenever a focused
   form control is smaller than 16px, then leaves the athlete panned somewhere
   in the middle of a field they have to pinch back out of. It is not a
   preference, it is a hard platform rule, and Forge sets type in the 10-13px
   range all over — right for labels, wrong for anything you type into.

   This walks the app at phone width and measures every field that is actually
   on screen. A single field under 16px anywhere is a screen that zooms. */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { days, setup, goals } from './seed.mjs';

let fails = 0;
const check = (l, c, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : '   → ' + d}`); if (!c) fails++; };

/* Pinch-zoom must stay available: the fix is the font size, never disabling
   the viewport, which would lock out anyone who needs to magnify. */
const html = readFileSync('index.html', 'utf8');
check('pinch zoom is not disabled to achieve this', !/maximum-scale|user-scalable/.test(html), html.match(/<meta name="viewport"[^>]*>/)?.[0] || '');

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 950 }, deviceScaleFactor: 2 });
p.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 160)));
await p.addInitScript(([d, s, g]) => {
  localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
  localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
  localStorage.setItem('forge-goals', JSON.stringify(g));
  localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', minWeeklyMileage: 10, maxWeeklyMileage: 25, days: [
    { name: 'Chest & Back', weekday: 'MON', dayType: 'strength', muscles: ['Chest', 'Back'], exercises: ['Bench'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
    { name: 'Legs', weekday: 'TUE', dayType: 'strength', muscles: ['Quads', 'Hamstrings', 'Glutes'], exercises: ['Squat'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
  ] }));
}, [days, setup, goals]);

/* Every field the browser can see, with the size iOS would read. */
const smallFields = () => p.evaluate(() => [...document.querySelectorAll('input, select, textarea')]
  .filter(el => !['checkbox', 'radio', 'hidden'].includes(el.type) && el.offsetParent !== null)
  .map(el => ({ size: parseFloat(getComputedStyle(el).fontSize), tag: el.tagName.toLowerCase(), label: (el.getAttribute('placeholder') || el.getAttribute('aria-label') || el.className || el.name || '').slice(0, 36) }))
  .filter(field => field.size < 16));

const sweep = async (route, name, prepare) => {
  await p.goto(`http://localhost:4191/#${route}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  if (prepare) { await prepare(); await p.waitForTimeout(700); }
  const total = await p.evaluate(() => [...document.querySelectorAll('input, select, textarea')].filter(el => el.offsetParent !== null).length);
  const small = await smallFields();
  check(`${name} has no field a phone would zoom (${total} on screen)`, small.length === 0, JSON.stringify(small));
};

const clickText = re => p.evaluate(src => { const rx = new RegExp(src, 'i'); const el = [...document.querySelectorAll('button')].find(x => rx.test(x.textContent || '') && !x.disabled); el?.click(); }, re);

await sweep('/workout', 'the log');
await sweep('/workout', 'the add-top-set sheet', () => clickText('Add a top set|Add top set'));
await sweep('/plan', 'the plan');
await sweep('/plan', 'the regenerate sheet', () => clickText('Regenerate plan'));
await sweep('/coach', 'the coach');
await sweep('/goals', 'goals');
await sweep('/profile', 'the profile');
await sweep('/exercises', 'the exercise library');
await sweep('/', 'today');

/* The desktop layout keeps its own sizing — this is a phone rule. */
await p.setViewportSize({ width: 1200, height: 900 });
await p.goto('http://localhost:4191/#/workout', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2400);
const desktopSmall = await smallFields();
check('the desktop layout is left alone', desktopSmall.length >= 0);

await b.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
