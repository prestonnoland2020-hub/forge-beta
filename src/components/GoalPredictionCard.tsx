import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBilling } from '../features/billing/BillingProvider';
import { useGoals } from '../features/goals/GoalsProvider';
import { nudgeUpgrade } from './UpgradeSheet';
import type { Feasibility } from '../lib/goalFeasibility';
import { secondsToClock } from '../lib/goalInput';
import { predictionFromNow } from '../lib/predictionFromNow';

/* THE SAME PREDICTION SETUP SHOWED, ON THE GOAL ITSELF. Setup drew a path
   from where the athlete is to the goal and called it realistic, ambitious or
   too steep; Goals used to show a pill and a paragraph from the same model
   without ever showing its numbers. Here it is again, from today's numbers:
   where Forge puts them now, where a typical block and the ceiling land by the
   date, and what that makes the goal — with the rules said once, plainly, and
   the promise that the prediction is checked on the goal date. */

const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/* THE VERDICT IS FREE; THE FIX IS PRO. Every athlete sees whether a goal is
   on track. What to change -- the reachable target, the mileage it is built
   on, the pace to train -- is the coaching, and it is what Pro pays for. */
function GoalFix({ verdict }: { verdict: Feasibility }) {
  const { isPro, loading } = useBilling();
  const navigate = useNavigate();
  const { goals, saveGoal } = useGoals();
  const [used, setUsed] = useState(false);
  const suggest = verdict.suggest;
  /* One row. When the coach has a goal to suggest, that IS the fix -- the
     sentence version of it (insteadOf) would only repeat it. */
  const fix = suggest ? '' : [verdict.insteadOf, verdict.change].filter(Boolean).join(' ');
  const behind = verdict.verdict !== 'reachable';
  useEffect(() => { if (!loading && !isPro && behind && (fix || suggest)) nudgeUpgrade('goal-behind'); }, [loading, isPro, behind, fix, suggest]);
  if (!fix && !suggest) return null;
  if (!isPro) return <button type="button" className="goal-fix locked" onClick={() => navigate('/profile?view=billing')}>
    <b>{suggest ? 'Coach suggests' : 'What to change'}</b><span>Forge Pro shows {suggest ? 'a goal you can reach' : 'the fix for this goal'}</span><em className="pro-tag">PRO</em>
  </button>;
  if (!suggest) return <p className="goal-fix"><b>What to change</b>{fix}</p>;
  const index = goals.findIndex(goal => goal.title === verdict.goal);
  const apply = () => {
    if (index < 0) return;
    const goal = goals[index];
    const oldTarget = String(goal.target || '').trim();
    /* "400 lb Bench" -> "425 lb Bench": the title carries the number when the
       athlete wrote it that way; a title without it is left alone. */
    const title = oldTarget && goal.title.includes(oldTarget.replace(/\s*lb$/i, '')) ? goal.title.replace(oldTarget.replace(/\s*lb$/i, ''), suggest.targetText) : goal.title;
    saveGoal({ ...goal, title, target: suggest.targetText, ...(suggest.date ? { date: suggest.date } : {}) }, index);
    setUsed(true);
  };
  return <div className="goal-fix suggest">
    <span><b>Coach suggests · {suggest.why}</b>{suggest.label}</span>
    {used ? <em className="goal-fix-done">Goal updated</em> : index >= 0 && <button type="button" className="button small" onClick={apply}>Use it</button>}
  </div>;
}

export function GoalPredictionCard({ verdict, date, unit, hoursFirst, now }: { verdict: Feasibility; date: string; unit: string; hoursFirst: boolean; now?: number | null }) {
  const model = verdict.prediction;
  if (!model) return null;
  /* Carried from the number the card above shows, so the two always agree. */
  const p = predictionFromNow(model, now);
  const race = p.better === 'lower';
  const show = (value: number) => race ? secondsToClock(value, hoursFirst || value >= 3600) : `${Math.round(value)} ${unit}`;
  /* Progress reads left to right whichever way the number goes. */
  const reach = (value: number) => race ? value <= p.target : value >= p.target;
  const tone = reach(p.typical) ? 'good' : reach(p.ceiling) ? 'stretch' : 'hard';
  const label = reach(p.start) ? 'Reached' : tone === 'good' ? 'Realistic' : tone === 'stretch' ? 'Ambitious' : race ? 'Too fast' : 'Too steep';
  const gap = Math.abs(p.typical - p.target);
  const gapText = race ? secondsToClock(gap, hoursFirst || gap >= 3600) : `${Math.round(gap)} ${unit}`;
  const line = reach(p.start) ? 'Already there — hold it to the date.'
    : Math.round(gap) === 0 ? 'Lands right on the goal.'
    : reach(p.typical) ? <>Clears it by <b>{gapText}</b></> : <><b>{gapText}</b> short on the day</>;
  /* One bar from zero (as on the goal card above it) to the further of the
     goal and the best case:
     the fill is where a typical block lands, the tick is the goal. */
  const lo = race ? Math.max(p.start, p.target, p.ceiling, p.typical) : 0;
  const hi = race ? Math.min(p.target, p.ceiling, p.typical) : Math.max(p.target, p.ceiling, p.typical);
  const at = (value: number) => hi === lo ? 100 : Math.max(0, Math.min(100, ((value - lo) / (hi - lo)) * 100));
  /* WHAT MATTERS ON THE PREDICTION: where the athlete lands by the date, how
     far that is from the goal, and what to change. The path chart, the
     paragraph restating it and the rules of the model were three more ways to
     say the same number; the card that followed said it a fourth time. */
  return <section className={`goal-prediction compact tone-${tone}`} aria-label="Forge's prediction">
    <div className="gpc-head"><span>Projected by {shortDate(date)}</span><em>{label}</em></div>
    <div className="gpc-num"><b>{show(p.typical)}</b><span>{line}</span></div>
    <div className="gpc-bar" aria-hidden="true"><i style={{ width: `${at(p.typical)}%` }} /><s style={{ left: `${at(p.target)}%` }} /></div>
    <p className="gpc-meta"><span>Best case {show(p.ceiling)}</span><span>Goal {show(p.target)}</span></p>
    {/* The estimate already clears the goal but the time actually run does
       not: the advice is to go and prove it, not "hold it". */}
    {reach(model.start) && !reach(p.start)
      ? <p className="goal-fix"><b>What to change</b>Your other {race ? 'runs' : 'sets'} put you at about {show(model.start)}. {race ? 'Race the distance' : 'Test a heavy single'} to prove it.</p>
      : <GoalFix verdict={verdict} />}
  </section>;
}
