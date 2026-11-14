/* APPLE PUSH, FOR THE IPHONE APP.

   The native app stores its APNs device token in push_subscriptions as
   `apns:<token>` (src/lib/nativePush.ts); every message forge-push composes
   for that row comes here instead of to Web Push. Same payload either way:
   { title, body, tag, url } — the title and body become the banner, the tag
   groups a thread, and the url rides along so a tap opens the right screen.

   Auth is a token: an ES256 JWT signed with the .p8 key made under
   Certificates, IDs & Profiles → Keys, naming the key id and the team id.
   Apple accepts one for up to an hour and refuses one minted too often, so it
   is cached for 50 minutes. */

export type ApnsConfig = { key: string; keyId: string; teamId: string; topic: string };
export type ApnsResult = { endpoint: string; status: number; gone: boolean; note?: string };

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const text = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)));

let cachedJwt: { token: string; at: number; keyId: string } | null = null;
async function jwt(config: ApnsConfig): Promise<string> {
  if (cachedJwt && cachedJwt.keyId === config.keyId && Date.now() - cachedJwt.at < 50 * 60_000) return cachedJwt.token;
  const pem = config.key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), char => char.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const unsigned = `${text({ alg: 'ES256', kid: config.keyId })}.${text({ iss: config.teamId, iat: Math.floor(Date.now() / 1000) })}`;
  /* WebCrypto signs ECDSA in the raw r‖s form JWS wants — no DER unwrapping. */
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned)));
  cachedJwt = { token: `${unsigned}.${b64url(signature)}`, at: Date.now(), keyId: config.keyId };
  return cachedJwt.token;
}

/* TestFlight and App Store builds use Apple's production service; a build run
   straight from Xcode uses the sandbox, and each refuses the other's tokens
   with BadDeviceToken. Production is tried first and the sandbox only on that
   answer, so nobody has to know which kind of build a phone is running. */
const HOSTS = ['https://api.push.apple.com', 'https://api.sandbox.push.apple.com'];

export async function sendApns(endpoint: string, payload: Record<string, unknown>, config: ApnsConfig): Promise<ApnsResult> {
  const token = endpoint.slice('apns:'.length);
  const body = JSON.stringify({
    aps: {
      alert: { title: String(payload.title || 'Forge'), body: String(payload.body || '') },
      sound: 'default',
      ...(payload.tag ? { 'thread-id': String(payload.tag).replace(/-.*$/, '') } : {}),
    },
    url: payload.url || './#/',
  });
  let last: ApnsResult = { endpoint, status: 0, gone: false };
  for (const host of HOSTS) {
    const response = await fetch(`${host}/3/device/${token}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${await jwt(config)}`,
        'apns-topic': config.topic,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        ...(payload.tag ? { 'apns-collapse-id': String(payload.tag).slice(0, 64) } : {}),
      },
      body,
    });
    const reason = response.ok ? '' : String((await response.json().catch(() => ({})) as { reason?: string }).reason || '');
    last = {
      endpoint, status: response.status,
      /* 410 Unregistered: the app was deleted or notifications revoked for
         good. The row goes, as a retired Web Push endpoint does. */
      gone: response.status === 410,
      note: reason ? `${host.includes('sandbox') ? 'sandbox' : 'production'}: ${reason}` : undefined,
    };
    if (!(response.status === 400 && reason === 'BadDeviceToken')) break;
  }
  return last;
}
