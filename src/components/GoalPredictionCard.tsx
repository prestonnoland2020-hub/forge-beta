import { useState } from 'react';
import type { Feasibility } from '../lib/goalFeasibility';
import { secondsToClock } from '../lib/goalInput';
import { OnboardingGoalPath, type GoalPath } from './OnboardingGoalPath';

/* THE SAME PREDICTION SETUP SHOWED, ON THE GOAL ITSELF. Setup drew a path
   from where the athlete is to the goal and called it realistic, ambitious or
   too steep; Goals used to show a pill and a paragraph from the same model
   without ever showing its numbers. Here it is again, from today's numbers:
   where Forge puts them now, where a typical block and the ceiling land by the
   date, and what that makes the goal — with the rules said once, plainly, and
   the promise that the prediction is checked on the goal date. */

const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function GoalPredictionCard({ verdict, date, unit, hoursFirst }: { verdict: Feasibility; date: string; unit: string; hoursFirst: boolean }) {
  const [open, setOpen] = useState(false);
  const p = verdict.prediction;
  if (!p) return null;
  const race = p.better === 'lower';
  const show = (value: number) => race ? secondsToClock(value, hoursFirst || value >= 3600) : `${Math.round(value)} ${unit}`;
  /* Progress reads left to right whichever way the number goes. */
  const reach = (value: number) => race ? value <= p.target : value >= p.target;
  const tone: GoalPath['tone'] = reach(p.typical) ? 'good' : reach(p.ceiling) ? 'stretch' : 'hard';
  const label = reach(p.start) ? 'Reached' : tone === 'good' ? 'Realistic' : tone === 'stretch' ? 'Ambitious' : race ? 'Too fast' : 'Too steep';
  const path: GoalPath = {
    from: p.start, to: p.target, weeks: Math.max(1, p.weeks),
    fromLabel: show(p.start), toLabel: show(p.target),
    headline: `Typical by ${shortDate(date)}: ${show(p.typical)} · best case ${show(p.ceiling)}`,
    verdict: label, tone, note: verdict.say,
  };
  return <section className="goal-prediction" aria-label="Forge's prediction">
    <div className="goal-prediction-head"><span>Forge’s prediction</span><button type="button" className="text-button" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Hide' : 'How Forge predicts'}</button></div>
    <OnboardingGoalPath path={path} date={date} />
    {open && <ul className="goal-prediction-rules">
      <li><b>Now</b> is {race ? 'what your logged runs are worth at this distance today' : 'your best calculated max from logged top sets — or the best you entered, until you log one'}.</li>
      <li><b>Typical</b> is where most athletes land: {race ? 'about 0.6% faster a week, for longer on longer races' : 'about 0.35% a week for 12 weeks, then slower'}{race ? '' : ' — or your own rate, once a lift has 12 weeks of history'}.</li>
      <li><b>Best case</b> is the most training finds: {race ? 'about 1% a week, scaled up for half and full marathons' : 'about 1% a week for 12 weeks, then ¼%; new lifts climb faster at first'}.</li>
      <li>{race ? 'These rates come from coaching practice and are being checked against real Forge results.' : 'These rates come from real Forge training history.'} Forge records this prediction and checks it against what you actually hit on {shortDate(date)}, so the model keeps getting more accurate.</li>
    </ul>}
  </section>;
}
