import { useMemo, useState } from 'react';
import { useGoals } from '../features/goals/GoalsProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useTrainingLibrary, type LibraryExercise } from '../features/training/TrainingLibraryProvider';
import { useAdaptiveTraining } from '../features/training/AdaptiveTrainingProvider';
import { requestForgeCoach } from '../features/training/coachService';
import { hyroxSession, hyroxSessionsDone, weeksUntil } from '../lib/hyroxSession';
import { paceModel } from '../lib/paceModel';
import { enduranceTarget } from '../lib/qualitySession';
import { medianWeeklyMiles } from '../lib/goalTrajectory';
import { cardioPlanSummary, type CircuitStation, type PlannedCardio } from './CardioPlanBuilder';

/* A DAY THAT IS NOT IN THE SPLIT, WRITTEN BY FORGE.

   "Start fresh" was a blank page: no lifts, no cardio, add what you did.
   Athletes asked for the other thing — "make me a HYROX session today",
   "a CrossFit-style circuit, 30 minutes, rower and kettlebells" — without
   editing their split. This is that. HYROX comes from the session writer
   the split's HYROX day already uses (deterministic, instant, paced off the
   athlete's threshold, no coach call). A circuit or a description goes to
   the coach's workout scope, which returns an editable circuit built only
   from the athlete's library. Either way the session lands in the logger
   as a planned circuit with a "Your time" field — the same shape a HYROX
   split day arrives in — so logging it is one number. */

export type WrittenSession = { name: string; plan: PlannedCardio; summary: string; rationale: string };

const unitFor = (exercise?: LibraryExercise) => exercise?.defaultUnit || (exercise?.kind === 'Cardio' ? 'meters' : 'reps');
type Kind = 'hyrox' | 'circuit' | 'custom';

export function ForgeWritesIt({ dateIso, session, onSession }: { dateIso: string; session: WrittenSession | null; onSession: (session: WrittenSession | null) => void }) {
  const { records } = useWorkoutHistory();
  const { goals } = useGoals();
  const { setup } = useProfileSetup();
  const { exercises } = useTrainingLibrary();
  const { recovery } = useAdaptiveTraining();
  const [kind, setKind] = useState<Kind | null>(null);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const metric = setup?.units === 'Metric';
  const library = useMemo(() => exercises.filter(exercise => exercise.enabled && /HYROX|CrossFit|Cardio|Bodyweight/i.test(`${exercise.detail} ${exercise.kind}`)), [exercises]);

  const writeHyrox = () => {
    const runGoal = enduranceTarget(goals);
    const hyroxGoal = goals.find(goal => /hyrox/i.test(`${goal.exercise || ''} ${goal.title}`));
    const threshold = paceModel(records, runGoal, dateIso, medianWeeklyMiles(records), setup?.excludedEfforts || []).threshold;
    const written = hyroxSession({ sessionIndex: hyroxSessionsDone(records, dateIso), thresholdSecondsPerMile: threshold || 0, division: hyroxGoal?.eventDivision, weeksToRace: weeksUntil(hyroxGoal?.date, dateIso), readiness: recovery.confidence === 'Low' ? undefined : recovery.readiness, metric });
    onSession({ name: written.title, plan: written.plan, summary: written.summary, rationale: written.rationale });
  };

  const askForge = async (request: string) => {
    setBusy(true); setError('');
    const response = await requestForgeCoach({
      scope: 'workout',
      question: request,
      context: {
        request: { sessionType: 'Circuit', instructions: request, date: dateIso },
        goals,
        profile: setup ? { primaryFocus: setup.primaryFocus, equipment: setup.equipment, limitations: setup.limitationNotes, split: setup.splitDays } : null,
        readiness: recovery.confidence === 'Low' ? null : recovery.readiness,
        recentTraining: records.slice(0, 21).map(record => ({ date: record.date, muscles: record.muscles, effort: record.effort, strength: record.topSets?.map(set => ({ exercise: set.lift, weight: set.weight, reps: set.reps })), cardio: record.cardioSessions?.map(item => ({ activity: item.activity, summary: item.summary })) })),
        availableLibrary: library.map(exercise => ({ name: exercise.name, category: exercise.detail, unit: unitFor(exercise) })),
      },
    }, 'Forge could not be reached, so nothing was written.');
    if (response.workout) {
      const byName = new Map(library.map(exercise => [exercise.name.toLowerCase(), exercise]));
      const stations: CircuitStation[] = response.workout.stations.flatMap((station, index) => {
        const exercise = byName.get(station.name.toLowerCase());
        return exercise ? [{ id: Date.now() + index, kind: exercise.kind as CircuitStation['kind'], name: exercise.name, target: station.target, unit: unitFor(exercise), rest: String(station.restSeconds) }] : [];
      });
      if (!stations.length) { setError('Forge wrote a session with movements that are not in your library. Try again, or add the movements in Library first.'); setBusy(false); return; }
      const plan: PlannedCardio = { id: Date.now(), activity: 'Circuit', structure: 'Circuit', targetSource: 'Goal generated', circuitFormat: 'Rounds', rounds: String(response.workout.rounds), roundRest: String(response.workout.roundRestSeconds), stationEntries: stations };
      onSession({ name: response.workout.title, plan, summary: cardioPlanSummary(plan), rationale: response.answer });
    } else {
      setError(response.error || response.answer);
    }
    setBusy(false);
  };

  const pick = (next: Kind) => {
    setKind(next); setError('');
    if (next === 'hyrox') writeHyrox();
    else if (next === 'circuit') void askForge('Write a CrossFit-style conditioning circuit for today from my library — balanced, about 25–35 minutes, no movement I have no equipment for.');
  };

  if (session) {
    return <section className="card forge-writes-it written">
      <div className="section-title compact-title"><div><span className="eyebrow">FORGE WROTE TODAY</span><h3>{session.name}</h3></div></div>
      <p className="forge-writes-rationale">{session.rationale}</p>
      <button type="button" className="text-button" onClick={() => { onSession(null); setKind(null); }}>Write a different one</button>
    </section>;
  }

  return <section className="card forge-writes-it">
    <div className="section-title compact-title"><div><h3>Or let Forge write it</h3><p>A session that is not in your split, built for today.</p></div></div>
    <div className="forge-writes-chips">
      <button type="button" className={kind === 'hyrox' ? 'active' : ''} onClick={() => pick('hyrox')} disabled={busy}>HYROX</button>
      <button type="button" className={kind === 'circuit' ? 'active' : ''} onClick={() => pick('circuit')} disabled={busy}>{busy && kind === 'circuit' ? 'Writing…' : 'Circuit'}</button>
      <button type="button" className={kind === 'custom' ? 'active' : ''} onClick={() => { setKind('custom'); setError(''); }} disabled={busy}>Your words</button>
    </div>
    {kind === 'custom' && <form className="forge-writes-custom" onSubmit={event => { event.preventDefault(); if (custom.trim()) void askForge(custom.trim()); }}>
      <textarea rows={2} value={custom} onChange={event => setCustom(event.target.value)} placeholder="“30 minutes, rower and kettlebells, no running” or “sled and wall balls, 4 rounds”" />
      <button type="button" className="button small-button" disabled={busy || !custom.trim()} onClick={() => void askForge(custom.trim())}>{busy ? 'Writing…' : 'Write it'}</button>
    </form>}
    {error && <p className="forge-writes-error">{error}</p>}
  </section>;
}
