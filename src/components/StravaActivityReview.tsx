import { useEffect, useMemo, useState } from 'react';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { requestCardioParse } from '../features/training/coachService';
import { parseCardioDescription } from '../lib/cardioParse';
import { formatCardioSummary, type CardioLogDraft } from '../lib/cardioSession';
import { markStravaReviewed, pendingStravaReviews } from '../features/training/stravaImportService';

/* Strava-style feed card: a freshly synced activity shows on Today with an AI
   box beneath it. The watch knows "3 mi @ 9:00"; only the athlete knows it was
   6×300 at :37 with walking rests — one sentence here restructures the logged
   session into those real intervals, keeping the same session id so the sync
   never re-imports a duplicate. */
export function StravaActivityReview() {
  const { records, updateRecord } = useWorkoutHistory();
  const [queue, setQueue] = useState<string[]>(pendingStravaReviews);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [reflection, setReflection] = useState('');
  useEffect(() => {
    const refresh = () => setQueue(pendingStravaReviews());
    window.addEventListener('forge-strava-review-changed', refresh);
    return () => window.removeEventListener('forge-strava-review-changed', refresh);
  }, []);

  const pending = useMemo(() => {
    for (const record of records) {
      const session = (record.cardioSessions || []).find(item => queue.includes(String(item.id)));
      if (session) return { record, session };
    }
    return null;
  }, [records, queue]);

  if (!pending) return null;
  const { record, session } = pending;
  const dateLabel = new Date(`${record.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  const dismiss = () => { markStravaReviewed(String(session.id)); setText(''); setReflection(''); };

  const refine = async () => {
    const description = text.trim();
    if (!description || busy) return;
    setBusy(true); setReflection('');
    const local = parseCardioDescription(description);
    const parsed = await requestCardioParse(description, {
      syncedDeviceSummary: session.summary,
      activityDate: record.date,
      savedCardioTypes: ['Run', 'Speed Run', 'Long Run', 'Easy', 'Base', 'Tempo', 'Walk', 'Bike', 'Rowing', 'Swimming'],
    }, local);
    if (!parsed.rows.length) { setReflection(parsed.reflection || 'Could not read a workout from that — try describing the reps and rest.'); setBusy(false); return; }
    /* A distance never sits on a time unit. Named here rather than imported so
     this file states the rule it is keeping. */
  const distanceSafeUnit = (row: { cardioType?: string; unit?: string; distance?: number }) => {
    const unit = String(row.unit || 'miles');
    if (!(Number(row.distance) > 0) || /mile|km|kilo|meter|yard/i.test(unit)) return unit;
    return /row|ski|erg/i.test(String(row.cardioType || '')) ? 'meters' : /swim/i.test(String(row.cardioType || '')) ? 'yards' : 'miles';
  };
  const refined: CardioLogDraft = {
      ...session,
      structure: parsed.rows.length > 1 ? 'intervals' : 'steady',
      /* Only the AI reads intent well enough to rename the session — the
         local regex fallback once heard "walking rests" and called a speed
         workout a Walk. Offline, the activity keeps its synced name. */
      activity: parsed.source === 'ai' ? (parsed.rows[0].cardioType || session.activity) : session.activity,
      prescription: {
        /* THE SAME UNIT GUARANTEE THE COMPOSER GIVES. This was the third
           path into cardio storage and the only one with no coercion at all,
           so the exact sentence the composer rescues — a distance the model
           attached to a time unit — was stored here as zero miles. */
        legacyIntervals: parsed.rows.map(row => ({ cardioType: row.cardioType, unit: distanceSafeUnit(row), distance: row.distance, time: row.timeMinutes })),
        distanceUnit: distanceSafeUnit(parsed.rows[0]),
        note: parsed.note || 'Refined from Strava sync',
      },
      summary: '',
    };
    refined.summary = formatCardioSummary(refined);
    const { id, ...savedDay } = record;
    const result = updateRecord(id, {
      ...savedDay,
      hasCardio: true,
      cardioSessions: (record.cardioSessions || []).map(item => String(item.id) === String(session.id) ? refined : item),
    });
    if (result.ok) {
      setReflection(parsed.reflection || 'Logged with the real structure.');
      markStravaReviewed(String(session.id));
      setText('');
    } else {
      setReflection('The refined session could not be saved. Try again.');
    }
    setBusy(false);
  };

  return <section className="card strava-review">
    <header>
      <div><span className="eyebrow">SYNCED FROM STRAVA · {dateLabel.toUpperCase()}</span><strong>{session.summary}</strong></div>
      <span className="strava-review-badge">New</span>
    </header>
    <p>The watch logged the totals. If this was structured work, describe it and Forge will log the real session.</p>
    <textarea value={text} onChange={event => setText(event.target.value)} rows={2} placeholder="e.g. 6×300 at :37 with walking rests, plus warmup and cooldown" disabled={busy} />
    {reflection && <small className="strava-review-reflection">{reflection}</small>}
    <footer>
      <button type="button" className="button ghost" disabled={busy} onClick={dismiss}>Looks right as-is ✓</button>
      <button type="button" className="button" disabled={busy || !text.trim()} onClick={() => void refine()}>{busy ? 'Reading it…' : 'Log the real session →'}</button>
    </footer>
  </section>;
}
