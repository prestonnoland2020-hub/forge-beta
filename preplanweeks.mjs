/* THE SQUARES AT THE TOP ARE THE WEEK PICKER.

   Ten pips across the top of the Plan tab read as tabs on every phone anyone
   owns, and they were a picture: they showed which week you were in and did
   nothing when pressed. The only route to week four was a "The whole block"
   accordion at the very bottom of the page — two ways to the same ten weeks,
   one inert and one invisible.

   Now the pips drive the screen, the week itself swipes, the tab opens on the
   week you are in, and the accordion is gone. */
import { chromium } from 'playwright';
import { setup } from './seed.mjs';

const BASE = 'http://localhost:4193';
let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : '   → ' + d}`); if (!c) fails++; };
const oneRm = (w, r) => Math.round(w * (1 + r / 30));
const today = new Date().toISOString().slice(0, 10);
/* A month back, so the block is genuinely mid-flight and "the week you are in"
   is week five rather than week one. */
const startDate = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); })();

const splitDays = [{ name: 'Legs', type: 'Strength', muscles: ['Quads'], exercises: ['Squat'] }];
const WAVE = [8, 6, 4, 2, 1, 8, 6, 4, 2, 1];
const LOAD = { 8: 340, 6: 365, 4: 385, 2: 405, 1: 465 };
const mkWeek = n => ({ week: n, phase: 'Build', mileage: 0, longRunMiles: 0, longRunPace: '', quality: '', qualityPace: '',
  qualityDay: '', longRunDay: '', easyDays: [], easyMinutes: 0, easyPace: '',
  topSets: [{ splitDay: 'Legs', exercise: 'Squat', weight: LOAD[WAVE[n - 1]], reps: WAVE[n - 1] }], note: 'Wave.' });
const storedPlan = { plan: { summary: 'Block.', easyPace: '', weeks: Array.from({ length: 10 }, (_, i) => mkWeek(i + 1)) },
  generatedAt: new Date().toISOString(), startDate, fingerprint: 'seeded', blockWeeks: 10, saved: true, savedAt: new Date().toISOString() };
const hist = [{ id: 'd1', date: today, title: 'Legs', muscles: ['Quads'],
  topSets: [{ id: 'd1t', muscle: 'Quads', lift: 'Squat', weight: 405, reps: 3, completed: true, calculatedMax: oneRm(405, 3) }],
  lift: 'Squat', weight: 405, reps: 3, calculatedMax: oneRm(405, 3), hasCardio: false, cardioSessions: [] }];


const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await b.newPage({ viewport: { width: 390, height: 1200 }, hasTouch: true });
page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 200)));
await page.addInitScript(([s, h, sd]) => {
  localStorage.clear();
  localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
  localStorage.setItem('forge-goals', JSON.stringify([{ type: 'Strength', title: 'Squat 500', exercise: 'Squat', metric: 'Real 1RM', target: '500', unit: 'lb', date: '2026-12-30', connection: '' }]));
  localStorage.setItem('forge-workout-history-v1', JSON.stringify(h));
  localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', minWeeklyMileage: 0, maxWeeklyMileage: 0,
    days: sd.map(d => ({ name: d.name, weekday: 'MON', dayType: 'strength', muscles: d.muscles, exercises: d.exercises, cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' })) }));
}, [{ ...setup, splitDays, completedAt: new Date().toISOString(), acceptedSafety: true }, hist, splitDays]);
await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { location.hash = '#/plan'; });
await page.waitForTimeout(3000);
const read = () => page.evaluate(() => ({
  heading: document.querySelector('.pv-progress-week')?.innerText.replace(/\n/g, ' ') || '',
  selected: [...document.querySelectorAll('.pv-dot')].findIndex(d => d.getAttribute('aria-selected') === 'true') + 1,
  weekTitle: document.querySelector('.pv-week h3')?.textContent || '',
  block: Boolean(document.querySelector('.pv-block')),
  snag: /HIT A SNAG/i.test(document.body.innerText),
}));
const a = await read();
console.log('  pre-program:', JSON.stringify(a));
check('the pre-program plan still renders', !a.snag && a.selected === 1, JSON.stringify(a));
check('and it has the same week picker', /^Week 1\b/.test(a.heading), a.heading);
check('with no accordion of its own', !a.block);
await page.evaluate(() => document.querySelectorAll('.pv-dot')[3]?.click());
await page.waitForTimeout(600);
const c = await read();
check('its pips move it too', c.selected === 4 && /^Week 4 · /.test(c.weekTitle), JSON.stringify(c));
await page.close(); await b.close();
console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
