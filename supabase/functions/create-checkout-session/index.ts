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
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) throw new Error('Authentication required.');

    const { plan } = await request.json();
    const priceByPlan: Record<string, string | undefined> = {
      pro_monthly: Deno.env.get('STRIPE_PRO_MONTHLY_PRICE_ID'),
      pro_annual: Deno.env.get('STRIPE_PRO_ANNUAL_PRICE_ID'),
    };
    const priceId = priceByPlan[plan];
    if (!priceId) throw new Error('Unsupported billing plan.');

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: existing } = await admin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('owner_id', userData.user.id)
      .single();

    let customerId = existing?.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData.user.email,
        metadata: { owner_id: userData.user.id },
      });
      customerId = customer.id;
      await admin.from('subscriptions').update({
        stripe_customer_id: customerId,
      }).eq('owner_id', userData.user.id);
    }

    const origin = request.headers.get('origin') ?? Deno.env.get('PUBLIC_APP_URL')!;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/settings/billing?checkout=success`,
      cancel_url: `${origin}/settings/billing?checkout=canceled`,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { owner_id: userData.user.id, plan },
      },
    });

    return Response.json({ url: session.url }, { headers: corsHeaders });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Checkout failed.' },
      { status: 400, headers: corsHeaders },
    );
  }
});
