import { useState } from 'react';
import { useAuth } from '../features/auth/AuthProvider';
import { useBilling } from '../features/billing/BillingProvider';
import { ALWAYS_FREE, PRO_FEATURES, remaining } from '../features/billing/entitlements';
import { APPLE_MANAGE_URL, beginCheckout, openBillingPortal, restorePurchases, type Plan } from '../features/billing/billingService';
import { billingRail, platform } from '../features/billing/platform';
import { deleteMyAccount } from '../features/profile/profileService';

/* PRICED AGAINST THE CATEGORY, NOT AGAINST HOPE. The median Health & Fitness
   subscription is about $9.99 a month and $39.99 a year; annual carries two
   thirds of the category's revenue. $59.99 sits above the annual median
   because a coach that calls a model on every question has a real marginal
   cost a plain logging app does not — but it is deliberately not the $79.99 a
   first draft reaches for, which is double the anchor buyers expect from an
   app they have never heard of. If conversion disappoints, the annual price is
   the first thing to test downward, not the feature set. */
const PRICES: Record<Plan, { label: string; price: string; note: string }> = {
  pro_monthly: { label: 'Monthly', price: '$9.99', note: 'per month' },
  pro_annual: { label: 'Annual', price: '$59.99', note: 'per year · half the monthly rate' },
};

const ENDPOINT_LABELS: Record<string, string> = {
  'forge-coach': 'Coach questions',
  'forge-plan': 'Program rebuilds',
};

function UsageRow({ endpoint, usage }: { endpoint: string; usage: { dailyLimit: number | null; monthlyLimit: number | null; usedToday: number; usedThisMonth: number } }) {
  const left = remaining(usage);
  const label = ENDPOINT_LABELS[endpoint] || endpoint;
  if (left === null) {
    return <article className="billing-usage-row"><div><strong>{label}</strong><span>Unmetered on this account</span></div><b>∞</b></article>;
  }
  const limit = usage.dailyLimit ?? 0;
  /* The bar shows what is GONE, so a full bar reads as "used up" rather than
     "plenty left" — the opposite reading would be reassuring and wrong. */
  const spent = limit ? Math.min(100, Math.round((usage.usedToday / limit) * 100)) : 0;
  return <article className="billing-usage-row">
    <div>
      <strong>{label}</strong>
      <span>{usage.usedToday} of {limit} used today{usage.monthlyLimit ? ` · ${usage.usedThisMonth} of ${usage.monthlyLimit} this month` : ''}</span>
      <div className="billing-meter" role="presentation"><i style={{ width: `${spent}%` }} data-full={left === 0 || undefined} /></div>
    </div>
    <b data-empty={left === 0 || undefined}>{left}</b>
  </article>;
}

export function BillingSettings() {
  const { user } = useAuth();
  const { entitlements, subscription, isPro, refresh, loading } = useBilling();
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const rail = billingRail();

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key); setError(''); setMessage('');
    try { await action(); } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That did not work. Try again.');
    } finally { setBusy(''); }
  };

  const subscribe = (plan: Plan) => run(plan, async () => {
    await beginCheckout(plan);
    /* Stripe leaves the page; Apple returns here and the entitlement is
       already written by the time verification resolves. */
    await refresh();
    setMessage('Forge Pro is active. Thank you.');
  });

  const renewalDate = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  if (loading) return <section className="card"><span className="eyebrow">PLAN</span><h3>Checking your plan…</h3></section>;

  return <div className="stack-l billing-settings">
    <section className="card billing-status" data-tier={entitlements.tier}>
      <header>
        <div>
          <span className="eyebrow">YOUR PLAN</span>
          <h3>{entitlements.tier === 'founder' ? 'Forge — owner account' : isPro ? 'Forge Pro' : 'Forge Free'}</h3>
          <p>
            {entitlements.tier === 'founder'
              ? 'No limits apply to this account.'
              : isPro
                ? subscription?.cancel_at_period_end
                  ? `Pro ends ${renewalDate || 'at the end of this period'}. You keep everything you have logged.`
                  : `Renews ${renewalDate || 'automatically'}${subscription?.source === 'apple' ? ' through the App Store' : ''}.`
                : 'Everything you log is free forever. Pro raises the coaching limits.'}
          </p>
        </div>
        <span className="billing-pill" data-pro={isPro || undefined}>{entitlements.tier === 'founder' ? 'OWNER' : isPro ? 'PRO' : 'FREE'}</span>
      </header>
    </section>

    {Object.keys(entitlements.endpoints).length > 0 && <section className="card billing-usage">
      <header><div><span className="eyebrow">FORGE AI</span><h3>What is left {entitlements.tier === 'founder' ? '' : 'today'}</h3><p>Coaching answers and program rebuilds each call a model. Logging, history and your split are never metered.</p></div></header>
      {Object.entries(entitlements.endpoints).map(([endpoint, usage]) => <UsageRow key={endpoint} endpoint={endpoint} usage={usage} />)}
    </section>}

    {!isPro && <section className="card billing-offer">
      <header><div><span className="eyebrow">FORGE PRO</span><h3>More of the part that coaches you</h3></div></header>
      <ul className="billing-features">{PRO_FEATURES.map(feature => <li key={feature}>{feature}</li>)}</ul>
      <div className="billing-plans">
        {(Object.keys(PRICES) as Plan[]).map(plan => <button
          key={plan}
          className={`billing-plan${plan === 'pro_annual' ? ' recommended' : ''}`}
          disabled={Boolean(busy)}
          onClick={() => void subscribe(plan)}>
          <small>{PRICES[plan].label}</small>
          <strong>{PRICES[plan].price}</strong>
          <span>{PRICES[plan].note}</span>
          <b>{busy === plan ? 'Opening…' : 'Choose'}</b>
        </button>)}
      </div>
      <p className="billing-fineprint">
        {rail === 'apple'
          ? 'Billed through your Apple ID. Cancel any time in App Store settings; a subscription renews unless cancelled at least 24 hours before the period ends.'
          : 'Billed securely by Stripe. Cancel any time — card details never touch Forge.'}
      </p>
      <details className="billing-free-note">
        <summary>What stays free</summary>
        <ul>{ALWAYS_FREE.map(item => <li key={item}>{item}</li>)}</ul>
      </details>
    </section>}

    <section className="card billing-manage">
      <header><div><span className="eyebrow">MANAGE</span><h3>Billing and account</h3></div></header>
      <div className="billing-actions">
        {isPro && subscription?.source === 'stripe' && <button className="button secondary" disabled={Boolean(busy)} onClick={() => void run('portal', openBillingPortal)}>
          {busy === 'portal' ? 'Opening…' : 'Manage payment and cancel'}
        </button>}
        {isPro && subscription?.source === 'apple' && <a className="button secondary" href={APPLE_MANAGE_URL} target="_blank" rel="noreferrer">Manage in App Store settings</a>}
        {platform() === 'ios' && <button className="button secondary" disabled={Boolean(busy)} onClick={() => void run('restore', async () => {
          const restored = await restorePurchases();
          await refresh();
          setMessage(restored ? 'Your subscription is restored.' : 'No previous Forge purchase was found on this Apple ID.');
        })}>{busy === 'restore' ? 'Checking…' : 'Restore purchases'}</button>}
        <button className="button secondary" disabled={Boolean(busy)} onClick={() => void run('refresh', async () => { await refresh(); setMessage('Plan refreshed.'); })}>
          {busy === 'refresh' ? 'Refreshing…' : 'Refresh plan status'}
        </button>
      </div>
      {message && <p className="billing-message">{message}</p>}
      {error && <p className="billing-message error">{error}</p>}
      <p className="billing-account-email">Signed in as {user?.email || 'this account'}.</p>
    </section>

    {/* App Store Review Guideline 5.1.1(v): an app that supports account
        creation must offer account deletion inside the app. Not a support
        email, not a web form — a control that actually deletes. Typing the
        word is the confirmation, because this is irreversible and cascades
        through every workout the athlete ever logged. */}
    <section className="card billing-danger">
      <header><div><span className="eyebrow">DELETE ACCOUNT</span><h3>Permanently delete Forge</h3><p>This removes your profile, every workout, top set, cardio session, goal and connection. It cannot be undone, and it does not cancel a subscription bought through the App Store — cancel that in App Store settings first.</p></div></header>
      {!confirmDelete
        ? <button className="button danger-outline" onClick={() => setConfirmDelete(true)}>Delete my account</button>
        : <div className="billing-confirm">
            <label>Type <b>DELETE</b> to confirm
              <input value={deleteText} onChange={event => setDeleteText(event.target.value)} placeholder="DELETE" autoComplete="off" />
            </label>
            <div className="billing-actions">
              <button className="button secondary" onClick={() => { setConfirmDelete(false); setDeleteText(''); }}>Keep my account</button>
              <button className="button danger" disabled={deleteText.trim().toUpperCase() !== 'DELETE' || Boolean(busy)} onClick={() => void run('delete', async () => {
                await deleteMyAccount();
                window.location.hash = '/login';
                window.location.reload();
              })}>{busy === 'delete' ? 'Deleting…' : 'Delete everything'}</button>
            </div>
          </div>}
    </section>
  </div>;
}
