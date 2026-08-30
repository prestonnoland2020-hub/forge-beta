import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { fetchEntitlements, fetchSubscription, FREE_FALLBACK, remaining, type Entitlements, type SubscriptionRow } from './entitlements';

/* One source of truth for "what can this account do", shared by the billing
   screen, the coach's remaining-questions line, and the paywall that appears
   when the server says no.

   Deliberately NOT a gate. Nothing here decides whether an expensive request
   is sent — the server counts before it spends, and the client's copy of the
   count is a courtesy so the athlete is not surprised. When the two disagree,
   the server is right and this refreshes. */

type Value = {
  entitlements: Entitlements;
  subscription: SubscriptionRow | null;
  loading: boolean;
  isPro: boolean;
  refresh: () => Promise<void>;
  /* Set when the server refuses on quota, so any screen can show the paywall
     with the reason the server actually gave. */
  paywall: { message: string; upgrade: boolean } | null;
  showPaywall: (message: string, upgrade: boolean) => void;
  dismissPaywall: () => void;
};

const Context = createContext<Value | null>(null);

export function BillingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [entitlements, setEntitlements] = useState<Entitlements>(FREE_FALLBACK);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [paywall, setPaywall] = useState<{ message: string; upgrade: boolean } | null>(null);

  const refresh = useCallback(async () => {
    if (!user) { setEntitlements(FREE_FALLBACK); setSubscription(null); setLoading(false); return; }
    const [next, row] = await Promise.all([fetchEntitlements(), fetchSubscription()]);
    setEntitlements(next);
    setSubscription(row);
    setLoading(false);
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  /* Returning from Stripe Checkout lands here with ?checkout=success, but the
     webhook that grants the entitlement may not have arrived yet. Poll briefly
     rather than showing a paying customer the free tier. */
  useEffect(() => {
    if (!user) return;
    if (!/checkout=success/.test(window.location.hash + window.location.search)) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      void refresh();
      if (attempts >= 6) window.clearInterval(timer);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [user, refresh]);

  const value = useMemo<Value>(() => ({
    entitlements,
    subscription,
    loading,
    isPro: entitlements.tier === 'pro' || entitlements.tier === 'founder',
    refresh,
    paywall,
    showPaywall: (message: string, upgrade: boolean) => setPaywall({ message, upgrade }),
    dismissPaywall: () => setPaywall(null),
  }), [entitlements, subscription, loading, refresh, paywall]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useBilling() {
  const value = useContext(Context);
  if (!value) throw new Error('useBilling must be used inside BillingProvider');
  return value;
}

/* How many of a given endpoint's calls are left today, or null when unmetered.
   Used to show "2 coach questions left today" before the athlete asks. */
export function useRemaining(endpoint: string): number | null {
  const { entitlements } = useBilling();
  return remaining(entitlements.endpoints[endpoint]);
}
