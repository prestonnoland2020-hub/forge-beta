/* THE HEADER ACTION HAS TO DO SOMETHING. The slot beside "NEXT IN YOUR SPLIT"
   held a circular regenerate button. Today's card is a pure derivation — the
   split position, the block's prescription for that day, the athlete's logged
   bests — so there was nothing to re-roll: pressing it rewrote the identical
   card and the screen never changed. It also rendered as an oval, a 30px
   circle stretched to 44 by the flex header.

   The want behind it was "today is not the day I want to train", and the log's
   From Split mode answers exactly that. The completed card puts Edit in this
   same slot; this is the same kind of link doing the same kind of job. */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { days, setup, goals } from './seed.mjs';

let fails = 0;
const check = (l, c, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : '   → ' + d}`); if (!c) fails++; };

const home = readFileSync('src/pages/HomePage.tsx', 'utf8');
check('the dead regenerate button is gone from the card', !/today-regen/.test(home));
check('nothing styles it any more', !/today-regen/.test(readFileSync('src/forge-system.css', 'utf8')));
check('the card no longer takes a refresh it cannot use', !/setCardioSelected, refresh/.test(home));

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

check('no dead button is left on the screen', !(await p.$('.today-regen')));

const link = await p.evaluate(() => {
  const el = [...document.querySelectorAll('.today-focus-card .feed-card-header a')][0];
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const header = document.querySelector('.today-focus-card .feed-card-header').getBoundingClientRect();
  return { text: el.textContent.trim(), href: el.getAttribute('href'), tall: Math.round(rect.height), rightAligned: Math.abs(rect.right - (header.right - 22)) < 12 };
});
check('the header offers an action in that slot', Boolean(link), 'none found');
check('it says what it does', link?.text === 'Change day', link?.text);
check('it goes where the athlete picks a split day', link?.href === '#/workout?source=split', link?.href);
check('it is a tap target, not a 30px sliver', (link?.tall || 0) >= 40, `${link?.tall}px`);
check('it sits at the end of the header, like Edit does', link?.rightAligned === true);

/* And the destination really is the day picker. */
await p.evaluate(() => [...document.querySelectorAll('.today-focus-card .feed-card-header a')][0].click());
await p.waitForTimeout(2200);
check('the log opens on From Split', /source=split/.test(p.url()), p.url());
const modes = await p.evaluate(() => [...document.querySelectorAll('.source-mode, .workout-source button, .source-modes button')].map(el => el.textContent.trim()));
const text = await p.evaluate(() => document.body.innerText);
check('and the split day chooser is what is showing', /split/i.test(text), JSON.stringify(modes).slice(0, 120));

await b.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
