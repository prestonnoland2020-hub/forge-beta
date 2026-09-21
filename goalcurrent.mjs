/* CURRENT: 30:00 — on a goal card whose own predictor said 19:10.

   A 3.1-mile run logged that morning at 10:00/mi was taken as Preston's
   current 5K because it was the one run in the window at exactly the goal
   distance. A jog is not a race result, and TO GO (11:01) was built on it.
   Meanwhile the card printed two projections that disagreed: 19:10 under
   PROJECTED (today's worth) and "16:44–18:53 on race day" in a footnote.

   The card now has one authority per tile. CURRENT is what the athlete is
   worth today — the predictor's number, the same one the verdict reads —
   replaced by an exact-distance run only when that run is FASTER. PROJECTED
   is race day, carried forward from CURRENT. TO GO is measured from
   PROJECTED. The footnote is gone because it became the tile. */
import { readFileSync } from 'node:fs';

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};
const src = readFileSync('./src/components/GoalProgressCard.tsx', 'utf8');

console.log('\nCURRENT is what you are worth today');
check('an endurance CURRENT reads the predictor',
  /const worthToday = goal\.type==='Endurance' && !paceGoal && legacyPrediction\s*\?\s*\(raceRun \? raceRun\.value : legacyPrediction\.seconds\)/.test(src));
check('an exact-distance run replaces it only when faster',
  /const raceRun = [^\n]*currentEvidence\.value < legacyPrediction\.seconds/.test(src));
check('the tile prints that number', /const currentText = worthToday \? formatValue\(worthToday\) : 'Not logged';/.test(src));
check('and names the run behind it', /label: `From your \$\{Math\.round\(legacyPrediction\.source\.miles \* 10\) \/ 10\} mi in/.test(src));

console.log('\nPROJECTED is race day, carried from CURRENT');
check('the outlook is built from today’s worth, not the raw predictor',
  /raceDayOutlook\(worthToday, roadmap\.weeksRemaining\)/.test(src));
check('and there is no second outlook built from anything else',
  (src.match(/raceDayOutlook\(/g) || []).length === 1);
check('the tile shows the race-day number', /outlook\?formatValue\(outlook\.likely\)/.test(src));
check('with its range underneath', /`\$\{formatValue\(outlook\.best\)\}–\$\{formatValue\(outlook\.likely\)\} on race day`/.test(src));

console.log('\nTO GO is measured from the projection');
check('the comparison value is the projection for an endurance goal',
  /const comparisonValue = goal\.type==='Endurance' && !paceGoal \? \(projectedValue \|\| worthToday\)/.test(src));
check('and the tile says so', /projectedOnly\?'Projected · ':''/.test(src));

console.log('\nOne projection on the card, not two');
check('the race-day footnote is gone', !/on race day, \{roadmap\.weeksRemaining\} weeks of training from here/.test(src));
check('the lift forecast line stays', /strengthForecast && <p className="goal-outlook">/.test(src));

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
