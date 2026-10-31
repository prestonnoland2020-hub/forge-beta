import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useCoachNotes } from '../features/training/useCoachNotes';
import { useCoachActions } from '../features/training/useCoachActions';
import { openCoachBubble } from '../features/training/coachService';
import { Icon } from './Icon';
import { localDayIso } from '../lib/time';

/* NOW AND AGAIN, NOT EVERY VISIT. A card that sat on Today every time the app
   opened turned into furniture. The note now arrives as a pop-up at most once
   every two days, never mid-workout or over the coach, and waits its turn
   behind any other dialog already asking something. */
const LAST_KEY = 'forge-noticed-shown';
const GAP_DAYS = 2;
const readLast = () => { try { return localStorage.getItem(LAST_KEY) || ''; } catch { return ''; } };
const writeLast = (iso: string) => { try { localStorage.setItem(LAST_KEY, iso); } catch { /* private mode */ } };
const daysSince = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 86400000);

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
  const { note: next, acknowledge } = useCoachNotes();
  const coach = useCoachActions();
  const { pathname } = useLocation();
  const today = localDayIso();
  const quiet = pathname === '/workout' || pathname === '/coach' || pathname.startsWith('/onboarding');
  /* Latched when it opens: acknowledging moves the ranking on, and the pop-up
     should close on the note it showed, not swap to the next one. */
  const [note, setNote] = useState<typeof next>(null);
  useEffect(() => {
    if (note || !next || quiet) return;
    const last = readLast();
    if (last && daysSince(last, today) < GAP_DAYS) return;
    const timer = window.setTimeout(() => {
      if (document.querySelector('[aria-modal="true"]')) return;
      writeLast(today);
      setNote(next);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [next, note, quiet, today, pathname]);
  const actions = useMemo(() => (note?.actions ? coach.parse(note.actions) : []), [note, coach]);
  if (!note) return null;
  const review = note.kind === 'week-review';
  const close = () => setNote(null);
  const done = () => { acknowledge(note); close(); };
  const applyAndClose = () => { coach.apply(actions, note.ask); done(); };
  return <div className="coach-checkin-backdrop forge-noticed-backdrop" role="dialog" aria-modal="true" aria-label="Forge noticed" onClick={event => { if (event.target === event.currentTarget) close(); }}>
  <section className={`card coach-checkin forge-noticed${review ? ' forge-week-review' : ''}`}>
    <div className="forge-noticed-head">
      <span className="eyebrow">{review ? 'Last week' : 'Forge noticed'}</span>
      <button type="button" className="forge-noticed-close" aria-label="Close" onClick={close}><Icon name="close" size={16} /></button>
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
      <button type="button" className="text-button" onClick={() => { close(); openCoachBubble(note.ask); }}>Ask Forge</button>
      {actions.length > 0
        ? <><button type="button" className="button ghost small-button" onClick={done}>Not now</button><button type="button" className="button small-button" onClick={applyAndClose}>Apply</button></>
        : <button type="button" className="button secondary small-button" onClick={done}>Got it</button>}
    </div>
  </section>
  </div>;
}
