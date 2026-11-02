import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useTrainingLibrary, isProgrammableStrength } from '../features/training/TrainingLibraryProvider';
import { requestCardioParse } from '../features/training/coachService';
import { parseCardioDescription } from '../lib/cardioParse';
import { formatCardioSummary, type CardioLogDraft } from '../lib/cardioSession';
import { markStravaReviewed, pendingStravaReviews, stravaReviewHasStrength, stravaReviewSource, cardioClass } from '../features/training/stravaImportService';
import { sessionLength } from '../lib/time';
import { useDailyRecommendation } from '../features/training/DailyRecommendationProvider';
import { sameLift, splitDayKey } from '../lib/liftAliases';
import { calculateEstimatedOneRepMax } from '../lib/strength';
import { primaryMusclesFor } from '../lib/liftAliases';
import { DialField } from './NumberDial';
import { Icon } from './Icon';

/* A SYNCED ACTIVITY IS HALF A RECORD, AND IT DESERVES THE WHOLE SCREEN.
   Strava knows the athlete moved for 54 minutes. It does not know which split
   day that was, what they lifted, or that the 3 miles were 6×300 at :37 with
   walking rests — and those are the facts Forge's program runs on.

   This was a strip at the top of Today, easy to scroll past and too small to
   answer in. It takes over the screen now, with the same AI box the log has,
   because a synced day is a question the athlete should answer once and then
   be done with rather than something to dismiss on the way to somewhere else.

   A gym session is asked what the log page asks, in the same order: which
   workout it was (a split day, or custom), the muscle groups, and the top
   sets — so a watch that synced before anything was typed walks the athlete
   through logging the day rather than a shorter form of it. A run is asked
   only what it actually was. "Looks right" is always there. */
type PlanDay = { name: string; dayType: string; muscles?: string[]; exercises?: string[] };
type DraftSet = { lift: string; weight: number; reps: number };
/* The log page's muscle list, without Cardio — a cardio session marks itself. */
const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Quads', 'Hamstrings', 'Glutes', 'Biceps', 'Triceps', 'Forearms', 'Abs'];
const CUSTOM = 'custom';

export function StravaReviewModal() {
  const { records, updateRecord } = useWorkoutHistory();
  const { exercises } = useTrainingLibrary();
  const { recommendation } = useDailyRecommendation();
  const [queue, setQueue] = useState<string[]>(pendingStravaReviews);
  const [dayIndex, setDayIndex] = useState('');
  const [lift, setLift] = useState('');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [sets, setSets] = useState<DraftSet[]>([]);
  const [muscles, setMuscles] = useState<string[]>([]);
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

  /* WHAT THE DAY IS DECIDES WHAT IT IS ASKED. A run has no split day and no
     top set — asking for them is asking the athlete to answer nothing, twice,
     before they can dismiss the card. A gym session has both, and the split
     day it belongs to is almost always the one Forge already put up for that
     date, so that is filled in rather than demanded. */
  const cardioSessions = pending?.record.cardioSessions || [];
  const loggedTopSets = pending?.record.topSets || [];
  const trainedMuscles = (pending?.record.muscles || []).filter(muscle => muscle !== 'Cardio');
  /* A lift inside the day's sync leaves nothing on the record to find, so the
     question itself remembers. Without this, a morning of lifting plus two
     runs was asked what a run is asked: nothing. */
  const syncedLift = pending ? stravaReviewHasStrength(pending.date) : false;
  const cardioOnly = cardioSessions.length > 0 && !trainedMuscles.length && !loggedTopSets.length && !syncedLift
    && cardioSessions.every(session => cardioClass(session.activity || '') !== 'strength');

  const todayIso = (() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; })();
  /* The day already knows its position when something assigned one; otherwise
     today's recommendation is the answer for a session logged today. A past
     gym session Forge cannot place is left for the athlete to say. */
  const suggestedDayIndex = useMemo(() => {
    if (!pending || cardioOnly) return '';
    if (pending.record.splitPosition) {
      const index = Number(pending.record.splitPosition) - 1;
      if (index >= 0 && index < planDays.length) return String(index);
    }
    /* What the day already trained beats what Forge expected: once sets are on
       it, the split day is whichever one those muscles belong to. Reading
       today's recommendation here would be wrong exactly when it matters —
       logging a session ADVANCES the cursor, so by the time the card is
       answered the recommendation names TOMORROW's day. */
    const trained = new Set([
      ...trainedMuscles,
      ...loggedTopSets.flatMap(set => primaryMusclesFor(set.lift, [])),
    ].filter(muscle => muscle && muscle !== 'Cardio'));
    if (trained.size) {
      const scored = planDays
        .map((day, index) => ({ index, overlap: (day.muscles || []).filter(muscle => trained.has(muscle)).length }))
        .filter(entry => entry.overlap > 0)
        .sort((a, b) => b.overlap - a.overlap);
      if (scored.length) return String(scored[0].index);
    }
    if (pending.date === todayIso && recommendation) {
      const index = planDays.findIndex(day => splitDayKey(day.name) === splitDayKey(recommendation.splitDay.name));
      if (index >= 0) return String(index);
    }
    return '';
  }, [pending, cardioOnly, planDays, recommendation, todayIso, trainedMuscles, loggedTopSets]);

  /* Seeded per synced day, so answering one and moving to the next re-fills
     rather than carrying the previous day's answer forward. */
  const seededFor = useRef('');
  useEffect(() => {
    if (!pending || seededFor.current === pending.date) return;
    seededFor.current = pending.date;
    setDayIndex(suggestedDayIndex);
    const suggested = suggestedDayIndex === '' ? undefined : planDays[Number(suggestedDayIndex)];
    setMuscles(suggested ? (suggested.muscles || []).filter(muscle => muscle !== 'Cardio') : trainedMuscles);
    setLift(''); setWeight(''); setReps(''); setSets([]); setText(''); setReflection('');
  }, [pending, suggestedDayIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const strengthLibrary = useMemo(
    () => exercises.filter(item => item.enabled && isProgrammableStrength(item)),
    [exercises],
  );
  const chosenDay = dayIndex === '' || dayIndex === CUSTOM ? undefined : planDays[Number(dayIndex)];
  const custom = dayIndex === CUSTOM;
  /* Picking the workout fills in its muscles, as the log page does; custom
     starts from what the day already trained. Either can be changed after. */
  const pickDay = (value: string) => {
    setDayIndex(value); setLift('');
    const day = value === '' || value === CUSTOM ? undefined : planDays[Number(value)];
    setMuscles(day ? (day.muscles || []).filter(muscle => muscle !== 'Cardio') : value === CUSTOM ? trainedMuscles : []);
  };
  const toggleMuscle = (muscle: string) => setMuscles(current => current.includes(muscle) ? current.filter(item => item !== muscle) : [...current, muscle]);
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
  /* The set being typed counts on Save without a separate Add tap. */
  const allSets = hasTopSet ? [...sets, { lift, weight: Number(weight), reps: Number(reps) }] : sets;
  const addSet = () => { if (!hasTopSet) return; setSets(allSets); setLift(''); setWeight(''); setReps(''); };
  /* A run's only answer is what it actually was; a gym session's is the
     workout it was. Neither is asked for something it does not have. */
  const hasAnswer = cardioOnly ? Boolean(text.trim()) : (Boolean(chosenDay) || custom || allSets.length > 0 || Boolean(text.trim()));
  const source = stravaReviewSource(date);
  /* How long the watch says the lifting took — the one number it adds. */
  const watchLength = record.durationMinutes ? `Strength · ${sessionLength(record.durationMinutes)}` : '';

  const close = () => { markStravaReviewed(date); seededFor.current = ''; setDayIndex(''); setLift(''); setWeight(''); setReps(''); setSets([]); setMuscles([]); setText(''); setReflection(''); };

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

    /* 2. The workout and its muscles. A split day owns the day's identity
       and its place in the cycle; custom is named as the log page names it.
       The muscles are what the athlete left ticked, plus whatever the sets
       train — a day that was lifted on is not a cardio day. */
    const musclesOf = (list: DraftSet[]) => list.flatMap(set => primaryMusclesFor(set.lift, exercises.find(item => item.name === set.lift)?.muscles || []));
    if (!cardioOnly) {
      const trained = Array.from(new Set([...muscles, ...musclesOf(loggedTopSets), ...musclesOf(allSets)].filter(muscle => muscle && muscle !== 'Cardio')));
      if (chosenDay) next = { ...next, title: chosenDay.name || record.title, splitPosition: Number(dayIndex) + 1 };
      else if (custom) next = { ...next, title: 'Custom Workout', splitPosition: undefined };
      if (chosenDay || custom || trained.length) next = { ...next, muscles: [...trained, ...(next.hasCardio ? ['Cardio'] : [])] };
    }

    /* 3. The top sets. */
    if (allSets.length) {
      next = {
        ...next,
        topSets: [...(record.topSets || []), ...allSets.map(set => ({
          muscle: primaryMusclesFor(set.lift, exercises.find(item => item.name === set.lift)?.muscles || [])[0] || 'Primary',
          lift: set.lift, weight: set.weight, reps: set.reps,
          calculatedMax: calculateEstimatedOneRepMax(set.weight, set.reps) ?? undefined, completed: true,
        }))],
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
          <span className="eyebrow">SYNCED FROM {source.toUpperCase()}</span>
          <strong>{cardioOnly ? record.title : 'Log this workout'}</strong>
          <small>{[dateLabel, watchLength, cardio?.summary].filter(Boolean).join(' · ')}</small>
        </div>
        <button type="button" className="strava-review-close" onClick={close} aria-label="Close">×</button>
      </header>
      <p className="strava-review-lede">{cardioOnly
        ? `${source} recorded the totals. Tell Forge what the session actually was — intervals, rests, warmup — or leave it as recorded.`
        : `${source} knows you were in the gym. Tell Forge what you trained, the same way you log any day.`}</p>

      {/* A RUN IS NOT A SPLIT DAY. It has no position in the cycle and no top
          set, so it is not asked for either — only for what it actually was. */}
      {!cardioOnly && <section className="strava-review-step" aria-label="Workout">
        <span className="field-caption">1 · WORKOUT</span>
        <div className="strava-review-choices">
          {planDays.map((day, index) => <button type="button" key={`${day.name}-${index}`} className={dayIndex === String(index) ? 'muscle-chip active' : 'muscle-chip'} aria-pressed={dayIndex === String(index)} onClick={() => pickDay(dayIndex === String(index) ? '' : String(index))}>{day.name}</button>)}
          <button type="button" className={custom ? 'muscle-chip active' : 'muscle-chip'} aria-pressed={custom} onClick={() => pickDay(custom ? '' : CUSTOM)}>Custom workout</button>
        </div>
        {dayIndex !== '' && dayIndex === suggestedDayIndex && <small className="strava-review-hint">Matched to the day Forge had up — change it if that is wrong.</small>}
        {!planDays.length && <small className="strava-review-hint">Build a split in Plan and its days appear here.</small>}
      </section>}

      {!cardioOnly && <section className="strava-review-step" aria-label="Muscle groups">
        <span className="field-caption">2 · MUSCLE GROUPS</span>
        <div className="strava-review-choices">
          {MUSCLES.map(muscle => <button type="button" key={muscle} className={muscles.includes(muscle) ? 'muscle-chip active' : 'muscle-chip'} aria-pressed={muscles.includes(muscle)} onClick={() => toggleMuscle(muscle)}>{muscle}</button>)}
        </div>
      </section>}

      {!cardioOnly && <section className="strava-review-step strava-review-set" aria-label="Top sets">
        <span className="field-caption">3 · TOP SETS</span>
        {/* Sets already logged for this day need no re-entry; the workout
            chosen above is what ties them to it. */}
        {(loggedTopSets.length > 0 || sets.length > 0) && <ul className="strava-review-sets">
          {loggedTopSets.map((set, index) => <li key={`logged-${index}`}><span>{set.lift}</span><b>{set.weight} × {set.reps}</b><small>Logged</small></li>)}
          {sets.map((set, index) => <li key={`new-${index}`}><span>{set.lift}</span><b>{set.weight} × {set.reps}</b><button type="button" className="text-button" aria-label={`Remove ${set.lift}`} onClick={() => setSets(current => current.filter((_, position) => position !== index))}>Remove</button></li>)}
        </ul>}
        <label>{loggedTopSets.length || sets.length ? 'Another top set' : 'Lift'}
          <select value={lift} onChange={event => setLift(event.target.value)}>
            <option value="">{loggedTopSets.length || sets.length ? 'No more' : 'No top set'}</option>
            {liftOptions.filter(name => !allSets.some(set => sameLift(set.lift, name)) || name === lift).map(name => <option key={name}>{name}</option>)}
          </select>
        </label>
        {lift && <div className="strava-review-numbers">
          <DialField label="Weight" kind="weight" unit="lb" value={weight} onChange={setWeight} />
          <DialField label="Reps" kind="reps" value={reps} onChange={setReps} />
        </div>}
        {hasTopSet && max ? <small className="strava-review-max">{Number(reps) === 1 ? 'Real 1RM' : 'Calculated max'} {max}</small> : null}
        {hasTopSet && <button type="button" className="button ghost" onClick={addSet}>＋ Add another lift</button>}
      </section>}

      <label>Describe it
        <textarea value={text} onChange={event => setText(event.target.value)} rows={3} disabled={busy}
          placeholder={cardio ? 'e.g. 6×300 at :37 with walking rests, plus warmup and cooldown' : 'e.g. heavy squats, felt strong, 3 back-off sets after'} />
      </label>
      {reflection && <small className="strava-review-reflection">{reflection}</small>}

      <footer>
        <button type="button" className="button ghost" disabled={busy} onClick={close}>Looks right <Icon name="check"/></button>
        <button type="button" className="button" disabled={busy || !hasAnswer} onClick={() => void save()}>{busy ? 'Reading it…' : <>Save this day <Icon name="arrow"/></>}</button>
      </footer>
    </div>
  </div>;
}
