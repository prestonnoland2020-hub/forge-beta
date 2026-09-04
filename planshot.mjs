/* The Plan tab in every state that matters, both tones, on a phone:
   a live AI block (mid-block, with a goal lift on today), the same block with
   today already logged, and the pre-program fallback. */
import { chromium } from 'playwright';
import { setup, goals, days } from './seed.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'http://localhost:4193';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
mkdirSync('/tmp/tour', { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });
const today = new Date().toISOString().slice(0, 10);
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

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

async function shoot(name, theme, extra, route = '/plan') {
  const page = await browser.newPage({ viewport: { width: 430, height: 950 }, deviceScaleFactor: 2 });
  await page.route('**/*', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
  await page.addInitScript(([s, g, d, sd, t, ex]) => {
    localStorage.clear();
    localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
    localStorage.setItem('forge-goals', JSON.stringify(g));
    localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
    localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'weekly', minWeeklyMileage: 12, maxWeeklyMileage: 30, days: sd }));
    localStorage.setItem('forge-appearance-v5', JSON.stringify({ theme: t, ground: 'carbon', accent: 'signal', icon: 'match' }));
    Object.entries(ex || {}).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
  }, [setup, goals, history, splitDays, theme, extra || {}]);
  await page.goto(`${BASE}/#${route}?t=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
  writeFileSync(`/tmp/tour/${name}.png`, await page.screenshot({ fullPage: true }));
  return page;
}

for (const theme of ['dark', 'light']) {
  /* Mid-block, nothing logged today. */
  const p1 = await shoot(`plan-${theme}`, theme, { 'forge-ai-plan-v1': plan });
  /* Open the block and a week inside it. */
  await p1.locator('.pv-block-toggle').click(); await p1.waitForTimeout(300);
  await p1.locator('.pv-block-row').nth(4).click(); await p1.waitForTimeout(300);
  await p1.locator('.pv-row-main').first().click().catch(() => {}); await p1.waitForTimeout(300);
  writeFileSync(`/tmp/tour/plan-${theme}-open.png`, await p1.screenshot({ fullPage: true }));
  await p1.close();
  /* Today logged. */
  const logged = [...history, { id: 'today', date: today, title: 'Chest & Back', muscles: ['Chest', 'Back'], hasCardio: true, topSets: [{ id: 't1', muscle: 'Chest', lift: 'Bench Press', weight: 330, reps: 4, calculatedMax: 374, completed: true }], cardioSessions: [{ id: 'c1', structure: 'steady', activity: 'Run', summary: 'Run · 2.5 miles · 24:00 · 9:36 /mi', prescription: { legacyIntervals: [{ cardioType: 'Run', unit: 'miles', distance: 2.5, time: 24 }] } }] }];
  const p2 = await shoot(`plan-${theme}-done`, theme, { 'forge-ai-plan-v1': plan, 'forge-workout-history-v1': logged });
  await p2.close();
}
/* Pre-program fallback (no stored block). */
const p3 = await shoot('plan-fallback', 'dark', {});
await p3.close();
await browser.close();
console.log('plan shots done');
