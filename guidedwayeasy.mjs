/* Guided: "way too easy" or Too easy twice in a row jumps two steps, bounded.
   Run: npx vite-node guidedwayeasy.mjs */
const { nextWeight, easyStreak } = await import('./src/lib/guided/builder.ts');
const { saidWayEasy, parseCommand } = await import('./src/lib/guided/voice.ts');
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

check('plain easy is still one 5 lb step', nextWeight(20, 'easy', 'dumbbell', false) === 25);
check('way easy dumbbell 20 → 30 (two steps)', nextWeight(20, 'easy', 'dumbbell', false, { steps: 2 }) === 30);
check('way easy barbell 100 → 120 (two 10 lb steps)', nextWeight(100, 'easy', 'barbell', false, { steps: 2 }) === 120);
check('way easy metric dumbbell 10 → 14', nextWeight(10, 'easy', 'dumbbell', true, { steps: 2 }) === 14);
check('never more than two steps', nextWeight(20, 'easy', 'dumbbell', false, { steps: 2, best: 500 }) === 30);
check('second step held to ~10% over the best lifted (best 27 → cap 29.7 → 25... first step still allowed)', nextWeight(20, 'easy', 'dumbbell', false, { steps: 2, best: 27 }) === 25, String(nextWeight(20, 'easy', 'dumbbell', false, { steps: 2, best: 27 })));
check('best 30 lets the two-step land on 30 (cap 33 → 30)', nextWeight(20, 'easy', 'dumbbell', false, { steps: 2, best: 30 }) === 30);
check('best equal to today weight still gives the one normal step', nextWeight(20, 'easy', 'dumbbell', false, { steps: 2, best: 20 }) === 25);
check('no weight stays null', nextWeight(null, 'easy', 'dumbbell', false, { steps: 2 }) === null);
check('hard ignores the jump and keeps the barbell floor', nextWeight(45, 'hard', 'barbell', false, { steps: 2 }) === 45);

for (const said of ['way too easy', 'that was way too easy', 'much too easy', 'way too light', 'far too easy', 'Way too easy!'])
  check(`"${said}" is way easy and still reads as Too easy`, saidWayEasy(said) && parseCommand(said) === 'easy', parseCommand(said));
for (const said of ['too easy', 'easy', 'too hard', 'just right', 'not too easy'])
  check(`"${said}" is not way easy`, !saidWayEasy(said) || said === 'not too easy' && false);

const logged = [{ moveId: 'db-row', feel: 'easy' }, { moveId: 'goblet', feel: 'hard' }];
check('Too easy after a Too easy on the same move is a streak', easyStreak(logged, 'db-row'));
check('a different move has no streak', !easyStreak(logged, 'goblet') && !easyStreak(logged, 'db-rdl'));
check('Too easy after a Just right is no streak', !easyStreak([{ moveId: 'db-row', feel: 'right' }], 'db-row'));
console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails ? 1 : 0);
