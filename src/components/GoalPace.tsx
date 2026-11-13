import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useGoals } from '../features/goals/GoalsProvider';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { goalFeasibility } from '../lib/goalFeasibility';
import { goalProgress } from '../lib/goalProgress';
import { sameLift } from '../lib/liftAliases';
import { effortOf, estimateWithEffort } from '../lib/setEffort';

/* IS IT WORKING? One row per goal: where it stands, how far it has moved in
   six weeks, and whether that is on pace. The coach's work, made visible. */

const SIX_WEEKS = 42 * 86400000;

export function GoalPace() {
  const { goals } = useGoals();
  const { records } = useWorkoutHistory();
  const { setup } = useProfileSetup();
  const unit = setup?.units === 'Metric' ? 'kg' : 'lb';
  const rows = useMemo(() => {
    const verdicts = goalFeasibility(goals, records);
    const now = Date.now();
    return goals.map((goal, index) => {
      const progress = goalProgress(goal, records, verdicts[index], setup, 'calculated');
      let moved: number | null = null;
      if (goal.type === 'Strength' && goal.exercise) {
        /* Best estimate in the last six weeks against the best before them. */
        let recent = 0; let before = 0;
        for (const record of records) for (const set of record.topSets || []) {
          if (set.completed === false || !set.lift || !sameLift(set.lift, goal.exercise) || !(set.weight > 0) || !(set.reps > 0)) continue;
          const max = estimateWithEffort(set.weight, set.reps, effortOf(record.date, set.lift));
          const age = now - new Date(`${record.date}T12:00:00`).getTime();
          if (age <= SIX_WEEKS) recent = Math.max(recent, max); else before = Math.max(before, max);
        }
        if (recent && before) moved = Math.round(recent - before);
      }
      return { id: `${goal.title}-${index}`, name: goal.exercise || goal.title, progress, moved };
    });
  }, [goals, records, setup]);
  if (!rows.length) return null;
  return <section className="card ic-card goal-pace">
    <header><h3>Your goals</h3><Link to="/goals">All goals</Link></header>
    {rows.map(row => <div className="goal-pace-row" key={row.id}>
      <div>
        <b>{row.name}</b>
        <small>{row.progress.currentText ? `${row.progress.currentText} now` : 'Nothing logged yet'}{row.progress.targetText ? ` · goal ${row.progress.targetText}` : ''}{row.moved !== null ? ` · ${row.moved > 0 ? '+' : ''}${row.moved} ${unit} in 6 weeks` : ''}</small>
      </div>
      <span className={`goal-pace-pill ${row.progress.tone}`}>{row.progress.label}</span>
    </div>)}
  </section>;
}
