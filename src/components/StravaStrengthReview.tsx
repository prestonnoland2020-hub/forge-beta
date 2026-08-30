import { useEffect, useMemo, useState } from 'react';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useTrainingLibrary, exerciseCategory } from '../features/training/TrainingLibraryProvider';
import { markStrengthReviewed, pendingStrengthReviews } from '../features/training/stravaImportService';
import { calculateEstimatedOneRepMax } from '../lib/strength';
import { primaryMusclesFor } from '../lib/liftAliases';

/* A SYNCED LIFT IS HALF A RECORD. Strava knows the athlete was in the gym for
   54 minutes. It does not know which split day that was or what they lifted —
   and those are the two facts Forge's whole program runs on: the split day
   moves the cycle, the top set feeds the wave. Without them a gym session
   imports as a dated blank.

   So the card asks for exactly those two things and nothing else. Two taps and
   a number: which day, which lift, what you hit. Everything else — the
   muscles, the calculated max, the title, the split position — Forge derives.
   "Not now" is always available, because a half-remembered top set is worse
   than none. */
type PlanDay = { name: string; dayType: string; muscles?: string[]; exercises?: string[] };

export function StravaStrengthReview() {
  const { records, updateRecord } = useWorkoutHistory();
  const { exercises } = useTrainingLibrary();
  const [queue, setQueue] = useState<string[]>(pendingStrengthReviews);
  const [dayIndex, setDayIndex] = useState('');
  const [lift, setLift] = useState('');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    const refresh = () => setQueue(pendingStrengthReviews());
    window.addEventListener('forge-strava-review-changed', refresh);
    return () => window.removeEventListener('forge-strava-review-changed', refresh);
  }, []);

  const planDays = useMemo<PlanDay[]>(() => {
    try {
      const plan = JSON.parse(localStorage.getItem('forge-training-plan-v1') || 'null') as { days?: PlanDay[] } | null;
      return plan?.days || [];
    } catch { return []; }
  }, []);

  /* Oldest first: the athlete works through a backlog in the order it happened. */
  const pending = useMemo(() => {
    const dates = [...queue].sort();
    for (const date of dates) {
      const record = records.find(item => item.date === date);
      if (record) return { date, record };
    }
    return null;
  }, [records, queue]);

  const chosenDay = dayIndex === '' ? undefined : planDays[Number(dayIndex)];
  /* The day's own mapping first — that is what the athlete trains there — and
     the rest of the library behind it, since a gym session is not always the
     plan. */
  const strengthLibrary = useMemo(
    () => exercises.filter(item => item.enabled && exerciseCategory(item) === 'Strength'),
    [exercises],
  );
  const options = useMemo(() => {
    const mapped = (chosenDay?.exercises || []).filter(Boolean);
    const rest = strengthLibrary.map(item => item.name).filter(name => !mapped.includes(name));
    return [...mapped, ...rest];
  }, [chosenDay, strengthLibrary]);

  if (!pending) return null;
  const { date, record } = pending;
  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const max = calculateEstimatedOneRepMax(Number(weight), Number(reps));
  const ready = Boolean(chosenDay && lift && Number(weight) > 0 && Number(reps) > 0);

  const reset = () => { setDayIndex(''); setLift(''); setWeight(''); setReps(''); };
  const dismiss = () => { markStrengthReviewed(date); reset(); setSaved(''); };

  const save = () => {
    if (!ready || !chosenDay) return;
    const libraryMuscles = exercises.find(item => item.name === lift)?.muscles || [];
    const muscles = Array.from(new Set([
      ...(chosenDay.muscles || []).filter(muscle => muscle !== 'Cardio'),
      /* A lift logs its primary movers, exactly as it would anywhere else. */
      ...primaryMusclesFor(lift, libraryMuscles),
      ...(record.hasCardio ? ['Cardio'] : []),
    ]));
    const result = updateRecord(record.id, {
      ...record,
      title: chosenDay.name || record.title,
      muscles,
      splitPosition: Number(dayIndex) + 1,
      topSets: [
        ...(record.topSets || []),
        { muscle: primaryMusclesFor(lift, libraryMuscles)[0] || 'Primary', lift, weight: Number(weight), reps: Number(reps), calculatedMax: max ?? undefined, completed: true },
      ],
    } as Omit<typeof record, 'id'>);
    if (!result.ok) return;
    setSaved(`${chosenDay.name} · ${lift} ${weight}×${reps}`);
    markStrengthReviewed(date);
    reset();
  };

  return <section className="card strava-strength-review">
    <header>
      <div>
        <span className="eyebrow">SYNCED FROM STRAVA</span>
        <strong>{record.title}</strong>
        <small>{dateLabel} · Which day was this, and what was your top set?</small>
      </div>
      <button type="button" className="text-button" onClick={dismiss}>Not now</button>
    </header>

    {planDays.length > 0
      ? <label>Split day
          <select value={dayIndex} onChange={event => { setDayIndex(event.target.value); setLift(''); }}>
            <option value="">Choose a day</option>
            {planDays.map((day, index) => <option key={`${day.name}-${index}`} value={index}>{day.name}</option>)}
          </select>
        </label>
      : <p className="empty-history">Build a split in Plan first — then its days appear here.</p>}

    {chosenDay && <div className="strength-review-set">
      <label>Top set
        <select value={lift} onChange={event => setLift(event.target.value)}>
          <option value="">Choose a lift</option>
          {options.map(name => <option key={name}>{name}</option>)}
        </select>
      </label>
      <div className="strength-review-numbers">
        <label>Weight<input value={weight} onChange={event => setWeight(event.target.value)} inputMode="decimal" placeholder="0" /></label>
        <label>Reps<input value={reps} onChange={event => setReps(event.target.value)} inputMode="numeric" placeholder="0" /></label>
      </div>
      {max ? <small className="strength-review-max">{Number(reps) === 1 ? 'Real 1RM' : 'Calculated max'} {max}</small> : null}
    </div>}

    <button type="button" className="button wide" disabled={!ready} onClick={save}>Save to this day</button>
    {saved && <small className="strength-review-saved">Saved · {saved}</small>}
  </section>;
}
