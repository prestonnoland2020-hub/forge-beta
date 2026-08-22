import Stripe from 'npm:stripe@18';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) throw new Error('Authentication required.');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) throw new Error('Authentication required.');

    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: subscription, error } = await admin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('owner_id', userData.user.id)
      .single();
    if (error || !subscription?.stripe_customer_id) throw new Error('No billing account exists yet.');

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
    const origin = request.headers.get('origin') ?? Deno.env.get('PUBLIC_APP_URL')!;
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${origin}/settings/billing`,
    });

    return Response.json({ url: session.url }, { headers: corsHeaders });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Billing portal failed.' },
      { status: 400, headers: corsHeaders },
    );
  }
});
