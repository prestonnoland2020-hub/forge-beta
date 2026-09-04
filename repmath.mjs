/* THE WAVE IS WRITTEN FROM THE NEAREST REAL EVIDENCE. Preston's own numbers
   are the case: an all-out 415x8 estimated a 526 max, and the double the
   block wrote from it (495) was a weight he could grind one rep with. His
   real heavy work sat at 475-490. */
import { bestsFromHistory, wavePrescription, loadFromAnchors } from './src/features/training/aiPlanService.ts';
import { calculateEstimatedOneRepMax, repMaxCoefficient, weightForReps } from './src/lib/strength.ts';
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

/* 1. The curve is one curve: a set converted to a max and back is itself. */
for (const [weight, reps] of [[415, 8], [320, 6], [225, 4], [500, 2], [480, 1], [135, 20]]) {
  const max = calculateEstimatedOneRepMax(weight, reps);
  const back = Math.round(weightForReps(max, Math.min(reps, 10)));
  check(`${weight}x${reps} -> ${max} -> ${back}`, Math.abs(back - weight) <= 1, `${back} vs ${weight}`);
}
check('a single is itself, never inflated', calculateEstimatedOneRepMax(405, 1) === 405);
check('past ten reps the estimate stops climbing', calculateEstimatedOneRepMax(135, 20) === calculateEstimatedOneRepMax(135, 10));

/* 2. Preston's squat: 415x8 all-out, a real 480 single. */
const day = (date, lift, weight, reps) => ({ topSets: [{ lift, weight, reps, completed: true }], date });
const { bests, anchors } = bestsFromHistory([day('2026-08-20', 'Squat', 415, 8), day('2026-07-02', 'Squat', 480, 1)]);
const squat = anchors.get('squat');
const at = reps => Math.ceil(loadFromAnchors(squat, bests.get('squat'), reps, 5) / 5) * 5;
check('the 8-rep week asks one step past the set he did', at(8) === 420, `${at(8)}`);
check('the double lands near his real heavy work, not 495', at(2) >= 465 && at(2) <= 480, `${at(2)}`);
check('the 4-rep week sits between his two anchors', at(4) > at(6) && at(4) < at(2), `${at(6)} / ${at(4)} / ${at(2)}`);
check('the wave still descends 8 -> 2', at(8) < at(6) && at(6) < at(4), `${at(8)}/${at(6)}/${at(4)}`);

/* 3. An old light set at one rep count never holds back a stronger lifter. */
const stale = bestsFromHistory([day('2024-01-01', 'Bench', 185, 8), day('2026-08-01', 'Bench', 315, 2)]);
const bench = stale.anchors.get('bench');
const benchAt = reps => Math.ceil(loadFromAnchors(bench, stale.bests.get('bench'), reps, 5) / 5) * 5;
check('a stale 185x8 does not write the 8-rep week', benchAt(8) > 240, `${benchAt(8)}`);

/* 3b. Repeating a rep count moves the bar; missing it holds the bar. */
const climb = bestsFromHistory([day('2026-08-01', 'Squat', 460, 4)]).anchors.get('squat');
const climbAt = reps => Math.ceil(loadFromAnchors(climb, 502, reps, 5) / 5) * 5;
check('coming back to 4 reps asks for 465, not 460', climbAt(4) === 465, `${climbAt(4)}`);
const missed = bestsFromHistory([day('2026-08-01', 'Squat', 460, 4), day('2026-09-01', 'Squat', 465, 3)]).anchors.get('squat');
check('a missed rep holds the 4-rep week at 465', Math.ceil(loadFromAnchors(missed, 502, 4, 5) / 5) * 5 === 465);

/* 4. With no anchors at all, the calculated max still stands in. */
check('a lift with no history falls back to the curve', Math.round(loadFromAnchors(undefined, 300, 6)) === Math.round(weightForReps(300, 6)));

/* 4b. A stale single does not cap max week when the rep work has moved on,
   and a runaway estimate cannot ask for a tenth of a PR in one session. */
const stalest = bestsFromHistory([
  day('2026-06-01', 'Squat', 475, 1), day('2026-09-04', 'Squat', 460, 4), day('2026-08-16', 'Squat', 408, 8),
]);
const attemptFor = single => wavePrescription(stalest.bests.get('squat'), 4, false, single, true, stalest.anchors.get('squat')).weight;
check('recent fours push the attempt past a spring single', attemptFor(475) > 490, `${attemptFor(475)}`);
check('and the jump is capped at a tenth of the single', attemptFor(300) <= 330, `${attemptFor(300)}`);

/* 5. The max attempt never sits below the heavy double. */
for (const [best, single] of [[526, 475], [526, 0], [380, 375], [300, 320]]) {
  const double = wavePrescription(best, 3, false, single, false).weight;
  const attempt = wavePrescription(best, 4, false, single, true).weight;
  check(`attempt ${attempt} > double ${double}`, attempt > double);
}
console.log(fails ? `\n${fails} check(s) failed` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
