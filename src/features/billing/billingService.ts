import { supabase } from '../../lib/supabase';

export async function getMySubscription() {
  const { data, error } = await supabase.from('subscriptions').select('*').maybeSingle();
  if (error) throw error;
  return data;
}

export async function beginCheckout(plan: 'pro_monthly' | 'pro_annual') {
  const { data, error } = await supabase.functions.invoke('create-checkout-session', {
    body: { plan },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Checkout URL was not returned.');
  window.location.assign(data.url);
}

export async function openBillingPortal() {
  const { data, error } = await supabase.functions.invoke('create-billing-portal');
  if (error) throw error;
  if (!data?.url) throw new Error('Billing portal URL was not returned.');
  window.location.assign(data.url);
}
