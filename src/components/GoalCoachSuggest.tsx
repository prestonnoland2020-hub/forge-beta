import type { GoalSuggestion } from '../lib/goalSuggestions';

/* THE COACH'S THREE GOALS, above the fields. One tap fills the target and the
   date; the fields stay editable underneath for anybody who has their own
   number in mind. */
export function GoalCoachSuggest({ suggestions, chosen, onChoose, empty, direction, onDirection }: {
  suggestions: GoalSuggestion[];
  chosen: string | null;
  onChoose: (suggestion: GoalSuggestion) => void;
  empty?: string;
  direction?: 'lose' | 'gain';
  onDirection?: (direction: 'lose' | 'gain') => void;
}) {
  return <section className="goal-coach" aria-label="Coach suggests">
    <header className="goal-coach-head">
      <b>Coach suggests</b>
      {onDirection && <span className="goal-coach-dir" role="radiogroup" aria-label="Direction">
        {(['lose', 'gain'] as const).map(value => <button type="button" role="radio" aria-checked={direction === value} className={direction === value ? 'active' : ''} key={value} onClick={() => onDirection(value)}>{value === 'lose' ? 'Lose' : 'Gain'}</button>)}
      </span>}
    </header>
    {suggestions.length ? <div className="goal-coach-list">
      {suggestions.map(item => <button type="button" key={item.tier} className={`goal-coach-option tier-${item.tier}${chosen === item.tier ? ' active' : ''}`} aria-pressed={chosen === item.tier} onClick={() => onChoose(item)}>
        <span className="goal-coach-top"><em>{item.name}</em><small>{item.verdict}</small></span>
        <span className="goal-coach-target"><b>{item.label}</b><small>by {item.dateLabel}</small></span>
        <span className="goal-coach-how">{item.how}</span>
      </button>)}
    </div> : <p className="goal-coach-empty">{empty}</p>}
    <small className="goal-coach-own">Or set your own below.</small>
  </section>;
}

/* Before a type is chosen: "have you thought about this one?" */
export function GoalCoachPicks({ picks, onPick }: { picks: GoalSuggestion[]; onPick: (pick: GoalSuggestion) => void }) {
  if (!picks.length) return null;
  return <section className="goal-coach picks" aria-label="Coach's picks">
    <header className="goal-coach-head"><b>Have you thought about…</b></header>
    <div className="goal-coach-list">
      {picks.map(item => <button type="button" key={`${item.goal.exercise}-${item.tier}`} className="goal-coach-option" onClick={() => onPick(item)}>
        <span className="goal-coach-top"><em>{item.goal.exercise}</em><small>{item.verdict}</small></span>
        <span className="goal-coach-target"><b>{item.label}</b><small>by {item.dateLabel}</small></span>
        <span className="goal-coach-how">{item.how}</span>
      </button>)}
    </div>
    <small className="goal-coach-own">Or pick a type below.</small>
  </section>;
}
