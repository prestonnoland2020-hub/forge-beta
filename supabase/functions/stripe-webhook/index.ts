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
      const ownerId = subscription.metadata.owner_id;
      if (!ownerId) throw new Error('Subscription is missing owner_id metadata.');

      const priceId = subscription.items.data[0]?.price.id;
      const plan = priceId === Deno.env.get('STRIPE_PRO_ANNUAL_PRICE_ID')
        ? 'pro_annual'
        : priceId === Deno.env.get('STRIPE_PRO_MONTHLY_PRICE_ID')
          ? 'pro_monthly'
          : 'free';

      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const { error } = await admin.from('subscriptions').upsert({
        owner_id: ownerId,
        plan,
        status: mapStatus(subscription.status),
        stripe_customer_id: String(subscription.customer),
        stripe_subscription_id: subscription.id,
        current_period_end: new Date(subscription.items.data[0].current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
      });
      if (error) throw error;
    }

    return Response.json({ received: true });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Webhook failed.', { status: 400 });
  }
});
