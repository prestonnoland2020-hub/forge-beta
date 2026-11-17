/* THE COACH'S MEMORY STAYS SMALL, STAYS TRAINING-ONLY, AND BELONGS TO THE
   ATHLETE (row coach-memory-2026-11). The model proposes facts; this file's
   rules decide what is kept, so a bad extraction can't store a diagnosis or
   grow the prompt without bound. */
import { emptyFacts, mergeExtraction, mergeGuided, memorySummary, normalizeFacts, worthRemembering, capFacts, MAX_ITEMS, MAX_LIFTS, SUMMARY_LIMIT, MEDICAL_PATTERN } from './supabase/functions/_shared/coachMemory.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

console.log('\nWhat gets kept');
let { facts, added } = mergeExtraction(emptyFacts(), { add: [{ category: 'schedule', text: 'Trains Mon/Wed/Fri at 6am' }, { category: 'dislikes', text: 'Dislikes lunges' }], remove: [] });
check('training facts are kept', facts.items.length === 2 && added.length === 2);
({ facts } = mergeExtraction(facts, { add: [{ category: 'dislikes', text: 'dislikes lunges!' }], remove: [] }));
check('a repeat is not stored twice', facts.items.filter(i => i.category === 'dislikes').length === 1);
({ facts } = mergeExtraction(facts, { add: [{ category: 'schedule', text: 'Trains Tue/Thu evenings' }], remove: [] }));
check('a new schedule replaces the old one', facts.items.filter(i => i.category === 'schedule').length === 1 && facts.items.some(i => i.text.includes('Tue/Thu')));
const id = facts.items.find(i => i.category === 'dislikes').id;
({ facts } = mergeExtraction(facts, { add: [], remove: [id] }));
check('a contradicted fact is removed by id', !facts.items.some(i => i.id === id));
({ facts } = mergeExtraction(facts, { add: [{ category: 'nonsense', text: 'x' }, { category: 'tone', text: '' }], remove: [] }));
check('bad categories and blank text are dropped', facts.items.length === 1);

console.log('\nNever medical');
for (const text of ['Has rotator cuff tendinitis', 'Takes ibuprofen before training', 'Diagnosed with asthma', 'Herniated disc at L4']) {
  const out = mergeExtraction(emptyFacts(), { add: [{ category: 'limits', text }], remove: [] });
  check(`"${text}" is not stored`, out.facts.items.length === 0);
}
const ok = mergeExtraction(emptyFacts(), { add: [{ category: 'limits', text: 'Ease off overhead pressing (said shoulder hurts)' }], remove: [] });
check('a training constraint is stored', ok.facts.items.length === 1);
check('conditioning is not mistaken for a condition', !MEDICAL_PATTERN.test('Likes conditioning circuits'));
check('stored medical text is dropped on read too', normalizeFacts({ items: [{ id: 'a', category: 'limits', text: 'Has arthritis', source: 'coach', at: '2026-11-01' }] }).items.length === 0);

console.log('\nSmall');
let big = emptyFacts();
for (let n = 0; n < 50; n += 1) big = mergeExtraction(big, { add: [{ category: 'exercises', text: `Likes exercise number ${n} a lot` }], remove: [] }, new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString()).facts;
check(`at most ${MAX_ITEMS} facts`, big.items.length === MAX_ITEMS, String(big.items.length));
check('the newest are the ones kept', big.items.some(i => i.text.includes('49')) && !big.items.some(i => i.text.includes('number 0 ')));
check(`summary under ${SUMMARY_LIMIT} characters`, memorySummary(big).length <= SUMMARY_LIMIT, String(memorySummary(big).length));
check('a long fact is cut to 140', mergeExtraction(emptyFacts(), { add: [{ category: 'goals', text: 'x'.repeat(400) }], remove: [] }).facts.items[0].text.length === 140);

console.log('\nGuided feel answers');
let g = mergeGuided(emptyFacts(), [{ lift: 'Back Squat', weight: 225, reps: 5, feel: 'easy' }, { lift: 'Plank', weight: null, reps: 30, feel: null }], 'lb', '2026-11-17T10:00:00Z');
check('a felt set is remembered', g.guided['Back Squat']?.feel === 'easy' && g.guided['Back Squat'].weight === 225);
check('an unanswered set is not', !g.guided.Plank);
check('it reaches the coach', memorySummary(g).includes('Back Squat: 225 lb x 5 felt too easy (2026-11-17)'), memorySummary(g));
g = mergeGuided(g, [{ lift: 'Back Squat', weight: 235, reps: 5, feel: 'hard' }], 'lb', '2026-11-19T10:00:00Z');
check('the latest workout wins', g.guided['Back Squat'].weight === 235 && g.guided['Back Squat'].feel === 'hard');
let many = emptyFacts();
for (let n = 0; n < 30; n += 1) many = mergeGuided(many, [{ lift: `Lift ${n}`, weight: 100, reps: 5, feel: 'right' }], 'lb', new Date(Date.UTC(2026, 0, 1, n)).toISOString());
check(`at most ${MAX_LIFTS} guided lifts`, Object.keys(capFacts(many).guided).length === MAX_LIFTS);

console.log('\nCost: only messages that might hold a fact get an extraction call');
check('"thanks" is skipped', !worthRemembering('thanks'));
check('"what is my top set today?" is skipped', !worthRemembering('what is my top set today?'));
check('"I only have dumbbells at home" is checked', worthRemembering('I only have dumbbells at home'));
check('"I hate lunges, can we skip them" is checked', worthRemembering('I hate lunges, can we skip them'));

console.log(`\n${fails ? `${fails} FAILED` : 'All coach memory checks passed.'}`);
process.exit(fails ? 1 : 0);
