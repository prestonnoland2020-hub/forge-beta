import { useMemo } from 'react';
import { useCoachNotes } from '../features/training/useCoachNotes';
import { useCoachActions } from '../features/training/useCoachActions';
import { openCoachBubble } from '../features/training/coachService';

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
      <span className="eyebrow">{review ? 'Your week' : 'Forge noticed'}</span>
      {pending > 1 && <small>{pending - 1} more</small>}
    </div>
    {note.lines
      ? <ol className="forge-noticed-lines">{note.lines.map(line => <li key={line}>{line}</li>)}</ol>
      : <p className="forge-noticed-say">{note.say}</p>}
    {!note.lines && note.detail && <p className="forge-noticed-detail">{note.detail}</p>}
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
