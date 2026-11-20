/* STRONGER IS NOT A MISS (Nov 20). 300 × 8 on a day that asked for 280 × 10 is
   a stronger set; it must not count toward a back-off, and the plan-pressure
   card asks about fatigue instead of declaring the block wrong. */
import { bestsFromHistory, strongerThanAsked } from './src/features/training/aiPlanService.ts';
import { liftPosition } from './src/lib/liftProgression.ts';
import { planPressure } from './src/lib/planPressure.ts';
import { readFileSync } from 'node:fs';
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`); if (!ok) fails += 1; };
check('300×8 vs asked 280×10 is stronger', strongerThanAsked(300, 8, 280, 10));
check('250×8 vs asked 280×10 is not', !strongerThanAsked(250, 8, 280, 10));
const day = (date, weight, reps) => ({ date, topSets: [{ lift: 'Bench Press', weight, reps, prescribedReps: 10, prescribedWeight: 280 }] });
const heavy = [day('2026-11-18', 300, 8), day('2026-11-11', 300, 8), day('2026-11-04', 300, 8)];
const counts = [...(bestsFromHistory(heavy, '2026-11-20').misses.get('bench')?.values() || [])];
check('three heavier-but-fewer-reps sessions are not misses', !counts.some(count => count >= 3), JSON.stringify(counts));
const weak = [day('2026-11-18', 250, 8), day('2026-11-11', 250, 8), day('2026-11-04', 250, 8)];
const weakCounts = [...(bestsFromHistory(weak, '2026-11-20').misses.get('bench')?.values() || [])];
check('three genuinely short sessions still count', weakCounts.some(count => count >= 3), JSON.stringify(weakCounts));
const pos = liftPosition(heavy.map(r => ({ date: r.date, ...r.topSets[0] })), false);
check('lift position does not log the heavier sets as misses', pos.misses === 0, JSON.stringify(pos));
const p = planPressure({ checkIns: [], backedOffLifts: ['Bench Press'], missedSessions: 0, goalsBehind: false, sessions: null });
check('back-off message no longer says "loads are ahead of you"', p && !/ahead of where you are/.test(p.say), p?.say);
const card = readFileSync('src/components/PlanPressureCard.tsx', 'utf8');
check('the card asks "Feeling fatigued?" and offers "I feel good"', /Feeling fatigued\?/.test(card) && /I feel good/.test(card));
if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall passed');
