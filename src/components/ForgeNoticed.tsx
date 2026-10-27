import { useMemo } from 'react';
import { useCoachNotes } from '../features/training/useCoachNotes';
import { useCoachActions } from '../features/training/useCoachActions';
import { openCoachBubble } from '../features/training/coachService';
import { Icon } from './Icon';

/* THE COACH SPEAKING FIRST, ON THE SCREEN YOU OPEN FIRST.

   One line. The thing Forge noticed, with its number in it. Two ways out:
   ask about it, which opens the coach with the fact already in the question,
   or "Got it", which is the acknowledgement that keeps it from ever being said
   again. No third button, no expand, no list — the ranking lives in
   lib/coachNotes and the card shows the top of it, and when that is seen the
   next one is here tomorrow or on the next visit.

   The weekly review is the one exception to "one line": four lines, and
   when the numbers warrant a change, the change itself as one tap — through
   the same path the chat coach's confirm card uses.

   It is absent, not empty, when there is nothing to say. A card that says
   "nothing to report" is the tab bar of cards. */
export function ForgeNoticed() {
  const { note, pending, acknowledge } = useCoachNotes();
  const coach = useCoachActions();
  const actions = useMemo(() => (note?.actions ? coach.parse(note.actions) : []), [note, coach]);
  if (!note) return null;
  const review = note.kind === 'week-review';
  const applyAndClose = () => { coach.apply(actions, note.ask); acknowledge(note); };
  return <section className={`card forge-noticed${review ? ' forge-week-review' : ''}`} role="status" aria-live="polite">
    <div className="forge-noticed-head">
      <span className="eyebrow">{review ? 'Last week' : 'Forge noticed'}</span>
      {pending > 1 && <small>{pending - 1} more</small>}
    </div>
    {/* THE WEEK, DRAWN. Four numbered sentences read as homework; the same
        facts are a row of days, a bar of miles and a PR — and a sentence only
        when something is actually changing. */}
    {note.review
      ? <div className="wk">
          {note.review.planned > 0 && <div className="wk-row">
            <span className="wk-dots" aria-label={`${note.review.trained} of ${note.review.planned} days trained`}>{Array.from({ length: Math.max(note.review.planned, note.review.trained) }, (_, index) => <i key={index} className={index < note.review!.trained ? 'on' : ''} style={{ animationDelay: `${index * 90}ms` }} />)}</span>
            <strong>{note.review.trained}<small>/{note.review.planned} days</small></strong>
          </div>}
          {(note.review.plannedMiles > 0 || note.review.ran > 0) && <div className="wk-row">
            <span className="wk-bar"><i style={{ width: `${Math.min(100, note.review.plannedMiles ? (note.review.ran / note.review.plannedMiles) * 100 : 100)}%` }} /></span>
            <strong>{note.review.ran}<small>{note.review.plannedMiles ? `/${note.review.plannedMiles}` : ''} {note.review.unit}</small></strong>
          </div>}
          {note.review.prs.length > 0 && <div className="wk-prs">{note.review.prs.slice(0, 3).map(pr => <span key={pr.lift}><Icon name="trophy" size={14}/> {pr.lift} {pr.weight}×{pr.reps}</span>)}</div>}
          {note.review.change && <p className="wk-change">{note.review.change}</p>}
          {note.review.next && <p className="wk-next"><span>Next</span>{note.review.next}</p>}
        </div>
      : note.lines
      ? <ol className="forge-noticed-lines">{note.lines.map(line => <li key={line}>{line}</li>)}</ol>
      : <p className="forge-noticed-say">{note.say}</p>}
    {!note.lines && !note.review && note.detail && <p className="forge-noticed-detail">{note.detail}</p>}
    {note.receipt && <details className="forge-noticed-receipt">
      <summary>{note.receipt.length ? `The ${note.receipt.length} run${note.receipt.length === 1 ? '' : 's'} behind that` : 'No runs logged in the last 7 days'}</summary>
      {note.receipt.length > 0 && <ul>{note.receipt.map(line => <li key={line}>{line}</li>)}</ul>}
    </details>}
    {actions.length > 0 && <ul className="forge-noticed-actions-list">{actions.map(action => <li key={action.label}>{action.label}</li>)}</ul>}
    <div className="forge-noticed-actions">
      <button type="button" className="text-button" onClick={() => openCoachBubble(note.ask)}>Ask Forge</button>
      {actions.length > 0
        ? <><button type="button" className="button ghost small-button" onClick={() => acknowledge(note)}>Not now</button><button type="button" className="button small-button" onClick={applyAndClose}>Apply</button></>
        : <button type="button" className="button secondary small-button" onClick={() => acknowledge(note)}>Got it</button>}
    </div>
  </section>;
}
