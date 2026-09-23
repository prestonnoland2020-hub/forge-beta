import { useCoachNotes } from '../features/training/useCoachNotes';
import { openCoachBubble } from '../features/training/coachService';

/* THE COACH SPEAKING FIRST, ON THE SCREEN YOU OPEN FIRST.

   One line. The thing Forge noticed, with its number in it. Two ways out:
   ask about it, which opens the coach with the fact already in the question,
   or "Got it", which is the acknowledgement that keeps it from ever being said
   again. No third button, no expand, no list — the ranking lives in
   lib/coachNotes and the card shows the top of it, and when that is seen the
   next one is here tomorrow or on the next visit.

   It is absent, not empty, when there is nothing to say. A card that says
   "nothing to report" is the tab bar of cards. */
export function ForgeNoticed() {
  const { note, pending, acknowledge } = useCoachNotes();
  if (!note) return null;
  return <section className="card forge-noticed" role="status" aria-live="polite">
    <div className="forge-noticed-head">
      <span className="eyebrow">Forge noticed</span>
      {pending > 1 && <small>{pending - 1} more</small>}
    </div>
    <p className="forge-noticed-say">{note.say}</p>
    {note.detail && <p className="forge-noticed-detail">{note.detail}</p>}
    {note.receipt && <details className="forge-noticed-receipt">
      <summary>{note.receipt.length ? `The ${note.receipt.length} run${note.receipt.length === 1 ? '' : 's'} behind that` : 'No runs logged in the last 7 days'}</summary>
      {note.receipt.length > 0 && <ul>{note.receipt.map(line => <li key={line}>{line}</li>)}</ul>}
    </details>}
    <div className="forge-noticed-actions">
      <button type="button" className="text-button" onClick={() => openCoachBubble(note.ask)}>Ask Forge</button>
      <button type="button" className="button secondary small-button" onClick={() => acknowledge(note)}>Got it</button>
    </div>
  </section>;
}
