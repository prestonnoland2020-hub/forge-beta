/* THE PLAN, PULLED TOWARD WHAT YOU'VE DONE LATELY — one rule for everyone.

   Recent sets below old bests pull the ask two-thirds of the way down; recent
   sets at or above them never hold a lifter back; reps left in the tank count. */
const store = {}; globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
const { bestsFromHistory, wavePrescription } = await import('./src/features/training/aiPlanService.ts');
const { setEffort } = await import('./src/lib/setEffort.ts');

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`); if (!ok) fails += 1; };
const iso = days => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); };
const ask = (rows, week) => {
  const records = rows.map(([ago, weight, reps]) => ({ date: iso(ago), topSets: [{ lift: 'Bench', weight, reps, completed: true }] }));
  const h = bestsFromHistory(records, iso(0)); const k = [...h.bests.keys()][0];
  const plan = wavePrescription(h.bests.get(k), week, { anchors: h.anchors.get(k), lastAt: h.lastAt.get(k) });
  const now = wavePrescription(h.bests.get(k), week, { anchors: h.anchors.get(k), lastAt: h.lastAt.get(k), latest: h.latest.get(k) });
  return { plan: plan.weight, now: now.weight, reps: now.reps };
};

console.log('\nRecent sets below old bests');
const slipping = [[100, 230, 3], [99, 225, 4], [40, 225, 3], [33, 205, 8], [6, 215, 3]];
const four = ask(slipping, 2);
check('the four-rep week sits between the old plan and the recent sets', four.now < four.plan && four.now > 205, `${four.plan} -> ${four.now}`);
check('nearer the recent sets than the old best', four.plan - four.now >= 10, `${four.plan} -> ${four.now}`);

console.log('\nA lifter moving up');
const climbing = [[35, 205, 4], [21, 215, 4], [7, 225, 4]];
const up = ask(climbing, 2);
check('is never held back', up.now >= up.plan, `${up.plan} -> ${up.now}`);

console.log('\nReps left in the tank');
const before = ask(slipping, 2).now;
setEffort(iso(6), 'Bench', 'easy');
check('an easy last set asks for more', ask(slipping, 2).now >= before, `${before} -> ${ask(slipping, 2).now}`);

console.log('\nOld sets only');
const stale = ask([[90, 230, 3], [80, 225, 4]], 2);
check('nothing in eight weeks: the plan stands', stale.now === stale.plan, `${stale.plan} -> ${stale.now}`);

console.log('\nTwo weeks of lighter weights and grinders');
const hardDays = [[60, 235, 4], [50, 240, 4], [12, 225, 4], [5, 225, 4]];
const normal = ask(hardDays, 2).now;
setEffort(iso(12), 'Bench', 'hard'); setEffort(iso(5), 'Bench', 'hard');
const dialed = ask(hardDays, 2).now;
check('dials it back below the lighter sets', dialed < 225 && dialed < normal, `${normal} -> ${dialed}`);

console.log('\nTwo months with no new best');
const stalled = ask([[200, 250, 4], [55, 235, 4], [40, 235, 4], [26, 230, 4], [12, 235, 4]], 2);
check('restarts below the old best, from the last two months', stalled.now < stalled.plan && stalled.now <= 235, `${stalled.plan} -> ${stalled.now}`);
const fresh = ask([[200, 250, 4], [55, 240, 4], [40, 245, 4], [26, 250, 4], [12, 255, 4]], 2);
check('a new best in those months: no restart', fresh.now >= fresh.plan, `${fresh.plan} -> ${fresh.now}`);

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall passed');
