/* WHAT WAS ASKED FOR ON THE DAY IT WAS RUN, AND WHAT CAME BACK.

   sessionVerdict knows how to compare a prescription to an effort. This is the
   part that finds the pair: for each recent logged run, which week of the
   block was it in, what did that week's hard session say, and did this log
   look like that session at all. Judging Tuesday's easy three miles against
   Thursday's threshold run would be worse than judging nothing. */

import type { WorkoutRecord } from './WorkoutHistoryProvider';
import type { AiPlanWeek, RunningAthlete, SplitDayRef, StoredAiPlan } from './aiPlanService';
import { resolveWeekRunning, weekIndexOn } from './aiPlanService';
import { parsePrescription, sessionVerdict, workEfforts, type SessionVerdict } from '../../lib/sessionVerdict';
import type { LegacyCardioInterval } from '../../lib/cardioSession';

export type DatedVerdict = SessionVerdict & { date: string; recordId: string; prescribed: number; text: string };

/* How far back a session is still worth reading. Beyond a month it says more
   about who the athlete used to be than about the block they are in. */
export const VERDICT_WINDOW_DAYS = 35;
/* A logged session has to look like the one prescribed before it is judged as
   that session. Three easy miles on a threshold day is a missed session, not a
   slow threshold run, and calling it the latter would be a lie about both. */
export const SHAPE_TOLERANCE = 0.45;
/* A shade inside easy pace still counts as easy running, not as a hard session
   the athlete came up short on. */
export const EASY_RUN_MARGIN = 0.98;

const daysBetween = (from: string, to: string) =>
  Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000);

const runningRows = (record: WorkoutRecord): LegacyCardioInterval[] => {
  const rows: LegacyCardioInterval[] = [];
  for (const raw of record.cardioSessions || []) {
    const session = raw as { activity?: string; prescription?: { legacyIntervals?: unknown } };
    if (!/run|jog|tempo|interval|track/i.test(String(session.activity || ''))) continue;
    const lines = session.prescription?.legacyIntervals;
    if (Array.isArray(lines)) rows.push(...(lines as LegacyCardioInterval[]));
  }
  return rows;
};

/* Every hard session in the block, judged, newest first. */
export function sessionVerdicts(
  records: WorkoutRecord[],
  stored: StoredAiPlan | null | undefined,
  splitDays: SplitDayRef[],
  athlete: RunningAthlete,
  todayIso: string,
  limit = 8,
): DatedVerdict[] {
  if (!stored?.plan?.weeks?.length) return [];
  const out: DatedVerdict[] = [];
  const weekCache = new Map<number, AiPlanWeek>();
  const resolvedWeek = (index: number) => {
    if (!weekCache.has(index)) {
      const raw = stored.plan.weeks[index];
      weekCache.set(index, resolveWeekRunning(raw, splitDays, athlete,
        { weekIndex: index, blockWeeks: stored.plan.weeks.length, waveIndex: index }));
    }
    return weekCache.get(index) as AiPlanWeek;
  };

  const recent = [...records]
    .filter(record => {
      const age = daysBetween(record.date, todayIso);
      return age >= 0 && age <= VERDICT_WINDOW_DAYS && record.date >= stored.startDate;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  for (const record of recent) {
    if (out.length >= limit) break;
    const rows = runningRows(record);
    if (!rows.length) continue;
    const week = resolvedWeek(weekIndexOn(stored, record.date));
    const prescription = parsePrescription(week.quality);
    if (!prescription) continue;
    const efforts = workEfforts(rows);
    if (!efforts.length) continue;

    /* DOES THIS LOG LOOK LIKE THAT SESSION? Two checks, and both are needed.

       The repeats have to be the right SIZE: an easy run logged as one line is
       not a slow set of 400s, and judging it as one would tell the athlete
       they failed a session they never attempted.

       And the session has to be the right LENGTH. A continuous prescription —
       "12 min continuous @ 7:23/mi" — has one repeat and no repeat distance,
       so the size check waved through every steady run in the log; Preston's
       five-mile Sunday came back judged as a twelve-minute tempo he had run
       four times too long. The total work is compared to the total asked for,
       in whichever unit the prescription was written in. */
    const off = (actual: number, asked: number) => (asked > 0 ? Math.abs(actual - asked) / asked : 0);
    /* A CONTINUOUS PRESCRIPTION IS JUDGED ON ONE PIECE — the one that looks
       like it.

       Summing the day was right for a set of repeats and wrong for a tempo,
       and it threw away the session it mattered most for. Preston was asked
       for "12 min continuous @ 6:53/mi" and ran 1.8 mi in 12:12 — the session
       exactly. His warm-up came off Strava as a SEPARATE activity on the same
       day (1.01 mi, 8:18), so the day totalled 20:30 against 12:00 asked,
       which is 71% off — past every tolerance — and the tempo was not judged
       at all. No verdict, no level movement, and the one number he wanted to
       see move stayed where it was.

       A warm-up is not part of a continuous effort, so it is not summed into
       one. The piece nearest what was asked is the piece that was asked for. */
    const judged = prescription.reps === 1 && efforts.length > 1
      ? [[...efforts].sort((a, b) => {
          const asked = prescription.minutes
            ? (candidate: typeof a) => off(candidate.seconds, prescription.minutes! * 60)
            : (candidate: typeof a) => off(candidate.metres, prescription.metres || 0);
          return asked(a) - asked(b);
        })[0]]
      : efforts;
    const totalMetres = judged.reduce((total, effort) => total + effort.metres, 0);
    const totalSeconds = judged.reduce((total, effort) => total + effort.seconds, 0);

    if (prescription.reps > 1 && prescription.metres) {
      const typical = totalMetres / judged.length;
      if (off(typical, prescription.metres) > SHAPE_TOLERANCE) continue;
    }
    if (prescription.metres && off(totalMetres, prescription.reps * prescription.metres) > SHAPE_TOLERANCE) continue;
    if (prescription.minutes && off(totalSeconds, prescription.reps * prescription.minutes * 60) > SHAPE_TOLERANCE) continue;
    /* A CONTINUOUS EFFORT IS ONE PIECE. Eight repeats adding up to roughly the
       right amount of time is a different session that happens to total the
       same — and judged as the tempo it reports an average across recoveries
       the athlete never ran as one effort. */
    /* And it is still ONE piece. Eight repeats adding up to roughly the right
       amount of time is a different session that happens to total the same,
       and the pick above would hand it whichever repeat was nearest — so the
       count is checked against what was actually judged. */
    if (prescription.reps === 1 && judged.length > 2) continue;

    /* AND IT HAS TO HAVE BEEN AN ATTEMPT AT THE SESSION AT ALL. A fourteen
       minute jog at ten minute pace is the same LENGTH as a fourteen minute
       threshold run and is not one — it is an easy run that happened to last
       as long. Judged as a tempo it came back "slower than asked", which tells
       the athlete they failed a session they never started, and it is the
       fastest way to make someone stop trusting the verdict entirely.

       Anything run at or slower than the athlete's own easy pace is easy
       running, whatever the calendar had pencilled in for that day. */
    const easyFloor = Number(athlete.paces?.easyFast) || 0;
    const ranPace = (judged.reduce((total, effort) => total + effort.seconds, 0)
      / judged.reduce((total, effort) => total + effort.metres, 0)) * 1609.344;
    if (easyFloor && ranPace >= easyFloor * EASY_RUN_MARGIN) continue;

    const verdict = sessionVerdict(prescription, judged);
    if (!verdict) continue;
    out.push({ ...verdict, date: record.date, recordId: record.id, text: String(week.quality) });
  }
  return out;
}
