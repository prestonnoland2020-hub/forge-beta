import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import Model from 'react-body-highlighter';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { useBilling } from '../features/billing/BillingProvider';
import { photoUrl, type Move, type Style } from '../lib/guided/catalog';
import { amountText, buildWorkout, estimateMinutes, FOCUSES, nextWeight, owned, suggestFocus, swapFor, type Feel, type Focus, type GuidedPrefs, type Level, type Place, type Step, type Workout } from '../lib/guided/builder';
import { canListen, canSpeak, cheer, Coach, forgetVoice, loadVoiceMemory, matchCommand, teachPhrase, type Command } from '../lib/guided/voice';
import { Icon } from '../components/Icon';
import { requestForgeCoach } from '../features/training/coachService';
import { guidedCoachContext, writeLive } from '../lib/guided/session';
import { blobToBase64, cloudEarsSupported } from '../lib/guided/cloudEars';
import { supabase } from '../lib/supabase';
import { isDemoMode } from '../lib/env';

/* HOW THE COACH HEARS. Signed in, it hears the Wispr Flow way: short clips
   to forge-voice, a strong cloud speech model told what to expect. In the
   preview build, or when that service is down, the phone's recognizer. */
const cloudVoice = () => !isDemoMode && cloudEarsSupported();
const voiceInput = () => canListen() || cloudVoice();
async function transcribe(blob: Blob, hints: { words: string[]; phrases: string[]; context: string }): Promise<string> {
  const audio = await blobToBase64(blob);
  const { data, error } = await supabase.functions.invoke('forge-voice', { body: { audio, mime: 'audio/wav', ...hints } });
  if (error) throw error;
  return String((data as { text?: string } | null)?.text || '');
}

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
const MIC_KEY = 'forge-guided-mic-v1';
type MicStatus = 'unknown' | 'granted' | 'denied';

/* Asks the phone for the microphone with a real request, so the system
   prompt appears on our button press, then lets go of it straight away —
   the coach's recognizer opens its own when it listens. */
async function requestMic(): Promise<MicStatus> {
  try {
    if (!navigator.mediaDevices?.getUserMedia) return voiceInput() ? 'granted' : 'denied';
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    return 'granted';
  } catch { return 'denied'; }
}

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
  const { addRecord, records } = useWorkoutHistory();
  const { setup } = useProfileSetup();
  const { isPro } = useBilling();
  const metric = setup?.units === 'Metric';
  const unit = metric ? 'kg' : 'lb';
  const unitWord = metric ? 'kilos' : 'pounds';

  const [prefs, setPrefs] = useState<GuidedPrefs | null>(() => read<GuidedPrefs | null>(PREFS_KEY, null));
  const [draft, setDraft] = useState<GuidedPrefs>(() => prefs || { styles: [], vibe: [], place: 'Home', gear: ['Dumbbells', 'Mat'], level: 'New to this' });
  const [setupStep, setSetupStep] = useState(0);
  /* Changing one line from the home screen saves straight back. */
  const [editOne, setEditOne] = useState(false);
  const last = read<{ focus?: Focus; moves?: string[] }>(LAST_KEY, {});
  const [minutes, setMinutes] = useState(30);
  /* TODAY'S KIND OF WORKOUT. Setup says what she likes; this says what she
     wants today, defaulting to her first pick. It only changes today. */
  const [todayStyle, setTodayStyle] = useState<Style>(() => prefs?.styles[0] || 'Strength');
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
  const [handsFree, setHandsFree] = useState(voiceInput());
  const [voiceOn, setVoiceOn] = useState(canSpeak());
  const [voiceState, setVoiceState] = useState({ speaking: false, listening: false });
  const [heard, setHeard] = useState('');
  const [savedNote, setSavedNote] = useState('');
  /* THE MICROPHONE IS ASKED FOR, NOT GRABBED. The first hands-free workout
     opens on a screen that says what the coach listens for and why, and only
     its button triggers the phone's own prompt. */
  const [mic, setMic] = useState<MicStatus>(() => read<MicStatus>(MIC_KEY, 'unknown'));
  const [micAsk, setMicAsk] = useState(false);
  const [micBusy, setMicBusy] = useState(false);
  useEffect(() => {
    const perms = (navigator as Navigator & { permissions?: { query: (d: { name: string }) => Promise<{ state: string }> } }).permissions;
    perms?.query({ name: 'microphone' }).then(result => { if (result.state === 'granted') { setMic('granted'); write(MIC_KEY, 'granted'); } else if (result.state === 'denied') setMic('denied'); }).catch(() => { /* Safari may not answer */ });
  }, []);
  const [askOpen, setAskOpen] = useState(false);
  const [askText, setAskText] = useState('');
  const [askBusy, setAskBusy] = useState(false);
  const [askAnswer, setAskAnswer] = useState<{ q: string; a: string } | null>(null);
  /* LEARNING HER VOICE. Something heard that matched nothing offers the
     commands that make sense right now; the one she taps is remembered for
     that phrase. Two misses in a row and the coach says what it listens for. */
  const [unknown, setUnknown] = useState<string | null>(null);
  const misses = useRef(0);
  const [learnedCount, setLearnedCount] = useState(() => Object.keys(loadVoiceMemory()).length);
  /* The voice check: three words, once. */
  const [check, setCheck] = useState<{ index: number; results: Array<'ok' | 'learned' | 'skipped'> } | null>(null);
  const coach = useRef<Coach | null>(null);
  const lastLine = useRef<{ text: string; listen?: Command[] }>({ text: '' });

  if (!coach.current && typeof window !== 'undefined') coach.current = new Coach();
  useEffect(() => {
    const c = coach.current!;
    c.onState = setVoiceState;
    c.onHeard = text => setHeard(text);
    c.onUnknown = text => {
      setUnknown(text); misses.current += 1;
      if (misses.current === 2) { const hint = lastLine.current.listen?.includes('easy') ? 'Say too easy, just right, or too hard. Or tap one.' : lastLine.current.listen?.includes('more') ? 'Say ready when you want to go, or more rest.' : 'Say done when you finish the set. Or tap the button.'; c.say(hint, lastLine.current.listen); }
    };
    const html = document.documentElement; const before = html.style.overflow; html.style.overflow = 'hidden';
    return () => { c.stop(); html.style.overflow = before; };
  }, []);
  useEffect(() => { if (coach.current) coach.current.muted = !voiceOn; }, [voiceOn]);
  useEffect(() => { coach.current?.setHandsFree(handsFree && (phase === 'card' || phase === 'feel' || phase === 'rest' || phase === 'preview' || Boolean(check))); }, [handsFree, phase, check]);

  /* Opens the cloud ears from a tap (iOS needs one), once per workout. */
  const openEars = () => { const c = coach.current; if (!c || !handsFree || !cloudVoice() || c.mode === 'cloud') return; void c.useCloud(blob => transcribe(blob, c.hints())); };
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
  const CARD_CMDS: Command[] = ['ask', 'done', 'ready', 'start', 'how', 'easier', 'harder', 'heavier', 'lighter', 'repeat', 'skip', 'pause', 'resume', 'end'];
  const speakCard = (index: number, setNo: number, w: number | null, plan = workout) => {
    const s = plan?.steps[index]; if (!s) return;
    say(cardLine(s, setNo, w), CARD_CMDS);
  };

  /* ---- The Forge coach, asked from inside the workout ---- */
  /* THE WORKOUT IN PROGRESS, where the Ask Forge coach can read it. */
  useEffect(() => {
    if (!workout || !step || !['card', 'feel', 'rest'].includes(phase)) return;
    if (coach.current) coach.current.context = step.move.name;
    const fmtW = (w: number | null) => w === null ? null : `${w} ${unit}`;
    writeLive({ focus: workout.focus, minutes: workout.minutes, phase, move: step.move.name, set: setIndex + 1, sets: step.sets, amount: amountText(step), weight: fmtW(weight), cue: step.move.cue,
      moves: workout.steps.map((item, i) => ({ name: item.move.name, sets: item.sets, amount: amountText(item), weight: fmtW(weights[i] !== undefined ? weights[i] : item.weight) })),
      feelSoFar: logged.filter(item => item.feel).map(item => ({ move: item.name, weight: fmtW(item.weight), feel: item.feel as string })), updatedAt: new Date().toISOString() });
  }, [phase, stepIndex, setIndex, weight, workout, logged.length]); // eslint-disable-line react-hooks/exhaustive-deps

  /* A quick answer when the coach cannot be reached (offline, preview). Pain
     always gets the safe answer first, whatever the server says after. */
  const localAnswer = (question: string) => {
    const q = question.toLowerCase();
    if (/\b(hurt|hurts|pain|painful|sharp|injur)/.test(q)) return 'Stop this move now. Pain is not part of it. Say skip and we will move on, and tell me in Ask Forge later where it hurt.';
    if (step && /\bhow\b|form|do (this|it)|technique/.test(q)) return `${step.move.steps.join(' ')} You should feel it in ${step.move.feel.replace(/\.$/, '').toLowerCase()}.`;
    if (/\bwhy\b.*\b(weight|pound|kilo|heavy|light)|\b(weight|pounds)\b.*\bwhy\b/.test(q)) return 'Weights start light on purpose. Tell me how each set felt and I move the next one up or down.';
    if (step && /\bwhat(\'s| is) next\b|\bnext\b/.test(q)) { const next = workout?.steps[stepIndex + 1]; return next ? `After this, ${next.move.name}, ${amountText(next)}.` : 'This is the last move. You are almost done.'; }
    return "I can't reach the full coach right now, but you're doing great. Keep going, and ask me again after the workout.";
  };
  const askCoach = async (question: string) => {
    const q = question.trim(); if (!q) return;
    setAskOpen(true); setAskBusy(true); setAskAnswer({ q, a: '' }); setAskText('');
    const safety = /\b(hurt|hurts|pain|painful|sharp|injur)/i.test(q);
    if (safety) say(localAnswer(q));
    const recentGuided = records.filter(record => /^Guided/.test(record.title)).slice(0, 5).map(record => ({ date: record.date, title: record.title, notes: record.notes }));
    const response = await requestForgeCoach({ question: q, scope: 'today', context: {
      surface: 'forge-guided-voice',
      replyStyle: 'The athlete is mid-workout with headphones in and will HEAR this. Answer in one or two short spoken sentences, plain words, no lists. Do not rebuild or change the workout; if they want a change, tell them to say easier, harder, heavier, lighter or skip.',
      guided: guidedCoachContext(), recentGuidedWorkouts: recentGuided,
    } }, localAnswer(q));
    const answer = response.source === 'ai' || response.source === 'limit' ? response.answer : localAnswer(q);
    setAskBusy(false); setAskAnswer({ q, a: answer });
    const resume: Command[] = phase === 'feel' ? ['ask', 'easy', 'right', 'hard', 'repeat', 'end'] : phase === 'rest' ? ['ask', 'ready', 'more', 'skip', 'repeat', 'pause', 'resume', 'end'] : CARD_CMDS;
    if (!safety) say(answer, resume); else lastLine.current = { text: answer, listen: resume };
  };
  const askSheet = askOpen ? <div className="gd-sheet-back" onClick={event => { if (event.target === event.currentTarget) setAskOpen(false); }}>
    <section className="gd-sheet" role="dialog" aria-modal="true" aria-labelledby="gd-ask-title">
      <h2 id="gd-ask-title">Ask your coach</h2>
      {askAnswer && <div className="gd-ask-turn"><p className="gd-ask-q">{askAnswer.q}</p><p className="gd-ask-a">{askBusy ? 'Thinking…' : askAnswer.a}</p></div>}
      {!askAnswer && <p className="gd-lead">{handsFree && voiceInput() ? 'Just talk. Or type below.' : 'Type a question. Why this weight, how to do the move, what is next.'}</p>}
      <form className="gd-ask-form" onSubmit={event => { event.preventDefault(); void askCoach(askText); }}>
        <input className="gd-ask-input" value={askText} onChange={event => setAskText(event.target.value)} placeholder="e.g. Why is it 15 pounds?" aria-label="Your question" />
        <button type="submit" className="gd-ask-send" disabled={!askText.trim() || askBusy} aria-label="Ask"><Svg d="M5 12h14M13 6l6 6-6 6" size={20} stroke={2.4} /></button>
      </form>
      <button type="button" className="gd-secondary" onClick={() => { setAskOpen(false); if (coach.current) coach.current.freeText = false; }}>Back to workout</button>
    </section>
  </div> : null;

  const LABELS: Partial<Record<Command, string>> = { done: 'Done', ready: 'Ready', easy: 'Too easy', right: 'Just right', hard: 'Too hard', more: 'More rest', how: 'How do I do this?', skip: 'Skip', repeat: 'Repeat' };
  const meanOptions: Command[] = phase === 'feel' ? ['easy', 'right', 'hard'] : phase === 'rest' ? ['ready', 'more'] : step?.move.timed && !running ? ['ready', 'how', 'skip'] : ['done', 'how', 'skip'];
  const didYouMean = unknown && handsFree ? <div className="gd-mean">
    <p>Heard “{unknown}”. Did you mean:</p>
    <div>{meanOptions.map(command => <button type="button" key={command} onClick={() => { teachPhrase(unknown, command); coach.current?.reloadMemory(); setLearnedCount(Object.keys(loadVoiceMemory()).length); const said = unknown; setUnknown(null); commandRef.current(command, said); }}>{LABELS[command]}</button>)}</div>
    <small>Your choice is remembered for next time.</small>
  </div> : null;

  const CHECK_WORDS: Array<[Command, string]> = [['done', 'Done'], ['ready', 'Ready'], ['easy', 'Too easy']];
  const runCheck = (index: number, results: Array<'ok' | 'learned' | 'skipped'> = []) => {
    const c = coach.current; if (!c) return;
    if (index >= CHECK_WORDS.length) {
      setCheck({ index, results }); setLearnedCount(Object.keys(loadVoiceMemory()).length);
      c.say('Got it. Your coach knows your voice now.');
      return;
    }
    setCheck({ index, results });
    const [command, label] = CHECK_WORDS[index];
    let answered = false;
    const timeout = window.setTimeout(() => { if (answered) return; answered = true; c.capture = null; runCheck(index + 1, [...results, 'skipped']); }, 9000);
    c.capture = heardList => {
      if (answered) return; answered = true; window.clearTimeout(timeout);
      const hit = heardList.some(text => matchCommand(text, [command], c.memory));
      if (!hit) { teachPhrase(heardList[0], command); c.reloadMemory(); }
      window.setTimeout(() => runCheck(index + 1, [...results, hit ? 'ok' : 'learned']), 400);
    };
    c.say(index === 0 ? `Quick voice check. Say: ${label}.` : `Now say: ${label}.`, [command]);
  };
  const checkView = check ? <div className="gd-check-list">
    {CHECK_WORDS.map(([, label], i) => <div key={label} className={i === check.index ? 'now' : i < check.index ? 'past' : ''}>
      <span>“{label}”</span>
      <b>{i < check.index ? (check.results[i] === 'ok' ? 'Heard it' : check.results[i] === 'learned' ? 'Learned' : 'Skipped') : i === check.index ? 'Say it now' : ''}</b>
    </div>)}
  </div> : null;

  const micSheet = micAsk ? <div className="gd-sheet-back" onClick={event => { if (event.target === event.currentTarget) setMicAsk(false); }}>
      <section className="gd-sheet" role="dialog" aria-modal="true" aria-labelledby="gd-mic-title">
        <span className="gd-mic-ic"><Svg d={MIC} size={30} stroke={2.2} /></span>
        <h2 id="gd-mic-title">{check ? (check.index >= CHECK_WORDS.length ? 'Your coach knows your voice' : 'Quick voice check') : mic === 'denied' ? 'Your microphone is off' : 'Let your coach hear you'}</h2>
        {check ? <>
          <p className="gd-lead">{check.index >= CHECK_WORDS.length ? 'It keeps learning as you go. If it ever mishears you, tap what you meant and it remembers.' : 'Say each word the way you would mid-workout. Forge learns how your phone hears you.'}</p>
          {checkView}
          {check.index >= CHECK_WORDS.length
            ? <button type="button" className="gd-cta" onClick={() => { setCheck(null); setMicAsk(false); if (workout && phase === 'preview') start(); }}>{phase === 'preview' ? 'Start workout' : 'Done'}</button>
            : <button type="button" className="gd-secondary" onClick={() => { if (coach.current) coach.current.capture = null; setCheck(null); setMicAsk(false); if (phase === 'preview') start(); }}>Skip the check</button>}
        </> : mic === 'denied'
          ? <p className="gd-lead">Your phone is blocking the microphone for Forge. To turn it on, go to Settings, then Safari, then Microphone, and choose Allow. You can still do the workout by tapping.</p>
          : <>
              <p className="gd-lead">Say “done”, “too easy” or “ready” instead of tapping. Your phone will ask to use the microphone next.</p>
              <ul className="gd-mic-list">
                <li><Svg d="M5 12.5 10 17l9-10" size={16} stroke={2.6} />Only listens during a workout</li>
                <li><Svg d="M5 12.5 10 17l9-10" size={16} stroke={2.6} />Only acts on a few workout words</li>
                <li><Svg d="M5 12.5 10 17l9-10" size={16} stroke={2.6} />Clips are turned into words, never saved</li>
              </ul>
            </>}
        {!check && mic !== 'denied' && <button type="button" className="gd-cta" disabled={micBusy} onClick={async () => {
          setMicBusy(true);
          const status = await requestMic();
          setMicBusy(false); setMic(status); write(MIC_KEY, status);
          if (status === 'granted') { openEars(); runCheck(0); }
        }}>{micBusy ? 'Waiting for your phone…' : 'Allow microphone'}</button>}
        {!check && <button type="button" className="gd-secondary" onClick={() => { setHandsFree(false); setMicAsk(false); start(); }}>{mic === 'denied' ? 'Start, I’ll tap' : 'Not now, I’ll tap'}</button>}
      </section>
    </div> : null;

  /* ---- Flow ---- */
  const build = (chosenFocus = focus, chosenMinutes = minutes) => {
    if (!prefs) return;
    if (!isPro && freeLeft <= 0) { setPhase('locked'); return; }
    const today = { ...prefs, styles: [todayStyle, ...prefs.styles.filter(item => item !== todayStyle)] };
    const plan = buildWorkout(today, chosenMinutes, chosenFocus, { seed: Date.now() % 100000, recent: last.moves || [], remembered: read<Record<string, number>>(WEIGHTS_KEY, {}), metric });
    setWorkout(plan); setPhase('preview');
  };
  const start = () => {
    if (!workout) return;
    openEars();
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
    say('How did that feel? Too easy, just right, or too hard?', ['ask', 'easy', 'right', 'hard', 'repeat', 'end']);
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
    say(`${cheer(logged.length)}${why} Rest ${restFor >= 60 ? `${Math.floor(restFor / 60)} minute${restFor >= 120 ? 's' : ''}${restFor % 60 ? ` ${restFor % 60} seconds` : ''}` : `${restFor} seconds`}. Up next, ${upNext.move.name}. Say ready when you are.`, ['ask', 'ready', 'more', 'skip', 'repeat', 'pause', 'resume', 'end']);
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
    writeLive(null);
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
  const commandRef = useRef<(command: Command, heard: string) => void>(() => {});
  commandRef.current = (command: Command, heardText: string) => {
    misses.current = 0; setUnknown(null);
    if (command === 'ask') { const question = heardText.replace(/^\s*(hey |ok |okay )?coach[,:]?\s*/i, '').replace(/^\s*ask (the )?coach\s*/i, '').replace(/^\s*question[,:]?\s*/i, '').trim(); if (question.split(/\s+/).length >= 2) void askCoach(question); else { setAskOpen(true); coach.current!.freeText = true; say('Yes? Ask me anything.', ['end']); } return; }
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
  useEffect(() => { coach.current?.on((command, heardText) => commandRef.current(command, heardText)); }, []);

  const close = () => { writeLive(null); coach.current?.stop(); navigate('/'); };

  /* ---------- Screens ---------- */
  const frame = (content: ReactNode, tone = '') => createPortal(<div className={`guided ${tone}`} role="dialog" aria-modal="true" aria-label="Forge Guided">{content}</div>, document.body);
  const top = (onBack?: () => void, right?: ReactNode) => <div className="gd-top">
    {onBack ? <button type="button" className="gd-round" aria-label="Back" onClick={onBack}><Svg d="M15 5l-7 7 7 7" size={20} stroke={2.4} /></button> : <button type="button" className="gd-round" aria-label="Close" onClick={close}><Svg d="M6 6l12 12M18 6L6 18" size={18} stroke={2.4} /></button>}
    <span className="gd-top-fill" />
    {right}
  </div>;
  const voiceToggles = <div className="gd-voice-row">
    <button type="button" className={voiceOn ? 'gd-pill on' : 'gd-pill'} aria-pressed={voiceOn} onClick={() => setVoiceOn(v => !v)}><Svg d="M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" size={16} />Coach voice</button>
    {voiceInput() && <button type="button" className={handsFree ? 'gd-pill on' : 'gd-pill'} aria-pressed={handsFree} onClick={() => setHandsFree(v => !v)}><Svg d={MIC} size={16} />Hands-free</button>}
  </div>;

  if (phase === 'setup') {
    const toggle = (key: 'styles' | 'vibe' | 'gear', value: string) => setDraft(d => ({ ...d, [key]: (d[key] as string[]).includes(value) ? (d[key] as string[]).filter(x => x !== value) : [...(d[key] as string[]), value] }));
    const next = () => { if (setupStep < 2 && !editOne) setSetupStep(s => s + 1); else { setEditOne(false); write(PREFS_KEY, draft); setPrefs(draft); setTodayStyle(draft.styles[0] || 'Strength'); setFocus(suggestFocus(last.focus, draft)); setPhase('today'); } };
    const ready = setupStep !== 0 || draft.styles.length > 0;
    return frame(<div className="gd-screen">
      {top(editOne ? () => { setEditOne(false); setPhase('today'); } : setupStep ? () => setSetupStep(s => s - 1) : prefs ? () => setPhase('today') : undefined, editOne ? undefined : <span className="gd-count">{setupStep + 1}/3</span>)}
      {!editOne && <div className="gd-bar"><i style={{ width: `${((setupStep + 1) / 3) * 100}%` }} /></div>}
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
      <button type="button" className="gd-cta" disabled={!ready} onClick={next}>{editOne ? 'Save' : setupStep < 2 ? 'Continue' : 'Done'}</button>
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
    {top()}
    <h1>Ready when you are.</h1>
    <h2>What kind of workout?</h2>
    <div className="gd-chips">{STYLES.map(([label]) => <button type="button" key={label} className={todayStyle === label ? 'gd-chip on' : 'gd-chip'} aria-pressed={todayStyle === label} onClick={() => { setTodayStyle(label); if (label === 'Stretch & mobility') setFocus('Stretch it out'); else if (focus === 'Stretch it out') setFocus(suggestFocus(last.focus, prefs)); }}>{label}</button>)}</div>
    <h2>How much time do you have?</h2>
    <div className="gd-times">{[20, 30, 45, 60].map(m => <button type="button" key={m} className={minutes === m ? 'gd-time on' : 'gd-time'} aria-pressed={minutes === m} onClick={() => setMinutes(m)}>{m} min</button>)}</div>
    <div className="gd-card">
      <span className="gd-eyebrow">YOUR COACH PICKED</span>
      <strong className="gd-focus">{focus} · {minutes} min</strong>
      {last.focus && <p className="gd-muted">Last time was {last.focus.toLowerCase()}, so today is {focus.toLowerCase()}.</p>}
      <span className="gd-small">Rather do something else?</span>
      <div className="gd-chips">{FOCUSES.map(item => <button type="button" key={item} className={focus === item ? 'gd-chip on' : 'gd-chip'} aria-pressed={focus === item} onClick={() => setFocus(item)}>{item}</button>)}</div>
    </div>
    {/* HER SETUP, ALWAYS IN VIEW. It used to be asked once and then hidden
        behind a small link; now it is a card she can change any time. */}
    <div className="gd-setup">
      <div className="gd-setup-row"><span>Where</span><b>{prefs.place === 'Home' ? `Home${prefs.gear.length ? ` · ${prefs.gear.join(', ').toLowerCase()}` : ' · no equipment'}` : prefs.place === 'Gym' ? 'Gym' : 'Anywhere · no equipment'}</b><button type="button" className="gd-link" onClick={() => { setDraft(prefs); setEditOne(true); setSetupStep(1); setPhase('setup'); }}>Change</button></div>
      <div className="gd-setup-row"><span>Level</span><b>{prefs.level}</b><button type="button" className="gd-link" onClick={() => { setDraft(prefs); setEditOne(true); setSetupStep(2); setPhase('setup'); }}>Change</button></div>
      <div className="gd-setup-row"><span>Likes</span><b>{[...prefs.styles, ...prefs.vibe].join(', ') || 'Not set'}</b><button type="button" className="gd-link" onClick={() => { setDraft(prefs); setEditOne(true); setSetupStep(0); setPhase('setup'); }}>Change</button></div>
    </div>
    {voiceToggles}
    {handsFree && voiceInput() && <p className="gd-muted gd-voice-learn">
      <button type="button" className="gd-link" onClick={() => { setMicAsk(true); if (mic === 'granted') { openEars(); runCheck(0); } }}>Voice check</button>
      {learnedCount > 0 && <> · Knows {learnedCount} way{learnedCount === 1 ? '' : 's'} you say things · <button type="button" className="gd-link" onClick={() => { forgetVoice(); coach.current?.reloadMemory(); setLearnedCount(0); }}>Reset</button></>}
    </p>}
    {micSheet}
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
    <button type="button" className="gd-cta" onClick={() => { if (handsFree && voiceInput() && mic !== 'granted') setMicAsk(true); else start(); }}><Svg d="M7 4v16l13-8z" size={18} />Start</button>
    {micSheet}
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
  const listenBadge = handsFree && voiceInput() ? <span className={voiceState.listening ? 'gd-listen on' : 'gd-listen'}><Svg d={MIC} size={14} stroke={2.4} />{voiceState.speaking ? 'Coach talking' : voiceState.listening ? 'Listening' : 'Mic'}</span> : null;

  if (phase === 'rest') {
    const total = Math.max(1, step.rest);
    const upNext = setIndex + 1 < step.sets ? step : workout.steps[stepIndex + 1];
    return frame(<div className="gd-screen gd-restscreen">
      {top(undefined, listenBadge)}
      <div className="gd-ring">
        <svg viewBox="0 0 260 260" aria-hidden="true"><circle cx="130" cy="130" r="110" className="track" /><circle cx="130" cy="130" r="110" className="fill" strokeDasharray="691" strokeDashoffset={691 * (1 - Math.max(0, timer) / total)} /></svg>
        <div><strong role="timer">{clock(Math.max(0, timer))}</strong><span>{paused ? 'Paused' : 'Rest. Breathe.'}</span></div>
      </div>
      {upNext && <div className="gd-next"><span>UP NEXT</span><strong>{upNext.move.name}{upNext === step ? ` · set ${setIndex + 2} of ${step.sets}` : ''}</strong><small>{amountText(upNext)}{(upNext === step ? weight : upNext.weight) !== null ? ` · ${upNext === step ? weight : upNext.weight} ${unit}` : ''}</small></div>}
      {didYouMean || (heard && handsFree && <p className="gd-heard">Heard: “{heard}”</p>)}
      <button type="button" className="gd-ask-pill" onClick={() => setAskOpen(true)}><Svg d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" size={16} />Ask coach</button>
      {askSheet}
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
    {askSheet}
    {didYouMean || (heard && handsFree && <p className="gd-heard">Heard: “{heard}”</p>)}
  </div>);

  /* The flashcard */
  const timed = Boolean(step.move.timed);
  const easier = swapFor(step, 'easier', have);
  const harder = swapFor(step, 'harder', have);
  return frame(<div className="gd-screen gd-cardscreen">
    {top(undefined, <>{listenBadge}<button type="button" className="gd-link" onClick={() => setAskOpen(true)}>Ask coach</button><button type="button" className="gd-link" onClick={finish}>End</button></>)}
    {askSheet}
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
    {didYouMean || (heard && handsFree && <p className="gd-heard">Heard: “{heard}”</p>)}
    {timed && !running
      ? <button type="button" className="gd-cta" onClick={startTimed}>Start {step.reps} sec</button>
      : <button type="button" className="gd-cta" onClick={setDone}>{timed ? 'Done early' : 'Done'}</button>}
  </div>);
}
