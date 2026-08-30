/* A scheduled rest day is shown, not skipped — and it advances on its own. */
import { chromium } from 'playwright';
import { setup } from './seed.mjs';
const splitDays = [
  { name: 'Chest & Back', type: 'Strength', muscles: ['Chest','Back'], exercises: ['Bench'] },
  { name: 'Legs', type: 'Strength', muscles: ['Quads','Hamstrings','Glutes'], exercises: ['Squat'] },
  { name: 'Sharms 2', type: 'Strength', muscles: ['Shoulders','Biceps','Triceps'], exercises: ['Smith Machine Shoulder Press'] },
  { name: 'Rest', type: 'Rest', muscles: [], exercises: [] },
];
const athlete = { ...setup, splitDays };
const dayIso = back => { const d = new Date(); d.setDate(d.getDate() - back); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const logged = (date, position, title, muscle, lift) => ({ id: `d-${date}`, date, title, muscles: [muscle], splitPosition: position, splitId: 'split-1',
  topSets: [{ id: `t-${date}`, muscle, lift, weight: 200, reps: 5, completed: true, calculatedMax: 233 }], lift, weight: 200, reps: 5, calculatedMax: 233, hasCardio: false, cardioSessions: [] });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fails = 0;
const check = (l, c, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : '   → ' + d}`); if (!c) fails++; };
const dueDay = async (records, cursor) => {
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  p.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 160)));
  await p.addInitScript(([r, s, sd, c]) => {
    localStorage.setItem('forge-workout-history-v1', JSON.stringify(r));
    localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
    /* A goal is now part of being set up — the onboarding gate routes a
     goal-less athlete into the goal step, so every fixture needs one. */
    localStorage.setItem('forge-goals', JSON.stringify([{ type: 'Strength', title: '510 lb Squat', target: '510 lb', date: '2026-12-01', connection: 'Quads', exercise: 'Squat', metric: 'Real 1RM', unit: 'lb' }]));
    localStorage.setItem('forge-split-cycle-v1', JSON.stringify({ nextPosition: c, revision: 1 }));
    const wk = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
    localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', minWeeklyMileage: 0, maxWeeklyMileage: 0,
      days: sd.map((day, i) => ({ name: day.name, weekday: wk[i % 7], dayType: day.type.toLowerCase(), muscles: day.muscles, exercises: day.exercises, cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' })) }));
  }, [records, athlete, splitDays, cursor]);
  await p.goto('http://localhost:4191/#/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2200);
  const text = await p.evaluate(() => document.body.innerText);
  const day = text.match(/NEXT IN YOUR SPLIT\n(.+)/)?.[1] || text.match(/TODAY · [A-Z]+\n(.+)/)?.[1] || '(none)';
  await p.close();
  return { day, text };
};
// trained yesterday, cursor now on the Rest day → rest is due TODAY
{
  const { day, text } = await dueDay([logged(dayIso(1), 3, 'Sharms 2', 'Shoulders', 'Smith Machine Shoulder Press')], 4);
  console.log('   trained yesterday, cursor on Rest →', day);
  check('the rest day is shown, not skipped', /Rest/i.test(day), day);
  check('no lift is prescribed on it', !/lb ×/.test(text.split('LAST ACTIVITY')[0] || ''), (text.split('LAST ACTIVITY')[0]||'').slice(0, 140));
}
// two days on, the rest has been had → next training day is up
{
  const { day } = await dueDay([logged(dayIso(2), 3, 'Sharms 2', 'Shoulders', 'Smith Machine Shoulder Press')], 4);
  console.log('   trained two days ago, cursor on Rest →', day);
  check('rest advances on its own the next day', /Chest & Back/i.test(day), day);
}
/* ONLY A SPLIT DAY MOVES THE PLAN. A walk is not training the split, so it
   cannot decide anything about where the cursor sits — neither ageing a rest
   day out nor reviving one that has already been had. The old rule counted
   ANY logged row, so a Saturday walk reset the clock and the plan answered
   differently for it. */
const strayCardio = (date, activity) => ({ id: `w-${date}`, date, title: activity, muscles: ['Cardio'],
  hasCardio: true, cardioSessions: [{ id: `s-${date}`, structure: 'steady', activity, summary: `${activity} \u00b7 1 mi \u00b7 20:00`,
    prescription: { legacyIntervals: [{ cardioType: activity, unit: 'miles', distance: 1, time: 20 }], distanceUnit: 'miles' } }],
  topSets: [] });
{
  /* The rest day was had days ago. A walk yesterday cannot revive it — under
     the old any-row rule it did, and the plan sat on Rest indefinitely for an
     athlete who only ever walked. */
  const { day } = await dueDay([
    logged(dayIso(3), 3, 'Sharms 2', 'Shoulders', 'Smith Machine Shoulder Press'),
    strayCardio(dayIso(1), 'Walk'),
  ], 4);
  console.log('   split day 3 days ago, walk yesterday, cursor on Rest \u2192', day);
  check('a walk cannot revive a rest day already had', /Chest & Back/i.test(day), day);
}
{
  /* The invariant itself: the same split history answers the same way whether
     or not a walk sits beside it. */
  const withoutWalk = await dueDay([logged(dayIso(2), 3, 'Sharms 2', 'Shoulders', 'Smith Machine Shoulder Press')], 4);
  const withWalk = await dueDay([
    logged(dayIso(2), 3, 'Sharms 2', 'Shoulders', 'Smith Machine Shoulder Press'),
    strayCardio(dayIso(1), 'Walk'),
  ], 4);
  console.log(`   same history with and without a walk \u2192 ${withoutWalk.day} / ${withWalk.day}`);
  check('a walk changes nothing about what is due', withoutWalk.day === withWalk.day, `${withoutWalk.day} / ${withWalk.day}`);
}
{
  /* Two days with no SPLIT day at all \u2014 the rest day has genuinely passed. */
  const { day } = await dueDay([
    logged(dayIso(3), 3, 'Sharms 2', 'Shoulders', 'Smith Machine Shoulder Press'),
  ], 4);
  console.log('   no split day for 3 days, cursor on Rest \u2192', day);
  check('rest still steps aside when no split day has happened', /Chest & Back/i.test(day), day);
}
// a normal training cursor is untouched
{
  const { day } = await dueDay([logged(dayIso(1), 1, 'Chest & Back', 'Chest', 'Bench')], 2);
  console.log('   cursor on a training day →', day);
  check('training days are unaffected', /Legs/i.test(day), day);
}
await b.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
