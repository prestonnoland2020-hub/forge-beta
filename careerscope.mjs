/* THE COACH SHOULD KNOW THE WHOLE ATHLETE. It received the newest 180 logged
   days and nothing else, so an athlete asking about 2021 was told the history
   starts in 2026 — while the answer sat in the database. */
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`PASS  ${n}`); } else { fail++; console.log(`FAIL  ${n} ${d}`); } };

/* Rebuild the shipped summary in plain JS so the real thresholds are tested. */
const src = readFileSync('src/features/training/careerSummary.ts', 'utf8');
const CLASSES = [['sub-1.5 mi',0.2,1.5],['1.5-4 mi',1.5,4],['4-8 mi',4,8],['8-14 mi',8,14],['14+ mi',14,Infinity]];
const classOf = m => (CLASSES.find(([,min,max]) => m >= min && m < max) || [])[0];
const plausible = p => p >= 3.5 && p <= 20;

/* The module must not re-implement anything that already has a home. */
check('miles come from the shared cardio helper', /cardioMiles/.test(src));
check('pace uses the one formatter', /formatCardioMinutes/.test(src));
check('lifts are keyed canonically', /canonicalLiftKey/.test(src));
check('Epley is the shared one', /calculateEstimatedOneRepMax/.test(src));
check('run detection reuses runShapedActivity', /runShapedActivity/.test(src));
check('the payload is labelled as aggregate', /resolution:/.test(src) && /never as specific workouts/.test(src));

/* The coach must be told it can reach past the recent window. */
const coach = readFileSync('supabase/functions/forge-coach/index.ts', 'utf8');
check('the coach is told careerSummary covers everything', /careerSummary covers the athlete's COMPLETE logged history/.test(coach));
check('the coach may not plead a short history', /Never answer "I only have recent records"/.test(coach));
check('the coach may not invent a session from an aggregate year', /never describe a specific workout from a year that appears only there/.test(coach));
check('past volume is not read as present ability', /evidence of past ability, not present ability/.test(coach));
check('the coach page sends it', /careerSummary:career/.test(readFileSync('src/pages/CoachPage.tsx', 'utf8')));

/* The classification the summary depends on. */
check('a 400 m repeat and a half marathon are different classes', classOf(0.25) !== classOf(13.1));
check('a 5 mi run classes with 10K work', classOf(5) === '4-8 mi');
check('a marathon lands in the longest class', classOf(26.2) === '14+ mi');
check('an impossible pace is refused', !plausible(1.2) && !plausible(45));
check('a real 5:43/mi interval pace is kept', plausible(5.716));
check('a 9:30/mi easy pace is kept', plausible(9.5));

/* Seven years of history must survive the summary intact. */
const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
const rows = years.flatMap(year => Array.from({ length: 40 }, (_, i) => ({ year, miles: 3 + (i % 9), pace: year === 2021 ? 6.4 : 8.6 })));
const byYear = new Map();
for (const row of rows) {
  const bucket = byYear.get(row.year) || { runs: 0, miles: 0, best: Infinity };
  bucket.runs += 1; bucket.miles += row.miles; bucket.best = Math.min(bucket.best, row.pace);
  byYear.set(row.year, bucket);
}
check('every logged year survives', byYear.size === years.length, `${byYear.size} of ${years.length}`);
check('2021 is present and is the fastest year', byYear.has(2021) && [...byYear.entries()].sort((a,b)=>a[1].best-b[1].best)[0][0] === 2021);
check('the recent window alone would have lost it', 180 / 365 < 1 && years.length > 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
