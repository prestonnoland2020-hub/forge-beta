/* FORGE GUIDED: the builder makes safe, fitting workouts; the coach hears
   short commands; the weights follow how each set felt. */
import { buildWorkout, nextWeight, owned, canDo, suggestFocus, estimateMinutes, startWeight } from './src/lib/guided/builder.ts';
import { parseCommand } from './src/lib/guided/voice.ts';
import { MOVES } from './src/lib/guided/catalog.ts';
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
check('feel step only hears feel words', parseCommand("I'm done", ['easy', 'right', 'hard']) === null);
check('rest: "ready" while only ready/more allowed', parseCommand('okay ready', ['ready', 'more']) === 'ready');

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
