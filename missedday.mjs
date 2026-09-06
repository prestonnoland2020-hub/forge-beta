/* A DAY BEHIND TODAY IS HISTORY, NOT A ROTATION. Preston trained Legs on the
   Friday, rested Saturday and pressed on Sunday. Because a rolling split is
   drawn by winding today's cursor backwards, Saturday claimed to be the Legs
   session he had already done — and called it missed. */
import { chromium } from 'playwright';
import { setup, goals } from './seed.mjs';
const BASE = 'http://localhost:4193';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const iso = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const today = iso(0), yesterday = iso(1), twoBack = iso(2);

const splitDays = [
  { name: 'Chest & Back', weekday: 'MON', dayType: 'strength', muscles: ['Chest','Back'], exercises: ['Bench Press'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
  { name: 'Legs', weekday: 'TUE', dayType: 'strength', muscles: ['Quads','Hamstrings'], exercises: ['Squat'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
  { name: 'Sharms', weekday: 'WED', dayType: 'strength', muscles: ['Shoulders'], exercises: ['Smith Machine Shoulder Press'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
];
/* Legs two days ago, NOTHING yesterday, Sharms today — his week exactly. */
const history = [
  { id: 'legs', date: twoBack, title: 'Legs', muscles: ['Quads'], hasCardio: false, splitPosition: 2,
    topSets: [{ id: 'l1', muscle: 'Quads', lift: 'Squat', weight: 460, reps: 4, calculatedMax: 502, completed: true }] },
  { id: 'sharms', date: today, title: 'Sharms', muscles: ['Shoulders'], hasCardio: false, splitPosition: 3,
    topSets: [{ id: 's1', muscle: 'Shoulders', lift: 'Smith Machine Shoulder Press', weight: 225, reps: 9, calculatedMax: 288, completed: true }] },
];
const plan = { plan: { summary: '', easyPace: '9:30', weeks: Array.from({ length: 10 }, (_, i) => ({
  week: i + 1, phase: 'Base', mileage: 0, longRunMiles: 0, longRunPace: '', longRunDay: '',
  quality: '', qualityPace: '', qualityDay: '', easyDays: [], easyMinutes: 0, easyPace: '9:30',
  topSets: [{ splitDay: 'Legs', exercise: 'Squat', weight: 460, reps: 4 }, { splitDay: 'Sharms', exercise: 'Smith Machine Shoulder Press', weight: 225, reps: 8 }], note: '',
})) }, generatedAt: new Date().toISOString(), startDate: iso(6), fingerprint: 'x', blockWeeks: 10, saved: true, waveOffset: 0 };

const page = await browser.newPage({ viewport: { width: 430, height: 950 } });
await page.route('**/*', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
await page.addInitScript(([s, g, d, sd, p]) => {
  localStorage.clear();
  localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
  localStorage.setItem('forge-goals', JSON.stringify(g));
  localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
  localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', minWeeklyMileage: 0, maxWeeklyMileage: 0, days: sd }));
  localStorage.setItem('forge-appearance-v5', JSON.stringify({ theme: 'dark', ground: 'carbon', accent: 'signal', icon: 'match' }));
  localStorage.setItem('forge-ai-plan-v1', JSON.stringify(p));
}, [setup, goals, history, splitDays, plan]);
await page.goto(`${BASE}/#/plan?t=1`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2600);

const rows = await page.evaluate(() => [...document.querySelectorAll('.pv-row')].map(row => ({
  cls: row.className, text: row.innerText.replace(/\n/g, ' | '),
})));
const dayOf = n => rows.find(row => row.text.startsWith(new Date(Date.now() - n * 86400000).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()));
const legsDay = dayOf(2), gapDay = dayOf(1), todayRow = dayOf(0);
console.log(rows.map(r => `    ${r.text}`).join('\n'));

check('the day he trained shows the session he logged', /Legs/.test(legsDay?.text || '') && /Squat 460/.test(legsDay?.text || ''), legsDay?.text);
check('and is marked done, not missed', /done/.test(legsDay?.cls || '') && !/missed/.test(legsDay?.cls || ''), legsDay?.cls);
check('the day he rested does NOT claim to be a session', !/Legs|Sharms|Chest/.test(gapDay?.text || ''), gapDay?.text);
check('the day he rested says nothing was logged', /Nothing logged/i.test(gapDay?.text || ''), gapDay?.text);
check('and it is muted, without a verdict on it', /missed/.test(gapDay?.cls || '') && !/Missed/.test(gapDay?.text || ''), `${gapDay?.cls} :: ${gapDay?.text}`);
check('today shows what he actually logged', /Sharms/.test(todayRow?.text || '') && /225/.test(todayRow?.text || ''), todayRow?.text);
check('no past row prescribes a set that was never owed', !rows.some(r => /missed/.test(r.cls) && /×|x\d/.test(r.text)), rows.filter(r => /missed/.test(r.cls)).map(r => r.text).join(' ;; '));

await browser.close();
console.log(fails ? `\n${fails} check(s) failed` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
