/* A GOAL IS PART OF BEING SET UP. Forge programs toward a goal — the wave,
   the mileage ramp and max week all exist to move one — so an athlete who
   finished setup without one met nothing but empty states. Four of the first
   seven accounts sat exactly there. Setup now cannot complete without one.

   Drives the real onboarding flow in a browser: no goal, no entry. */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`PASS  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${detail}`); } };
const text = async p => (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
const clickText = async (p, pattern) => p.evaluate(pat => {
  const re = new RegExp(pat, 'i');
  const el = [...document.querySelectorAll('button')].find(b => re.test(b.textContent || ''));
  if (el && !el.disabled) { el.click(); return true; } return false;
}, pattern.source ?? pattern);

const fresh = async () => {
  const p = await b.newPage({ viewport: { width: 1280, height: 950 } });
  await p.addInitScript(() => { localStorage.clear(); });
  await p.goto('http://localhost:4191/#/onboarding', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1600);
  return p;
};

/* 1. Setup announces three steps and names the goal step. */
const p = await fresh();
let body = await text(p);
if (/I understand and accept this/i.test(body)) {
  await p.evaluate(() => { const c = document.querySelector('.setup-check.safety input'); if (c) { c.click(); } });
  await p.waitForTimeout(300);
  await clickText(p, /continue to setup/);
  await p.waitForTimeout(700);
  body = await text(p);
}
check('setup is three steps, not two', /SETUP 1 OF 3/.test(body), body.slice(0, 90));
check('the third step is named for the goal', /Your first goal/i.test(body));

/* 2. Walk to the goal step. */
await p.evaluate(() => { const i = document.querySelector('.setup-fields input'); if (i) { const d = Object.getOwnPropertyDescriptor(i.constructor.prototype, 'value').set; d.call(i, 'Test Athlete'); i.dispatchEvent(new Event('input', { bubbles: true })); } });
await p.waitForTimeout(250);
await clickText(p, /continue/);
await p.waitForTimeout(700);

/* 3. Step 2 must not advance without the safety confirmation. */
const beforeSafety = await text(p);
await clickText(p, /continue/);
await p.waitForTimeout(500);
const afterBlocked = await text(p);
check('step 2 still refuses to advance unconfirmed', /Confirm the safety note/i.test(afterBlocked), beforeSafety.slice(0, 60));

await p.evaluate(() => { const boxes = [...document.querySelectorAll('.setup-check input')]; const safety = boxes[boxes.length - 1]; if (safety && !safety.checked) safety.click(); });
await p.waitForTimeout(300);
await clickText(p, /continue/);
await p.waitForTimeout(800);
body = await text(p);
check('the goal step is reached', /SETUP 3 OF 3/.test(body), body.slice(0, 80));
check('the goal step explains why a goal is required', /One goal is all Forge needs/i.test(body));

/* 4. THE GATE: finishing with no goal is refused, and the app is not entered. */
await clickText(p, /enter forge|save profile/);
await p.waitForTimeout(1200);
const url = p.url();
body = await text(p);
check('finishing without a goal is refused', /Add one goal to finish/i.test(body), body.slice(0, 120));
check('the athlete is still in setup', /#\/onboarding/.test(url), url);
const committed = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('forge-athlete-setup')).map(k => { try { return JSON.parse(localStorage.getItem(k)).completedAt || ''; } catch { return ''; } }));
check('setup was never marked complete', committed.every(stamp => !stamp), JSON.stringify(committed));

/* 5. With a goal present, setup completes and the app opens. */
await p.evaluate(() => localStorage.setItem('forge-goals', JSON.stringify([{ type: 'Strength', title: '405 lb Squat', target: '405 lb', date: '2026-12-01', connection: 'Quads', exercise: 'Squat', metric: 'Real 1RM', unit: 'lb' }])));
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1800);
body = await text(p);
if (/I understand and accept this/i.test(body)) {
  await p.evaluate(() => { const c = document.querySelector('.setup-check.safety input'); if (c) c.click(); });
  await p.waitForTimeout(300); await clickText(p, /continue to setup/); await p.waitForTimeout(600);
}
/* 6. An athlete who FINISHED setup before the goal step existed is sent back
   to it rather than dropped on a home screen of empty states. */
const returning = await b.newPage({ viewport: { width: 1280, height: 950 } });
await returning.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify({
    displayName: 'Returning', username: 'returning', units: 'Imperial', primaryFocus: 'Hybrid',
    trainingDays: 4, runningDays: 2, weeklyMileage: 12, longestRun: 4, splitDays: [],
    acceptedSafety: true, completedAt: '2026-01-01T00:00:00.000Z',
  }));
});
await returning.goto('http://localhost:4191/#/', { waitUntil: 'domcontentloaded' });
await returning.waitForTimeout(2200);
check('a goal-less athlete is routed into the goal step', /#\/onboarding/.test(returning.url()), returning.url());
const returningBody = await text(returning);
check('they land on the goal step, not back at step one', /SETUP 3 OF 3|Your first goal/i.test(returningBody), returningBody.slice(0, 100));

/* 7. An athlete WITH a goal is never bounced. */
const settled = await b.newPage({ viewport: { width: 1280, height: 950 } });
await settled.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify({
    displayName: 'Settled', username: 'settled', units: 'Imperial', primaryFocus: 'Hybrid',
    trainingDays: 4, runningDays: 2, weeklyMileage: 12, longestRun: 4, splitDays: [],
    acceptedSafety: true, completedAt: '2026-01-01T00:00:00.000Z',
  }));
  localStorage.setItem('forge-goals', JSON.stringify([{ type: 'Strength', title: '405 lb Squat', target: '405 lb', date: '2026-12-01', connection: 'Quads', exercise: 'Squat', metric: 'Real 1RM', unit: 'lb' }]));
});
await settled.goto('http://localhost:4191/#/', { waitUntil: 'domcontentloaded' });
await settled.waitForTimeout(2200);
check('an athlete with a goal is left alone', !/#\/onboarding/.test(settled.url()), settled.url());

console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
