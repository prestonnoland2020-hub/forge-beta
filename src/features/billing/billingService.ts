import { supabase } from '../../lib/supabase';
import { APPLE_PRODUCT_IDS, billingRail, storeBridge } from './platform';

export type Plan = 'pro_monthly' | 'pro_annual';

export async function getMySubscription() {
  const { data, error } = await supabase.from('subscriptions').select('*').maybeSingle();
  if (error) throw error;
  return data;
}

/* supabase-js reports a non-2xx function response as a FunctionsHttpError and
   puts the body out of reach — which is exactly where our real message lives,
   including the quota refusal the paywall needs to show. Without this, every
   server refusal reached the athlete as "Edge Function returned a non-2xx
   status code". */
export async function readFunctionError(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response }).context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json();
      if (body?.error) return String(body.error);
    } catch { /* not JSON — fall through to the message */ }
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

/* THE WEB RAIL. Stripe Checkout as a full-page redirect; the return URL is
   built server-side from the app's own origin, never from a request header. */
async function beginStripeCheckout(plan: Plan) {
  const { data, error } = await supabase.functions.invoke('create-checkout-session', { body: { plan } });
  if (error) throw new Error(await readFunctionError(error, 'Checkout could not start.'));
  if (!data?.url) throw new Error('Checkout URL was not returned.');
  window.location.assign(data.url);
}

/* THE iOS RAIL. StoreKit takes the payment; the server then asks Apple what
   that transaction actually was and writes the entitlement from Apple's
   answer. The app never tells the server "I paid" and is never believed. */
async function beginApplePurchase(plan: Plan) {
  const store = storeBridge();
  if (!store) throw new Error('In-app purchases need the latest version of Forge from the App Store.');
  const { transactionId } = await store.purchase(APPLE_PRODUCT_IDS[plan]);
  await verifyAppleTransaction(transactionId);
}

export async function verifyAppleTransaction(transactionId: string) {
  const { data, error } = await supabase.functions.invoke('apple-iap', { body: { transactionId } });
  if (error) throw new Error(await readFunctionError(error, 'That purchase could not be confirmed.'));
  return data as { plan: string; status: string; entitled: boolean };
}

export async function beginCheckout(plan: Plan) {
  if (billingRail() === 'apple') return beginApplePurchase(plan);
  return beginStripeCheckout(plan);
}

/* App Store Review Guideline 3.1.1 requires a restore path for any restorable
   purchase: someone who reinstalls, or signs in on a second device, must get
   back what they already paid for without paying twice. */
export async function restorePurchases(): Promise<boolean> {
  const store = storeBridge();
  if (!store) throw new Error('Restoring purchases needs the Forge app from the App Store.');
  const restored = await store.restore();
  if (!restored) return false;
  const result = await verifyAppleTransaction(restored.transactionId);
  return Boolean(result?.entitled);
}

export async function openBillingPortal() {
  const { data, error } = await supabase.functions.invoke('create-billing-portal');
  if (error) throw new Error(await readFunctionError(error, 'The billing portal is unavailable.'));
  if (!data?.url) throw new Error('Billing portal URL was not returned.');
  window.location.assign(data.url);
}

/* Apple owns cancellation for anything bought through the App Store. We cannot
   cancel it on the athlete's behalf, and a button implying otherwise leaves
   someone believing they have stopped paying when they have not. */
export const APPLE_MANAGE_URL = 'https://apps.apple.com/account/subscriptions';
