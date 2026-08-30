/* OPENING THE APP MEANS TODAY. The hash survives whatever closed the app — a
   backgrounded tab, a home-screen shortcut saved from wherever the athlete
   happened to be — so someone who last looked at Plan opened Forge on Plan
   days later. The app's answer to "what now" lives on Today. */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { days, setup, goals } from './seed.mjs';

let fails = 0;
const check = (l, c, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : '   → ' + d}`); if (!c) fails++; };

const main = readFileSync('src/main.tsx', 'utf8');
check('a reload is not a launch', /launch === 'navigate'/.test(main));
check('a deep link with a query is left alone', /!launchQuery/.test(main));
check('the OAuth return still reaches Profile', /callbackQuery\.get\('strava'\) !== 'callback'/.test(main));
check('login is never redirected away from', /login\|auth/.test(main));

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 950 } });
await p.addInitScript(([d, s, g]) => {
  localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
  localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
  localStorage.setItem('forge-goals', JSON.stringify(g));
  localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', minWeeklyMileage: 10, maxWeeklyMileage: 25, days: [
    { name: 'Chest & Back', weekday: 'MON', dayType: 'strength', muscles: ['Chest', 'Back'], exercises: ['Bench'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
  ] }));
}, [days, setup, goals]);

/* Launching on the route the last visit left behind. */
await p.goto('http://localhost:4191/#/plan', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2600);
check('a launch on Plan lands on Today', p.url().endsWith('#/'), p.url());
const text = await p.evaluate(() => document.body.innerText);
check('and Today is what is showing', /Today’s training|Today's training/.test(text), text.slice(0, 90));

/* Moving around inside the app is untouched. */
await p.evaluate(() => { const el = [...document.querySelectorAll('.bottom-nav a')].find(a => /plan/i.test(a.getAttribute('href') || '')); el?.click(); });
await p.waitForTimeout(1500);
check('navigating to Plan still works', p.url().endsWith('#/plan'), p.url());

/* A reload keeps its place — a developer checking a deploy on Plan stays. */
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2400);
check('a reload does not bounce you to Today', p.url().endsWith('#/plan'), p.url());

/* A deep link someone followed on purpose is honoured. */
await p.goto('http://localhost:4191/#/workout?source=split', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2400);
check('a deep link with a query survives the launch', /source=split/.test(p.url()), p.url());

/* NEVER THE LOG. It is the one screen holding work that is not saved yet, so a
   phone reloading a backgrounded tab must not throw a half-typed session away. */
await p.goto('http://localhost:4191/#/workout', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2400);
check('a launch on the log stays on the log', p.url().endsWith('#/workout'), p.url());

/* And a launch already on Today changes nothing. */
await p.goto('http://localhost:4191/#/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2200);
check('a launch on Today stays on Today', p.url().endsWith('#/'), p.url());

await b.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
