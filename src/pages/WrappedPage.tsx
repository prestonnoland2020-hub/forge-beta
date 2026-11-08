import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useBilling } from '../features/billing/BillingProvider';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { buildWrapped, wrappedWindow, type Wrapped } from '../lib/wrapped';
import { Icon } from '../components/Icon';

/* FORGE WRAPPED — the year as a story. Full screen, one slide at a time,
   tap right for next and left for back, hold to pause. Pro only: a free
   athlete sees their headline number and what unlocking shows them.

   Every slide is mounted fresh when it opens, so its animations play from the
   start each time it is reached. */

const SLIDE_MS = 6500;
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (value: number, places = 0) => value.toLocaleString(undefined, { maximumFractionDigits: places, minimumFractionDigits: places });
const shortDate = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };

function useCountUp(target: number, delay = 250, duration = 1600) {
  const [value, setValue] = useState(() => (reduced() ? target : 0));
  useEffect(() => {
    if (reduced()) { setValue(target); return; }
    let frame = 0; let start = 0;
    const timer = window.setTimeout(() => {
      const step = (now: number) => {
        if (!start) start = now;
        const t = Math.min(1, (now - start) / duration);
        setValue(target * (1 - Math.pow(1 - t, 3)));
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }, delay);
    return () => { window.clearTimeout(timer); cancelAnimationFrame(frame); };
  }, [target, delay, duration]);
  return value;
}

function Count({ to, places = 0, delay }: { to: number; places?: number; delay?: number }) {
  const value = useCountUp(to, delay);
  return <>{fmt(value, places)}</>;
}

type Slide = { key: string; tone: string; body: ReactNode };

/* ---------- Slides ---------- */

function Intro({ year, name }: { year: number; name: string }) {
  return <div className="wr-center">
    <svg className="wr-rings" viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="90" /><circle cx="100" cy="100" r="70" /><circle cx="100" cy="100" r="50" />
    </svg>
    <p className="wr-kicker wr-in" style={{ animationDelay: '.1s' }}>{name ? `${name}, this was` : 'This was'}</p>
    <h1 className="wr-year" aria-label={String(year)}>{String(year).split('').map((digit, index) => <span key={index} style={{ animationDelay: `${0.3 + index * 0.12}s` }}>{digit}</span>)}</h1>
    <p className="wr-sub wr-in" style={{ animationDelay: '1s' }}>Your year in Forge</p>
    <p className="wr-hint wr-in" style={{ animationDelay: '1.8s' }}>Tap to continue</p>
  </div>;
}

function Days({ w }: { w: Wrapped }) {
  /* The year as a grid: one column per week, Monday at the top. */
  const jan1 = (new Date(w.year, 0, 1).getDay() + 6) % 7;
  const cells = [...new Array(jan1).fill(-1), ...w.calendar];
  const columns = Math.ceil(cells.length / 7);
  return <div className="wr-stack">
    <p className="wr-kicker wr-in">You showed up</p>
    <h2 className="wr-huge"><Count to={w.trainingDays} /></h2>
    <p className="wr-lead wr-in" style={{ animationDelay: '.6s' }}>days this year</p>
    <div className="wr-heat" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }} aria-hidden="true">
      {cells.map((cell, index) => <i key={index} className={cell < 0 ? 'pad' : `c${cell}`} style={{ animationDelay: `${0.8 + Math.floor(index / 7) * 0.025}s` }} />)}
    </div>
    <p className="wr-legend wr-in" style={{ animationDelay: '2.4s' }}><span className="c1" />Lifted<span className="c2" />Ran<span className="c3" />Both</p>
  </div>;
}

function Tonnage({ w, unit }: { w: Wrapped; unit: string }) {
  const blocks = Math.min(w.tonnageCompare?.count || 0, 24);
  return <div className="wr-stack">
    <p className="wr-kicker wr-in">Across {fmt(w.topSets)} top sets you moved</p>
    <h2 className="wr-big"><Count to={w.tonnage} /><small> {unit}</small></h2>
    {w.tonnageCompare && <>
      <div className="wr-blocks" aria-hidden="true">{Array.from({ length: blocks }, (_, index) => <i key={index} style={{ animationDelay: `${1.2 + index * 0.08}s` }} />)}</div>
      <p className="wr-lead wr-in" style={{ animationDelay: `${1.6 + blocks * 0.08}s` }}>That’s about <b>{fmt(w.tonnageCompare.count)} {w.tonnageCompare.thing}</b>.</p>
    </>}
    <p className="wr-foot wr-in" style={{ animationDelay: '3s' }}>Top sets only. Your warm-ups and back-off sets are extra.</p>
  </div>;
}

function Strongest({ w, unit }: { w: Wrapped; unit: string }) {
  const lift = w.mostImproved || w.strongest!;
  const improved = Boolean(w.mostImproved);
  const startPct = Math.max(12, Math.round((lift.start / lift.best) * 100));
  return <div className="wr-stack">
    <p className="wr-kicker wr-in">{improved ? 'Your biggest jump' : 'Your strongest lift'}</p>
    <h2 className="wr-name wr-in" style={{ animationDelay: '.25s' }}>{lift.name}</h2>
    <div className="wr-bars">
      <div className="wr-bar-row"><span>First {w.year} set</span><div><i className="from" style={{ ['--w' as string]: `${startPct}%` }} /></div><b>{fmt(lift.start)}</b></div>
      <div className="wr-bar-row"><span>Best · {shortDate(lift.bestDate)}</span><div><i className="to" style={{ ['--w' as string]: '100%' }} /></div><b><Count to={lift.best} delay={900} /></b></div>
    </div>
    {lift.gain > 0 && <p className="wr-gain wr-pop" style={{ animationDelay: '2.2s' }}>+{fmt(lift.gain)} {unit}</p>}
    <p className="wr-lead wr-in" style={{ animationDelay: '2.6s' }}>Estimated max{improved && w.strongest && w.strongest.name !== lift.name ? <>. Your strongest overall: <b>{w.strongest.name}, {fmt(w.strongest.best)} {unit}</b></> : ''}.</p>
  </div>;
}

const CONFETTI = ['#4d7cff', '#8b5cf6', '#ffffff', '#38bdf8', '#c4b5fd'];
function Prs({ w, unit }: { w: Wrapped; unit: string }) {
  const pieces = useMemo(() => Array.from({ length: 50 }, (_, index) => ({ left: Math.random() * 100, delay: 0.4 + Math.random() * 0.8, duration: 2.4 + Math.random() * 1.6, drift: (Math.random() - 0.5) * 140, color: CONFETTI[index % CONFETTI.length] })), []);
  return <div className="wr-stack">
    {!reduced() && <div className="wr-confetti" aria-hidden="true">{pieces.map((piece, index) => <i key={index} style={{ left: `${piece.left}%`, background: piece.color, animationDelay: `${piece.delay}s`, animationDuration: `${piece.duration}s`, ['--drift' as string]: `${piece.drift}px` }} />)}</div>}
    <p className="wr-kicker wr-in">You set</p>
    <h2 className="wr-huge"><Count to={w.prCount} /></h2>
    <p className="wr-lead wr-in" style={{ animationDelay: '.6s' }}>personal record{w.prCount === 1 ? '' : 's'}</p>
    <ul className="wr-list">
      {w.prs.map((pr, index) => <li key={pr.lift} className="wr-slide-in" style={{ animationDelay: `${1.2 + index * 0.35}s` }}><Icon name="trophy" size={20} /><span>{pr.lift}<small>{shortDate(pr.date)}</small></span><b>{fmt(pr.max)} {unit}</b></li>)}
    </ul>
  </div>;
}

function Running({ w, metric }: { w: Wrapped; metric: boolean }) {
  const k = metric ? 1.609344 : 1;
  const unit = metric ? 'km' : 'miles';
  /* Miles adding up through the year, drawn as one line. */
  let sum = 0;
  /* A year still under way stops at this month rather than running flat. */
  const now = new Date();
  const months = w.year === now.getFullYear() ? now.getMonth() + 1 : 12;
  const cumulative = w.milesByMonth.slice(0, months).map(miles => (sum += miles));
  const top = Math.max(1, sum);
  const points = cumulative.map((value, index) => `${(index / Math.max(1, months - 1)) * 300},${110 - (value / top) * 100}`).join(' ');
  return <div className="wr-stack">
    <p className="wr-kicker wr-in">You ran</p>
    <h2 className="wr-big"><Count to={w.runMiles * k} places={0} /><small> {unit}</small></h2>
    <p className="wr-lead wr-in" style={{ animationDelay: '.6s' }}>over {fmt(w.runs)} run{w.runs === 1 ? '' : 's'}</p>
    <svg className="wr-line" viewBox="0 0 300 120" preserveAspectRatio="none" aria-hidden="true">
      <polygon className="fill" points={`0,110 ${points} ${cumulative.length > 1 ? 300 : 0},110`} />
      <polyline points={points} pathLength={1} />
    </svg>
    <div className="wr-axis" aria-hidden="true"><span>Jan</span><span>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][months - 1]}</span></div>
    {w.longestRun && <p className="wr-lead wr-in" style={{ animationDelay: '2.6s' }}>Longest run: <b>{fmt(w.longestRun.miles * k, 1)} {metric ? 'km' : 'mi'}</b> on {shortDate(w.longestRun.date)}</p>}
  </div>;
}

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
function Rhythm({ w }: { w: Wrapped }) {
  const top = Math.max(...w.weekdays, 1);
  const favorite = w.weekdays.indexOf(top);
  return <div className="wr-stack">
    <p className="wr-kicker wr-in">Your day was</p>
    <h2 className="wr-name wr-in" style={{ animationDelay: '.25s' }}>{w.favoriteDay}</h2>
    <div className="wr-week" aria-hidden="true">
      {w.weekdays.map((count, index) => <div key={index} className={index === favorite ? 'fav' : ''}>
        <i style={{ ['--h' as string]: `${Math.max(6, (count / top) * 100)}%`, animationDelay: `${0.6 + index * 0.1}s` }}><em>{count}</em></i>
        <span>{DAY_LETTERS[index]}</span>
      </div>)}
    </div>
    <p className="wr-lead wr-in" style={{ animationDelay: '1.8s' }}>Your busiest month was <b>{w.bestMonth}</b> — {Math.max(...w.daysByMonth)} training days.</p>
  </div>;
}

function Streak({ w }: { w: Wrapped }) {
  const shown = Math.min(52, w.longestWeekStreak);
  return <div className="wr-center">
    <p className="wr-kicker wr-in">Your longest streak</p>
    <div className="wr-ring">
      <svg viewBox="0 0 200 200" aria-hidden="true">
        {Array.from({ length: 52 }, (_, index) => {
          const angle = (index / 52) * Math.PI * 2 - Math.PI / 2;
          const x = 100 + Math.cos(angle) * 84, y = 100 + Math.sin(angle) * 84;
          return <circle key={index} cx={x} cy={y} r="4.2" className={index < shown ? 'on' : ''} style={{ animationDelay: `${0.4 + index * 0.035}s` }} />;
        })}
      </svg>
      <div><b><Count to={w.longestWeekStreak} delay={400} /></b><span>weeks</span></div>
    </div>
    <p className="wr-lead wr-in" style={{ animationDelay: '2.4s' }}>in a row without missing a week.</p>
  </div>;
}

function PersonaSlide({ w }: { w: Wrapped }) {
  return <div className="wr-center">
    <p className="wr-kicker wr-in">Your training type</p>
    <div className="wr-card-flip"><div>
      <div className="back"><Icon name="star" size={44} /></div>
      <div className="front"><Icon name="star" size={30} /><h2>{w.persona.name}</h2><p>{w.persona.line}</p></div>
    </div></div>
  </div>;
}

function Summary({ w, unit, metric, name, onShare, sharing }: { w: Wrapped; unit: string; metric: boolean; name: string; onShare: () => void; sharing: boolean }) {
  const lift = w.strongest;
  return <div className="wr-stack wr-summary">
    <div className="wr-sum-card wr-pop">
      <header><span>FORGE WRAPPED</span><b>{w.year}</b></header>
      <h2>{w.persona.name}</h2>
      {name && <p className="wr-sum-name">{name}</p>}
      <dl>
        <div><dt>Days trained</dt><dd>{fmt(w.trainingDays)}</dd></div>
        <div><dt>Top sets</dt><dd>{fmt(w.topSets)}</dd></div>
        {lift && <div><dt>Top lift</dt><dd>{lift.name}<small>{fmt(lift.best)} {unit}</small></dd></div>}
        {w.runs > 0 && <div><dt>{metric ? 'Kilometers' : 'Miles'} run</dt><dd>{fmt(w.runMiles * (metric ? 1.609344 : 1))}</dd></div>}
        {w.prCount > 0 && <div><dt>Records</dt><dd>{fmt(w.prCount)}</dd></div>}
        {w.longestWeekStreak > 1 && <div><dt>Week streak</dt><dd>{w.longestWeekStreak}</dd></div>}
      </dl>
    </div>
    <button type="button" className="wr-share wr-in" style={{ animationDelay: '.8s' }} onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onShare(); }} disabled={sharing}>{sharing ? 'Getting it ready…' : 'Share my Wrapped'}</button>
  </div>;
}

/* ---------- Share image ---------- */

async function shareImage(w: Wrapped, unit: string, metric: boolean, name: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080; canvas.height = 1920;
  const ctx = canvas.getContext('2d')!;
  const bg = ctx.createLinearGradient(0, 0, 1080, 1920);
  bg.addColorStop(0, '#0b1230'); bg.addColorStop(0.55, '#2a1a6e'); bg.addColorStop(1, '#3b5bff');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1080, 1920);
  const glow = ctx.createRadialGradient(860, 360, 0, 860, 360, 620);
  glow.addColorStop(0, 'rgba(139,92,246,.55)'); glow.addColorStop(1, 'rgba(139,92,246,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, 1080, 1920);
  const font = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 40px ${font}`; ctx.fillText('FORGE WRAPPED', 90, 170);
  ctx.font = `800 300px ${font}`; ctx.fillText(String(w.year), 70, 470);
  ctx.font = `800 96px ${font}`; ctx.fillText(w.persona.name, 90, 660);
  ctx.globalAlpha = 0.75; ctx.font = `500 44px ${font}`; ctx.fillText(name || w.persona.line, 90, 735); ctx.globalAlpha = 1;
  const rows: Array<[string, string]> = [['Days trained', fmt(w.trainingDays)], ['Top sets', fmt(w.topSets)]];
  if (w.strongest) rows.push(['Top lift', `${w.strongest.name} · ${fmt(w.strongest.best)} ${unit}`]);
  if (w.runs) rows.push([metric ? 'Kilometers run' : 'Miles run', fmt(w.runMiles * (metric ? 1.609344 : 1))]);
  if (w.prCount) rows.push(['Personal records', fmt(w.prCount)]);
  if (w.longestWeekStreak > 1) rows.push(['Week streak', String(w.longestWeekStreak)]);
  rows.slice(0, 6).forEach(([label, value], index) => {
    const y = 900 + index * 150;
    ctx.globalAlpha = 0.2; ctx.fillRect(90, y - 70, 900, 2); ctx.globalAlpha = 0.7;
    ctx.font = `500 40px ${font}`; ctx.fillText(label, 90, y);
    ctx.globalAlpha = 1; ctx.font = `800 56px ${font}`;
    const width = ctx.measureText(value).width;
    ctx.fillText(value, Math.max(90, 990 - width), y);
  });
  ctx.globalAlpha = 0.7; ctx.font = `600 36px ${font}`; ctx.fillText('Trained with Forge', 90, 1830); ctx.globalAlpha = 1;
  const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return;
  const file = new File([blob], `forge-wrapped-${w.year}.png`, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: `My ${w.year} in Forge` }); } catch { /* cancelled */ }
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = file.name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------- The page ---------- */

export function WrappedPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isPro, loading: billingLoading } = useBilling();
  const { records } = useWorkoutHistory();
  const { setup } = useProfileSetup();
  const metric = setup?.units === 'Metric';
  const unit = metric ? 'kg' : 'lb';
  const name = (setup?.displayName || '').split(' ')[0];
  /* ?year= opens a specific year — used to preview the current one early. */
  const requested = Number(params.get('year'));
  const year = Number.isInteger(requested) && requested > 2000 ? requested : wrappedWindow().year;
  const w = useMemo(() => buildWrapped(records, year, metric), [records, year, metric]);

  useEffect(() => { try { localStorage.setItem(`forge-wrapped-seen-${year}`, '1'); } catch { /* per-device */ } }, [year]);

  const slides: Slide[] = useMemo(() => {
    if (!w) return [];
    const list: Slide[] = [{ key: 'intro', tone: 't-intro', body: <Intro year={w.year} name={name} /> }];
    list.push({ key: 'days', tone: 't-blue', body: <Days w={w} /> });
    if (w.topSets > 0) list.push({ key: 'tonnage', tone: 't-violet', body: <Tonnage w={w} unit={unit} /> });
    if (w.strongest) list.push({ key: 'lift', tone: 't-navy', body: <Strongest w={w} unit={unit} /> });
    if (w.prCount > 0) list.push({ key: 'prs', tone: 't-electric', body: <Prs w={w} unit={unit} /> });
    if (w.runs > 0) list.push({ key: 'run', tone: 't-violet', body: <Running w={w} metric={metric} /> });
    list.push({ key: 'rhythm', tone: 't-navy', body: <Rhythm w={w} /> });
    if (w.longestWeekStreak >= 2) list.push({ key: 'streak', tone: 't-blue', body: <Streak w={w} /> });
    list.push({ key: 'persona', tone: 't-electric', body: <PersonaSlide w={w} /> });
    return list;
  }, [w, unit, metric, name]);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [sharing, setSharing] = useState(false);
  const total = slides.length + 1; // + summary
  const atEnd = index >= total - 1;
  const close = useCallback(() => { if (window.history.length > 1) navigate(-1); else navigate('/'); }, [navigate]);
  const next = useCallback(() => setIndex(current => Math.min(total - 1, current + 1)), [total]);
  const back = useCallback(() => setIndex(current => Math.max(0, current - 1)), []);

  /* Auto-advance, except on the last slide and while held. */
  useEffect(() => {
    if (!isPro || !w || atEnd || paused) return;
    const timer = window.setTimeout(next, SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [index, isPro, w, atEnd, paused, next]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'ArrowRight' || event.key === ' ') next(); if (event.key === 'ArrowLeft') back(); if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    const html = document.documentElement; const before = html.style.overflow; html.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); html.style.overflow = before; };
  }, [next, back, close]);

  const held = useRef<number | null>(null);
  const wasHold = useRef(false);
  const onDown = () => { wasHold.current = false; held.current = window.setTimeout(() => { wasHold.current = true; setPaused(true); }, 220); };
  const onUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (held.current) window.clearTimeout(held.current);
    if (wasHold.current) { setPaused(false); return; }
    const box = event.currentTarget.getBoundingClientRect();
    if (event.clientX - box.left < box.width * 0.3) back(); else next();
  };

  const share = async () => { if (!w) return; setSharing(true); try { await shareImage(w, unit, metric, setup?.displayName || ''); } finally { setSharing(false); } };

  const shell = (tone: string, content: ReactNode, interactive = true) => createPortal(<div className={`wrapped ${tone}`} role="dialog" aria-modal="true" aria-label={`Forge Wrapped ${year}`}>
    <div className="wr-glow" aria-hidden="true"><i /><i /><i /></div>
    {interactive && w && isPro && <div className="wr-progress" aria-hidden="true">{Array.from({ length: total }, (_, i) => <span key={i}><i className={i < index ? 'done' : i === index ? (atEnd ? 'done' : paused ? 'now paused' : 'now') : ''} style={i === index ? { animationDuration: `${SLIDE_MS}ms` } : undefined} /></span>)}</div>}
    <button type="button" className="wr-close" aria-label="Close Wrapped" onClick={close}><Icon name="close" size={20} stroke={2.4} /></button>
    {content}
  </div>, document.body);

  if (billingLoading) return shell('t-intro', <div className="wr-center"><p className="wr-sub">Loading your year…</p></div>, false);

  if (!w || w.trainingDays < 3) return shell('t-intro', <div className="wr-center wr-empty">
    <p className="wr-kicker">Forge Wrapped {year}</p>
    <h2 className="wr-name">Not enough training yet</h2>
    <p className="wr-lead">Wrapped needs a few logged days from {year} to tell your story. Keep training — it’ll be here.</p>
    <button type="button" className="wr-share" onClick={close}>Back to Forge</button>
  </div>, false);

  /* FREE: the headline, then the lock. The number is theirs and it is the
     hook; the rest of the story is Pro. */
  if (!isPro) return shell('t-intro', <div className="wr-center wr-locked">
    <p className="wr-kicker wr-in">Forge Wrapped {year}</p>
    <h2 className="wr-huge"><Count to={w.trainingDays} /></h2>
    <p className="wr-lead wr-in" style={{ animationDelay: '.6s' }}>days trained. Your full year is ready.</p>
    <ul className="wr-teaser wr-in" style={{ animationDelay: '1s' }}>
      {['Your strongest lift and how far it moved', w.prCount ? `All ${w.prCount} personal records` : 'Your personal records', w.runs ? 'Every mile, drawn out' : 'Your training rhythm', 'Your training type, and a card to share'].map(item => <li key={item}><Icon name="lock" size={15} />{item}</li>)}
    </ul>
    <button type="button" className="wr-share wr-in" style={{ animationDelay: '1.3s' }} onClick={() => navigate('/profile?view=billing', { replace: true })}>Unlock with Forge Pro</button>
    <p className="wr-foot wr-in" style={{ animationDelay: '1.5s' }}>Wrapped is part of Forge Pro.</p>
  </div>, false);

  const current = index < slides.length ? slides[index] : null;
  return shell(current ? current.tone : 't-summary', <div className="wr-stage" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => { if (held.current) window.clearTimeout(held.current); setPaused(false); }}>
    <div className="wr-slide" key={current ? current.key : 'summary'}>
      {current ? current.body : <Summary w={w} unit={unit} metric={metric} name={setup?.displayName || ''} onShare={() => void share()} sharing={sharing} />}
    </div>
  </div>);
}
