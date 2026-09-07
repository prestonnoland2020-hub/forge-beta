/* WEB PUSH, WRITTEN OUT. The npm libraries for this pull in Node crypto and
   do not run cleanly on Deno's edge runtime, and the protocol is small enough
   to state plainly: sign a JWT that proves who is sending (VAPID, RFC 8292),
   encrypt the payload to the subscriber's public key (aes128gcm, RFC 8291),
   and POST the ciphertext to the endpoint the browser gave you.

   Apple is stricter than the rest: the VAPID `sub` must be a mailto: address
   or an https URL, or the push service answers 403. */

const b64url = (bytes: Uint8Array | ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (value: string) => {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from([...atob(padded)].map(char => char.charCodeAt(0)));
};
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0; for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
};

/* The VAPID private key arrives as the raw `d` scalar; WebCrypto wants a JWK,
   which needs the matching public coordinates alongside it. */
async function vapidKey(privateD: string, publicKey: string): Promise<CryptoKey> {
  const raw = fromB64url(publicKey);
  const jwk: JsonWebKey = {
    kty: 'EC', crv: 'P-256', d: privateD,
    x: b64url(raw.slice(1, 33)), y: b64url(raw.slice(33, 65)), ext: true,
  };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

async function vapidHeader(endpoint: string, publicKey: string, privateD: string, subject: string) {
  const audience = new URL(endpoint).origin;
  const header = b64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(new TextEncoder().encode(JSON.stringify({
    aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject,
  })));
  const key = await vapidKey(privateD, publicKey);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' },
    key, new TextEncoder().encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${publicKey}`;
}

const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) => {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
};

/* RFC 8291: an ephemeral key agreement with the subscriber, mixed with the
   auth secret they generated, produces the content encryption key. */
async function encrypt(payload: string, p256dh: string, auth: string) {
  const subscriberKey = fromB64url(p256dh);
  const authSecret = fromB64url(auth);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const localPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const subscriberPublic = await crypto.subtle.importKey('raw', subscriberKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: subscriberPublic }, local.privateKey, 256));

  const encoder = new TextEncoder();
  const prkInfo = concat(encoder.encode('WebPush: info\0'), subscriberKey, localPublic);
  const ikm = await hkdf(authSecret, shared, prkInfo, 32);
  const contentKey = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']);
  /* A single record, padded with the 0x02 delimiter that marks the last one. */
  const plaintext = concat(encoder.encode(payload), new Uint8Array([2]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext));

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  return concat(salt, recordSize, new Uint8Array([localPublic.length]), localPublic, ciphertext);
}

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type PushResult = { endpoint: string; status: number; gone: boolean };

export async function sendPush(
  target: PushTarget, payload: Record<string, unknown>,
  vapid: { publicKey: string; privateKey: string; subject: string },
): Promise<PushResult> {
  const body = await encrypt(JSON.stringify(payload), target.p256dh, target.auth);
  const response = await fetch(target.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(target.endpoint, vapid.publicKey, vapid.privateKey, vapid.subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'normal',
    },
    body,
  });
  /* 404 and 410 are the push service saying this install is gone for good —
     the only responses worth acting on, by deleting the row. */
  return { endpoint: target.endpoint, status: response.status, gone: response.status === 404 || response.status === 410 };
}
