import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';

/* THE BIG ONE. A real single heavier than any before it gets the whole screen
   for a moment: confetti and the number. It goes away on its own, or on a tap,
   and it never asks for anything — the next set is still the next thing to do.

   The smaller record, a new calculated max, does not come here at all. It is
   acknowledged on the set's own line (see TopSetCards), because a number on a
   curve has earned a nod, not an interruption. */
const COLORS = ['var(--accent)', 'var(--good)', '#f5c542', '#ff6b6b', '#5ab0ff', '#ffffff'];

export function PrCelebration({ lift, weight, previous, unit, onDone }: { lift: string; weight: number; previous: number | null; unit: string; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 4200);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  const pieces = useMemo(() => Array.from({ length: 90 }, (_, index) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.6,
    duration: 2.2 + Math.random() * 1.6,
    drift: (Math.random() - 0.5) * 160,
    spin: (Math.random() - 0.5) * 1440,
    size: 6 + Math.random() * 7,
    round: index % 4 === 0,
    color: COLORS[index % COLORS.length],
  })), []);

  const gain = previous !== null ? Math.round((weight - previous) * 10) / 10 : null;

  return createPortal(<div className="pr-celebration" role="status" aria-live="assertive" onClick={onDone}>
    <div className="pr-confetti" aria-hidden="true">
      {pieces.map((piece, index) => <i key={index} style={{
        left: `${piece.left}%`,
        width: `${piece.size}px`,
        height: `${piece.round ? piece.size : piece.size * 0.45}px`,
        borderRadius: piece.round ? '999px' : '2px',
        background: piece.color,
        animationDelay: `${piece.delay}s`,
        animationDuration: `${piece.duration}s`,
        ['--drift' as string]: `${piece.drift}px`,
        ['--spin' as string]: `${piece.spin}deg`,
      }} />)}
    </div>
    <div className="pr-celebration-card">
      <span className="pr-celebration-eyebrow">NEW 1RM PR</span>
      <strong>{weight} <small>{unit}</small></strong>
      <p>{lift}{gain !== null && gain > 0 ? <> · <b>+{gain} {unit}</b> over your best single</> : <> · your first true single</>}</p>
      <small className="pr-celebration-hint">Tap to keep going</small>
    </div>
  </div>, document.body);
}
