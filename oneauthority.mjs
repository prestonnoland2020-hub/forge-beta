/* ONE AUTHORITY PER RULE — enforced, not remembered.
   Every bug this project has shipped has the same shape: a rule stated in one
   place and quietly contradicted somewhere else. Fixing the instances is not
   the fix; the fix is that a second implementation cannot be added without
   failing a test. Each rule below names its one home, and this suite fails if
   the arithmetic, the table, or the comparison shows up anywhere else. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = [];
const walk = dir => readdirSync(dir).forEach(name => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) walk(path);
  else if (/\.(ts|tsx)$/.test(path)) files.push(path);
});
walk('src');
const read = path => readFileSync(path, 'utf8');
const sources = files.map(path => ({ path, text: read(path) }));

let pass = 0, fail = 0;
const check = (name, offenders, home) => {
  if (!offenders.length) { pass++; console.log(`PASS  ${name}`); return; }
  fail++;
  console.log(`FAIL  ${name}\n      lives in ${home}; also found in:`);
  offenders.forEach(line => console.log(`      ${line}`));
};
/* Report offenders as file:line so a failure points at the copy, not the rule. */
const scan = (test, exempt = []) => sources.flatMap(({ path, text }) =>
  exempt.includes(path) ? [] : text.split('\n').flatMap((line, index) =>
    test(line) ? [`${path}:${index + 1}  ${line.trim().slice(0, 90)}`] : []));

/* 1. Epley. A bare `weight * (1 + reps / 30)` treats a logged 405x1 as a 419
   max; the canonical version returns the single as itself. */
check('Epley is written once', scan(
  line => /\(\s*1\s*\+\s*\w+(\.\w+)*\s*\/\s*30\s*\)/.test(line) && !/loadFor|\/\s*\(1 \+ count/.test(line),
  ['src/lib/strength.ts', 'src/features/training/aiPlanService.ts'],
), 'src/lib/strength.ts (calculateEstimatedOneRepMax)');

/* 2. The wave. Rep sequences and inverse-Epley loading belong to
   aiPlanService; a second sequence is a second training program. */
check('the wave rep sequence is written once', scan(
  line => /\[\s*8\s*,\s*6\s*,\s*4\s*,\s*2\s*,\s*1\s*\]|\[\s*6\s*,\s*8\s*,\s*4\s*\]/.test(line),
  ['src/features/training/aiPlanService.ts'],
), 'src/features/training/aiPlanService.ts (WAVE_REPS)');

/* 3. The alias table. Two copies drift the moment one gains a lift. */
check('the lift alias table is written once', scan(
  line => /ALIAS_GROUPS|LIFT_ALIASES/.test(line),
  ['src/lib/liftAliases.ts'],
), 'src/lib/liftAliases.ts');

/* 4. Lift identity. A raw === between two exercise names makes "Back Squat"
   invisible to a "Squat" goal. */
check('lift names are compared canonically', scan(line =>
  /(set|record|template|entry)\.(lift|exercise)\s*===\s*(?!undefined)/.test(line)
  && !/canonicalLiftKey|sameLift|splitDayKey/.test(line)
), 'src/lib/liftAliases.ts (sameLift / canonicalLiftKey)');

/* 5. The long-run share. 35% on the roadmap and 32% in the event generator
   put three different long runs on one week. */
check('the long-run share is stated once', scan(
  line => /(mileage|weeklyMileage|target)\s*\*\s*\.?0?\.3[0-9]?\b/.test(line),
  ['src/features/training/aiPlanService.ts'],
), 'aiPlanService (LONG_RUN_MIN_SHARE / LONG_RUN_MAX_SHARE)');

/* 6. The week window. A second copy of the rotation is a schedule free to
   drift from the mileage that must agree with it. */
check('the week window is computed once', scan(
  line => /absoluteDay\s*%\s*cycle\.length|\(\(absoluteDay/.test(line),
  ['src/features/training/aiPlanService.ts'],
), 'aiPlanService (weekCycleDays)');

/* 7. Rest days. Five definitions meant the same day was rest on one screen
   and a cardio day on another. */
/* Consuming an already-derived `type === 'rest'` is fine. DERIVING rest — a
   regex on a name, or "no muscles and no cardio" — is what produced five
   different answers, so only derivation is forbidden here. */
check('rest is derived in one place', scan(
  line => (/\/rest\/i\.test\(/.test(line) || /\?\s*'rest'\s*:/.test(line) || /:\s*'rest'\s*;/.test(line))
    && !/isRestDay/.test(line),
  ['src/features/training/aiPlanService.ts'],
), 'aiPlanService (isRestDay)');

/* 8. Pace. A hand-rolled mm:ss printed "8:60/mi" and sent it to the
   generator. */
check('pace is formatted once', scan(line =>
  /% 1\) \* 60|%1\)\*60/.test(line) && /pad|pace/i.test(line)
), 'src/lib/cardioSession.ts (formatCardioMinutes)');

/* 9. The best-max map. Keyed raw on one screen and canonically on another,
   the same history produced maxes 45 lb apart. */
check('the bests map is built once', scan(line =>
  /map\.set\((set|entry)\.lift/.test(line)
), 'aiPlanService (bestsFromHistory)');

/* 10. The max-week rule. It exists in exactly one function, and nothing else
    may decide who gets a tested single. */
check('only one function decides who is tested', scan(
  line => /goalLifts\.has\(/.test(line),
  ['src/features/training/aiPlanService.ts'],
), 'aiPlanService (testsOneRepMax)');

/* 11. The Strava read must never re-acquire a ceiling. */
check('the Strava import reads the whole table', scan(line =>
  /external_activities[\s\S]*\.limit\(/.test(line) || /\.limit\(400\)/.test(line)
), 'stravaImportService (paged with .range)');

/* 12. THE EDGE FUNCTION'S COPY. Deno cannot import the client's modules, so
    the alias table and the max-week rule genuinely exist twice. What must not
    exist twice is a DIFFERENCE: the copies are compared here, so adding a
    lift to one and not the other fails a test instead of producing a block
    that tests a lift the client says is untested. */
const clientAliases = read('src/lib/liftAliases.ts').match(/const ALIAS_GROUPS[\s\S]*?\n\];/)[0];
const edgeAliases = read('supabase/functions/forge-plan/index.ts').match(/const LIFT_ALIASES[\s\S]*?\n\s*\];/)[0];
const groups = text => (text.match(/\[[^\][]*'[^\][]*\]/g) || []).map(row => row.replace(/\s+/g, ' ').trim());
const clientGroups = groups(clientAliases), edgeGroups = groups(edgeAliases);
const missing = clientGroups.filter(row => !edgeGroups.includes(row));
const extra = edgeGroups.filter(row => !clientGroups.includes(row));
check("the edge function's alias table matches the client's", [...missing.map(row => `only in the client: ${row}`), ...extra.map(row => `only in the edge function: ${row}`)], 'src/lib/liftAliases.ts');

const edge = read('supabase/functions/forge-plan/index.ts');
check('the edge function keys split days the same way', /replace\(\/\\s\*\(\?:#\\s\*\)\?\\d\+\$\//.test(edge) ? [] : ['forge-plan does not strip a trailing instance number from split-day names'], 'src/lib/liftAliases.ts (splitDayKey)');
check('the edge function reads both rest keys', /day\.type \?\? day\.dayType/.test(edge) ? [] : ['forge-plan reads only one of type/dayType'], 'aiPlanService (isRestDay)');
check('the edge function tests only goal lifts', /goalLifts\.has\(liftKey\(exercise\)\)/.test(edge) && !/goalLifts\.size\s*===\s*0/.test(edge) ? [] : ['forge-plan has a fallback that tests a non-goal lift'], 'aiPlanService (testsOneRepMax)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
