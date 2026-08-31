/* Every screen, both themes, side by side. Reading CSS cannot tell you whether
   light mode works; only looking can. */
import { chromium } from 'playwright';
import { setup, goals, days } from './seed.mjs';

const BASE = 'http://localhost:4191';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ROUTES = process.argv[2] ? [process.argv[2]] : ['/', '/plan', '/insights', '/history', '/goals', '/coach', '/exercises', '/profile'];
const splitDays = [
  { name:'Chest & Back', weekday:'MON', dayType:'strength', muscles:['Chest','Back'], exercises:['Bench Press'], cardioPolicy:'none', cardio:[], recoveryStyle:'Full rest', strengthDuration:'60', maxDuration:'60' },
  { name:'Quality Cardio', weekday:'TUE', dayType:'cardio', muscles:[], exercises:[], cardioPolicy:'forge', cardio:[], recoveryStyle:'Full rest', strengthDuration:'45', maxDuration:'45' },
];
const browser = await chromium.launch({ executablePath: CHROME });

async function shot(route, theme) {
  const page = await browser.newPage({ viewport: { width: 430, height: 1000 }, deviceScaleFactor: 2 });
  await page.route('**/*', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
  await page.addInitScript(([s, g, d, sd, t]) => {
    localStorage.clear();
    localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
    localStorage.setItem('forge-goals', JSON.stringify(g));
    localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
    localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name:'Split', rhythm:'rolling', minWeeklyMileage:0, maxWeeklyMileage:0, days: sd }));
    localStorage.setItem('forge-appearance-v3', JSON.stringify({ theme: t }));
  }, [setup, goals, days, splitDays, theme]);
  await page.goto(`${BASE}/#${route}${route.includes('?') ? '&' : '?'}t=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
  const buf = await page.screenshot({ fullPage: false });
  await page.close();
  return buf;
}

import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('/tmp/themes', { recursive: true });
for (const route of ROUTES) {
  const name = route.replace(/\W+/g, '') || 'today';
  for (const theme of ['light', 'dark']) {
    writeFileSync(`/tmp/themes/${name}-${theme}.png`, await shot(route, theme));
  }
  console.log('  ' + name);
}
await browser.close();
