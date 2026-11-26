/* Guided: Too easy / Too hard on a bodyweight set changes the move or the reps.
   Run: npx vite-node guidedbodyweight.mjs */
const { bodyweightNext } = await import('./src/lib/guided/builder.ts');
const { MOVE } = await import('./src/lib/guided/catalog.ts');
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const step = (id, reps = 12, part = 'main') => ({ move: MOVE(id), sets: 3, reps, weight: null, rest: 45, part });
const none = new Set(['none']); const dbs = new Set(['none', 'dumbbell', 'mat']);
const j = x => JSON.stringify(x && { move: x.move?.id, reps: x.reps });
let r;
r = bodyweightNext(step('incline-pushup'), 'easy', false, none); check('easy incline push-up → push-up', r?.move?.id === 'pushup', j(r));
r = bodyweightNext(step('glute-bridge'), 'easy', false, none); check('easy glute bridge → single-leg bridge', r?.move?.id === 'single-leg-bridge', j(r));
r = bodyweightNext(step('bodyweight-squat'), 'easy', false, dbs); check('easy squat with dumbbells stays bodyweight, +2 reps (no surprise weight)', !r?.move && r?.reps === 14, j(r));
r = bodyweightNext(step('bodyweight-squat'), 'easy', false, none); check('easy squat at home → 14 reps', r?.reps === 14 && !r.move, j(r));
r = bodyweightNext(step('bodyweight-squat', 20), 'easy', false, none); check('capped at 20 reps', r === null, j(r));
r = bodyweightNext(step('bodyweight-squat'), 'hard', false, none); check('hard squat, no easier version → 10 reps', r?.reps === 10, j(r));
r = bodyweightNext(step('pushup'), 'hard', false, none); check('hard push-up → incline push-up', r?.move?.id === 'incline-pushup', j(r));
r = bodyweightNext(step('pushup'), 'hard', true, none); check('hard on the last set still swaps (as before)', r?.move?.id === 'incline-pushup', j(r));
r = bodyweightNext(step('bodyweight-squat'), 'easy', true, none); check('last set: no rep change', r === null, j(r));
r = bodyweightNext(step('bodyweight-squat'), 'right', false, none); check('just right: nothing', r === null, j(r));
r = bodyweightNext(step('bodyweight-squat', 12, 'warmup'), 'easy', false, none); check('warm-up: nothing', r === null, j(r));
const plank = Object.values(await import('./src/lib/guided/catalog.ts')).find(Array.isArray).find(m => m.timed && m.load === 'none' && !m.harder);
r = bodyweightNext({ ...step(plank.id, 20) }, 'easy', false, none); check(`timed ${plank.id} 20 sec easy → 30 sec`, r?.reps === 30, j(r));
r = bodyweightNext({ ...step(plank.id, 20) }, 'hard', false, none); check(`timed ${plank.id} 20 sec hard → 15 sec floor`, r?.reps === 15 || (plank.easier && r?.move), j(r));
r = bodyweightNext({ ...step('goblet-squat'), weight: null }, 'easy', false, dbs); check('loaded move with no weight: nothing on easy', r === null, j(r));
console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails ? 1 : 0);
