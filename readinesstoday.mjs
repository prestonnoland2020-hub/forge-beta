/* THE CHECK-IN KEEPS ITS PROMISE. Under 55 the card says "Backing today off —
   no heavy singles, hold the load"; under 70 "easing". The wave that writes
   Today's top set took no readiness input, so a beat-up athlete was handed
   the same number as a fresh one. Two boots of the same account, one with a
   rough check-in this morning, must not print the same load. */
import { chromium } from 'playwright';
import { setup, goals } from './seed.mjs';
const BASE = 'http://localhost:4191';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const iso = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const today = iso(0);
const splitDays = [
  { name: 'Legs', weekday: 'MON', dayType: 'strength', muscles: ['Quads', 'Hamstrings'], exercises: ['Squat'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
  { name: 'Chest', weekday: 'TUE', dayType: 'strength', muscles: ['Chest'], exercises: ['Bench Press'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
];
/* Enough squat history that the wave has a number to move, last session a week ago. */
const history = [3, 10, 17, 24].map((back, i) => ({ id: `legs${i}`, date: iso(back), title: 'Legs', muscles: ['Quads'], hasCardio: false, splitPosition: 1,
  topSets: [{ id: `s${i}`, muscle: 'Quads', lift: 'Squat', weight: 315 - i * 5, reps: 5, calculatedMax: 355 - i * 5, completed: true, prescribedWeight: 315 - i * 5, prescribedReps: 5 }] }));
/* Chest yesterday, so Legs is the day that is due. */
history.unshift({ id: 'chest', date: iso(1), title: 'Chest', muscles: ['Chest'], hasCardio: false, splitPosition: 2, topSets: [{ id: 'c1', muscle: 'Chest', lift: 'Bench Press', weight: 225, reps: 5, calculatedMax: 253, completed: true }] });
const plan = { plan: { summary: '', easyPace: '9:30', weeks: Array.from({ length: 10 }, (_, i) => ({ week: i + 1, phase: 'Base', mileage: 0, longRunMiles: 0, longRunPace: '', longRunDay: '', quality: '', qualityPace: '', qualityDay: '', easyDays: [], easyMinutes: 0, easyPace: '9:30', topSets: [{ splitDay: 'Legs', exercise: 'Squat', weight: 320, reps: 5 }], note: '' })) }, generatedAt: new Date().toISOString(), startDate: iso(6), fingerprint: 'x', blockWeeks: 10, saved: true, waveOffset: 0 };
const boot = async (checkIns) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await page.addInitScript(([s, g, d, sd, p, c]) => {
    localStorage.clear();
    localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify({ ...s, splitDays: [] }));
    localStorage.setItem('forge-goals', JSON.stringify(g));
    localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
    localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', minWeeklyMileage: 0, maxWeeklyMileage: 0, days: sd }));
    localStorage.setItem('forge-ai-plan-v1', JSON.stringify(p));
    localStorage.setItem('forge-check-ins-v1', JSON.stringify(c));
    localStorage.setItem('forge-checkin-dismissed', '1');
  }, [setup, goals, history, splitDays, plan, checkIns]);
  await page.goto(`${BASE}/#/?t=${Math.random()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2800);
  const text = await page.evaluate(() => document.body.innerText);
  const card = text.slice(text.indexOf('NEXT IN YOUR SPLIT'), text.indexOf('NEXT IN YOUR SPLIT') + 400);
  await page.close();
  return { text, card };
};
console.log('\nA fresh morning');
const fresh = await boot([]);
const load = card => Number((card.match(/(\d{3}) lb/) || [])[1] || 0);
check('Today prescribes the squat with a load', /Squat/.test(fresh.card) && load(fresh.card) > 0, fresh.card.slice(0, 160));

console.log('\nA rough one');
const rough = await boot([{ date: today, legs: 5, energy: 1, sleep: 1, prompt: 'Quick check' }]);
check('Today still prescribes the squat', /Squat/.test(rough.card), rough.card.slice(0, 160));
check('but at a held load, not a step up', load(rough.card) > 0 && load(rough.card) <= load(fresh.card), `${load(rough.card)} vs fresh ${load(fresh.card)}`);
check('and no 1RM attempt is on the card', !/1RM attempt|tested MAX/i.test(rough.card));

await browser.close();
console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
