import '../coach-today.css';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type GuidedPrefs, type Focus } from '../lib/guided/builder';
import { pickFocus, type PickInput } from '../lib/guided/pickFocus';
import { GUIDED_KEYS } from '../lib/guided/session';

/* TODAY, COACH ME. The same Today screen with the coach in charge: what the
   coach picked for today, how long she has, and one button. Setting it up the
   first time is three taps inside Guided. */

const read = <T,>(key: string, fallback: T): T => { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; } };

export type CoachPlan = { title: string; count: number; start: () => void };

/* What Today knows that the pick needs: the logged workouts, what the body
   log keeps off-limits, what the goals train, and whether the plan rests. */
export type CoachContext = Omit<PickInput, 'prefs' | 'lastFocus'> & { rest: boolean; easeLifting?: boolean };

export function CoachToday({ plan, context }: { plan?: CoachPlan; context?: CoachContext } = {}) {
  const navigate = useNavigate();
  /* TODAY'S PLAN, GUIDED, comes first: the day Forge wrote, top sets and
     accessories, walked through with photos and the coach's voice. The
     coach-picked workout is still one tap away for a day off the split. */
  const [ownPick, setOwnPick] = useState(false);
  const prefs = read<GuidedPrefs | null>(GUIDED_KEYS.prefs, null);
  const last = read<{ focus?: Focus }>(GUIDED_KEYS.last, {});
  const [minutes, setMinutes] = useState(30);
  const [trainAnyway, setTrainAnyway] = useState(false);
  /* A Guided workout left part-way (GuidedPage keeps it for 24 hours). */
  const paused = read<{ savedAt?: number; workout?: { focus?: string }; logged?: unknown[] } | null>('forge-guided-resume-v1', null);
  if (paused?.savedAt && Date.now() - paused.savedAt < 24 * 3600 * 1000) return <section className="td-card ct-card">
    <span className="ct-eyebrow">WORKOUT IN PROGRESS</span>
    <h3 className="td-title">{paused.workout?.focus || 'Your workout'}</h3>
    <p className="ct-lead">{(paused.logged?.length || 0)} sets done. Pick up right where you stopped.</p>
    <button type="button" className="button wide" onClick={() => navigate('/guided')}>Resume workout</button>
  </section>;
  if (plan && !ownPick) return <section className="td-card ct-card">
    <span className="ct-eyebrow">TODAY, GUIDED</span>
    <h3 className="td-title">{plan.title}</h3>
    <p className="ct-lead">Your full workout for today, {plan.count} {plan.count === 1 ? 'exercise' : 'exercises'}. Videos for every move, and your coach talks you through each set and logs it for you.</p>
    <button type="button" className="button wide" onClick={plan.start}>Start guided workout</button>
    <button type="button" className="ct-more" onClick={() => setOwnPick(true)}>Let the coach pick a different workout</button>
  </section>;
  if (!prefs) return <section className="td-card ct-card">
    <span className="ct-eyebrow">YOUR COACH</span>
    <h3 className="td-title">Let the coach run your workout</h3>
    <p className="ct-lead">Tell it what you like and what you have. It builds every workout and talks you through each set, out loud.</p>
    <ul className="ct-points"><li>No logging, no planning</li><li>Photos and cues for every move</li><li>Weights that learn from you</li></ul>
    <button type="button" className="button wide" onClick={() => navigate('/guided')}>Set up my coach · 3 taps</button>
  </section>;
  /* REST DAY: the plan rests, so the coach says so. A light stretch is the
     offer; training anyway is one more tap. */
  if (context?.rest && !trainAnyway) return <section className="td-card ct-card">
    <span className="ct-eyebrow">REST DAY</span>
    <h3 className="td-title">Rest today</h3>
    <p className="ct-lead">Your plan has you resting. Recovery is when the training turns into strength.</p>
    <button type="button" className="button wide" onClick={() => navigate(`/guided?go=1&min=20&focus=${encodeURIComponent('Stretch it out')}`)}>Light stretch · 20 min</button>
    <button type="button" className="ct-more" onClick={() => setTrainAnyway(true)}>Train anyway</button>
  </section>;
  const picked = context
    ? (context.easeLifting ? { focus: 'Stretch it out' as Focus, why: 'Your body log has the lifting eased right now, so today is a stretch.' } : pickFocus({ ...context, prefs, lastFocus: last.focus }))
    : pickFocus({ records: [], todayIso: new Date().toISOString().slice(0, 10), prefs, lastFocus: last.focus });
  const focus = picked.focus;
  const style = focus === 'Stretch it out' ? 'Stretch & mobility' : prefs.styles[0] || 'Strength';
  return <section className="td-card ct-card">
    <span className="ct-eyebrow">YOUR COACH PICKED</span>
    <h3 className="td-title">{focus}</h3>
    <p className="ct-why">{picked.why}</p>
    <p className="ct-lead">{style}{prefs.place === 'Gym' ? ' at the gym' : prefs.place === 'Home' ? ' at home' : ', no equipment'}. Your coach talks you through every set.</p>
    <div className="ct-times" role="radiogroup" aria-label="How long">{[20, 30, 45, 60].map(m => <button type="button" role="radio" aria-checked={minutes === m} key={m} className={minutes === m ? 'on' : ''} onClick={() => setMinutes(m)}>{m} min</button>)}</div>
    <button type="button" className="button wide" onClick={() => navigate(`/guided?go=1&min=${minutes}&focus=${encodeURIComponent(focus)}`)}>Start with my coach</button>
    <button type="button" className="ct-more" onClick={() => navigate('/guided')}>Change the workout type</button>
  </section>;
}

/* The My plan | Coach me switch at the top of Today. Remembered per device. */
export const TODAY_MODE_KEY = 'forge-today-mode';
export function TodayModeSwitch({ mode, onChange }: { mode: 'plan' | 'coach'; onChange: (mode: 'plan' | 'coach') => void }) {
  return <div className="ct-switch" role="tablist" aria-label="How to train today">
    {(['plan', 'coach'] as const).map(item => <button type="button" role="tab" aria-selected={mode === item} key={item} className={mode === item ? 'on' : ''} onClick={() => onChange(item)}>{item === 'plan' ? 'My plan' : 'Coach me'}</button>)}
  </div>;
}
