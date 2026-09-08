import { useRef, useState, type ReactNode, type TouchEvent } from 'react';
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
/* THE SQUARES LOOK LIKE TABS, SO THEY ARE TABS NOW.

   Ten pips across the top of a screen read as a control on every phone anyone
   owns, and these were a picture: they showed which week you were in and did
   nothing when pressed, while the only way to see week four was a "The whole
   block" accordion at the far bottom of the page. Two ways to reach the same
   ten weeks, one of them invisible and the other inert.

   So the pips drive the screen. Tap one, or swipe the week itself, and the
   week below changes; the tab always opens on the week you are actually in.
   A week is a real tab stop, keyboard arrows included, because that is what it
   looks like. */
export function PlanProgress({ weekIndex, current, total, waveIndexFor, sentence, onPick }: {
  weekIndex: number; current: number; total: number;
  waveIndexFor: (index: number) => number; sentence: ReactNode; onPick: (index: number) => void;
}) {
  const away = weekIndex - current;
  return <section className="pv-progress">
    <div className="pv-progress-head">
      <span className="pv-progress-week">Week {weekIndex + 1} <small>of {total}</small></span>
      <span className="pv-progress-name">{waveLabel(waveIndexFor(weekIndex))}</span>
    </div>
    <div className="pv-dots" role="tablist" aria-label="Week">
      {Array.from({ length: total }, (_, index) => {
        const wave = waveIndexFor(index);
        const kind = isMaxWeek(wave) ? ' max' : isLighterWeek(wave) ? ' light' : '';
        const state = index === weekIndex ? ' now' : index < current ? ' done' : '';
        return <button type="button" key={index} role="tab" aria-selected={index === weekIndex}
          className={`pv-dot${state}${kind}${index === current ? ' here' : ''}`}
          aria-label={`Week ${index + 1}, ${waveLabel(wave).toLowerCase()}${index === current ? ', the week you are in' : ''}`}
          onKeyDown={event => {
            if (event.key === 'ArrowRight' && weekIndex < total - 1) { event.preventDefault(); onPick(weekIndex + 1); }
            if (event.key === 'ArrowLeft' && weekIndex > 0) { event.preventDefault(); onPick(weekIndex - 1); }
          }}
          onClick={() => onPick(index)} />;
      })}
    </div>
    <p className="pv-progress-sentence">{sentence}</p>
    {/* Looking somewhere other than now is a state worth naming, with the way
        back one tap away rather than a scroll and a guess. */}
    {away !== 0 && <button type="button" className="pv-progress-back" onClick={() => onPick(current)}>
      {away > 0 ? `${away} week${away === 1 ? '' : 's'} ahead` : `${-away} week${away === -1 ? '' : 's'} back`} · return to this week
    </button>}
  </section>;
}

/* Two names for the same day — "Chest & Back" against "Chest and Back" — are
   not a swap worth reporting. */
const sameDayName = (a: string, b: string) =>
  a.toLowerCase().replace(/[^a-z0-9]/g, '') === b.toLowerCase().replace(/[^a-z0-9]/g, '');

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
      {/* WHAT WAS DONE, NOT WHAT WAS PLANNED. This printed the planned day's
          name under "Logged", so a day the athlete trained off-plan read
          "Logged · Legs" above a list of bench sets — and the week list below
          it, which reads from history, said Chest & Back on the same screen.
          Completed work is authoritative everywhere else in Forge; it is here
          too. The plan's intention is still worth knowing when the two differ,
          so it is said once, quietly, rather than replacing the truth. */}
      {done && <small>{logged?.title || session.title}</small>}
      {done && logged?.title && !isRest && !sameDayName(logged.title, session.title)
        && <span className="pv-today-swap">Planned {session.title}</span>}
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
export function WeekList({ sessions, unit, records, title = 'This week', note, onSwipe }: {
  sessions: PlanSession[]; unit: string; records: WorkoutRecord[]; title?: string;
  note?: ReactNode;
  /* A horizontal drag across the week moves to the next or previous one. It is
     the gesture the dots above promise, and a phone will otherwise scroll the
     page vertically underneath it — so only a clearly sideways drag counts. */
  onSwipe?: (direction: 1 | -1) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  /* A REF, NOT STATE. Where the finger went down is not something the screen
     draws, and holding it in state means the touchend handler can run against a
     render that has not flushed yet — a fast flick then does nothing at all. */
  const from = useRef<{ x: number; y: number } | null>(null);
  const todayIso = localDayIso();
  const swipe = onSwipe ? {
    onTouchStart: (event: TouchEvent<HTMLElement>) => { from.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; },
    onTouchEnd: (event: TouchEvent<HTMLElement>) => {
      const start = from.current;
      from.current = null;
      if (!start) return;
      const dx = event.changedTouches[0].clientX - start.x;
      const dy = event.changedTouches[0].clientY - start.y;
      /* A drag that is mostly vertical is the page scrolling, not a swipe. */
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.6) onSwipe(dx < 0 ? 1 : -1);
    },
  } : {};
  return <section className="card pv-week" {...swipe}>
    <header><h3>{title}</h3></header>
    <div className="pv-week-rows">
      {sessions.map(session => {
        const iso = localDayIso(session.date);
        const isToday = iso === todayIso;
        const past = iso < todayIso;
        const logged = records.find(record => record.date === iso && ((record.topSets || []).some(set => set.completed !== false) || (record.cardioSessions || []).length > 0 || record.muscles.some(muscle => muscle !== 'Cardio')));
        const isRest = session.empty === 'rest' && !session.lifts.length && !session.run;
        const isOpenDay = session.empty === 'open' && !session.lifts.length && !session.run;
        /* THE PAST IS HISTORY, NOT A PROJECTION. A rolling split rotates around
           where the athlete's cursor is TODAY, so the days behind today are
           drawn by winding that rotation backwards — which is fiction the
           moment a day is trained early or skipped. Preston squatted on the
           Friday, rested Saturday and pressed on Sunday; the week showed
           "Sat — Legs 2 — Squat 475x2 — Missed", naming a session he had
           already done and calling it missed on a day he had rested.

           Behind today the app knows exactly what happened, so that is what it
           shows: the day the athlete logged, under the name they gave it, or
           an honest blank. It never asserts what was owed on a day already
           gone. */
        const expanded = open === iso;
        /* A ROLLING SPLIT CANNOT MISS A DAY. It advances on what you log, so
           a day with no training is a rest day you chose, not a session you
           owe — branding every one of them "Missed" would put three verdicts a
           week on anyone training four days. The row goes quiet instead: muted,
           and it says what is true, which is that nothing was logged. */
        const missed = past && !logged && !isRest;
        const heading = logged ? logged.title : past ? (isRest ? 'Rest' : 'Nothing logged') : isRest ? 'Rest' : session.title;
        /* One line, in words the athlete would use. */
        const summary = logged
          ? [...(logged.topSets || []).filter(set => set.completed !== false).slice(0, 2).map(set => `${set.lift} ${set.weight}×${set.reps}`), ...(logged.cardioSessions || []).slice(0, 1).map(cardio => cardio.summary?.replace(`${cardio.activity} · `, '') || cardio.activity)].filter(Boolean).join(' · ') || 'Logged'
          : past ? (isRest ? 'Rest day' : 'No training on this day')
          : isRest ? 'Nothing scheduled'
          : isOpenDay ? 'Open — nothing required'
          : [
              ...session.lifts.slice(0, 2).map(lift => lift.weight ? `${lift.exercise} ${lift.weight}×${lift.reps}` : lift.exercise),
              session.run ? (() => { const text = session.run.text.split(/ @ | · /)[0]; return /\beasy\b/i.test(text) && session.run.kind === 'Easy run' ? text : `${session.run.kind} ${text}`; })() : '',
            /* NEVER THE DAY'S OWN NAME AGAIN. The last resort used to be
               session.title, so a split day the block prescribes nothing for
               rendered as "Chest & Back" over "Chest & Back" — a repetition
               that read as a rendering bug and, worse, hid the real problem:
               that day has no top set waiting for it. Say that instead. */
            ].filter(Boolean).join(' · ') || session.summary || 'No top set prescribed';
        /* A logged day opens on what was logged; a day gone by with nothing on
           it has nothing to open. */
        const loggedLifts = (logged?.topSets || []).filter(set => set.completed !== false);
        const canExpand = logged
          ? loggedLifts.length + (logged.cardioSessions || []).length > 0
          : !past && !isRest && !isOpenDay && (session.lifts.length + (session.run ? 1 : 0) > 0 || Boolean(session.summary));
        return <div className={`pv-row${isToday ? ' today' : ''}${logged ? ' done' : ''}${missed ? ' missed' : ''}${isRest ? ' rest' : ''}${expanded ? ' open' : ''}`} key={iso}>
          <button type="button" className="pv-row-main" onClick={() => canExpand && setOpen(current => current === iso ? null : iso)} aria-expanded={canExpand ? expanded : undefined} disabled={!canExpand}>
            <span className="pv-row-date"><b>{weekdayShort(session.date)}</b><small>{dayNumber(session.date)}</small></span>
            <span className="pv-row-body">
              <strong>{heading}</strong>
              <small>{summary}</small>
            </span>
            <span className="pv-row-state" aria-hidden="true">{logged ? '✓' : isToday ? 'Today' : canExpand ? '›' : ''}</span>
          </button>
          {expanded && <div className="pv-row-detail">
            {logged
              ? <>
                  {loggedLifts.map((set, index) => <LiftLine key={set.id || `${set.lift}-${index}`} lift={{ exercise: set.lift, weight: set.weight, reps: set.reps }} unit={unit} />)}
                  {(logged.cardioSessions || []).map(cardio => <div className="pv-line" key={cardio.id}><span className="pv-line-name">{cardio.activity}</span><span className="pv-line-value">{cardio.summary?.replace(`${cardio.activity} · `, '')}</span></div>)}
                </>
              : <>
                  {session.lifts.map((lift, index) => <LiftLine key={`${lift.exercise}-${index}`} lift={lift} unit={unit} />)}
                  {session.run && <RunLine run={session.run} />}
                  {!session.lifts.length && !session.run && session.summary && <p>{session.summary}</p>}
                </>}
          </div>}
        </div>;
      })}
    </div>
    {note && <p className="pv-week-note">{note}</p>}
  </section>;
}

/* THE WHOLE BLOCK, UNFOLDED. There used to be a fourth section here: a "The
   whole block" accordion at the bottom of the page listing all ten weeks, each
   expanding to its own days. It was the only way to see week four, and it sat
   below everything, while ten pips at the top of the screen showed the same
   ten weeks and did nothing when pressed. The pips are the control now and the
   week list draws whichever week they pick, so the accordion has nothing left
   to say — one way to reach a week, at the top, where it looked like it was
   all along. */

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
