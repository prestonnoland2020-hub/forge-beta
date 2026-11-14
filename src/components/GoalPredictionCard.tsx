import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBilling } from '../features/billing/BillingProvider';
import { useGoals } from '../features/goals/GoalsProvider';
import { nudgeUpgrade } from './UpgradeSheet';
import { weeksUntil, type Feasibility, type GoalPrediction } from '../lib/goalFeasibility';
import { secondsToClock } from '../lib/goalInput';
import { predictionFromNow } from '../lib/predictionFromNow';
import type { GoalSuggestion } from '../lib/goalSuggestions';

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

/* THE WHY, AS A PACE. "388 by Mar 31" is a number; "+1.2 lb a week, the goal
   needs +2.1" is the reason for it, and what to beat. */
function paceOf(p: GoalPrediction, weeks: number) {
  const race = p.better === 'lower';
  const gain = race ? p.start - p.typical : p.typical - p.start;
  const need = race ? p.start - p.target : p.target - p.start;
  return { per: weeks > 0 ? gain / weeks : 0, need: weeks > 0 ? need / weeks : 0 };
}
const fmtRate = (value: number) => Math.abs(value) >= 10 ? Math.round(value).toString() : (Math.round(value * 10) / 10).toFixed(1);

/* THE LINE TO THE DATE: today's number, the pace carried to the goal date,
   and the goal as a dashed line across. Where the two meet is the answer. */
function PaceGraph({ p, date, show, tone }: { p: GoalPrediction; date: string; show: (value: number) => string; tone: string }) {
  const race = p.better === 'lower';
  const W = 320, H = 118, top = 22, bottom = 26, left = 6, right = 6;
  const values = [p.start, p.typical, p.target];
  const min = Math.min(...values), max = Math.max(...values);
  const pad = Math.max((max - min) * 0.18, race ? 5 : 2);
  const lo = min - pad, hi = max + pad;
  /* Better is always up: a faster race time climbs like a heavier lift. */
  const y = (value: number) => {
    const share = (value - lo) / (hi - lo);
    return top + (race ? share : 1 - share) * (H - top - bottom);
  };
  const x0 = left, x1 = W - right;
  const goalY = y(p.target), startY = y(p.start), endY = y(p.typical);
  const ends = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  /* Labels sit on the side away from the other line so they never overlap. */
  const endAbove = endY <= goalY;
  return <svg className={`gpc-graph tone-${tone}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`From ${show(p.start)} today to ${show(p.typical)} by ${ends}; goal ${show(p.target)}`}>
    <path className="gpc-graph-area" d={`M${x0},${startY} L${x1},${endY} L${x1},${H - bottom} L${x0},${H - bottom} Z`} />
    <line className="gpc-graph-goal" x1={x0} x2={x1} y1={goalY} y2={goalY} />
    <text className="gpc-graph-goal-label" x={x0} y={goalY - 6}>Goal {show(p.target)}</text>
    <line className="gpc-graph-line" x1={x0} x2={x1} y1={startY} y2={endY} />
    <circle className="gpc-graph-dot start" cx={x0 + 3} cy={startY} r="3.5" />
    <circle className="gpc-graph-dot" cx={x1 - 4} cy={endY} r="4.5" />
    <text className="gpc-graph-end" x={x1} y={endAbove ? endY - 10 : endY + 18} textAnchor="end">{show(p.typical)}</text>
    <line className="gpc-graph-base" x1={x0} x2={x1} y1={H - bottom} y2={H - bottom} />
    <text className="gpc-graph-axis" x={x0} y={H - 8}>Today</text>
    <text className="gpc-graph-axis" x={x1} y={H - 8} textAnchor="end">{ends}</text>
  </svg>;
}

/* THE STEPPING STONE: a goal a few weeks out the athlete can actually hit,
   added beside the big one, not instead of it. */
/* A STEPPING STONE IS ITS OWN GOAL. "Add" read as "change my goal", and
   the goal did not change. It now says what it does: a second, nearer goal
   on the way, and the big one stays as it is. */
function QuickWin({ win, onAdd, keeps }: { win: GoalSuggestion & { added?: boolean }; onAdd: (win: GoalSuggestion) => void; keeps: string }) {
  const [tapped, setAdded] = useState(false);
  const added = tapped || Boolean(win.added);
  return <div className="goal-quickwin">
    <span><b>{win.name} · {win.label} by {win.dateLabel}</b>{win.how}<small>{added ? `Added as its own goal. Your ${keeps} goal stays.` : `A step on the way. Adds it as a second goal — your ${keeps} goal stays.`}</small></span>
    {added ? <em className="goal-fix-done">Added</em> : <button type="button" className="button small" onClick={() => { onAdd(win); setAdded(true); }}>Add step</button>}
  </div>;
}

export function GoalPredictionCard({ verdict, date, unit, hoursFirst, now, quickWin, onAddQuickWin }: { verdict: Feasibility; date: string; unit: string; hoursFirst: boolean; now?: number | null; quickWin?: (GoalSuggestion & { added?: boolean }) | null; onAddQuickWin?: (win: GoalSuggestion) => void }) {
  const model = verdict.prediction;
  if (!model) return null;
  /* Carried from the number the card above shows, so the two always agree. */
  const p = predictionFromNow(model, now);
  const race = p.better === 'lower';
  const show = (value: number) => race ? secondsToClock(value, hoursFirst || value >= 3600) : `${Math.round(value)} ${unit}`;
  /* Progress reads left to right whichever way the number goes. */
  const reach = (value: number) => race ? value <= p.target : value >= p.target;
  const tone = reach(p.typical) ? 'good' : reach(p.ceiling) ? 'stretch' : 'hard';
  /* The sets already reach the goal; only the tested number is short. One
     heavy single settles it, so that is what the card says. */
  const ready = reach(model.start) && !reach(p.start);
  const label = ready ? 'Ready to test' : reach(p.start) ? 'Reached' : tone === 'good' ? 'Realistic' : tone === 'stretch' ? 'Ambitious' : race ? 'Too fast' : 'Too steep';
  const gap = Math.abs(p.typical - p.target);
  const gapText = race ? secondsToClock(gap, hoursFirst || gap >= 3600) : `${Math.round(gap)} ${unit}`;
  const line = reach(p.start) ? 'Already there — hold it to the date.'
    : Math.round(gap) === 0 ? 'Lands right on the goal.'
    : reach(p.typical) ? <>Clears it by <b>{gapText}</b></> : <><b>{gapText}</b> short on the day</>;
  const weeks = weeksUntil(date);
  const pace = paceOf(p, weeks);
  const rateUnit = race ? 'sec/wk faster' : `${unit}/wk`;
  const source = p.measured ? 'your pace' : p.measured === false ? 'typical pace' : '';
  return <section className={`goal-prediction compact tone-${ready ? 'stretch' : tone}`} aria-label="Forge's prediction">
    <div className="gpc-head"><span>{ready ? `Test it before ${shortDate(date)}` : `Projected by ${shortDate(date)}`}</span><em>{label}</em></div>
    {ready ? <div className="gpc-num"><b>{show(model.start)}</b><span>{race ? 'what your runs say you can do' : 'what your sets say you can lift'}</span></div>
    : <div className="gpc-num"><b>{show(p.typical)}</b><span>{line}</span></div>}
    {!ready && weeks >= 1 && <p className="gpc-pace">
      <b>{pace.per > 0 ? `${race ? '' : '+'}${fmtRate(pace.per)} ${rateUnit}` : 'Flat'}</b>
      {source && <span>{source}</span>}
      {!reach(p.start) && pace.need > 0 && <span className="gpc-need">· needs {race ? '' : '+'}{fmtRate(pace.need)}</span>}
    </p>}
    {!ready && weeks >= 1 && <PaceGraph p={p} date={date} show={show} tone={tone} />}
    {/* The estimate already clears the goal but the time actually run does
       not: the advice is to go and prove it, not "hold it". */}
    {reach(model.start) && !reach(p.start)
      ? <p className="goal-fix"><b>Next step</b>Your other {race ? 'runs' : 'sets'} put you at about {show(model.start)}. {race ? 'Race the distance' : 'Test a heavy single'} to prove it.</p>
      : <GoalFix verdict={verdict} />}
    {quickWin && onAddQuickWin && <QuickWin win={quickWin} onAdd={onAddQuickWin} keeps={show(p.target)} />}
  </section>;
}
