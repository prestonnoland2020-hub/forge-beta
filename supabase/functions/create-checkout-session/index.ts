import Stripe from 'npm:stripe@18';
import { appOrigin, corsFor, errorResponse, HttpError, requireCaller } from '../_shared/guard.ts';

Deno.serve(async (request) => {
  const corsHeaders = corsFor(request);
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const caller = await requireCaller(request);
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);

    const { plan } = await request.json();
    const priceByPlan: Record<string, string | undefined> = {
      pro_monthly: Deno.env.get('STRIPE_PRO_MONTHLY_PRICE_ID'),
      pro_annual: Deno.env.get('STRIPE_PRO_ANNUAL_PRICE_ID'),
    };
    const priceId = priceByPlan[plan];
    if (!priceId) throw new HttpError(400, 'Unsupported billing plan.');

    /* maybeSingle, not single: an athlete whose subscriptions row is missing
       for any reason should get a checkout session, not a thrown error on the
       one screen where they are trying to pay. */
    const { data: existing } = await caller.admin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('owner_id', caller.id)
      .maybeSingle();

    let customerId = existing?.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: caller.email ?? undefined,
        metadata: { owner_id: caller.id },
      });
      customerId = customer.id;
      await caller.admin.from('subscriptions')
        .upsert({ owner_id: caller.id, stripe_customer_id: customerId }, { onConflict: 'owner_id' });
    }

    /* The return URL is the app's own origin, never the request's Origin
       header. Origin is freely settable outside a browser: reflecting it let
       anyone mint a genuine checkout.stripe.com session that returns the payer
       to a site of their choosing -- a handoff that starts on Stripe's real
       domain and ends wherever the attacker wants. It is also a plain open
       redirect on the billing surface.

       Hash routes, because that is how this app is addressed. `/settings/
       billing` was never a route here; a completed payment landed on a
       redirect to Today with no confirmation that anything had happened. */
    const origin = appOrigin(request);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/#/profile?checkout=success`,
      cancel_url: `${origin}/#/profile?checkout=canceled`,
      allow_promotion_codes: true,
      client_reference_id: caller.id,
      subscription_data: {
        metadata: { owner_id: caller.id, plan },
      },
    });

    return Response.json({ url: session.url }, { headers: corsHeaders });
  } catch (error) {
    return errorResponse(error, corsHeaders);
  }
});
