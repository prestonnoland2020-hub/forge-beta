/* SETUP TAKES MORE THAN ONE WANT. Sarah wanted guided workouts, a body-weight
   goal and to get stronger at once; setup took one focus, and "Coach me"
   ended it with no goal at all. These are the rules that turn the three
   answers (what you want, who builds it, what kind) into goal screens, a
   week and the coach's setup. */
globalThis.localStorage = { s: {}, getItem(k) { return this.s[k] ?? null; }, setItem(k, v) { this.s[k] = v; }, removeItem(k) { delete this.s[k]; } };
globalThis.window = globalThis.window || { dispatchEvent() {} };
const { toggleWant, wantsFromFocus, focusOf, splitFocusFor, goalSlots, coachSplit, guidedPrefsFor, coachBuilds } = await import('./src/lib/onboardingPlan.ts');
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`); if (!ok) fails += 1; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('\nWhat do you want? — pick any');
let wants = toggleWant(toggleWant([], 'strength'), 'weight');
check('stronger and a body weight can both be picked', same(wants, ['strength', 'weight']), JSON.stringify(wants));
check('tapping one again takes it off', same(toggleWant(wants, 'strength'), ['weight']));
check('"Just get fit" stands alone', same(toggleWant(wants, 'fit'), ['fit']) && same(toggleWant(['fit'], 'run'), ['run']));

console.log('\nSarah: stronger + body weight, coach builds it, at the gym');
check('she is asked for a lift goal AND a weight goal', same(goalSlots(wants, true, 'Gym'), ['strength', 'weight']), JSON.stringify(goalSlots(wants, true, 'Gym')));
check('her week is lifting, with no run she did not ask for', splitFocusFor(wants, true, 'Gym') === 'Strength');
check('the one-word focus the app reads is Strength', focusOf(wants) === 'Strength');
check('the coach is set up for the gym, strength first', same(guidedPrefsFor('Gym', [], wants), { styles: ['Strength'], vibe: [], place: 'Gym', gear: [], level: 'A little' }));

console.log('\nThe same wants, running her own workouts');
check('one screen pair per want', same(goalSlots(['strength', 'run', 'weight'], false), ['strength', 'run', 'weight']));
check('no specific want still sets one goal — the plan is built from it', same(goalSlots(['fit'], false), ['any']));
check('a coached athlete who just wants to get fit is asked for none', same(goalSlots(['fit'], true, 'Gym'), []));

console.log('\nWhat kind of training — coach builds it');
check('Hybrid adds running to the week', splitFocusFor(['strength'], true, 'Hybrid') === 'Hybrid');
check('Gym plus "run faster" adds running too', splitFocusFor(['run', 'weight'], true, 'Gym') === 'Hybrid');
check('Pilates and Home are built by the coach each day', coachBuilds(true, 'Pilates') && coachBuilds(true, 'Home') && !coachBuilds(true, 'Gym') && !coachBuilds(false, 'Pilates'));
check('no barbell goal without a barbell', same(goalSlots(['strength', 'weight'], true, 'Pilates'), ['weight']));
const pilates = coachSplit('Pilates', 3, false);
check('3 Pilates days is a 7-day week with 4 rest days', pilates.length === 7 && pilates.filter(day => day.type === 'Rest').length === 4, pilates.map(day => day.name).join(', '));
check('every Pilates day has its own name and carries no lifts', new Set(pilates.filter(day => day.type !== 'Rest').map(day => day.name)).size === 3 && pilates.every(day => !day.exercises?.length && !day.muscles?.length));
check('the days are spread, not stacked', pilates[0].type !== 'Rest' && pilates[1].type === 'Rest');
const homeRun = coachSplit('Home', 4, true).filter(day => day.type !== 'Rest');
check('with a running want every other day is a run', same(homeRun.map(day => day.type), ['Strength', 'Cardio', 'Strength', 'Cardio']) && same(homeRun.map(day => day.name), ['Home workout', 'Run', 'Home workout 2', 'Run 2']), homeRun.map(day => day.name).join(', '));
check('Pilates sets the coach up with a mat', same(guidedPrefsFor('Pilates', [], ['fit']).styles, ['Pilates']) && guidedPrefsFor('Pilates', [], ['fit']).gear.includes('Mat'));
check('home with dumbbells is strength, with nothing is bodyweight', guidedPrefsFor('Home', ['Dumbbells'], ['strength']).styles[0] === 'Strength' && guidedPrefsFor('Home', [], ['strength']).styles[0] === 'Bodyweight');

console.log('\nAccounts from before wants existed');
check('one focus reads back as its wants', same(wantsFromFocus('Hybrid'), ['strength', 'run']) && same(wantsFromFocus('Body composition'), ['weight']) && same(wantsFromFocus('Strength'), ['strength']));
check('and round-trips', ['Strength', 'Endurance', 'Hybrid', 'Body composition'].every(focus => focusOf(wantsFromFocus(focus)) === focus));
if (fails) process.exit(1);
