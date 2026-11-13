/* THE HEADER ACTION HAS TO DO SOMETHING. The slot beside "UP NEXT"
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

const chips = await p.evaluate(() => {
  const ask = document.querySelector('.today-focus-card .tp-ask');
  const els = [...document.querySelectorAll('.today-focus-card .tp-chips button')];
  return { ask: ask?.textContent.trim(), names: els.map(e => e.textContent.trim()), tall: Math.min(...els.map(e => Math.round(e.getBoundingClientRect().height))), on: els.findIndex(e => e.getAttribute('aria-checked') === 'true') };
});
check('the card asks what you are training', chips.ask === 'What are you training today?', chips.ask);
check('every split day is a chip', chips.names.length >= 2, JSON.stringify(chips.names));
check('the suggested day comes first and is picked', chips.on === 0 && /Suggested/.test(chips.names[0] || ''), JSON.stringify(chips));
check('chips are tap targets', chips.tall >= 32, `${chips.tall}px`);

/* Tap the other day, then start: the log opens on that day. */
await p.evaluate(() => document.querySelectorAll('.today-focus-card .tp-chips button')[1].click());
await p.waitForTimeout(600);
const picked = await p.evaluate(() => [...document.querySelectorAll('.today-focus-card .tp-chips button')].findIndex(e => e.getAttribute('aria-checked') === 'true'));
check('one tap switches the day', picked === 1, String(picked));
const start = await p.evaluate(() => { const a = [...document.querySelectorAll('.today-focus-card a')].find(e => /source=split/.test(e.getAttribute('href') || '')); return a?.getAttribute('href'); });
check('start goes to that split day', /source=split&day=\d+&dayName=/.test(start || ''), start);
await b.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
