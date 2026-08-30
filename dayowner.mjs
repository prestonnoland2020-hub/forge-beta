/* WHICH GOAL LIFT OWNS A DAY CANNOT DEPEND ON ARRAY ORDER. "Chest & Back"
   maps Bench and Pull Ups — both goal lifts — and appears twice in the cycle.
   Taking the FIRST match meant the owner was whatever order the exercises
   happened to be stored in, and the two instances were stored in OPPOSITE
   orders: Chest & Back prescribed Bench, Chest & Back 2 prescribed Pull Ups,
   for what is one day. Reordering the list in the plan editor changed the
   prescription underneath the athlete. */
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`PASS  ${n}`); } else { fail++; console.log(`FAIL  ${n} ${d}`); } };

const src = readFileSync('src/features/training/aiPlanService.ts', 'utf8');
check('ownership no longer takes the first match it finds', !/const owner = \(day\.exercises \|\| \[\]\)\.find\(/.test(src));
check('instances of a day are folded together', /instancesOfDay/.test(src));
check('a day\'s goal lifts are sorted canonically', /sort\(\(a, b\) => canonicalLiftKey\(a\)\.localeCompare\(canonicalLiftKey\(b\)\)\)/.test(src));
check('owners are handed out round-robin by instance', /owners\[index % owners\.length\]/.test(src));

/* Reproduce the assignment with Preston's real split, in the exact order each
   instance is stored — which is reversed between the two. */
const canonical = name => name.trim().toLowerCase();
const splitDayKey = name => name.trim().toLowerCase().replace(/\s*(?:#\s*)?\d+$/, '');
const goalLifts = new Set(['bench', 'pull ups', 'squat']);

const assign = days => {
  const instances = new Map();
  days.forEach(day => {
    const key = splitDayKey(day.name);
    instances.set(key, [...(instances.get(key) || []), day.name]);
  });
  const owners = new Map();
  days.forEach(day => {
    const key = splitDayKey(day.name);
    const owned = (day.exercises || []).filter(name => goalLifts.has(canonical(name)));
    const merged = new Map();
    [...(owners.get(key) || []), ...owned].forEach(name => merged.set(canonical(name), name));
    owners.set(key, [...merged.values()].sort((a, b) => canonical(a).localeCompare(canonical(b))));
  });
  const out = new Map();
  instances.forEach((names, key) => {
    const list = owners.get(key) || [];
    if (!list.length) return;
    names.forEach((name, index) => out.set(name, list[index % list.length]));
  });
  return out;
};

const split = [
  { name: 'Chest & Back', exercises: ['Bench', 'Smith Machine Incline Bench', 'Pull Ups', 'Lat Pulldown'] },
  { name: 'Legs', exercises: ['Hack Squat', 'Squat', 'Smith Machine Squat'] },
  { name: 'Sharms', exercises: ['Smith Machine Shoulder Press'] },
  { name: 'Long Run', exercises: [] },
  /* Stored in the REVERSE order — the whole cause of the contradiction. */
  { name: 'Chest & Back 2', exercises: ['Lat Pulldown', 'Pull Ups', 'Smith Machine Incline Bench', 'Bench'] },
  { name: 'Legs 2', exercises: ['Smith Machine Squat', 'Squat', 'Hack Squat'] },
  { name: 'Sharms 2', exercises: ['Smith Machine Shoulder Press'] },
  { name: 'Rest', exercises: [] },
];
const owners = assign(split);

check('Chest & Back takes one of its two goal lifts', ['Bench', 'Pull Ups'].includes(owners.get('Chest & Back')), owners.get('Chest & Back'));
check('Chest & Back 2 takes the OTHER one', owners.get('Chest & Back 2') !== owners.get('Chest & Back'), `${owners.get('Chest & Back')} / ${owners.get('Chest & Back 2')}`);
check('both goal lifts on that day get an exposure', new Set([owners.get('Chest & Back'), owners.get('Chest & Back 2')]).size === 2);
check('a day with one goal lift owns every instance', owners.get('Legs') === 'Squat' && owners.get('Legs 2') === 'Squat', `${owners.get('Legs')} / ${owners.get('Legs 2')}`);
check('a non-goal squat variant never claims the day', !['Hack Squat', 'Smith Machine Squat'].includes(owners.get('Legs')));
check('a day with no goal lift claims none', !owners.has('Sharms') && !owners.has('Long Run') && !owners.has('Rest'));

/* Reordering the stored list must not change a single prescription. */
const shuffled = split.map(day => ({ ...day, exercises: [...(day.exercises || [])].reverse() }));
const reordered = assign(shuffled);
const same = [...owners.entries()].every(([day, lift]) => reordered.get(day) === lift);
check('reordering the exercise list changes nothing', same,
  JSON.stringify([...reordered.entries()].filter(([d, l]) => owners.get(d) !== l)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
