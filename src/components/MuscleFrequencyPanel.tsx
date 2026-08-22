import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';

type TimeRange = '4w' | '3m' | '6m' | '1y' | 'all';

const rangeDays: Record<TimeRange, number> = { '4w': 28, '3m': 92, '6m': 183, '1y': 366, all: Infinity };
const formatDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function MuscleFrequencyPanel({ range, rangeLabel }: { range: TimeRange; rangeLabel: string }) {
  const {records}=useWorkoutHistory();
  const now = Date.now();
  const cutoff = rangeDays[range] === Infinity ? -Infinity : now - rangeDays[range] * 86400000;
  const muscleSessions=records.reduce<Record<string,string[]>>((groups,record)=>{if(new Date(`${record.date}T12:00:00`).getTime()<cutoff)return groups;[...new Set(record.muscles.filter(muscle=>muscle!=='Cardio'))].forEach(muscle=>{groups[muscle]=[...(groups[muscle]||[]),record.date]});return groups},{});
  const rows = Object.entries(muscleSessions).map(([muscle, dates]) => {
    const visible = dates.filter(date => new Date(`${date}T12:00:00`).getTime() >= cutoff);
    return { muscle, count: visible.length, last: visible.at(-1) ?? null };
  }).filter(row => row.count > 0).sort((a,b) => b.count - a.count || a.muscle.localeCompare(b.muscle));
  const maxCount = Math.max(1, ...rows.map(row => row.count));
  const totalExposures = rows.reduce((sum,row) => sum + row.count, 0);
  const uniqueWorkoutDates = new Set(Object.values(muscleSessions).flat().filter(date => new Date(`${date}T12:00:00`).getTime() >= cutoff)).size;
  const mostTrained = rows[0];
  const leastTrained = rows.at(-1);

  return <div className="muscle-frequency-view">
    <section className="frequency-kpis">
      <div><span>LIFT DAYS</span><strong>{uniqueWorkoutDates}</strong><small>{rangeLabel}</small></div>
      <div><span>MUSCLE EXPOSURES</span><strong>{totalExposures}</strong><small>One count per workout</small></div>
      <div><span>MOST TRAINED</span><strong>{mostTrained?.muscle ?? '—'}</strong><small>{mostTrained?.count ?? 0} sessions</small></div>
    </section>
    <div className="frequency-layout">
      <section className="card frequency-chart-card">
        <div className="frequency-title"><div><span className="eyebrow">{rangeLabel.toUpperCase()}</span><h3>Muscle Group Frequency</h3></div><small>Logged workout exposures</small></div>
        <div className="frequency-bars">{rows.map(row=><div className="frequency-row" key={row.muscle}>
          <strong>{row.muscle}</strong>
          <div className="frequency-track"><i style={{width:`${Math.max(7,row.count/maxCount*100)}%`}} /></div>
          <b>{row.count}</b>
          <small>{row.last ? `Last ${formatDate(row.last)}` : 'No sessions'}</small>
        </div>)}</div>
        {!rows.length&&<div className="frequency-empty">No muscle-group workouts were logged in this range.</div>}
      </section>
      <aside className="card frequency-coach-card">
        <span className="eyebrow">AI COACH INTERPRETATION</span>
        <h3>{leastTrained ? `${leastTrained.muscle} has the lowest exposure` : 'Log workouts to see balance'}</h3>
        <p>{leastTrained ? `${leastTrained.muscle} appears in ${leastTrained.count} logged workout${leastTrained.count===1?'':'s'} during this period. Forge considers this alongside your split, goals, recovery, and exercise choices before changing a recommendation.` : 'Frequency becomes useful once workouts have muscle groups attached.'}</p>
        <div className="frequency-rule"><span>COUNTING RULE</span><small>A muscle counts once per workout even when several exercises train it. This prevents one long session from inflating frequency.</small></div>
      </aside>
    </div>
  </div>;
}
