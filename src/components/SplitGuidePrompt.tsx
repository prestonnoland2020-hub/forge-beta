import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { readGuideState, SPLIT_GUIDE_KEY, SPLIT_GUIDE_FRESH_KEY } from '../features/splits/splitGuideState';
import { tap } from '../lib/haptics';
import { Icon } from './Icon';

/* "DO YOU WANT TO MAKE YOUR SPLIT?" — asked once, on Home, of someone who has
   only the starter split Forge made at sign-up. Yes opens the step-by-step
   guide; Not now keeps the starter split and does not ask again (the guide
   stays one tap away under Profile → Split, and the coach can open it). */
export function SplitGuidePrompt() {
  const { setup } = useProfileSetup();
  const navigate = useNavigate();
  const [asked, setAsked] = useState(() => readGuideState());
  const starter = Boolean(setup?.completedAt) && setup?.splitSource !== 'Custom';
  /* Someone the coach trains (Coach me) has no split to build; ask later if they switch. */
  let coaching = setup?.trainingMode === 'coach';
  try { coaching = coaching || localStorage.getItem('forge-today-mode') === 'coach'; } catch { /* fine */ }
  if (!starter || asked || coaching) return null;
  const dayNames = (setup?.splitDays || []).map(day => day.name).filter(Boolean);
  const later = () => { tap(); try { localStorage.setItem(SPLIT_GUIDE_KEY, 'later'); } catch { /* per-device */ } setAsked('later'); };
  return <div className="sgp-backdrop" role="dialog" aria-modal="true" aria-labelledby="sgp-title">
    <section className="sgp-sheet">
      <span className="sgp-mark" aria-hidden="true"><Icon name="star" /></span>
      <h2 id="sgp-title">Do you want to make your split?</h2>
      <p>Your <b>split</b> is your repeating set of training days. Forge started you on a simple one{dayNames.length ? <>: <b>{dayNames.slice(0, 4).join(' · ')}{dayNames.length > 4 ? ' …' : ''}</b></> : null}.</p>
      <p>Make your own in about two minutes — we’ll walk you through every step, and you can change it any time.</p>
      <button type="button" className="button" onClick={() => { tap(); navigate('/split?guide=1&from=home'); }}>Yes, build my split</button>
      <button type="button" className="button ghost" onClick={later}>Not now — keep the starter split</button>
      <small>You can always find it under Profile → Split guide, or ask the coach.</small>
    </section>
  </div>;
}

/* "YOUR SPLIT IS READY" — once, on the Home the guide lands on, so the
   athlete knows the card under it is the split they just made. */
export function SplitReadyNote({ dayName }: { dayName?: string }) {
  const [fresh, setFresh] = useState(() => { try { return localStorage.getItem(SPLIT_GUIDE_FRESH_KEY); } catch { return null; } });
  if (!fresh) return null;
  const close = () => { try { localStorage.removeItem(SPLIT_GUIDE_FRESH_KEY); } catch { /* per-device */ } setFresh(null); };
  return <div className="sgp-ready" role="status">
    <Icon name="check" />
    <p><b>Your split “{fresh}” is ready.</b> {dayName ? <>Today is <b>{dayName}</b> — it’s below.</> : 'Today’s day is below.'}</p>
    <button type="button" onClick={close} aria-label="Dismiss">×</button>
  </div>;
}
