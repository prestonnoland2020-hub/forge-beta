import Stripe from 'npm:stripe@18';
import { appOrigin, corsFor, errorResponse, HttpError, requireCaller } from '../_shared/guard.ts';

Deno.serve(async (request) => {
  const corsHeaders = corsFor(request);
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const caller = await requireCaller(request);
    const { data: subscription } = await caller.admin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('owner_id', caller.id)
      .maybeSingle();
    if (!subscription?.stripe_customer_id) {
      throw new HttpError(404, 'There is no billing account to manage yet.');
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
    /* Own origin only -- see the note in create-checkout-session. */
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${appOrigin(request)}/#/profile`,
    });

    return Response.json({ url: session.url }, { headers: corsHeaders });
  } catch (error) {
    return errorResponse(error, corsHeaders);
  }
});
