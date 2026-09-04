import { chromium } from 'playwright';
import { setup, goals, days } from './seed.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const BASE='http://localhost:4193';
mkdirSync('/tmp/tour/head', { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
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


const FULL = ['/profile', '/profile?view=settings', '/', '/workout'];
const ROUTES = ['/', '/plan', '/goals', '/history', '/profile', '/workout', '/insights', '/split', '/profile?view=appearance', '/profile?view=faq', '/profile?view=devices', '/exercises', '/coach'];
async function shot(route, theme, width, height, clipH) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.route('**/*', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
  await page.addInitScript(([s, g, d, sd, p, t]) => {
    localStorage.clear();
    localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
    localStorage.setItem('forge-goals', JSON.stringify(g));
    localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
    localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'weekly', minWeeklyMileage: 12, maxWeeklyMileage: 30, days: sd }));
    localStorage.setItem('forge-appearance-v5', JSON.stringify({ theme: t, ground: 'carbon', accent: 'signal', icon: 'match' }));
    localStorage.setItem('forge-ai-plan-v1', JSON.stringify(p));
  }, [setup, goals, history, splitDays, plan, theme]);
  await page.goto(`${BASE}/#${route}${route.includes('?') ? '&' : '?'}t=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const name = route.replace(/[\/?=]/g, '_') || 'root';
  writeFileSync(`/tmp/tour/head/${theme}-${width}-${name}.png`, await page.screenshot({ clip: { x: 0, y: 0, width, height: clipH } }));
  await page.close();
}
for (const route of ROUTES) { await shot(route, 'dark', 430, 950, 330); await shot(route, 'light', 430, 950, 330); }
for (const route of FULL) await shot(route, 'dark', 430, 950, 950);
for (const route of ['/', '/plan', '/goals', '/profile', '/insights']) await shot(route, 'dark', 1100, 900, 260);
await browser.close();
console.log('done');
