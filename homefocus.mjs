/* THE HOME SCREEN IS TODAY'S SESSION. Two cards sat under it repeating what
   other tabs already own: LAST ACTIVITY, which is the History tab's whole job,
   and GOAL FOCUS, which is the Goals tab's. Neither was actionable — both were
   a summary with a link to the page that says it properly — and together they
   pushed the one thing the screen exists for above the fold and everything
   else below it. */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { days, setup, goals } from './seed.mjs';

let fails = 0;
const check = (l, c, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : '   → ' + d}`); if (!c) fails++; };

const home = readFileSync('src/pages/HomePage.tsx', 'utf8');
check('the support grid is gone from the page', !/feed-support-grid/.test(home));
check('and nothing styles it any more', !/feed-support-grid/.test(readFileSync('src/home-simple.css', 'utf8') + readFileSync('src/forge-system.css', 'utf8')));
/* Removing the cards without removing what fed them leaves the home screen
   sorting goals and scanning history on every render for nobody. */
check('the goal-ranking it fed is gone too', !/primaryGoal|goalReason|byNearestDate/.test(home));
check('the prior-workout lookup is gone too', !/priorWorkout|priorSets/.test(home));
check('the unused week totals went with them', !/weekTopSets|weekMiles/.test(home));
check('the goals provider is no longer read here', !/useGoals/.test(home));

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 950 } });
await p.addInitScript(([d, s, g]) => {
  localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
  localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
  localStorage.setItem('forge-goals', JSON.stringify(g));
  localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', minWeeklyMileage: 10, maxWeeklyMileage: 25, days: [
    { name: 'Chest & Back', weekday: 'MON', dayType: 'strength', muscles: ['Chest', 'Back'], exercises: ['Bench'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
    { name: 'Lower Body', weekday: 'TUE', dayType: 'strength', muscles: ['Quads', 'Hamstrings', 'Glutes'], exercises: ['Squat'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
  ] }));
}, [days, setup, goals]);
await p.goto('http://localhost:4191/#/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2400);

const text = await p.evaluate(() => document.body.innerText);
check('LAST ACTIVITY is off the home screen', !/LAST ACTIVITY/i.test(text), text.slice(0, 160));
check('GOAL FOCUS is off the home screen', !/GOAL FOCUS/i.test(text), text.slice(0, 160));
check('nothing is left rendering the grid', !(await p.$('.feed-support-grid')));

/* What remains has to still be the whole point of the screen. */
check("today's card survived", Boolean(await p.$('.today-focus-card')));
check('the greeting survived', /Good (morning|afternoon|evening)/.test(text), text.slice(0, 80));
check('starting the workout survived', /Start workout|Open workout/.test(text));
check('Change day survived', /Change day/.test(text));

/* And the two tabs that own this material are still one tap away. */
const nav = await p.evaluate(() => [...document.querySelectorAll('.bottom-nav a')].map(a => a.getAttribute('href')));
check('History is still in the nav', nav.some(href => /history/.test(href || '')), JSON.stringify(nav));
check('Goals are still reachable from the nav', nav.some(href => /goals|insights/.test(href || '')), JSON.stringify(nav));

/* The home screen should now be short enough that today is the screen. */
const belowCard = await p.evaluate(() => {
  const card = document.querySelector('.today-focus-card');
  const feed = document.querySelector('.forge-feed');
  if (!card || !feed) return null;
  return Math.round(feed.getBoundingClientRect().bottom - card.getBoundingClientRect().bottom);
});
check('nothing of substance sits under the card', (belowCard ?? 999) < 40, `${belowCard}px below`);

await b.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
