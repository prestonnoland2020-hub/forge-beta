import { corsFor, errorResponse, HttpError, requireCaller } from '../_shared/guard.ts';

/* APPLE IN-APP PURCHASE VERIFICATION.

   App Store Review Guideline 3.1.1: an app may not use its own mechanism to
   unlock features. Forge Pro sold inside the iOS app therefore goes through
   StoreKit, not Stripe, and this is the server half of it.

   The rule that matters: NEVER trust the client's claim that it bought
   something. The app sends only a transaction id. This function asks Apple
   directly, over an authenticated TLS connection, what that transaction
   actually is -- and writes the entitlement from Apple's answer. A jailbroken
   device faking a StoreKit response never reaches the database, because the
   database is only ever written from what came back from Apple's own host.

   Setup this needs in App Store Connect (see APPLE_IAP.md):
     APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID, APPLE_IAP_PRIVATE_KEY (.p8 body),
     APPLE_BUNDLE_ID, APPLE_PRO_MONTHLY_PRODUCT_ID, APPLE_PRO_ANNUAL_PRODUCT_ID */

const PRODUCTION_HOST = 'https://api.storekit.itunes.apple.com';
const SANDBOX_HOST = 'https://api.storekit-sandbox.itunes.apple.com';

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/* The App Store Server API authenticates with a short-lived ES256 JWT signed
   by the private key downloaded from App Store Connect. */
async function appleAuthToken(): Promise<string> {
  const keyId = Deno.env.get('APPLE_IAP_KEY_ID');
  const issuerId = Deno.env.get('APPLE_IAP_ISSUER_ID');
  const privateKeyPem = Deno.env.get('APPLE_IAP_PRIVATE_KEY');
  const bundleId = Deno.env.get('APPLE_BUNDLE_ID');
  if (!keyId || !issuerId || !privateKeyPem || !bundleId) {
    throw new HttpError(503, 'In-app purchases are not configured yet.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 600,
    aud: 'appstoreconnect-v1',
    bid: bundleId,
  };

  const encoder = new TextEncoder();
  const signingInput = `${base64url(encoder.encode(JSON.stringify(header)))}.${base64url(encoder.encode(JSON.stringify(payload)))}`;

  const der = Uint8Array.from(
    atob(privateKeyPem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')),
    character => character.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(signingInput));
  /* WebCrypto returns ECDSA signatures as raw r||s, which is exactly the JWS
     ES256 encoding -- no DER unwrapping needed. */
  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

/* Apple returns transaction and renewal records as JWS. The signature chain is
   Apple's; we read the payload rather than re-verifying it, because we did not
   receive this from the client -- we fetched it from Apple's host ourselves
   over TLS with our own credentials. */
function decodeJws(jws: string): Record<string, unknown> {
  const segment = jws.split('.')[1];
  if (!segment) throw new HttpError(502, 'Apple returned an unreadable transaction.');
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const json = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return JSON.parse(decodeURIComponent(escape(json)));
}

async function fetchSubscriptionStatus(transactionId: string, token: string) {
  /* A build under review runs against sandbox while the same binary in the
     store runs against production, and there is no reliable flag to tell them
     apart. Apple's documented answer is to try production and fall back on
     21007/404 -- which is also what makes TestFlight and App Review work. */
  for (const host of [PRODUCTION_HOST, SANDBOX_HOST]) {
    const response = await fetch(`${host}/inApps/v1/subscriptions/${encodeURIComponent(transactionId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) return await response.json();
    if (response.status !== 404) {
      const detail = await response.text();
      console.error('apple-iap-status', host, response.status, detail.slice(0, 300));
      if (host === SANDBOX_HOST) throw new HttpError(502, 'Apple could not confirm that purchase.');
    }
  }
  throw new HttpError(404, 'Apple has no record of that purchase.');
}

Deno.serve(async request => {
  const corsHeaders = corsFor(request);
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const caller = await requireCaller(request);
    const { transactionId } = await request.json();
    const id = String(transactionId || '').trim();
    if (!id || !/^[0-9]{1,32}$/.test(id)) throw new HttpError(400, 'A valid transaction is required.');

    const token = await appleAuthToken();
    const status = await fetchSubscriptionStatus(id, token);

    /* Walk every subscription group Apple returned and keep the newest
       transaction that is one of ours. */
    /* Apple's numeric status travels on the same lastTransactions entry as the
       transaction it describes, so it has to be carried along with the entry we
       actually pick. Reading it off the first group's first entry — which is a
       different subscription whenever an athlete has ever held more than one —
       would have entitled or denied people based on somebody else's row. */
    let best: { transaction: Record<string, unknown>; renewal: Record<string, unknown>; status: number } | null = null;
    for (const group of (status.data || []) as Array<Record<string, unknown>>) {
      for (const entry of (group.lastTransactions || []) as Array<Record<string, unknown>>) {
        const transaction = decodeJws(String(entry.signedTransactionInfo || ''));
        const renewal = decodeJws(String(entry.signedRenewalInfo || ''));
        if (String(transaction.bundleId) !== Deno.env.get('APPLE_BUNDLE_ID')) continue;
        if (!best || Number(transaction.purchaseDate || 0) > Number(best.transaction.purchaseDate || 0)) {
          best = { transaction, renewal, status: Number(entry.status ?? 0) };
        }
      }
    }
    if (!best) throw new HttpError(404, 'That purchase does not belong to Forge.');

    const productId = String(best.transaction.productId || '');
    const plan = productId === Deno.env.get('APPLE_PRO_ANNUAL_PRODUCT_ID')
      ? 'pro_annual'
      : productId === Deno.env.get('APPLE_PRO_MONTHLY_PRODUCT_ID')
        ? 'pro_monthly'
        : null;
    if (!plan) throw new HttpError(400, 'That product is not a Forge Pro subscription.');

    const expiresMs = Number(best.transaction.expiresDate || 0);
    const revoked = Boolean(best.transaction.revocationDate);
    /* Apple's numeric status: 1 active, 2 expired, 3 in billing retry,
       4 in billing grace period, 5 revoked. Grace still entitles — the card
       failed, Apple is retrying, and taking the app away mid-retry is how you
       turn a payment hiccup into a cancellation. */
    const appleStatus = best.status;

    const entitled = !revoked && (expiresMs > Date.now() || appleStatus === 4);
    const subscriptionStatus = revoked
      ? 'canceled'
      : entitled
        ? 'active'
        : appleStatus === 3
          ? 'past_due'
          : 'canceled';

    const originalTransactionId = String(best.transaction.originalTransactionId || id);

    /* One Apple purchase entitles one Forge account. If this transaction is
       already attached elsewhere, say so plainly rather than silently moving
       a paid subscription between accounts. */
    const { data: claimed } = await caller.admin
      .from('subscriptions')
      .select('owner_id')
      .eq('apple_original_transaction_id', originalTransactionId)
      .maybeSingle();
    if (claimed && claimed.owner_id !== caller.id) {
      throw new HttpError(409, 'That subscription is already linked to another Forge account.');
    }

    const { error } = await caller.admin.from('subscriptions').upsert({
      owner_id: caller.id,
      plan,
      status: subscriptionStatus,
      source: 'apple',
      apple_original_transaction_id: originalTransactionId,
      apple_product_id: productId,
      current_period_end: expiresMs ? new Date(expiresMs).toISOString() : null,
      cancel_at_period_end: best.renewal.autoRenewStatus === 0,
    }, { onConflict: 'owner_id' });
    if (error) throw error;

    return Response.json({
      plan,
      status: subscriptionStatus,
      entitled,
      currentPeriodEnd: expiresMs ? new Date(expiresMs).toISOString() : null,
    }, { headers: corsHeaders });
  } catch (error) {
    return errorResponse(error, corsHeaders);
  }
});
