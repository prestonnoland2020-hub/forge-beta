import Stripe from 'npm:stripe@18';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
const cryptoProvider = Stripe.createSubtleCryptoProvider();

function mapStatus(status: Stripe.Subscription.Status) {
  if (status === 'active' || status === 'trialing' || status === 'past_due' || status === 'unpaid') {
    return status;
  }
  return status === 'canceled' ? 'canceled' : 'inactive';
}

Deno.serve(async (request) => {
  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response('Missing Stripe signature.', { status: 400 });

  try {
    const body = await request.text();
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
      undefined,
      cryptoProvider,
    );

    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );

      /* Whose subscription is this? Normally the metadata our own checkout
         function set. But a plan changed in the Stripe billing portal, or a
         subscription created by hand in the dashboard, arrives with no
         metadata at all -- and throwing there used to mean Stripe retried a
         handful of times and then gave up, silently leaving a paying customer
         on the free tier. The customer id is the durable link, so fall back
         to it. */
      let ownerId = subscription.metadata?.owner_id as string | undefined;
      if (!ownerId) {
        const { data: byCustomer } = await admin
          .from('subscriptions')
          .select('owner_id')
          .eq('stripe_customer_id', String(subscription.customer))
          .maybeSingle();
        ownerId = byCustomer?.owner_id as string | undefined;
      }
      if (!ownerId) {
        /* Nothing links this to an athlete. Acknowledge so Stripe stops
           retrying a delivery that can never succeed, and leave a trace. */
        console.error('stripe-webhook-unmatched', subscription.id, String(subscription.customer));
        return Response.json({ received: true, matched: false });
      }

      const item = subscription.items.data[0];
      const priceId = item?.price.id;
      const plan = priceId === Deno.env.get('STRIPE_PRO_ANNUAL_PRICE_ID')
        ? 'pro_annual'
        : priceId === Deno.env.get('STRIPE_PRO_MONTHLY_PRICE_ID')
          ? 'pro_monthly'
          : 'free';

      /* A deleted subscription is over regardless of what its last status
         field said. */
      const status = event.type === 'customer.subscription.deleted'
        ? 'canceled'
        : mapStatus(subscription.status);

      const periodEnd = item?.current_period_end
        ? new Date(item.current_period_end * 1000).toISOString()
        : null;

      const { error } = await admin.from('subscriptions').upsert({
        owner_id: ownerId,
        plan,
        status,
        source: 'stripe',
        stripe_customer_id: String(subscription.customer),
        stripe_subscription_id: subscription.id,
        current_period_end: periodEnd,
        cancel_at_period_end: subscription.cancel_at_period_end,
      }, { onConflict: 'owner_id' });
      if (error) throw error;
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error('stripe-webhook-error', error instanceof Error ? error.message : String(error));
    return new Response('Webhook processing failed.', { status: 400 });
  }
});
