import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { WAVE_REPS, WAVE_LENGTH } from '../features/training/aiPlanService';
import { localDayIso } from '../lib/time';
import type { WorkoutRecord } from '../features/training/WorkoutHistoryProvider';

/* THE PLAN TAB, AS SOMEONE WHO JUST WANTS TO TRAIN READS IT.

   The old screen was a coach's spreadsheet: phase names (Base, Specific,
   Foundation), stress ratings, SCALED and FLEXIBLE chips, a five-column table
   that truncated its own words on a phone, and every day's prescription
   crammed into one sentence of middots. All of it was true and none of it was
   legible.

   Four questions, in the order an athlete asks them, and nothing else:
     1. Where am I in the block?          — the dots and one sentence
     2. What do I do today?               — the big card
     3. What does the rest of the week hold? — seven scannable rows
     4. Where is this going?              — the block, folded away until asked

   Vocabulary is the athlete's, not the coach's. A week is named by what it IS
   ("6-rep week", "Max week", "Lighter week"); a session is a lift, a run, or a
   rest. Every component here is shared by the AI program and the pre-program
   fallback, so the tab looks like one thing whichever is showing. */

export type PlanLift = { exercise: string; weight: number; reps: number };
export type PlanRun = { kind: 'Long run' | 'Hard run' | 'Easy run'; text: string };
export type PlanSession = {
  date: Date;
  title: string;
  lifts: PlanLift[];
  run?: PlanRun;
  /* Set for a day with nothing on it — a true rest day, or a day the week's
     running has already covered. `rest` renders quietly; `open` says so. */
  empty?: 'rest' | 'open';
  /* Pre-program sessions arrive as prose; when there is no structured data
     the summary is what the row shows. */
  summary?: string;
};

/* What a week of the wave is CALLED. 8/6/4/2/1 are numbers the athlete knows
   as "8s" and "6s"; the last two rungs have names of their own. */
export function waveLabel(waveIndex: number): string {
  const slot = ((waveIndex % WAVE_LENGTH) + WAVE_LENGTH) % WAVE_LENGTH;
  const reps = WAVE_REPS[slot];
  if (slot === WAVE_LENGTH - 1) return 'Max week';
  if (reps === 2) return 'Heavy doubles';
  return `${reps}-rep week`;
}
/* What the week means for the lifts, in one plain clause. */
export function waveSentence(waveIndex: number): string {
  const slot = ((waveIndex % WAVE_LENGTH) + WAVE_LENGTH) % WAVE_LENGTH;
  const reps = WAVE_REPS[slot];
  if (slot === WAVE_LENGTH - 1) return 'Max week — your goal lifts get a true single.';
  if (slot === WAVE_LENGTH - 2) return 'Heavy doubles, and the running eases off before max week.';
  if (slot === 0) return `Top sets of ${reps} — the lightest loads of the wave, the most reps.`;
  return `Top sets of ${reps} — heavier than last week, fewer reps.`;
}
export const isMaxWeek = (waveIndex: number) => ((waveIndex % WAVE_LENGTH) + WAVE_LENGTH) % WAVE_LENGTH === WAVE_LENGTH - 1;
/* The running deload lands on the 2-rep week — the lighter week before max. */
export const isLighterWeek = (waveIndex: number) => ((waveIndex % WAVE_LENGTH) + WAVE_LENGTH) % WAVE_LENGTH === WAVE_LENGTH - 2;

const weekdayShort = (date: Date) => date.toLocaleDateString('en-US', { weekday: 'short' });
const dayNumber = (date: Date) => date.getDate();
const longDate = (date: Date) => date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

/* One line for a lift, one for a run. */
export function LiftLine({ lift, unit }: { lift: PlanLift; unit: string }) {
  return <div className="pv-line">
    <span className="pv-line-name">{lift.exercise}</span>
    <span className="pv-line-value">{lift.weight ? <>{lift.weight} <small>{unit}</small> × {lift.reps}</> : lift.reps === 1 ? 'Max attempt' : `${lift.reps} reps`}</span>
  </div>;
}
export function RunLine({ run }: { run: PlanRun }) {
  return <div className="pv-line">
    <span className="pv-line-name">{run.kind}</span>
    <span className="pv-line-value">{run.text}</span>
  </div>;
}

/* ── 1. Where am I ──────────────────────────────────────────────────────── */
export function PlanProgress({ weekIndex, total, waveIndexFor, sentence }: {
  weekIndex: number; total: number; waveIndexFor: (index: number) => number; sentence: ReactNode;
}) {
  return <section className="pv-progress">
    <div className="pv-progress-head">
      <span className="pv-progress-week">Week {weekIndex + 1} <small>of {total}</small></span>
      <span className="pv-progress-name">{waveLabel(waveIndexFor(weekIndex))}</span>
    </div>
    <div className="pv-dots" role="img" aria-label={`Week ${weekIndex + 1} of ${total}`}>
      {Array.from({ length: total }, (_, index) => {
        const wave = waveIndexFor(index);
        const kind = isMaxWeek(wave) ? ' max' : isLighterWeek(wave) ? ' light' : '';
        return <i key={index} className={`${index < weekIndex ? 'done' : index === weekIndex ? 'now' : ''}${kind}`} />;
      })}
    </div>
    <p className="pv-progress-sentence">{sentence}</p>
  </section>;
}

/* ── 2. Today ────────────────────────────────────────────────────────────── */
export function TodayCard({ session, unit, logged, workoutHref }: {
  session: PlanSession | undefined; unit: string; logged?: WorkoutRecord; workoutHref: string;
}) {
  if (!session) return null;
  const done = Boolean(logged);
  const isRest = session.empty === 'rest' && !session.lifts.length && !session.run;
  const nothing = !session.lifts.length && !session.run && !session.summary;
  return <section className={`card pv-today${done ? ' done' : ''}${isRest ? ' rest' : ''}`}>
    <header>
      <span className="eyebrow">TODAY · {longDate(session.date).toUpperCase()}</span>
      <h2>{done ? 'Logged' : isRest ? 'Rest day' : session.title}</h2>
      {done && <small>{session.title}</small>}
    </header>
    {done && logged
      ? <div className="pv-lines">
          {(logged.topSets || []).filter(set => set.completed !== false).map((set, index) => <div className="pv-line" key={set.id || `${set.lift}-${index}`}><span className="pv-line-name">{set.lift}</span><span className="pv-line-value">{set.weight} <small>{unit}</small> × {set.reps}</span></div>)}
          {(logged.cardioSessions || []).map(cardio => <div className="pv-line" key={cardio.id}><span className="pv-line-name">{cardio.activity}</span><span className="pv-line-value">{cardio.summary?.replace(`${cardio.activity} · `, '')}</span></div>)}
        </div>
      : isRest
        ? <p className="pv-today-note">Nothing scheduled. A walk or some mobility is welcome; nothing is required.</p>
        : nothing
          ? <p className="pv-today-note">Nothing required today — the week&rsquo;s running is already covered.</p>
          : <div className="pv-lines">
              {session.lifts.map((lift, index) => <LiftLine key={`${lift.exercise}-${index}`} lift={lift} unit={unit} />)}
              {session.run && <RunLine run={session.run} />}
              {!session.lifts.length && !session.run && session.summary && <p className="pv-today-note">{session.summary}</p>}
            </div>}
    <footer>
      {done
        ? <Link className="button ghost" to={`/workout?edit=${logged!.id}`}>Edit today</Link>
        : isRest
          ? <Link className="button ghost" to={workoutHref}>Log something anyway</Link>
          : <Link className="button" to={workoutHref}>Start workout →</Link>}
    </footer>
  </section>;
}

/* ── 3. This week ────────────────────────────────────────────────────────── */
export function WeekList({ sessions, unit, records, title = 'This week' }: {
  sessions: PlanSession[]; unit: string; records: WorkoutRecord[]; title?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const todayIso = localDayIso();
  return <section className="card pv-week">
    <header><h3>{title}</h3></header>
    <div className="pv-week-rows">
      {sessions.map(session => {
        const iso = localDayIso(session.date);
        const isToday = iso === todayIso;
        const logged = records.find(record => record.date === iso && ((record.topSets || []).some(set => set.completed !== false) || (record.cardioSessions || []).length > 0 || record.muscles.some(muscle => muscle !== 'Cardio')));
        const missed = !logged && iso < todayIso && session.empty !== 'rest' && (session.lifts.length > 0 || Boolean(session.run) || Boolean(session.summary));
        const isRest = session.empty === 'rest' && !session.lifts.length && !session.run;
        const isOpenDay = session.empty === 'open' && !session.lifts.length && !session.run;
        const expanded = open === iso;
        /* One line, in words the athlete would use. */
        const summary = logged
          ? [...(logged.topSets || []).filter(set => set.completed !== false).slice(0, 2).map(set => `${set.lift} ${set.weight}×${set.reps}`), ...(logged.cardioSessions || []).slice(0, 1).map(cardio => cardio.summary?.replace(`${cardio.activity} · `, '') || cardio.activity)].filter(Boolean).join(' · ') || 'Logged'
          : isRest ? 'Nothing scheduled'
          : isOpenDay ? 'Open — nothing required'
          : [
              ...session.lifts.slice(0, 2).map(lift => lift.weight ? `${lift.exercise} ${lift.weight}×${lift.reps}` : lift.exercise),
              session.run ? (() => { const text = session.run.text.split(/ @ | · /)[0]; return /\beasy\b/i.test(text) && session.run.kind === 'Easy run' ? text : `${session.run.kind} ${text}`; })() : '',
            ].filter(Boolean).join(' · ') || session.summary || session.title;
        const canExpand = !isRest && !isOpenDay && (session.lifts.length + (session.run ? 1 : 0) > 0 || Boolean(session.summary));
        return <div className={`pv-row${isToday ? ' today' : ''}${logged ? ' done' : ''}${missed ? ' missed' : ''}${isRest ? ' rest' : ''}${expanded ? ' open' : ''}`} key={iso}>
          <button type="button" className="pv-row-main" onClick={() => canExpand && setOpen(current => current === iso ? null : iso)} aria-expanded={canExpand ? expanded : undefined} disabled={!canExpand}>
            <span className="pv-row-date"><b>{weekdayShort(session.date)}</b><small>{dayNumber(session.date)}</small></span>
            <span className="pv-row-body">
              <strong>{isRest ? 'Rest' : session.title}</strong>
              <small>{summary}</small>
            </span>
            <span className="pv-row-state" aria-hidden="true">{logged ? '✓' : missed ? 'Missed' : isToday ? 'Today' : canExpand ? '›' : ''}</span>
          </button>
          {expanded && <div className="pv-row-detail">
            {session.lifts.map((lift, index) => <LiftLine key={`${lift.exercise}-${index}`} lift={lift} unit={unit} />)}
            {session.run && <RunLine run={session.run} />}
            {!session.lifts.length && !session.run && session.summary && <p>{session.summary}</p>}
          </div>}
        </div>;
      })}
    </div>
  </section>;
}

/* ── 4. The whole block, folded ─────────────────────────────────────────── */
export type PlanBlockWeek = {
  index: number;
  startDate: Date;
  waveIndex: number;
  miles: number;
  /* The week's headline set, if it has one. */
  lead?: PlanLift;
  sessions?: () => PlanSession[];
};
export function BlockList({ weeks, currentIndex, unit, distanceUnit, records }: {
  weeks: PlanBlockWeek[]; currentIndex: number; unit: string; distanceUnit: string; records: WorkoutRecord[];
}) {
  const [shown, setShown] = useState(false);
  const [openWeek, setOpenWeek] = useState<number | null>(null);
  const short = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return <section className="card pv-block">
    <button type="button" className="pv-block-toggle" onClick={() => setShown(value => !value)} aria-expanded={shown}>
      <span><strong>The whole block</strong><small>{weeks.length} weeks · {weeks.filter(week => isMaxWeek(week.waveIndex)).length === 1 ? 'one max week' : `${weeks.filter(week => isMaxWeek(week.waveIndex)).length} max weeks`}</small></span>
      <b aria-hidden="true">{shown ? '−' : '+'}</b>
    </button>
    {shown && <div className="pv-block-weeks">
      {weeks.map(week => {
        const label = waveLabel(week.waveIndex);
        const state = week.index < currentIndex ? 'past' : week.index === currentIndex ? 'now' : 'ahead';
        const opened = openWeek === week.index;
        return <div className={`pv-block-week ${state}${isMaxWeek(week.waveIndex) ? ' max' : ''}${isLighterWeek(week.waveIndex) ? ' light' : ''}${opened ? ' open' : ''}`} key={week.index}>
          <button type="button" className="pv-block-row" onClick={() => setOpenWeek(current => current === week.index ? null : week.index)} aria-expanded={opened}>
            <span className="pv-block-num"><b>{week.index + 1}</b><small>{short(week.startDate)}</small></span>
            <span className="pv-block-body">
              <strong>{label}{state === 'now' ? <em> · now</em> : null}</strong>
              <small>{[week.lead ? (week.lead.weight ? `${week.lead.exercise} ${week.lead.weight}×${week.lead.reps}` : week.lead.exercise) : '', week.miles ? `${week.miles} ${distanceUnit} running` : ''].filter(Boolean).join(' · ') || 'Built from what you log'}</small>
            </span>
            <span className="pv-block-state" aria-hidden="true">{state === 'past' ? '✓' : '›'}</span>
          </button>
          {opened && week.sessions && <div className="pv-block-days">
            {week.sessions().map(session => {
              const isRest = session.empty === 'rest' && !session.lifts.length && !session.run;
              return <div className={`pv-block-day${isRest ? ' rest' : ''}`} key={session.date.toISOString()}>
                <span className="pv-row-date"><b>{weekdayShort(session.date)}</b><small>{dayNumber(session.date)}</small></span>
                <div>
                  <strong>{isRest ? 'Rest' : session.title}</strong>
                  {session.lifts.map((lift, index) => <LiftLine key={`${lift.exercise}-${index}`} lift={lift} unit={unit} />)}
                  {session.run && <RunLine run={session.run} />}
                  {!session.lifts.length && !session.run && !isRest && <small>{session.summary || 'Open — nothing required'}</small>}
                </div>
              </div>;
            })}
          </div>}
        </div>;
      })}
      <p className="pv-block-note">Every load comes from your best logged set through the 8 / 6 / 4 / 2 / max wave. Beat a set and the numbers rise; miss one and they hold. {records.length ? '' : 'Log a set and the first numbers appear.'}</p>
    </div>}
  </section>;
}

/* ── Save / Regenerate ───────────────────────────────────────────────────── */
export function PlanActions({ saved, savedAt, generating, canGenerate, onSave, onRegenerate, request, requestNote, generatedAt, error }: {
  saved: boolean; savedAt?: string; generating: boolean; canGenerate: boolean;
  onSave: () => void; onRegenerate: () => void;
  request?: string; requestNote?: string; generatedAt?: string; error?: string;
}) {
  const [showRequest, setShowRequest] = useState(false);
  const stamp = (iso?: string) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  return <section className="pv-actions">
    <div className="pv-actions-row">
      {saved
        ? <span className="pv-saved" title={savedAt ? `Saved ${stamp(savedAt)}` : undefined}>✓ Saved</span>
        : <button type="button" className="button small-button" disabled={generating} onClick={onSave}>Save plan</button>}
      {canGenerate && <button type="button" className="button ghost small-button" disabled={generating} onClick={onRegenerate}>{generating ? 'Building…' : 'Regenerate'}</button>}
      {generatedAt && <small className="pv-stamp">Built {stamp(generatedAt)}</small>}
    </div>
    {request && <div className="pv-request">
      <button type="button" className="text-button" onClick={() => setShowRequest(value => !value)} aria-expanded={showRequest}>{showRequest ? 'Hide what you asked for' : 'What you asked for ›'}</button>
      {showRequest && <blockquote>“{request}”{requestNote ? <span> — {requestNote}</span> : null}</blockquote>}
    </div>}
    {error && <small className="pv-error">{error}</small>}
  </section>;
}
