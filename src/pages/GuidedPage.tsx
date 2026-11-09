import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import Model from 'react-body-highlighter';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { useBilling } from '../features/billing/BillingProvider';
import { photoUrl, type Move, type Style } from '../lib/guided/catalog';
import { amountText, buildWorkout, estimateMinutes, FOCUSES, nextWeight, owned, suggestFocus, swapFor, type Feel, type Focus, type GuidedPrefs, type Level, type Place, type Step, type Workout } from '../lib/guided/builder';
import { canListen, canSpeak, cheer, Coach, type Command } from '../lib/guided/voice';
import { Icon } from '../components/Icon';

/* FORGE GUIDED. The coach builds the workout and walks her through it, one
   card at a time, out loud. The only input during a workout is "how did that
   feel" — tapped or said — and everything is saved to the log, so the day she
   moves to goal-based Forge it already knows her numbers.

   Free athletes get three guided workouts; then it is Forge Pro. */

const PREFS_KEY = 'forge-guided-prefs-v1';
const WEIGHTS_KEY = 'forge-guided-weights-v1';
const LAST_KEY = 'forge-guided-last-v1';
const COUNT_KEY = 'forge-guided-count-v1';
const FREE_WORKOUTS = 3;

const read = <T,>(key: string, fallback: T): T => { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* per device */ } };
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`;

const STYLES: Array<[Style, string]> = [
  ['Strength', 'M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12'],
  ['Pilates', 'M12 5a2 2 0 1 0 0-.01M4 20l5-6 3 2 3-2 5 6M9 14l3-5 3 5'],
  ['Build muscle', 'M7 7c0 3 2 5 5 5s5-2 5-5M5 21c0-4 3-7 7-7s7 3 7 7'],
  ['Bodyweight', 'M12 4a2 2 0 1 0 0 .01M12 8v6M8 21l4-7 4 7M6 11h12'],
  ['HIIT / CrossFit-style', 'M13 2 4 14h7l-1 8 9-12h-7l1-8z'],
  ['Stretch & mobility', 'M4 20c4-8 12-8 16 0M12 4a2 2 0 1 0 0 .01M12 8v4'],
];
const VIBES = ['Slow & controlled', 'High energy', 'Low impact', 'Core focus', 'Glutes & legs', 'Upper body', 'Short & sweet'];
const PLACES: Array<[Place, string]> = [['Gym', 'Machines, barbells, dumbbells'], ['Home', 'A few things at home'], ['Anywhere', 'No equipment at all']];
const GEAR = ['Dumbbells', 'Kettlebell', 'Mat', 'Bench'];
const LEVELS: Array<[Level, string]> = [['New to this', 'I have never really lifted. Show me everything.'], ['A little', 'I know a few moves but not a plan.'], ['Comfortable', 'I know my way around. Just tell me what to do.']];

type LoggedSet = { moveId: string; name: string; muscles: string[]; reps: number; weight: number | null; feel: Feel | null; timed: boolean };
type Phase = 'setup' | 'today' | 'preview' | 'card' | 'feel' | 'rest' | 'done' | 'locked';

function Svg({ d, size = 22, stroke = 2 }: { d: string; size?: number; stroke?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
const MIC = 'M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v3';

function BodyMap({ move }: { move: Move }) {
  const data = [
    { name: 'secondary', muscles: move.map.secondary as never[], frequency: 1 },
    { name: 'primary', muscles: move.map.primary as never[], frequency: 2 },
  ].filter(item => item.muscles.length);
  const back = ['gluteal', 'hamstring', 'upper-back', 'lower-back', 'trapezius', 'back-deltoids', 'triceps', 'calves'];
  const front = ['chest', 'abs', 'obliques', 'quadriceps', 'biceps', 'front-deltoids', 'adductor', 'abductors', 'forearm'];
  const all = [...move.map.primary, ...move.map.secondary];
  const showFront = all.some(muscle => front.includes(muscle)) || !all.some(muscle => back.includes(muscle));
  const showBack = all.some(muscle => back.includes(muscle));
  const style = { width: showFront && showBack ? '46%' : '58%' };
  return <div className="gd-body" aria-hidden="true">
    {showFront && <Model type="anterior" data={data} bodyColor="#D9DCE1" highlightedColors={['#F2B1A4', '#D63A2F']} style={style} />}
    {showBack && <Model type="posterior" data={data} bodyColor="#D9DCE1" highlightedColors={['#F2B1A4', '#D63A2F']} style={style} />}
  </div>;
}

function Photos({ move, still }: { move: Move; still?: boolean }) {
  return <div className={still ? 'gd-photos still' : 'gd-photos'} role="img" aria-label={`${move.name}: start and finish positions`}>
    <img src={photoUrl(move, 0)} alt="" draggable={false} />
    <img src={photoUrl(move, 1)} alt="" draggable={false} />
  </div>;
}

export function GuidedPage() {
  const navigate = useNavigate();
  const { addRecord } = useWorkoutHistory();
  const { setup } = useProfileSetup();
  const { isPro } = useBilling();
  const metric = setup?.units === 'Metric';
  const unit = metric ? 'kg' : 'lb';
  const unitWord = metric ? 'kilos' : 'pounds';

  const [prefs, setPrefs] = useState<GuidedPrefs | null>(() => read<GuidedPrefs | null>(PREFS_KEY, null));
  const [draft, setDraft] = useState<GuidedPrefs>(() => prefs || { styles: [], vibe: [], place: 'Home', gear: ['Dumbbells', 'Mat'], level: 'New to this' });
  const [setupStep, setSetupStep] = useState(0);
  const last = read<{ focus?: Focus; moves?: string[] }>(LAST_KEY, {});
  const [minutes, setMinutes] = useState(30);
  const [focus, setFocus] = useState<Focus>(() => prefs ? suggestFocus(last.focus, prefs) : 'Full body');
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [phase, setPhase] = useState<Phase>(prefs ? 'today' : 'setup');
  const [stepIndex, setStepIndex] = useState(0);
  const [setIndex, setSetIndex] = useState(0);
  const [weights, setWeights] = useState<Record<number, number | null>>({});
  const [logged, setLogged] = useState<LoggedSet[]>([]);
  const [learn, setLearn] = useState(false);
  const [timer, setTimer] = useState(0);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [handsFree, setHandsFree] = useState(canListen());
  const [voiceOn, setVoiceOn] = useState(canSpeak());
  const [voiceState, setVoiceState] = useState({ speaking: false, listening: false });
  const [heard, setHeard] = useState('');
  const [savedNote, setSavedNote] = useState('');
  const coach = useRef<Coach | null>(null);
  const lastLine = useRef<{ text: string; listen?: Command[] }>({ text: '' });

  if (!coach.current && typeof window !== 'undefined') coach.current = new Coach();
  useEffect(() => {
    const c = coach.current!;
    c.onState = setVoiceState;
    c.onHeard = text => setHeard(text);
    const html = document.documentElement; const before = html.style.overflow; html.style.overflow = 'hidden';
    return () => { c.stop(); html.style.overflow = before; };
  }, []);
  useEffect(() => { if (coach.current) coach.current.muted = !voiceOn; }, [voiceOn]);
  useEffect(() => { coach.current?.setHandsFree(handsFree && (phase === 'card' || phase === 'feel' || phase === 'rest' || phase === 'preview')); }, [handsFree, phase]);

  const say = (text: string, listen?: Command[]) => { lastLine.current = { text, listen }; coach.current?.say(text, listen); };

  const step: Step | undefined = workout?.steps[stepIndex];
  const weight = step ? (weights[stepIndex] !== undefined ? weights[stepIndex] : step.weight) : null;
  const have = useMemo(() => owned(prefs || draft), [prefs, draft]);
  const freeLeft = Math.max(0, FREE_WORKOUTS - read<number>(COUNT_KEY, 0));

  /* ---- Lines the coach says ---- */
  const cardLine = (s: Step, setNo: number, w: number | null) => {
    const lead = s.part === 'warmup' ? 'Warm-up. ' : s.part === 'cooldown' ? 'Cool-down. ' : `Set ${setNo + 1} of ${s.sets}. `;
    const load = w !== null ? ` with ${w} ${unitWord}` : s.weightNote && setNo === 0 ? `. ${s.weightNote}` : '';
    const amount = s.move.timed ? `${s.reps} seconds${s.move.perSide && s.part === 'main' ? ' each side' : ''}` : `${s.reps} ${s.move.perSide ? 'each side' : 'reps'}`;
    const ask = s.move.timed ? ' Say go when you are ready.' : ' Say done when you finish.';
    return `${s.move.name}. ${lead}${amount}${load}. ${s.move.cue}${ask}`;
  };
  const CARD_CMDS: Command[] = ['done', 'ready', 'start', 'how', 'easier', 'harder', 'heavier', 'lighter', 'repeat', 'skip', 'pause', 'resume', 'end'];
  const speakCard = (index: number, setNo: number, w: number | null, plan = workout) => {
    const s = plan?.steps[index]; if (!s) return;
    say(cardLine(s, setNo, w), CARD_CMDS);
  };

  /* ---- Flow ---- */
  const build = (chosenFocus = focus, chosenMinutes = minutes) => {
    if (!prefs) return;
    if (!isPro && freeLeft <= 0) { setPhase('locked'); return; }
    const plan = buildWorkout(prefs, chosenMinutes, chosenFocus, { seed: Date.now() % 100000, recent: last.moves || [], remembered: read<Record<string, number>>(WEIGHTS_KEY, {}), metric });
    setWorkout(plan); setPhase('preview');
  };
  const start = () => {
    if (!workout) return;
    setStepIndex(0); setSetIndex(0); setWeights({}); setLogged([]); setStartedAt(Date.now()); setPhase('card'); setTimer(workout.steps[0].reps); setRunning(false);
    say(`Let's go. ${workout.steps.length} moves, about ${estimateMinutes(workout)} minutes. I'll talk you through every one. ${cardLine(workout.steps[0], 0, workout.steps[0].weight)}`, CARD_CMDS);
  };
  const goTo = (index: number) => {
    if (!workout) return;
    if (index >= workout.steps.length) { finish(); return; }
    const next = workout.steps[index];
    setStepIndex(index); setSetIndex(0); setPhase('card'); setLearn(false); setTimer(next.reps); setRunning(false);
    speakCard(index, 0, weights[index] !== undefined ? weights[index] : next.weight);
  };
  const setDone = () => {
    if (!step) return;
    setRunning(false);
    if (step.part !== 'main') { record(null); goTo(stepIndex + 1); return; }
    setPhase('feel');
    say('How did that feel? Too easy, just right, or too hard?', ['easy', 'right', 'hard', 'repeat', 'end']);
  };
  const record = (feel: Feel | null) => {
    if (!step) return;
    setLogged(list => [...list, { moveId: step.move.id, name: step.move.name, muscles: step.move.muscles, reps: step.reps, weight, feel, timed: Boolean(step.move.timed) }]);
  };
  const answer = (feel: Feel) => {
    if (!step || !workout) return;
    record(feel);
    const nextW = nextWeight(weight, feel, step.move.load, metric);
    let swapped: Move | undefined;
    if (feel === 'hard' && weight === null) swapped = swapFor(step, 'easier', have);
    if (feel === 'easy' && weight === null && setIndex + 1 >= step.sets) swapped = undefined;
    if (nextW !== null) { setWeights(map => ({ ...map, [stepIndex]: nextW })); const remembered = read<Record<string, number>>(WEIGHTS_KEY, {}); remembered[step.move.id] = nextW; write(WEIGHTS_KEY, remembered); }
    if (swapped) setWorkout(plan => plan ? { ...plan, steps: plan.steps.map((item, i) => i === stepIndex ? { ...item, move: swapped! } : item) } : plan);
    const lastSet = setIndex + 1 >= step.sets;
    const lastStep = stepIndex + 1 >= workout.steps.length;
    if (lastSet && lastStep) { finish(); return; }
    const restFor = step.rest;
    const upNext = lastSet ? workout.steps[stepIndex + 1] : step;
    const why = feel === 'easy' && nextW !== null && !lastSet ? ` Going up to ${nextW} ${unitWord}.` : feel === 'hard' && nextW !== null && !lastSet ? ` Dropping to ${nextW} ${unitWord}.` : feel === 'hard' && swapped ? ` Next set: ${swapped.name}, an easier version.` : '';
    setPhase('rest'); setTimer(restFor); setRunning(true); setPaused(false);
    say(`${cheer(logged.length)}${why} Rest ${restFor >= 60 ? `${Math.floor(restFor / 60)} minute${restFor >= 120 ? 's' : ''}${restFor % 60 ? ` ${restFor % 60} seconds` : ''}` : `${restFor} seconds`}. Up next, ${upNext.move.name}. Say ready when you are.`, ['ready', 'more', 'skip', 'repeat', 'pause', 'resume', 'end']);
  };
  const afterRest = () => {
    if (!step || !workout) return;
    setRunning(false);
    if (setIndex + 1 < step.sets) {
      const nextSet = setIndex + 1;
      setSetIndex(nextSet); setPhase('card'); setTimer(step.reps); setLearn(false);
      speakCard(stepIndex, nextSet, weights[stepIndex] !== undefined ? weights[stepIndex] : step.weight);
    } else goTo(stepIndex + 1);
  };
  const swap = (way: 'easier' | 'harder') => {
    if (!step || !workout) return;
    const move = swapFor(step, way, have);
    if (!move) { say(way === 'easier' ? 'This is already the easiest version. Take it slower, or do fewer reps.' : 'This is the hardest version for now. Slow it down to make it harder.', CARD_CMDS); return; }
    const updated = { ...workout, steps: workout.steps.map((item, i) => i === stepIndex ? { ...item, move, weight: move.load === 'none' ? null : item.weight } : item) };
    setWorkout(updated); setWeights(map => ({ ...map, [stepIndex]: move.load === 'none' ? null : (map[stepIndex] ?? step.weight) }));
    speakCard(stepIndex, setIndex, move.load === 'none' ? null : weight, updated);
  };
  const bump = (dir: 1 | -1) => {
    if (!step || weight === null) { say('This one has no weight. Say easier or harder to change it.', CARD_CMDS); return; }
    const w = nextWeight(weight, dir > 0 ? 'easy' : 'hard', step.move.load, metric);
    setWeights(map => ({ ...map, [stepIndex]: w }));
    say(`Okay, ${w} ${unitWord}.`, CARD_CMDS);
  };
  const explain = () => {
    if (!step) return;
    setLearn(true);
    say(`Here's how. One: ${step.move.steps[0]} Two: ${step.move.steps[1]} Three: ${step.move.steps[2]} You should feel it in ${step.move.feel.replace(/\.$/, '').toLowerCase()}. Watch out: ${step.move.mistake} Say done when you finish the set.`, CARD_CMDS);
  };
  const finish = () => {
    coach.current?.stop();
    setRunning(false); setPhase('done');
  };

  /* Save once, when the done screen appears. */
  const saved = useRef(false);
  useEffect(() => {
    if (phase !== 'done' || saved.current || !workout) return;
    saved.current = true;
    const minutesTaken = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
    const main = logged.filter(item => item.feel !== null);
    const best = new Map<string, LoggedSet>();
    for (const item of main) if (item.weight !== null && (!best.has(item.moveId) || (item.weight ?? 0) > (best.get(item.moveId)!.weight ?? 0))) best.set(item.moveId, item);
    const muscles = [...new Set(logged.flatMap(item => item.muscles))];
    const notes = `Forge Guided · ${workout.focus}. ` + [...new Set(main.map(item => item.name))].map(name => { const sets = main.filter(item => item.name === name); return `${name} ${sets.length}×${sets[0].timed ? `${sets[0].reps}s` : sets[0].reps}${sets[0].weight !== null ? ` @ ${sets[sets.length - 1].weight} ${unit}` : ''}`; }).join(' · ');
    if (logged.length) {
      const result = addRecord({ date: todayIso(), title: `Guided · ${workout.focus}`, muscles, hasCardio: false, notes, durationMinutes: minutesTaken,
        topSets: [...best.values()].map(item => ({ muscle: item.muscles[0] || 'Full body', lift: item.name, weight: item.weight as number, reps: item.reps, completed: true })) });
      setSavedNote(result.ok ? 'Saved to your log.' : 'Already in your log.');
      write(COUNT_KEY, read<number>(COUNT_KEY, 0) + 1);
      write(LAST_KEY, { focus: workout.focus, moves: workout.steps.map(item => item.move.id) });
    }
    const sets = main.length;
    coach.current?.say(logged.length ? `That's the workout. ${sets} sets in ${minutesTaken} minutes. Really well done. It's saved to your log.` : 'No problem. Come back when you are ready.');
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- Timers: rest counts down; a timed move counts down once started ---- */
  useEffect(() => {
    if (!running || paused) return;
    const id = window.setInterval(() => setTimer(t => t - 1), 1000);
    return () => window.clearInterval(id);
  }, [running, paused]);
  useEffect(() => {
    if (!running || paused) return;
    if (phase === 'rest') {
      if (timer === 10) coach.current?.aside('Ten seconds.');
      if (timer <= 0) afterRest();
    }
    if (phase === 'card' && step?.move.timed) {
      if (timer === 3) coach.current?.aside('Three, two, one.');
      if (timer <= 0) { coach.current?.aside('Done. Nice.'); setDone(); }
      else if (step.move.perSide && step.part === 'main' && timer === Math.floor(step.reps / 2)) coach.current?.aside('Switch sides.');
    }
  }, [timer]); // eslint-disable-line react-hooks/exhaustive-deps

  /* "Go" keeps listening, so "done", "pause" or "end" work mid-plank. */
  const startTimed = () => { if (!step?.move.timed) return; setTimer(step.reps); setRunning(true); setPaused(false); say('Go!', CARD_CMDS); };

  /* ---- Voice commands, read against the latest state ---- */
  const commandRef = useRef<(command: Command) => void>(() => {});
  commandRef.current = (command: Command) => {
    if (command === 'end') { finish(); return; }
    if (command === 'repeat') { say(lastLine.current.text, lastLine.current.listen); return; }
    if (command === 'pause') { setPaused(true); say('Paused. Say resume when you are ready.', ['resume', 'ready', 'end']); return; }
    if (command === 'resume') { setPaused(false); say('Back to it.', lastLine.current.listen); return; }
    if (phase === 'card') {
      if (command === 'done') { if (step?.move.timed && running) { setDone(); return; } setDone(); return; }
      if (command === 'ready' || command === 'start') { if (step?.move.timed && !running) startTimed(); else if (!step?.move.timed) setDone(); return; }
      if (command === 'how') { explain(); return; }
      if (command === 'easier' || command === 'harder') { swap(command); return; }
      if (command === 'heavier') { bump(1); return; }
      if (command === 'lighter') { bump(-1); return; }
      if (command === 'skip') { goTo(stepIndex + 1); return; }
    }
    if (phase === 'feel') {
      if (command === 'easy') answer('easy');
      if (command === 'right') answer('right');
      if (command === 'hard') answer('hard');
      return;
    }
    if (phase === 'rest') {
      if (command === 'ready' || command === 'skip') { afterRest(); return; }
      if (command === 'more') { setTimer(t => t + 30); say('Thirty more seconds.', ['ready', 'more', 'skip', 'repeat', 'end']); return; }
    }
  };
  useEffect(() => { coach.current?.on(command => commandRef.current(command)); }, []);

  const close = () => { coach.current?.stop(); navigate('/'); };

  /* ---------- Screens ---------- */
  const frame = (content: ReactNode, tone = '') => createPortal(<div className={`guided ${tone}`} role="dialog" aria-modal="true" aria-label="Forge Guided">{content}</div>, document.body);
  const top = (onBack?: () => void, right?: ReactNode) => <div className="gd-top">
    {onBack ? <button type="button" className="gd-round" aria-label="Back" onClick={onBack}><Svg d="M15 5l-7 7 7 7" size={20} stroke={2.4} /></button> : <button type="button" className="gd-round" aria-label="Close" onClick={close}><Svg d="M6 6l12 12M18 6L6 18" size={18} stroke={2.4} /></button>}
    <span className="gd-top-fill" />
    {right}
  </div>;
  const voiceToggles = <div className="gd-voice-row">
    <button type="button" className={voiceOn ? 'gd-pill on' : 'gd-pill'} aria-pressed={voiceOn} onClick={() => setVoiceOn(v => !v)}><Svg d="M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" size={16} />Coach voice</button>
    {canListen() && <button type="button" className={handsFree ? 'gd-pill on' : 'gd-pill'} aria-pressed={handsFree} onClick={() => setHandsFree(v => !v)}><Svg d={MIC} size={16} />Hands-free</button>}
  </div>;

  if (phase === 'setup') {
    const toggle = (key: 'styles' | 'vibe' | 'gear', value: string) => setDraft(d => ({ ...d, [key]: (d[key] as string[]).includes(value) ? (d[key] as string[]).filter(x => x !== value) : [...(d[key] as string[]), value] }));
    const next = () => { if (setupStep < 2) setSetupStep(s => s + 1); else { write(PREFS_KEY, draft); setPrefs(draft); setFocus(suggestFocus(undefined, draft)); setPhase('today'); } };
    const ready = setupStep !== 0 || draft.styles.length > 0;
    return frame(<div className="gd-screen">
      {top(setupStep ? () => setSetupStep(s => s - 1) : undefined, <span className="gd-count">{setupStep + 1}/3</span>)}
      <div className="gd-bar"><i style={{ width: `${((setupStep + 1) / 3) * 100}%` }} /></div>
      {setupStep === 0 && <>
        <h1>What do you enjoy?</h1><p className="gd-lead">Pick as many as you like.</p>
        <div className="gd-tiles">{STYLES.map(([label, icon]) => { const on = draft.styles.includes(label); return <button type="button" key={label} className={on ? 'gd-tile on' : 'gd-tile'} aria-pressed={on} onClick={() => toggle('styles', label)}><span className="gd-ic"><Svg d={icon} size={20} /></span><strong>{label}</strong></button>; })}</div>
        <h2>Your style</h2>
        <div className="gd-chips">{VIBES.map(label => { const on = draft.vibe.includes(label); return <button type="button" key={label} className={on ? 'gd-chip on' : 'gd-chip'} aria-pressed={on} onClick={() => toggle('vibe', label)}>{label}</button>; })}</div>
      </>}
      {setupStep === 1 && <>
        <h1>Where do you train?</h1>
        <div className="gd-list">{PLACES.map(([label, copy]) => { const on = draft.place === label; return <button type="button" key={label} className={on ? 'gd-opt on' : 'gd-opt'} aria-pressed={on} onClick={() => setDraft(d => ({ ...d, place: label }))}><span><strong>{label}</strong><small>{copy}</small></span></button>; })}</div>
        {draft.place === 'Home' && <><h2>What do you have?</h2><div className="gd-chips">{GEAR.map(label => { const on = draft.gear.includes(label); return <button type="button" key={label} className={on ? 'gd-chip on' : 'gd-chip'} aria-pressed={on} onClick={() => toggle('gear', label)}>{label}</button>; })}</div></>}
      </>}
      {setupStep === 2 && <>
        <h1>How much have you trained?</h1><p className="gd-lead">No wrong answer. Forge starts easy and learns from how each set feels.</p>
        <div className="gd-list">{LEVELS.map(([label, copy]) => { const on = draft.level === label; return <button type="button" key={label} className={on ? 'gd-opt on' : 'gd-opt'} aria-pressed={on} onClick={() => setDraft(d => ({ ...d, level: label }))}><span><strong>{label}</strong><small>{copy}</small></span></button>; })}</div>
      </>}
      <button type="button" className="gd-cta" disabled={!ready} onClick={next}>{setupStep < 2 ? 'Continue' : 'Done'}</button>
    </div>);
  }

  if (phase === 'locked') return frame(<div className="gd-screen">
    {top()}
    <span className="gd-badge">{FREE_WORKOUTS} FREE WORKOUTS DONE</span>
    <h1>Keep your coach.</h1>
    <p className="gd-lead">Forge Pro builds a new workout every day and talks you through every set.</p>
    <button type="button" className="gd-cta" onClick={() => { coach.current?.stop(); navigate('/profile?view=billing'); }}>Start my 7-day free trial</button>
  </div>);

  if (phase === 'today' && prefs) return frame(<div className="gd-screen">
    {top(undefined, <button type="button" className="gd-link" onClick={() => { setDraft(prefs); setSetupStep(0); setPhase('setup'); }}>Change setup</button>)}
    <h1>Ready when you are.</h1>
    <h2>How much time do you have?</h2>
    <div className="gd-times">{[20, 30, 45, 60].map(m => <button type="button" key={m} className={minutes === m ? 'gd-time on' : 'gd-time'} aria-pressed={minutes === m} onClick={() => setMinutes(m)}>{m} min</button>)}</div>
    <div className="gd-card">
      <span className="gd-eyebrow">YOUR COACH PICKED</span>
      <strong className="gd-focus">{focus} · {minutes} min</strong>
      {last.focus && <p className="gd-muted">Last time was {last.focus.toLowerCase()}, so today is {focus.toLowerCase()}.</p>}
      <span className="gd-small">Rather do something else?</span>
      <div className="gd-chips">{FOCUSES.map(item => <button type="button" key={item} className={focus === item ? 'gd-chip on' : 'gd-chip'} aria-pressed={focus === item} onClick={() => setFocus(item)}>{item}</button>)}</div>
    </div>
    {voiceToggles}
    {!isPro && <p className="gd-muted center">{freeLeft > 0 ? `${freeLeft} free guided workout${freeLeft === 1 ? '' : 's'} left` : 'Your free workouts are used up'}</p>}
    <button type="button" className="gd-cta" onClick={() => build()}>Build my workout</button>
  </div>);

  if (phase === 'preview' && workout) return frame(<div className="gd-screen">
    {top(() => setPhase('today'))}
    <h1>{workout.focus}</h1>
    <p className="gd-lead strong">About {estimateMinutes(workout)} min · {workout.steps.length} moves</p>
    <div className="gd-moves">{workout.steps.map((item, index) => <div className="gd-move" key={`${item.move.id}-${index}`}>
      <img src={photoUrl(item.move, 1)} alt="" />
      <span><strong>{item.move.name}</strong><small>{item.part === 'warmup' ? 'Warm-up · ' : item.part === 'cooldown' ? 'Cool-down · ' : `${item.sets} sets × `}{amountText(item)}{item.weight !== null ? ` · ${item.weight} ${unit}` : ''}</small></span>
    </div>)}</div>
    <p className="gd-muted">Weights are a starting guess. Tell the coach how each set felt and the next one adjusts.</p>
    <button type="button" className="gd-secondary" onClick={() => build()}>Shuffle moves</button>
    <button type="button" className="gd-cta" onClick={start}><Svg d="M7 4v16l13-8z" size={18} />Start</button>
  </div>);

  if (phase === 'done' && workout) {
    const main = logged.filter(item => item.feel !== null);
    const notes = [...new Set(main.filter(item => item.feel === 'easy' && item.weight !== null).map(item => item.name))];
    return frame(<div className="gd-screen">
      <span className="gd-check"><Svg d="M5 12.5 10 17l9-10" size={38} stroke={2.8} /></span>
      <h1>{main.length ? 'You did it.' : 'Workout ended.'}</h1>
      <div className="gd-stats">
        <div><strong>{Math.max(1, Math.round((Date.now() - startedAt) / 60000))}</strong><span>minutes</span></div>
        <div><strong>{new Set(logged.map(item => item.moveId)).size}</strong><span>moves</span></div>
        <div><strong>{main.length}</strong><span>sets</span></div>
      </div>
      {notes.length > 0 && <div className="gd-card"><span className="gd-eyebrow">YOUR COACH NOTICED</span>{notes.map(name => <p key={name} className="gd-note"><Svg d="M12 19V5M5 12l7-7 7 7" size={16} />{name} felt easy. It starts heavier next time.</p>)}</div>}
      {savedNote && <p className="gd-saved"><Svg d="M5 12.5 10 17l9-10" size={18} />{savedNote}</p>}
      <button type="button" className="gd-cta" onClick={close}>Finish</button>
    </div>);
  }

  if (!workout || !step) return frame(<div className="gd-screen">{top()}<p className="gd-lead">Loading…</p></div>);

  const progress = <div className="gd-dots" aria-label={`Move ${stepIndex + 1} of ${workout.steps.length}`}>{workout.steps.map((_, i) => <span key={i} className={i < stepIndex ? 'done' : i === stepIndex ? 'now' : ''} />)}</div>;
  const listenBadge = handsFree && canListen() ? <span className={voiceState.listening ? 'gd-listen on' : 'gd-listen'}><Svg d={MIC} size={14} stroke={2.4} />{voiceState.speaking ? 'Coach talking' : voiceState.listening ? 'Listening' : 'Mic'}</span> : null;

  if (phase === 'rest') {
    const total = Math.max(1, step.rest);
    const upNext = setIndex + 1 < step.sets ? step : workout.steps[stepIndex + 1];
    return frame(<div className="gd-screen rest">
      {top(undefined, listenBadge)}
      <div className="gd-ring">
        <svg viewBox="0 0 260 260" aria-hidden="true"><circle cx="130" cy="130" r="110" className="track" /><circle cx="130" cy="130" r="110" className="fill" strokeDasharray="691" strokeDashoffset={691 * (1 - Math.max(0, timer) / total)} /></svg>
        <div><strong role="timer">{clock(Math.max(0, timer))}</strong><span>{paused ? 'Paused' : 'Rest. Breathe.'}</span></div>
      </div>
      {upNext && <div className="gd-next"><span>UP NEXT</span><strong>{upNext.move.name}{upNext === step ? ` · set ${setIndex + 2} of ${step.sets}` : ''}</strong><small>{amountText(upNext)}{(upNext === step ? weight : upNext.weight) !== null ? ` · ${upNext === step ? weight : upNext.weight} ${unit}` : ''}</small></div>}
      {heard && handsFree && <p className="gd-heard">Heard: “{heard}”</p>}
      <div className="gd-row">
        <button type="button" className="gd-ghost" onClick={() => setTimer(t => t + 30)}>+30 sec</button>
        <button type="button" className="gd-cta light" onClick={afterRest}>I'm ready</button>
      </div>
    </div>, 'dark');
  }

  if (phase === 'feel') return frame(<div className="gd-screen">
    {top(undefined, listenBadge)}
    <span className="gd-eyebrow">{step.move.name} · set {setIndex + 1} done</span>
    <h1>How did that feel?</h1>
    <button type="button" className="gd-feel" onClick={() => answer('easy')}><span className="gd-ic"><Svg d="M12 19V5M5 12l7-7 7 7" /></span><span><strong>Too easy</strong><small>{weight !== null ? 'Next set goes up a little' : 'Keep going, you are strong'}</small></span></button>
    <button type="button" className="gd-feel main" onClick={() => answer('right')}><span className="gd-ic"><Svg d="M5 12.5 10 17l9-10" /></span><span><strong>Just right</strong><small>Hard by the last rep, good form</small></span></button>
    <button type="button" className="gd-feel" onClick={() => answer('hard')}><span className="gd-ic warn"><Svg d="M12 5v14M5 12l7 7 7-7" /></span><span><strong>Too hard</strong><small>{weight !== null ? 'Next set gets lighter' : 'Next set gets an easier version'}</small></span></button>
    {handsFree && <p className="gd-muted center">Or just say it: “that was easy”.</p>}
    {heard && handsFree && <p className="gd-heard">Heard: “{heard}”</p>}
  </div>);

  /* The flashcard */
  const timed = Boolean(step.move.timed);
  const easier = swapFor(step, 'easier', have);
  const harder = swapFor(step, 'harder', have);
  return frame(<div className="gd-screen card">
    {top(undefined, <>{listenBadge}<button type="button" className="gd-link" onClick={finish}>End</button></>)}
    {progress}
    <div className="gd-media">
      <Photos move={step.move} still={learn} />
      {step.move.tempo && <span className="gd-tag left">{step.move.tempo}</span>}
    </div>
    <div className="gd-title"><h1>{step.move.name}</h1><span>{step.part === 'warmup' ? 'Warm-up' : step.part === 'cooldown' ? 'Cool-down' : `Set ${setIndex + 1} of ${step.sets}`}</span></div>
    <div className="gd-nums">
      <div><span>{timed ? (step.move.perSide && step.part === 'main' ? 'Time each side' : 'Time') : step.move.perSide ? 'Reps each side' : 'Reps'}</span><strong>{timed && running ? clock(Math.max(0, timer)) : timed ? `${step.reps} sec` : step.reps}</strong></div>
      <div><span>Weight</span><strong>{weight !== null ? `${weight} ${unit}` : step.weightNote ? 'Light' : 'None'}</strong>
        {weight !== null && <span className="gd-adjust"><button type="button" aria-label="Lighter" onClick={() => bump(-1)}>−</button><button type="button" aria-label="Heavier" onClick={() => bump(1)}>+</button></span>}</div>
    </div>
    {learn ? <div className="gd-learn">
      <ol>{step.move.steps.map(line => <li key={line}>{line}</li>)}</ol>
      <div className="gd-feelit"><BodyMap move={step.move} /><div><strong>Feel it here</strong><p>{step.move.feel}</p><strong className="warn">Watch out</strong><p>{step.move.mistake}</p></div></div>
      <button type="button" className="gd-link" onClick={() => setLearn(false)}>Hide</button>
    </div> : <>
      <p className="gd-cue">{step.move.cue}</p>
      <div className="gd-feelit compact"><BodyMap move={step.move} /><p><strong>Feel it:</strong> {step.move.feel}</p></div>
    </>}
    <div className="gd-row small">
      {!learn && <button type="button" className="gd-small-btn accent" onClick={explain}>How do I do this?</button>}
      <button type="button" className="gd-small-btn" disabled={!easier} onClick={() => swap('easier')}>Easier</button>
      <button type="button" className="gd-small-btn" disabled={!harder} onClick={() => swap('harder')}>Harder</button>
    </div>
    {heard && handsFree && <p className="gd-heard">Heard: “{heard}”</p>}
    {timed && !running
      ? <button type="button" className="gd-cta" onClick={startTimed}>Start {step.reps} sec</button>
      : <button type="button" className="gd-cta" onClick={setDone}>{timed ? 'Done early' : 'Done'}</button>}
  </div>);
}
