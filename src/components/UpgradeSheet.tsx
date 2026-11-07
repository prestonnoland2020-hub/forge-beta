import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBilling } from '../features/billing/BillingProvider';
import { PRO_PITCH } from '../features/billing/entitlements';
import { Icon } from './Icon';

/* THE UPGRADE MOMENT. Free shows the problem; this sheet offers the fix, at
   the moments the athlete has just felt the gap:

   - first-top-set  — they logged their first top set
   - missed-lift    — a top set came in under what was prescribed
   - goal-behind    — a goal's verdict is "behind"; the fix is Pro
   - pro-action     — the coach proposed a plan change only Pro applies
   - trial-ended    — the 7-day trial is over
   - limit          — the server refused on quota (BillingProvider.paywall)

   Each nudge shows ONCE per account on this device, never to Pro or trial
   athletes, and never more than one per day: a paywall that pops on every
   tap teaches people to dismiss it. The server-driven limit sheet always
   shows -- it is answering something the athlete just tried to do.

   Fire one from anywhere with: nudgeUpgrade('missed-lift') */

export type NudgeKind = 'first-top-set' | 'missed-lift' | 'goal-behind' | 'pro-action' | 'trial-ended';

export function nudgeUpgrade(kind: NudgeKind, detail?: string) {
  window.dispatchEvent(new CustomEvent('forge:nudge', { detail: { kind, detail } }));
}

const COPY: Record<NudgeKind, { title: string; body: string }> = {
  'first-top-set': { title: 'First top set logged', body: 'Pro’s coach turns every set you log into your next one — and plans your whole week around it.' },
  'missed-lift': { title: 'A miss is information', body: 'Pro’s coach tells you why it happened and what to change next time, using your own numbers.' },
  'goal-behind': { title: 'Behind — here’s the fix', body: 'You can see the verdict free. Pro shows exactly what to change to close the gap, and can apply it for you.' },
  'pro-action': { title: 'Let the coach make the change', body: 'Pro applies the coach’s plan changes in one tap — mileage, loads, goals and new workouts.' },
  'trial-ended': { title: 'Your Pro trial has ended', body: 'Logging, history and today’s top set stay free. Pro keeps the coach answering and adjusting your plan.' },
};

const SEEN_KEY = 'forge-upgrade-nudges-v1';
function readSeen(): { kinds: string[]; last: number } {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '') as { kinds: string[]; last: number }; } catch { return { kinds: [], last: 0 }; }
}
function markSeen(kind: string) {
  try { const seen = readSeen(); localStorage.setItem(SEEN_KEY, JSON.stringify({ kinds: [...new Set([...seen.kinds, kind])], last: Date.now() })); } catch { /* storage unavailable: the nudge may repeat, which is harmless */ }
}

export function UpgradeSheet() {
  const { paywall, dismissPaywall, isPro, entitlements, loading } = useBilling();
  const navigate = useNavigate();
  const [nudge, setNudge] = useState<{ kind: NudgeKind; detail?: string } | null>(null);

  useEffect(() => {
    const onNudge = (event: Event) => {
      const { kind, detail } = (event as CustomEvent<{ kind: NudgeKind; detail?: string }>).detail;
      if (isPro || loading) return;
      const seen = readSeen();
      if (seen.kinds.includes(kind)) return;
      if (Date.now() - seen.last < 20 * 3600 * 1000) return;
      markSeen(kind);
      setNudge({ kind, detail });
    };
    window.addEventListener('forge:nudge', onNudge);
    return () => window.removeEventListener('forge:nudge', onNudge);
  }, [isPro, loading]);

  /* The trial's end is a moment of its own. */
  useEffect(() => {
    if (loading || isPro || !entitlements.trialUsed) return;
    nudgeUpgrade('trial-ended');
  }, [loading, isPro, entitlements.trialUsed]);

  const open = Boolean(paywall) || Boolean(nudge);
  if (!open) return null;
  const close = () => { setNudge(null); dismissPaywall(); };
  const copy = nudge ? COPY[nudge.kind] : { title: paywall?.upgrade ? 'You’ve used today’s free questions' : 'Forge AI limit reached', body: paywall?.message || '' };
  const showOffer = nudge ? true : Boolean(paywall?.upgrade);

  return <>
    <button type="button" className="upgrade-backdrop" aria-label="Close" onClick={close} />
    <section className="upgrade-sheet" role="dialog" aria-modal="true" aria-labelledby="upgrade-title">
      <span className="upgrade-grip" aria-hidden="true" />
      <span className="eyebrow">Forge Pro</span>
      <h2 id="upgrade-title">{copy.title}</h2>
      <p>{nudge?.detail || copy.body}</p>
      {showOffer && <ul className="upgrade-pitch">{PRO_PITCH.map(item => <li key={item}><Icon name="check" size={16} stroke={2.6} />{item}</li>)}</ul>}
      <footer>
        {showOffer && <button type="button" className="button" onClick={() => { close(); navigate('/profile?view=billing'); }}>See Pro · $9.99/mo</button>}
        <button type="button" className="button ghost" onClick={close}>{showOffer ? 'Not now' : 'OK'}</button>
      </footer>
    </section>
  </>;
}
