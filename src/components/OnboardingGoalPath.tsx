import { reachableSeconds, STRENGTH_WEEKLY_GAIN, weeksUntil } from '../lib/goalFeasibility';
import { secondsToClock } from '../lib/goalInput';

/* WHY A GOAL, SHOWN RATHER THAN SAID. Setup asked for a target and a date and
   explained neither; a goal was a form field. Here the answer draws itself as
   it is typed: where they are, where they want to be, what each week has to
   find, and whether that is a normal block. Changing the date redraws it, so
   the athlete learns what the plan does by moving it.

   The verdicts use the rates the goal check on Goals uses (goalFeasibility),
   so setup never calls realistic what the app later calls out of reach. */

export type GoalPathInput = {
  kind: 'lift' | 'race' | 'weight';
  unit: string;
  target: string;
  current: string;
  date: string;
};

type Tone = 'good' | 'stretch' | 'hard';
export type GoalPath = {
  from: number; to: number; weeks: number;
  fromLabel: string; toLabel: string;
  headline: string; verdict: string; tone: Tone;
  note?: string;
  /* A date that makes the goal a normal block, offered as one tap. */
  suggestWeeks?: number;
};

const clockSeconds = (value: string) => {
  const parts = value.trim().split(':').map(Number);
  if (!parts.length || parts.some(part => !Number.isFinite(part))) return 0;
  /* A bare number is minutes, as the goal field reads it. */
  return parts.length === 1 ? parts[0] * 60 : parts.reduce((total, part) => total * 60 + part, 0);
};
const round = (value: number, step: number) => Math.round(value / step) * step;
const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function goalPath({ kind, unit, target, current, date }: GoalPathInput): GoalPath | null {
  const weeks = Math.max(1, Math.round(weeksUntil(date)));
  const by = shortDate(date);
  if (kind === 'race') {
    const to = clockSeconds(target); const from = clockSeconds(current);
    if (!to || !from) return null;
    const hours = unit !== 'mm:ss';
    const fromLabel = secondsToClock(from, hours && from >= 3600); const toLabel = secondsToClock(to, hours && to >= 3600);
    if (to >= from) return { from, to, weeks, fromLabel, toLabel, headline: 'You’re already there', verdict: 'Done', tone: 'good', note: 'Set a faster time and Forge has something to build toward.' };
    const perWeek = (from - to) / weeks;
    const reachable = reachableSeconds(from, weeks);
    const headline = `${Math.max(1, Math.round(perWeek))} seconds faster each week for ${weeks} weeks`;
    if (to >= reachable) return { from, to, weeks, fromLabel, toLabel, headline, verdict: to >= reachableSeconds(from, weeks, 0.006) ? 'Realistic' : 'Ambitious', tone: to >= reachableSeconds(from, weeks, 0.006) ? 'good' : 'stretch' };
    return { from, to, weeks, fromLabel, toLabel, headline, verdict: 'Too fast for one block', tone: 'hard',
      note: `About ${secondsToClock(reachable, hours && reachable >= 3600)} is reachable by ${by}. Keep the goal and Forge will say so honestly as you train.` };
  }
  const to = Number.parseFloat(target); const from = Number.parseFloat(current);
  if (!(to > 0) || !(from > 0)) return null;
  const step = unit === 'kg' ? 0.5 : 1;
  const fromLabel = `${round(from, step)} ${unit}`; const toLabel = `${round(to, step)} ${unit}`;
  if (kind === 'weight') {
    if (Math.abs(to - from) < step) return { from, to, weeks, fromLabel, toLabel, headline: 'Hold where you are', verdict: 'Maintain', tone: 'good' };
    const perWeek = (to - from) / weeks;
    const share = Math.abs(perWeek) / from;
    const headline = `${perWeek > 0 ? '+' : '−'}${Math.abs(perWeek).toFixed(1)} ${unit} a week for ${weeks} weeks`;
    if (share <= 0.0075) return { from, to, weeks, fromLabel, toLabel, headline, verdict: 'Realistic', tone: 'good' };
    if (share <= 0.01) return { from, to, weeks, fromLabel, toLabel, headline, verdict: 'Ambitious', tone: 'stretch' };
    const suggestWeeks = Math.ceil(Math.abs(to - from) / (from * 0.0075));
    return { from, to, weeks, fromLabel, toLabel, headline, verdict: 'Faster than is healthy', tone: 'hard', suggestWeeks,
      note: `About ¾% of your body weight a week keeps it steady, which is ${suggestWeeks} weeks.` };
  }
  /* A lift. The best they gave is read as a one-rep max, as the goal is. */
  if (from >= to) return { from, to, weeks, fromLabel, toLabel, headline: 'You’re already there', verdict: 'Done', tone: 'good', note: 'Set a heavier target and Forge has something to build toward.' };
  const perWeek = (to - from) / weeks;
  const headline = `+${round(perWeek, 0.5)} ${unit} a week for ${weeks} weeks`;
  const reachable = from * Math.pow(1 + STRENGTH_WEEKLY_GAIN, Math.min(weeks, 24));
  if (to <= reachable) {
    const easy = to <= from * Math.pow(1 + STRENGTH_WEEKLY_GAIN * 0.6, Math.min(weeks, 24));
    return { from, to, weeks, fromLabel, toLabel, headline, verdict: easy ? 'Realistic' : 'Ambitious', tone: easy ? 'good' : 'stretch' };
  }
  const suggestWeeks = Math.ceil(Math.log(to / from) / Math.log(1 + STRENGTH_WEEKLY_GAIN));
  return { from, to, weeks, fromLabel, toLabel, headline, verdict: 'Too much for one block', tone: 'hard',
    suggestWeeks: suggestWeeks <= 52 ? suggestWeeks : undefined,
    note: suggestWeeks <= 52 ? `About 1% a week is a strong block, which is ${suggestWeeks} weeks.` : `${Math.round(reachable / 5) * 5} ${unit} is reachable by ${by}. A nearer milestone keeps the plan honest.` };
}

/* The line climbs left to right whatever the goal, because the card is about
   progress: a faster time and a lighter body both read as "up". Week marks
   every four weeks show the plan in blocks. */
export function OnboardingGoalPath({ path, date, onUseWeeks, compact = false }: { path: GoalPath; date: string; onUseWeeks?: (weeks: number) => void; compact?: boolean }) {
  /* The line stretches to any width; the dots are placed over it in
     percentages so they stay round. */
  const marks = Array.from({ length: Math.floor((path.weeks - 1) / 4) }, (_, index) => (index + 1) * 4);
  const at = (week: number) => ({ left: `${(week / path.weeks) * 100}%`, top: `${100 - (week / path.weeks) * 100}%` });
  return <div className={`ob-path ${path.tone}${compact ? ' compact' : ''}`} aria-live="polite">
    <div className="ob-path-head"><strong>{path.headline}</strong><span className="ob-path-verdict">{path.verdict}</span></div>
    <div className="ob-path-chart" role="img" aria-label={`From ${path.fromLabel} now to ${path.toLabel} by ${shortDate(date)}`}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="100" x2="100" y2="0" className="ob-path-line" /></svg>
      {marks.map(week => <i key={week} className="ob-path-mark" style={at(week)} />)}
      <i className="ob-path-start" style={at(0)} />
      <i className="ob-path-end" style={at(path.weeks)} />
    </div>
    <div className="ob-path-ends"><span>Now · {path.fromLabel}</span><span>{shortDate(date)} · {path.toLabel}</span></div>
    {path.note && <p className="ob-path-note">{path.note}</p>}
    {path.suggestWeeks && onUseWeeks && <button type="button" className="text-button ob-path-use" onClick={() => onUseWeeks(path.suggestWeeks!)}>Give it {path.suggestWeeks} weeks</button>}
  </div>;
}
