import { useEffect, useMemo, useState } from 'react';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useTrainingLibrary, exerciseCategory } from '../features/training/TrainingLibraryProvider';
import { requestCardioParse } from '../features/training/coachService';
import { parseCardioDescription } from '../lib/cardioParse';
import { formatCardioSummary, type CardioLogDraft } from '../lib/cardioSession';
import { markStravaReviewed, pendingStravaReviews } from '../features/training/stravaImportService';
import { calculateEstimatedOneRepMax } from '../lib/strength';
import { primaryMusclesFor } from '../lib/liftAliases';
import { DialField } from './NumberDial';

/* A SYNCED ACTIVITY IS HALF A RECORD, AND IT DESERVES THE WHOLE SCREEN.
   Strava knows the athlete moved for 54 minutes. It does not know which split
   day that was, what they lifted, or that the 3 miles were 6×300 at :37 with
   walking rests — and those are the facts Forge's program runs on.

   This was a strip at the top of Today, easy to scroll past and too small to
   answer in. It takes over the screen now, with the same AI box the log has,
   because a synced day is a question the athlete should answer once and then
   be done with rather than something to dismiss on the way to somewhere else.

   Three answers, all optional, one save: which day, the top set, and what it
   actually was in their own words. "Looks right" is always there. */
type PlanDay = { name: string; dayType: string; muscles?: string[]; exercises?: string[] };

export function StravaReviewModal() {
  const { records, updateRecord } = useWorkoutHistory();
  const { exercises } = useTrainingLibrary();
  const [queue, setQueue] = useState<string[]>(pendingStravaReviews);
  const [dayIndex, setDayIndex] = useState('');
  const [lift, setLift] = useState('');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [reflection, setReflection] = useState('');

  useEffect(() => {
    const refresh = () => setQueue(pendingStravaReviews());
    window.addEventListener('forge-strava-review-changed', refresh);
    return () => window.removeEventListener('forge-strava-review-changed', refresh);
  }, []);

  const planDays = useMemo<PlanDay[]>(() => {
    try {
      const plan = JSON.parse(localStorage.getItem('forge-training-plan-v1') || 'null') as { days?: PlanDay[] } | null;
      return plan?.days || [];
    } catch { return []; }
  }, []);

  /* Oldest first — a backlog is answered in the order it happened. */
  const pending = useMemo(() => {
    for (const date of [...queue].sort()) {
      const record = records.find(item => item.date === date);
      if (record) return { date, record };
    }
    return null;
  }, [records, queue]);

  const strengthLibrary = useMemo(
    () => exercises.filter(item => item.enabled && exerciseCategory(item) === 'Strength'),
    [exercises],
  );
  const chosenDay = dayIndex === '' ? undefined : planDays[Number(dayIndex)];
  /* The chosen day's own lifts first — that is what the athlete trains there —
     with the rest of the library behind, since a gym session is not always
     the plan. */
  const liftOptions = useMemo(() => {
    const mapped = (chosenDay?.exercises || []).filter(Boolean);
    return [...mapped, ...strengthLibrary.map(item => item.name).filter(name => !mapped.includes(name))];
  }, [chosenDay, strengthLibrary]);

  /* The escape key closes it, like any takeover. */
  useEffect(() => {
    if (!pending) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') markStravaReviewed(pending.date); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);

  if (!pending) return null;
  const { date, record } = pending;
  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const cardio = (record.cardioSessions || [])[0];
  const max = calculateEstimatedOneRepMax(Number(weight), Number(reps));
  const hasTopSet = Boolean(lift && Number(weight) > 0 && Number(reps) > 0);
  const hasAnswer = Boolean(chosenDay) || hasTopSet || Boolean(text.trim());

  const close = () => { markStravaReviewed(date); setDayIndex(''); setLift(''); setWeight(''); setReps(''); setText(''); setReflection(''); };

  /* A distance never sits on a time unit — the rule this file must keep. */
  const distanceSafeUnit = (row: { cardioType?: string; unit?: string; distance?: number }) => {
    const unit = String(row.unit || 'miles');
    if (!(Number(row.distance) > 0) || /mile|km|kilo|meter|yard/i.test(unit)) return unit;
    return /row|ski|erg/i.test(String(row.cardioType || '')) ? 'meters' : /swim/i.test(String(row.cardioType || '')) ? 'yards' : 'miles';
  };

  const save = async () => {
    if (!hasAnswer || busy) return;
    setBusy(true); setReflection('');
    const { id, ...day } = record;
    let next = { ...day } as Omit<typeof record, 'id'>;

    /* 1. The athlete's words rebuild the cardio session, when there is one. */
    const description = text.trim();
    if (description && cardio) {
      const local = parseCardioDescription(description);
      const parsed = await requestCardioParse(description, {
        syncedDeviceSummary: cardio.summary,
        activityDate: record.date,
        savedCardioTypes: ['Run', 'Speed Run', 'Long Run', 'Easy', 'Base', 'Tempo', 'Walk', 'Bike', 'Rowing', 'Swimming'],
      }, local);
      if (parsed.rows.length) {
        const refined: CardioLogDraft = {
          ...cardio,
          structure: parsed.rows.length > 1 ? 'intervals' : 'steady',
          /* Only the AI reads intent well enough to rename the session — the
             local fallback once heard "walking rests" and called a speed
             workout a Walk. Offline, the synced name stands. */
          activity: parsed.source === 'ai' ? (parsed.rows[0].cardioType || cardio.activity) : cardio.activity,
          prescription: {
            legacyIntervals: parsed.rows.map(row => ({ cardioType: row.cardioType, unit: distanceSafeUnit(row), distance: row.distance, time: row.timeMinutes })),
            distanceUnit: distanceSafeUnit(parsed.rows[0]),
            note: parsed.note || 'Refined from Strava sync',
          },
          summary: '',
        };
        refined.summary = formatCardioSummary(refined);
        next = { ...next, hasCardio: true, cardioSessions: (record.cardioSessions || []).map(item => String(item.id) === String(cardio.id) ? refined : item) };
      } else {
        setReflection(parsed.reflection || 'Could not read a workout from that — try describing the reps and rest.');
        setBusy(false); return;
      }
    } else if (description) {
      /* No cardio session to rebuild: keep the words as the day's note. */
      next = { ...next, notes: [record.notes, description].filter(Boolean).join('\n') };
    }

    /* 2. The split day the athlete assigns owns the day's identity. */
    const libraryMuscles = exercises.find(item => item.name === lift)?.muscles || [];
    const liftMuscles = hasTopSet ? primaryMusclesFor(lift, libraryMuscles) : [];
    if (chosenDay) {
      next = {
        ...next,
        title: chosenDay.name || record.title,
        splitPosition: Number(dayIndex) + 1,
        muscles: Array.from(new Set([
          ...(chosenDay.muscles || []).filter(muscle => muscle !== 'Cardio'),
          ...liftMuscles,
          ...(next.hasCardio ? ['Cardio'] : []),
        ])),
      };
    } else if (liftMuscles.length) {
      next = { ...next, muscles: Array.from(new Set([...(record.muscles || []), ...liftMuscles])) };
    }

    /* 3. The top set. */
    if (hasTopSet) {
      next = {
        ...next,
        topSets: [...(record.topSets || []), { muscle: liftMuscles[0] || 'Primary', lift, weight: Number(weight), reps: Number(reps), calculatedMax: max ?? undefined, completed: true }],
      };
    }

    const result = updateRecord(id, next);
    setBusy(false);
    if (!result.ok) { setReflection('That could not be saved. Try again.'); return; }
    close();
  };

  return <div className="strava-review-backdrop" role="dialog" aria-modal="true" aria-label="Review synced activity">
    <div className="strava-review-sheet">
      <header>
        <div>
          <span className="eyebrow">SYNCED FROM STRAVA</span>
          <strong>{record.title}</strong>
          <small>{dateLabel}{cardio?.summary ? ` · ${cardio.summary}` : ''}</small>
        </div>
        <button type="button" className="strava-review-close" onClick={close} aria-label="Close">×</button>
      </header>
      <p className="strava-review-lede">Strava recorded the totals. Tell Forge what it actually was.</p>

      <label>Split day
        {planDays.length
          ? <select value={dayIndex} onChange={event => { setDayIndex(event.target.value); setLift(''); }}>
              <option value="">Not part of the split</option>
              {planDays.map((day, index) => <option key={`${day.name}-${index}`} value={index}>{day.name}</option>)}
            </select>
          : <small className="strava-review-hint">Build a split in Plan and its days appear here.</small>}
      </label>

      <div className="strava-review-set">
        <label>Top set
          <select value={lift} onChange={event => setLift(event.target.value)}>
            <option value="">No top set</option>
            {liftOptions.map(name => <option key={name}>{name}</option>)}
          </select>
        </label>
        {lift && <div className="strava-review-numbers">
          <DialField label="Weight" kind="weight" unit="lb" value={weight} onChange={setWeight} />
          <DialField label="Reps" kind="reps" value={reps} onChange={setReps} />
        </div>}
        {hasTopSet && max ? <small className="strava-review-max">{Number(reps) === 1 ? 'Real 1RM' : 'Calculated max'} {max}</small> : null}
      </div>

      <label>Describe it
        <textarea value={text} onChange={event => setText(event.target.value)} rows={3} disabled={busy}
          placeholder={cardio ? 'e.g. 6×300 at :37 with walking rests, plus warmup and cooldown' : 'e.g. heavy squats, felt strong, 3 back-off sets after'} />
      </label>
      {reflection && <small className="strava-review-reflection">{reflection}</small>}

      <footer>
        <button type="button" className="button ghost" disabled={busy} onClick={close}>Looks right ✓</button>
        <button type="button" className="button" disabled={busy || !hasAnswer} onClick={() => void save()}>{busy ? 'Reading it…' : 'Save this day →'}</button>
      </footer>
    </div>
  </div>;
}
