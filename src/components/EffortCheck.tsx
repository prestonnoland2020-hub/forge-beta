import { useMemo, useState } from 'react';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { standoutEffort, CONFIRMED_PREFIX, type Effort } from '../lib/effortAudit';
import { continuousRunEfforts } from '../lib/cardioSession';
import { isRaceEvidence } from '../lib/runQuality';
import { localDayIso } from '../lib/time';

/* "WAS THAT REAL?" — ASKED ONCE, ABOUT THE ONE THING THAT MATTERS.

   Every goal verdict and every training pace in Forge is built on a single
   number: the athlete's best recent continuous effort. Preston's log held a
   5.47-mile run at 5:29/mi that never happened, and off it Forge told him his
   5K was already inside his goal and paced his entire block from it.

   Nothing automatic can catch that. It is not impossible — plenty of people
   run 5:29 — it does not contradict his real 5:19 mile, and his log sorted by
   mile-equivalent reads 4:57, 5:12, 5:16, 5:28, 5:37 with no gap a rule could
   cut without also cutting somebody's genuine breakthrough.

   So it asks. Once, only when the best effort stands clear of everything else,
   and never again about the same run — because being asked twice about a
   personal best you are proud of is its own kind of insult. */

const WINDOW_DAYS = 180;

/* The continuous running efforts inside the window that are good enough to
   predict a race from. One definition, used by the dialog and by the check
   that tells the other dialogs to wait. */
function useRecentEfforts(records: ReturnType<typeof useWorkoutHistory>['records']): Effort[] {
  return useMemo<Effort[]>(() => {
    const cutoff = new Date(`${localDayIso()}T12:00:00`);
    cutoff.setDate(cutoff.getDate() - WINDOW_DAYS);
    const since = cutoff.toISOString().slice(0, 10);
    const out: Effort[] = [];
    for (const record of records || []) {
      if (record.date < since) continue;
      for (const session of record.cardioSessions || []) {
        if (!/run|jog|tempo|track/i.test(String(session.activity || ''))) continue;
        for (const effort of continuousRunEfforts(session)) {
          const seconds = effort.minutes * 60;
          if (isRaceEvidence(effort.miles, seconds)) out.push({ date: record.date, miles: effort.miles, seconds });
        }
      }
    }
    return out;
  }, [records]);
}

/* Whether the effort question is about to be asked, so nothing else opens on
   top of it — and so the mileage gate is not computed from evidence that is
   still in doubt. */
export function useEffortCheckPending(): boolean {
  const { records, loading } = useWorkoutHistory();
  const { setup, loading: setupLoading } = useProfileSetup();
  const efforts = useRecentEfforts(records);
  return Boolean(!loading && !setupLoading && setup?.completedAt
    && standoutEffort(efforts, setup?.excludedEfforts || []));
}

export function EffortCheck() {
  const { records, loading } = useWorkoutHistory();
  const { setup, saveSetup, loading: setupLoading } = useProfileSetup();
  const [closed, setClosed] = useState(false);
  const efforts = useRecentEfforts(records);

  const ask = useMemo(
    () => (loading || setupLoading || !setup?.completedAt ? null : standoutEffort(efforts, setup?.excludedEfforts || [])),
    [loading, setupLoading, setup, efforts],
  );
  if (!ask || closed) return null;

  /* BOTH ANSWERS ARE REMEMBERED — see CONFIRMED_PREFIX. */
  const answer = (real: boolean) => {
    const seen = setup?.excludedEfforts || [];
    const next = real ? [...seen, `${CONFIRMED_PREFIX}${ask.key}`] : [...seen, ask.key];
    if (setup) saveSetup({ ...setup, excludedEfforts: next });
    setClosed(true);
  };

  return <div className="mileage-check-backdrop" role="dialog" aria-modal="true" aria-label="Confirm this effort">
    <div className="mileage-check">
      <section className="card gate-card">
        <span className="eyebrow">Before Forge builds on this</span>
        <p className="gate-lede">{ask.say}</p>
        <p className="gate-detail">{ask.question}</p>
        <div className="gate-actions">
          <button type="button" className="button" onClick={() => answer(true)}>Yes, that was real</button>
          <button type="button" className="button ghost" onClick={() => answer(false)}>No — bad log</button>
        </div>
        <p className="gate-foot">Either way the miles still count. This only decides what your goals and paces are predicted from.</p>
      </section>
    </div>
  </div>;
}
