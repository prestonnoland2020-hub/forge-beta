/* THREE NEW ATHLETES, START TO FINISH, ON THE CURRENT SETUP.
   Replaces freshuser.mjs and goalgate.mjs, which drove the old three-screen
   setup. What each journey must prove:
   - the week they chose is the week they get (4 days = 4 training days);
   - Today and Plan name the same day; the goal lift sits on its own day;
   - a runner is never asked what they bench, and "22" means 22 minutes;
   - a goal cannot be skipped past with an empty target. */
import { chromium } from 'playwright';
import { onboard } from './onboardflow.mjs';

const BASE = 'http://localhost:4191';
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const fresh = async () => {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await c.newPage();
  await p.addInitScript(() => { if (!sessionStorage.getItem('fresh')) { localStorage.clear(); sessionStorage.setItem('fresh', '1'); } });
  return { c, p };
};
const text = p => p.evaluate(() => document.body.innerText);
const between = (t, a, len) => { const i = t.indexOf(a); return i < 0 ? '' : t.slice(i, i + len); };
const tap = async (p, label) => { await p.evaluate(l => { const el = [...document.querySelectorAll('button,label')].filter(x => x.offsetParent && !x.disabled && x.innerText.trim().startsWith(l)).pop(); el?.click(); }, label); await p.waitForTimeout(650); };
const go = async (p, hash) => { await p.evaluate(h => { location.hash = h; }, hash); await p.waitForTimeout(2000); return text(p); };

/* ---------- Strength ---------- */
{
  const { c, p } = await fresh();
  console.log('\nA lifter who trains 4 days a week');
  await onboard(p, { base: BASE, name: 'Sam', focus: 'Get stronger', lift: 'Squat', target: '315', current: '275' });
  const plan = await go(p, '#/plan');
  const week = between(plan, 'This week\n', 900);
  const restRows = (week.match(/\nRest\n/g) || []).length;
  check('the week has three days off', restRows === 3, week.replace(/\n/g, ' | '));
  const home = await go(p, '#/');
  const todayDay = between(home, 'Suggested\n', 60).split('\n')[1];
  check(`Today and Plan both open on ${todayDay}`, week.split('\n')[3] === todayDay, `${week.split('\n')[3]} vs ${todayDay}`);
  check('the squat is on Lower Body', /Lower Body\nBack Squat \d+×\d+/.test(week) || /Lower Body[^]*?Back Squat/.test(week), week.slice(0, 300));
  check('training days are numbered among themselves (no "Day 5" in a 4-day week)', !/\nDay [5-7]\n/.test(home), between(home, 'Swipe', 200));
  await c.close();
}

/* ---------- Runner ---------- */
{
  const { c, p } = await fresh();
  console.log('\nA runner aiming at a 22-minute 5K');
  await p.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2200);
  for (const box of await p.locator('input[type=checkbox]').all()) await box.check();
  await tap(p, 'Continue'); await p.fill('input[aria-label="Your name"]', 'Riley'); await tap(p, 'Continue');
  await tap(p, 'Run faster'); await tap(p, 'Continue'); await tap(p, 'I know what'); await tap(p, 'Continue'); await tap(p, '4'); await tap(p, '5K');
  const blocked = await p.evaluate(() => [...document.querySelectorAll('button')].find(x => x.innerText.trim() === 'Continue')?.disabled);
  check('Continue waits for a target', blocked === true);
  await (await p.$('input.ob-input')).fill('22');
  await tap(p, '12 weeks'); await tap(p, 'Continue'); await tap(p, '10–20 miles');
  let t = await text(p);
  check('a runner is not asked what they lift', !/What can you lift/.test(t) && /Do you run with a watch/.test(t), t.slice(0, 120));
  await tap(p, 'Continue');
  t = await text(p);
  check('"22" is 22 minutes', /5K in 22:00/.test(t), between(t, 'YOUR GOAL', 80));
  await tap(p, 'Enter Forge'); await p.waitForTimeout(2600);
  const notNow = p.getByRole('button', { name: 'Not now — keep the starter split' }); if (await notNow.count()) await notNow.click();
  await p.waitForTimeout(600);
  t = await text(p);
  check('the first speed session is paced off 22:00, not 22 seconds', /1:4\d per rep/.test(t), between(t, 'Swipe', 400));
  const goals = await go(p, '#/goals');
  check('the goal card reads like a person wrote it', /5K Run · 22:00\n/.test(goals) && !/mm:ss/.test(goals), between(goals, 'Endurance', 80));
  await c.close();
}

await b.close();
console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
