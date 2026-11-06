import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { isDemoMode } from '../lib/env';
import { isNative } from '../features/billing/platform';
import { BrandMark } from '../features/training/brandLogos';
import { getGarminConnection } from '../features/training/garminConnectionService';

/* GARMIN, ASKED ON OPEN. A Garmin watch is the single biggest thing an
   athlete can give Forge — every workout, and with the Health API their
   sleep and recovery — so the first screen after opening asks, once.

   Once per app open, never more: the answer is remembered for the session.
   "Not now" waits until tomorrow; "I don't wear a Garmin" ends it on this
   device, because asking someone with an Apple Watch every morning is the
   fastest way to have every prompt ignored.

   It stays out of the way of everything else: not over another dialog, not
   mid-workout, not on Connections itself (that IS the answer), not before
   sign-in or onboarding, and not in the native shell, where the OAuth return
   address does not work yet and the button would lead to an error. */

const laterKey = 'forge-garmin-prompt-later';
const neverKey = 'forge-garmin-prompt-never';
const askedKey = 'forge-garmin-prompt-asked';
const read = (store: Storage, key: string) => { try { return store.getItem(key); } catch { return null; } };
const write = (store: Storage, key: string, value: string) => { try { store.setItem(key, value); } catch { /* asked again next time */ } };

const quietPath = (path: string) => /^\/(profile|workout|login|onboarding)/.test(path);

export function GarminConnectPrompt() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isDemoMode || !user || isNative()) return;
    if (read(sessionStorage, askedKey) || read(localStorage, neverKey)) return;
    const later = read(localStorage, laterKey);
    if (later && new Date(later).getTime() > Date.now()) return;
    let live = true;
    /* A beat after launch, so the app has painted and any sync popup has had
       its chance to claim the screen first. */
    const timer = window.setTimeout(() => {
      void getGarminConnection().then(status => {
        if (!live || !status.configured || status.connected) return;
        if (quietPath(window.location.hash.replace(/^#/, '')) || document.querySelector('[aria-modal="true"]')) return;
        write(sessionStorage, askedKey, '1');
        setOpen(true);
      }).catch(() => undefined);
    }, 1500);
    return () => { live = false; window.clearTimeout(timer); };
  }, [user?.id]);

  /* Navigating somewhere quiet (say, straight into a workout) closes it. */
  useEffect(() => { if (open && quietPath(location.pathname)) setOpen(false); }, [location.pathname, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') later(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  const later = () => { write(localStorage, laterKey, new Date(Date.now() + 86400000).toISOString()); setOpen(false); };
  const never = () => { write(localStorage, neverKey, '1'); setOpen(false); };
  const connect = () => { setOpen(false); navigate('/profile?view=connections'); };

  return <div className="strava-review-backdrop" role="dialog" aria-modal="true" aria-labelledby="garmin-prompt-title" onClick={event => { if (event.target === event.currentTarget) later(); }}>
    <div className="strava-review-sheet garmin-prompt">
      <header>
        <div>
          <BrandMark id="garmin" name="Garmin" />
          <span className="eyebrow">NEW · DIRECT FROM GARMIN</span>
          <strong id="garmin-prompt-title">Connect your Garmin</strong>
        </div>
        <button type="button" className="strava-review-close" onClick={later} aria-label="Not now">×</button>
      </header>
      <p className="strava-review-lede">Every run, ride and workout on your watch lands in your training log on its own — distance, pace and heart rate included, nothing to type.</p>
      <footer className="garmin-prompt-actions">
        <button type="button" className="button wide" onClick={connect}>Connect Garmin</button>
        <button type="button" className="garmin-prompt-later" onClick={later}>Not now</button>
        <button type="button" className="garmin-prompt-never" onClick={never}>I don’t wear a Garmin</button>
      </footer>
    </div>
  </div>;
}
