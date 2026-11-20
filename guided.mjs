/* FORGE GUIDED: the builder makes safe, fitting workouts; the coach hears
   short commands; the weights follow how each set felt. */
import { MUST_HIT, customWorkout, buildWorkout, nextWeight, owned, canDo, suggestFocus, estimateMinutes, startWeight } from './src/lib/guided/builder.ts';
import { parseCommand, matchCommand, normalizePhrase, parseSetReport } from './src/lib/guided/voice.ts';
import { MOVES } from './src/lib/guided/catalog.ts';
import { planWorkout } from './src/lib/guided/fromPlan.ts';
import { existsSync } from 'node:fs';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`); if (!ok) fails += 1; };

check('every move has both photos on disk', MOVES.every(m => existsSync(`public/exercises/${m.photo}/0.jpg`) && existsSync(`public/exercises/${m.photo}/1.jpg`)), MOVES.filter(m => !existsSync(`public/exercises/${m.photo}/1.jpg`)).map(m => m.id).join());
check('every move has muscles for the map', MOVES.every(m => m.map.primary.length));
check('swaps point at real moves', MOVES.every(m => [m.easier, m.harder].filter(Boolean).every(id => MOVES.some(x => x.id === id))));

const home = { styles: ['Pilates', 'Build muscle'], vibe: ['Low impact'], place: 'Home', gear: ['Dumbbells', 'Mat'], level: 'New to this' };
const w = buildWorkout(home, 30, 'Glutes & core', { seed: 7 });
const have = owned(home);
check('30 min = warm-up + 5 main + cool-down', w.steps.filter(s => s.part === 'main').length === 5 && w.steps[0].part === 'warmup' && w.steps.at(-1).part === 'cooldown', w.steps.map(s => `${s.part}:${s.move.id}`).join());
check('only moves she has the gear for', w.steps.every(s => canDo(s.move, have)), w.steps.map(s => s.move.id).join());
check('no gym machines at home', !w.steps.some(s => s.move.equip.includes('gym')));
check('no repeats in one workout', new Set(w.steps.map(s => s.move.id)).size === w.steps.length);
check('beginners get 2–3 sets, never more', w.steps.filter(s => s.part === 'main').every(s => s.sets >= 2 && s.sets <= 3));
check('30 min is about 30 min', Math.abs(estimateMinutes(w) - 30) <= 8, String(estimateMinutes(w)));
check('dumbbell moves get a starting weight', w.steps.filter(s => s.move.load === 'dumbbell').every(s => s.weight === 10), w.steps.map(s => `${s.move.id}:${s.weight}`).join());
check('no-weight moves have none', w.steps.filter(s => s.move.load === 'none').every(s => s.weight === null));
check('the estimate is in the right range', estimateMinutes(w) >= 15 && estimateMinutes(w) <= 45, String(estimateMinutes(w)));

const nothing = buildWorkout({ ...home, place: 'Anywhere', gear: [] }, 20, 'Upper body', { seed: 3 });
check('anywhere: bodyweight only', nothing.steps.every(s => s.move.equip.every(e => e === 'none')), nothing.steps.map(s => s.move.id).join());
check('anywhere still builds a workout', nothing.steps.filter(s => s.part === 'main').length >= 2, nothing.steps.map(s => s.move.id).join());

const gym = buildWorkout({ styles: ['Strength'], vibe: [], place: 'Gym', gear: [], level: 'Comfortable' }, 60, 'Full body', { seed: 11 });
check('60 min gym = 7 main moves', gym.steps.filter(s => s.part === 'main').length === 7, String(gym.steps.length));
check('machines say start light, not a guessed number', gym.steps.filter(s => s.move.load === 'machine').every(s => s.weight === null && /Start light/.test(s.weightNote || '')));
check('remembered weights are used', startWeight(MOVES.find(m => m.id === 'goblet-squat'), 'New to this', { 'goblet-squat': 25 }, false).weight === 25);
check('metric starts in kilos', startWeight(MOVES.find(m => m.id === 'goblet-squat'), 'New to this', {}, true).weight === 4);

check('too easy adds 5 lb', nextWeight(15, 'easy', 'dumbbell', false) === 20);
check('too hard takes 5 off', nextWeight(15, 'hard', 'dumbbell', false) === 10);
check('never below one step', nextWeight(5, 'hard', 'dumbbell', false) === 5);
check('just right keeps it', nextWeight(15, 'right', 'dumbbell', false) === 15);
check('no weight stays none', nextWeight(null, 'easy', 'none', false) === null);

const stretch = buildWorkout(home, 20, 'Stretch it out', { seed: 1 });
check('stretch day has no weights', stretch.steps.every(s => s.weight === null));
check('focus rotates', suggestFocus('Glutes & core', home) !== 'Glutes & core');

const heard = [['I\'m done', 'done'], ['done!', 'done'], ['finished', 'done'], ['that was too easy', 'easy'], ['easy', 'easy'], ['just right', 'right'], ['perfect', 'right'], ['too hard', 'hard'], ['that was heavy', 'hard'], ['ready', 'ready'], ["let's go", 'ready'], ['I need more rest', 'more'], ['not ready', 'more'], ['how do I do this', 'how'], ['show me', 'how'], ['make it easier', 'easier'], ['harder', 'harder'], ['say that again', 'repeat'], ['pause', 'pause'], ['end workout', 'end'], ['go heavier', 'heavier'], ['skip', 'skip'], ['banana', null]];
for (const [text, want] of heard) check(`"${text}" → ${want}`, parseCommand(text) === want, String(parseCommand(text)));
for (const [text, want] of [['coach, why is it 15 pounds', 'ask'], ['hey coach is this too hard', 'ask'], ['ask coach what is next', 'ask'], ['coach', 'ask']]) check(`"${text}" → ${want}`, parseCommand(text) === want, String(parseCommand(text)));
check('the coach question is asked before command words', parseCommand('coach, is this too hard for me') === 'ask');
const coachPage = (await import('node:fs')).readFileSync('src/pages/CoachPage.tsx', 'utf8');
check('the Ask Forge coach is told about Guided', /guided:guidedCoachContext\(\)/.test(coachPage));
/* Learning her voice */
check('common mishear: "dawn" is done', matchCommand('dawn', ['done', 'how'])?.command === 'done');
check('common mishear: "two easy" is too easy', matchCommand('two easy', ['easy', 'right', 'hard'])?.command === 'easy');
check('common mishear: "radio" is ready in rest', matchCommand('radio', ['ready', 'more'])?.command === 'ready');
check('near miss: "redy" is ready', matchCommand('redy', ['ready', 'more'])?.command === 'ready');
check('near miss: "jist right" is just right', matchCommand('jist right', ['easy', 'right', 'hard'])?.command === 'right');
check('a taught phrase works next time', matchCommand('dumbbell', ['done'], { dumbbell: 'done' })?.how === 'learned');
check('taught phrases respect the moment', matchCommand('dumbbell', ['easy', 'right', 'hard'], { dumbbell: 'done' }) === null);
check('a sentence is not a near miss', matchCommand('my neighbor is really noisy today honestly', ['ready', 'more']) === null);
check('chatter is not a command', matchCommand('what time is it', ['done', 'how', 'skip']) === null);
const CARD = ['ask', 'done', 'ready', 'start', 'how', 'easier', 'harder', 'heavier', 'lighter', 'repeat', 'skip', 'pause', 'resume', 'end'];
check('counting reps out loud never ends the set', ['one', 'gone', 'none', 'one two three'].every(t => matchCommand(t, CARD) === null), ['one', 'gone', 'none'].map(t => `${t}:${matchCommand(t, CARD)?.command}`).join());
check('"not done yet" and "don\'t skip" move nothing', ["not done yet", "I'm not done", "don't skip", "not ready"].every(t => matchCommand(t, CARD) === null));
check('"not ready" in the rest still asks for more time', matchCommand('not ready', ['ready', 'more'])?.command === 'more');
check('background talk never moves the workout', ['I was going to go to the store', 'play the next song now', 'we should go get food after this'].every(t => matchCommand(t, ['ready', 'more', 'skip', 'done']) === null), ['I was going to go to the store'].map(t => matchCommand(t, ['ready'])?.command).join());
check('short "next" / "go" still mean ready', ['next', 'go go go', 'next one please'].every(t => matchCommand(t, ['ready', 'more'])?.command === 'ready'));
check('"not too hard" is just right; "it wasn\'t easy" sets nothing', matchCommand('not too hard', ['easy', 'right', 'hard'])?.command === 'right' && matchCommand("it wasn't easy", ['easy', 'right', 'hard']) === null);
check('"that felt good" in a sentence is just right', matchCommand('yeah that felt good', ['easy', 'right', 'hard'])?.command === 'right');
{ const first = planWorkout('Chest & Back', [{ exercise: 'Barbell Row', muscle: 'Back', weight: 0, reps: 5 }, { exercise: 'Bench Press', muscle: 'Chest', weight: 0, reps: 0 }, { exercise: 'Incline Dumbbell Press', muscle: 'Chest', weight: 0, reps: 10, sets: 3, accessory: true }, { exercise: 'Pull Ups', muscle: 'Back', weight: 0, reps: 5 }], false);
  const by = name => first.steps.find(s => s.move.name === name);
  check('a first barbell lift from the plan starts at the empty bar, so it gets logged', by('Barbell Row').weight === 45 && by('Bench Press').weight === 45, `${by('Barbell Row').weight}/${by('Bench Press').weight}`);
  check('a first dumbbell lift from the plan starts light, not at 45', by('Incline Dumbbell Press').weight === 10, String(by('Incline Dumbbell Press').weight));
  check('a bodyweight lift from the plan stays weightless', by('Pull Ups').weight === null); }
check('real mishearings still land', matchCommand('redy')?.command === 'ready' && matchCommand('finised')?.command === 'done' && matchCommand('jest right')?.command === 'right');
check('phrases are stored plainly', normalizePhrase("I'm  DONE!") === 'im done');
check('feel step only hears feel words', parseCommand("I'm done", ['easy', 'right', 'hard']) === null);
check('rest: "ready" while only ready/more allowed', parseCommand('okay ready', ['ready', 'more']) === 'ready');


/* COACH ME THROUGH IT: today's planned lifts, coached. */
const pw = planWorkout('Upper Strength', [{ exercise: 'Bench Press', muscle: 'Chest', weight: 185, reps: 5 }, { exercise: 'Cable Fly Machine', muscle: 'Chest', weight: 0, reps: 10 }], false);
check('plan: warm-up then one step per planned lift', pw.steps[0].part === 'warmup' && pw.steps.filter(s => s.part === 'main').length === 2, pw.steps.map(s => s.part).join());
const pwMain = pw.steps.filter(s => s.part === 'main');
check('plan: keeps the planned weight and reps', pwMain[0].weight === 185 && pwMain[0].reps === 5, JSON.stringify(pwMain[0]));
check('plan: one top set each', pw.steps.filter(s => s.part === 'main').every(s => s.sets === 1));
check('plan: title is the split day', pw.title === 'Upper Strength');
check('plan: known lift gets warm-up sets before it (95×5, 130×3, 155×1)', pw.steps.filter(s => s.part === 'warmup' && s.weight !== null).map(s => `${s.weight}x${s.reps}`).join(',') === '95x5,130x3,155x1', pw.steps.filter(s => s.part === 'warmup').map(s => `${s.weight}x${s.reps}`).join(','));
check('plan: unknown lift still coached (map, no photo, work-up cue)', pwMain[1].move.photo === '' && /Work up to/.test(pwMain[1].move.cue), pwMain[1].move.cue);
/* BUILD MY OWN */
const cw = customWorkout(home, ['hip-circles', 'glute-bridge', 'goblet-squat', 'nope', 'childs-pose'], 'Pilates', {});
check('custom: keeps her order, drops unknown ids', cw.steps.map(s => s.move.id).join() === 'hip-circles,glute-bridge,goblet-squat,childs-pose');
check('custom: warm-up and stretch moves keep their part', cw.steps.every(s => s.part === (s.move.pattern === 'warmup' ? 'warmup' : s.move.pattern === 'stretch' ? 'cooldown' : 'main')), cw.steps.map(s => `${s.move.id}:${s.part}`).join());
check('custom: main moves get sets and a time estimate', cw.steps.filter(s => s.part === 'main').every(s => s.sets >= 2) && cw.minutes > 0);
/* EVERY FOCUS HITS WHAT IT PROMISES, at every length and setup. */
const setups = { home, gym: { styles: ['Build muscle'], vibe: [], place: 'Gym', gear: [], level: 'Comfortable' }, anywhere: { styles: ['Bodyweight'], vibe: [], place: 'Anywhere', gear: [], level: 'A little' } };
const misses = [];
for (const [name, prefs] of Object.entries(setups)) for (const focus of ['Full body', 'Upper body', 'Lower body', 'Glutes & core']) for (const min of [20, 30, 45, 60]) for (const seed of [1, 7, 42]) {
  const wk = buildWorkout(prefs, min, focus, { seed });
  const hit = new Set(wk.steps.filter(s => s.part === 'main').flatMap(s => s.move.muscles));
  const missing = MUST_HIT[focus].filter(m => !hit.has(m));
  if (missing.length && !(name === 'anywhere' && missing.every(m => ['Biceps', 'Calves', 'Shoulders'].includes(m)))) misses.push(`${name} ${focus} ${min}m: ${missing.join('/')}`);
  if (estimateMinutes(wk) > min * 1.25 || estimateMinutes(wk) < min * 0.45) misses.push(`${name} ${focus} ${min}m: ${estimateMinutes(wk)} min`);
}
check('every focus hits every muscle group it promises, and fits the time', !misses.length, [...new Set(misses)].slice(0, 8).join('; '));

/* THE FOUR BARBELL LIFTS every default plan is built on resolve to a catalog move with photos (they used to fall back to the bare muscle map). */
{ const { canonicalLiftKey } = await import('./src/lib/liftAliases.ts');
  for (const name of ['Bench Press', 'Barbell Bench Press', 'Barbell Row', 'Back Squat', 'Squat', 'Deadlift', 'Conventional Deadlift']) {
    const hit = MOVES.find(m => canonicalLiftKey(m.name) === canonicalLiftKey(name));
    check(`catalog: "${name}" resolves to a move with photos`, !!hit && !!hit.photo && existsSync(`public/exercises/${hit.photo}/0.jpg`) && existsSync(`public/exercises/${hit.photo}/1.jpg`) && !!hit.cue && hit.steps.every(Boolean), hit?.id || 'no match'); }
  const lifts = ['Bench Press', 'Barbell Row', 'Back Squat', 'Deadlift'].map(exercise => ({ exercise, muscle: 'Chest', weight: 100, reps: 5 }));
  const day = planWorkout('Full Body', lifts, false).steps.filter(s => s.part === 'main');
  check('plan-day cards for these lifts have photos, not the bare muscle map', day.length === 4 && day.every(s => s.move.photo), day.map(s => `${s.move.name}:${s.move.photo || 'none'}`).join()); }

/* THE COACH ME NUDGE: when its line shows and when it hides. */
{ const { showNudge, dismissNudge } = await import('./src/lib/guided/nudge.ts');
  const d1 = '2026-11-19', d2 = '2026-11-20', d3 = '2026-11-21';
  check('nudge: shows for someone who never did a guided workout', showNudge(null, 0, d1));
  check('nudge: gone for good after the first guided workout', !showNudge(null, 1, d1) && !showNudge({ dismissals: 1, lastDismissed: d1 }, 3, d3));
  let st = dismissNudge(null, d1);
  check('nudge: a dismissal hides it for the rest of that day', !showNudge(st, 0, d1));
  check('nudge: it comes back the next day after one dismissal', showNudge(st, 0, d2));
  st = dismissNudge(st, d2);
  check('nudge: two dismissals hide it for good', !showNudge(st, 0, d3) && !showNudge(st, 0, '2027-01-01'));
  check('nudge: counts dismissals', st.dismissals === 2); }
{ /* Nov 19: the coached plan skipped the warm-up sets Today prescribes. */
  const bench = planWorkout('Chack 2', [{ exercise: 'Bench', muscle: 'Chest', weight: 360, reps: 2 }], false);
  const ramp = bench.steps.filter(s => s.part === 'warmup' && s.weight !== null);
  check('coached plan: warm-up sets match Today (180×5, 250×3, 305×1)', ramp.map(s => `${s.weight}x${s.reps}`).join(',') === '180x5,250x3,305x1', ramp.map(s => `${s.weight}x${s.reps}`).join(','));
  const top = bench.steps.find(s => s.part === 'main');
  check('coached plan: warm-ups come before the top set', bench.steps.indexOf(ramp.at(-1)) < bench.steps.indexOf(top) && top.weight === 360 && top.reps === 2);
  check('coached plan: warm-ups are kept apart from the top set when logging', ramp.every(s => s.move.id.endsWith(':warmup')) && !top.move.id.endsWith(':warmup'));
  const acc = planWorkout('X', [{ exercise: 'Incline Dumbbell Press', muscle: 'Chest', weight: 60, reps: 10, sets: 3, accessory: true }], false);
  check('coached plan: accessories get no warm-up ramp', !acc.steps.some(s => s.part === 'warmup' && s.weight !== null)); }
{ /* Nov 19 (real workout): "I just did 400 pounds for six reps" on the Bench card went unheard. */
  const r = (t) => JSON.stringify(parseSetReport(t));
  check('set report: "I just did 400 pounds for six reps" = 400 lb × 6', r('I just did 400 pounds for six reps') === JSON.stringify({ weight: 400, reps: 6, unit: 'lb' }), r('I just did 400 pounds for six reps'));
  check('set report: "got 225 for 5" = 225 × 5', r('got 225 for 5') === JSON.stringify({ weight: 225, reps: 5, unit: null }), r('got 225 for 5'));
  check('set report: "did 100 kilos for 3" is kilos', parseSetReport('did 100 kilos for 3')?.unit === 'kg');
  check('set report: "I did 8 reps" is reps only', r('I did 8 reps') === JSON.stringify({ weight: null, reps: 8, unit: null }), r('I did 8 reps'));
  check('set report: "I hit 1,000 pounds for 2" reads the comma', parseSetReport('I hit 1,000 pounds for 2')?.weight === 1000);
  for (const t of ['Alright, Bench. 2 reps at 360 pounds.', 'should I do 400 for 6', "I didn't get 6 reps", 'coach I did 400 for 6?', 'Done', 'I did it', 'two three four five', 'play the next song'])
    check(`set report: "${t}" is not a set`, parseSetReport(t) === null, r(t)); }
console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
