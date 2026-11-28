/* Guided: a bodyweight workout shows its moves on Today and in the Logbook.
   Run: npx vite-node guidedbwlog.mjs */
const { bodyweightLines, moveNote } = await import('./src/lib/guided/notes.ts');
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`); if (!ok) fails += 1; };
const notes = 'Forge Guided · Full body. ' + [
  moveNote('Bodyweight squat', [{ reps: 12, weight: null }, { reps: 14, weight: null }, { reps: 14, weight: null }], 'lb'),
  moveNote('Push-up', [{ reps: 12, weight: null }, { reps: 12, weight: null }], 'lb'),
  moveNote('Plank', [{ reps: 30, weight: null, timed: true }, { reps: 40, weight: null, timed: true }], 'lb'),
  moveNote('Goblet squat', [{ reps: 10, weight: 15 }, { reps: 10, weight: 20 }], 'lb'),
  moveNote('Barbell Row', [{ reps: 5, weight: 45 }], 'lb'),
].join(' · ');
const lines = bodyweightLines(notes);
const j = JSON.stringify(lines);
check('three bodyweight moves, no loaded ones', lines.length === 3 && !lines.some(l => /Goblet|Row/.test(l.name)), j);
check('varied reps listed per set', lines[0]?.detail === '12, 14, 14 reps', j);
check('same reps written out per set', lines[1]?.detail === '12, 12 reps', j);
check('timed sets keep seconds', lines[2]?.detail === '30s, 40s', j);
check('coached plan day too', bodyweightLines('Coached · Chest & Back. Push-up 3×10').length === 1);
check('a hand-written note is left alone', bodyweightLines('Felt good 3×10').length === 0 && bodyweightLines(undefined).length === 0);
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
