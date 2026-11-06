import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { useBilling } from '../features/billing/BillingProvider';
import { ALWAYS_FREE, PRO_FEATURES, remaining } from '../features/billing/entitlements';
import { APPLE_MANAGE_URL, beginCheckout, openBillingPortal, restorePurchases, type Plan } from '../features/billing/billingService';
import { billingRail, platform } from '../features/billing/platform';
import { deleteMyAccount } from '../features/profile/profileService';
import { Icon } from './Icon';

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
  pro_annual: { label: 'Annual', price: '$59.99', note: 'per year · about $5 a month' },
};

const ENDPOINT_LABELS: Record<string, string> = {
  'forge-coach': 'Coach questions',
  'forge-plan': 'Program rebuilds',
};

function UsageRow({ endpoint, usage }: { endpoint: string; usage: { dailyLimit: number | null; monthlyLimit: number | null; usedToday: number; usedThisMonth: number } }) {
  const left = remaining(usage);
  const label = ENDPOINT_LABELS[endpoint] || endpoint;
  if (left === null) {
    return <div className="settings-row billing-usage-row"><div><strong>{label}</strong><span>Unmetered on this account</span></div><b className="billing-left"><strong>∞</strong></b></div>;
  }
  const limit = usage.dailyLimit ?? 0;
  /* The bar shows what is GONE, so a full bar reads as "used up" rather than
     "plenty left" — the opposite reading would be reassuring and wrong. */
  const spent = limit ? Math.min(100, Math.round((usage.usedToday / limit) * 100)) : 0;
  return <div className="settings-row billing-usage-row">
    <div>
      <strong>{label}</strong>
      <span>{usage.usedToday} of {limit} used today{usage.monthlyLimit ? ` · ${usage.usedThisMonth} of ${usage.monthlyLimit} this month` : ''}</span>
      <div className="billing-meter" role="presentation"><i style={{ width: `${spent}%` }} data-full={left === 0 || undefined} /></div>
    </div>
    {/* The bare number used to sit here unlabelled, so "1" could be read as
        used, left or a limit. It says which. */}
    <b className="billing-left" data-empty={left === 0 || undefined}><strong>{left}</strong><small>left</small></b>
  </div>;
}

/* PLAN & BILLING, GROUPED THE WAY SETTINGS IS. It was five full cards, each
   with a label, a heading and a paragraph, stacked with no gap between them,
   so the page read as one long wall and the delete warning was the biggest
   thing on it. Now: the plan up top as the one loud block, then labelled
   groups of rows — usage, the upgrade, managing it, and the account — with
   the destructive action reduced to a red row that opens its confirmation. */
export function BillingSettings() {
  const { user } = useAuth();
  const { entitlements, subscription, isPro, refresh, loading } = useBilling();
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const rail = billingRail();
  const stripeStillBilling = isPro && subscription?.source === 'stripe' && !subscription?.cancel_at_period_end;

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

  if (loading) return <section className="card billing-hero"><div><span className="eyebrow">Your plan</span><h2 className="billing-tier">Checking…</h2></div></section>;

  const founder = entitlements.tier === 'founder';
  const tierWord = founder ? 'Owner' : isPro ? 'Pro' : 'Free';
  const status = founder
    ? 'No limits apply to this account.'
    : isPro
      ? subscription?.cancel_at_period_end
        ? `Pro ends ${renewalDate || 'at the end of this period'}. You keep everything you have logged.`
        : `Renews ${renewalDate || 'automatically'}${subscription?.source === 'apple' ? ' through the App Store' : ''}.`
      : 'Everything you log is free, forever. Pro raises the coaching limits.';

  return <div className="settings-groups billing-settings">
    <section className="card billing-hero" data-tier={entitlements.tier} aria-label="Your plan">
      <div>
        <span className="eyebrow">Your plan</span>
        <h2 className="billing-tier">Forge <em>{tierWord}</em></h2>
        <p>{status}</p>
      </div>
    </section>

    {Object.keys(entitlements.endpoints).length > 0 && <section aria-labelledby="billing-ai">
      <h3 id="billing-ai">Forge AI {founder ? '' : 'today'}</h3>
      <div className="simple-settings-list">
        {Object.entries(entitlements.endpoints).map(([endpoint, usage]) => <UsageRow key={endpoint} endpoint={endpoint} usage={usage} />)}
      </div>
      <p className="billing-group-note">Coaching answers and program rebuilds each call an AI model. Logging, history and your split are never metered.</p>
    </section>}

    {!isPro && <section aria-labelledby="billing-pro">
      <h3 id="billing-pro">Upgrade</h3>
      <div className="card billing-offer">
        <header>
          <h2 className="billing-tier">Forge <em>Pro</em></h2>
          <p>More of the part that coaches you.</p>
        </header>
        <ul className="billing-features">{PRO_FEATURES.map(feature => <li key={feature}><Icon name="check" size={16} stroke={2.6} />{feature}</li>)}</ul>
        <div className="billing-plans" role="group" aria-label="Choose a plan">
          {(Object.keys(PRICES) as Plan[]).map(plan => <button
            key={plan}
            type="button"
            className={`billing-plan${plan === 'pro_annual' ? ' recommended' : ''}`}
            disabled={Boolean(busy)}
            onClick={() => void subscribe(plan)}>
            {plan === 'pro_annual' && <span className="billing-plan-badge">Best value</span>}
            <small>{PRICES[plan].label}</small>
            <strong>{PRICES[plan].price}</strong>
            <span>{PRICES[plan].note}</span>
            <b className="billing-plan-cta">{busy === plan ? 'Opening…' : 'Subscribe'}</b>
          </button>)}
        </div>
        {/* Auto-renewal laws (California's among them) want the renewal, the
            price and how to cancel stated where the athlete commits, not only
            in the terms. */}
        <p className="billing-fineprint">
          {rail === 'apple'
            ? 'Billed through your Apple ID. Renews automatically at the price shown unless cancelled at least 24 hours before the period ends. Cancel any time in App Store settings.'
            : 'Renews automatically at the price shown, every month or year, until you cancel. Cancel any time with Manage payment and cancel; Pro stays on until the period ends. Billed by Stripe — card details never touch Forge.'}
          {' '}<Link to="/legal/terms">Terms</Link> · <Link to="/legal/refunds">Refund Policy</Link>
        </p>
      </div>
      <details className="simple-settings-list billing-free">
        <summary><div><strong>What stays free</strong><span>Logging is never behind the paywall</span></div><Icon name="chevron" size={16} stroke={2.4} className="billing-free-chevron" /></summary>
        <ul>{ALWAYS_FREE.map(item => <li key={item}><Icon name="check" size={14} stroke={2.6} />{item}</li>)}</ul>
      </details>
    </section>}

    <section aria-labelledby="billing-manage">
      <h3 id="billing-manage">Manage</h3>
      <div className="simple-settings-list">
        {isPro && subscription?.source === 'stripe' && <button type="button" disabled={Boolean(busy)} onClick={() => void run('portal', openBillingPortal)}>
          <div><strong>{busy === 'portal' ? 'Opening…' : 'Manage payment and cancel'}</strong><span>Card, invoices and cancellation, through Stripe</span></div><b>›</b>
        </button>}
        {isPro && subscription?.source === 'apple' && <a href={APPLE_MANAGE_URL} target="_blank" rel="noreferrer">
          <div><strong>Manage in App Store settings</strong><span>Change or cancel through your Apple ID</span></div><b>›</b>
        </a>}
        {platform() === 'ios' && <button type="button" disabled={Boolean(busy)} onClick={() => void run('restore', async () => {
          const restored = await restorePurchases();
          await refresh();
          setMessage(restored ? 'Your subscription is restored.' : 'No previous Forge purchase was found on this Apple ID.');
        })}><div><strong>{busy === 'restore' ? 'Checking…' : 'Restore purchases'}</strong><span>Bought Pro on another device?</span></div><b>›</b></button>}
        <button type="button" disabled={Boolean(busy)} onClick={() => void run('refresh', async () => { await refresh(); setMessage('Plan refreshed.'); })}>
          <div><strong>{busy === 'refresh' ? 'Refreshing…' : 'Refresh plan status'}</strong><span>If a purchase hasn’t shown up yet</span></div><b>›</b>
        </button>
      </div>
      {message && <p className="billing-message" role="status">{message}</p>}
      {error && <p className="billing-message error" role="alert">{error}</p>}
      <p className="billing-group-note">Signed in as {user?.email || 'this account'}.</p>
    </section>

    {/* App Store Review Guideline 5.1.1(v): an app that supports account
        creation must offer account deletion inside the app. Not a support
        email, not a web form — a control that actually deletes. Typing the
        word is the confirmation, because this is irreversible and cascades
        through every workout the athlete ever logged. */}
    <section aria-labelledby="billing-account">
      <h3 id="billing-account">Account</h3>
      <div className="simple-settings-list">
        {!confirmDelete
          ? <button type="button" className="settings-sign-out" onClick={() => setConfirmDelete(true)}>
              <div><strong>Delete account</strong><span>Permanently removes everything you’ve logged</span></div>
            </button>
          : <div className="billing-confirm">
              <strong>Permanently delete Forge?</strong>
              <p>This removes your profile, every workout, top set, cardio session, goal and connection. It cannot be undone, and it does not cancel a subscription — cancel that first, in App Store settings or with Manage payment and cancel above.</p>
              {/* Deleting the account removes the database rows but nothing
                  tells Stripe, so a live web subscription would go on charging
                  a card for an account that no longer exists. Until deletion
                  cancels it server-side, it has to be cancelled first. */}
              {stripeStillBilling
                ? <>
                    <p className="billing-message error">Your web subscription is still set to renew. Cancel it with <strong>Manage payment and cancel</strong> above, then come back to delete your account.</p>
                    <div className="billing-actions"><button type="button" className="button secondary" onClick={() => setConfirmDelete(false)}>Back</button></div>
                  </>
                : <>
                    <label><span>Type <b>DELETE</b> to confirm</span>
                      <input value={deleteText} onChange={event => setDeleteText(event.target.value)} placeholder="DELETE" autoComplete="off" autoFocus />
                    </label>
                    <div className="billing-actions">
                      <button type="button" className="button secondary" onClick={() => { setConfirmDelete(false); setDeleteText(''); }}>Keep my account</button>
                      <button type="button" className="button danger" disabled={deleteText.trim().toUpperCase() !== 'DELETE' || Boolean(busy)} onClick={() => void run('delete', async () => {
                        await deleteMyAccount();
                        window.location.hash = '/login';
                        window.location.reload();
                      })}>{busy === 'delete' ? 'Deleting…' : 'Delete everything'}</button>
                    </div>
                  </>}
            </div>}
      </div>
    </section>
  </div>;
}
