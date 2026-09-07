/* WEB PUSH IS EITHER EXACTLY RIGHT OR SILENTLY DEAD. A wrong VAPID signature
   or a mis-derived key does not throw anywhere in Forge — Apple simply answers
   403 or 400 and nobody's phone ever buzzes. So the edge function's crypto is
   verified here the only way that means anything: sign a token and check it
   against the public half, then encrypt a payload to a freshly generated
   subscriber keypair and decrypt it back the way a browser would. */
import { execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = join(mkdtempSync(join(tmpdir(), 'forge-push-')), 'webpush.mjs');
execFileSync('npx', ['esbuild', 'supabase/functions/forge-push/webpush.ts', '--format=esm', '--platform=neutral', `--outfile=${out}`], { stdio: 'pipe' });
const { sendPush } = await import(out);

const b64url = b => Buffer.from(b).toString('base64url');
const fromB64url = v => new Uint8Array(Buffer.from(v, 'base64url'));
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

/* A VAPID pair, and a subscriber as a browser would mint one. */
const server = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const serverJwk = await webcrypto.subtle.exportKey('jwk', server.privateKey);
const vapid = {
  publicKey: b64url(new Uint8Array(await webcrypto.subtle.exportKey('raw', server.publicKey))),
  privateKey: serverJwk.d,
  subject: 'mailto:prestonnoland2020@gmail.com',
};
const sub = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const subPublic = new Uint8Array(await webcrypto.subtle.exportKey('raw', sub.publicKey));
const authSecret = webcrypto.getRandomValues(new Uint8Array(16));

let captured = null;
globalThis.fetch = async (url, init) => { captured = { url, headers: init.headers, body: new Uint8Array(init.body) }; return { status: 201 }; };

const payload = { title: 'Your turn', body: 'Adam trained today. You haven’t logged yet.' };
const result = await sendPush({ endpoint: 'https://web.push.apple.com/abc123', p256dh: b64url(subPublic), auth: b64url(authSecret) }, payload, vapid);

check('the push is posted and accepted', result.status === 201);
check('content-encoding is aes128gcm', captured.headers['Content-Encoding'] === 'aes128gcm');
const authHeader = captured.headers.Authorization;
check('the header is a VAPID token', /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/.test(authHeader), authHeader.slice(0, 34));
const [, token] = authHeader.match(/t=([^,]+)/);
const [head, claimPart, signature] = token.split('.');
const claims = JSON.parse(Buffer.from(claimPart, 'base64url').toString());
check('audience is the push service origin', claims.aud === 'https://web.push.apple.com', claims.aud);
check('subject is one Apple accepts', /^(mailto:|https:)/.test(claims.sub), claims.sub);
check('the token expires inside 24 hours', claims.exp - Math.floor(Date.now() / 1000) <= 86400);
const raw = fromB64url(vapid.publicKey);
const verifyKey = await webcrypto.subtle.importKey('jwk',
  { kty: 'EC', crv: 'P-256', x: b64url(raw.slice(1, 33)), y: b64url(raw.slice(33, 65)), ext: true },
  { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
check('the signature verifies against the public key',
  await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verifyKey, fromB64url(signature), new TextEncoder().encode(`${head}.${claimPart}`)));

/* And the body, decrypted as the subscriber (RFC 8291). */
const body = captured.body;
const salt = body.slice(0, 16);
const serverPublic = body.slice(21, 21 + body[20]);
const ciphertext = body.slice(21 + body[20]);
const shared = new Uint8Array(await webcrypto.subtle.deriveBits(
  { name: 'ECDH', public: await webcrypto.subtle.importKey('raw', serverPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []) }, sub.privateKey, 256));
const hkdf = async (s, ikm, info, length) => {
  const key = await webcrypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await webcrypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: s, info }, key, length * 8));
};
const enc = new TextEncoder();
const concat = (...parts) => { const o = new Uint8Array(parts.reduce((t, p) => t + p.length, 0)); let at = 0; for (const p of parts) { o.set(p, at); at += p.length; } return o; };
const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), subPublic, serverPublic), 32);
const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
const plain = new Uint8Array(await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce },
  await webcrypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), ciphertext));
check('the subscriber decrypts the payload', JSON.parse(new TextDecoder().decode(plain.slice(0, -1))).body === payload.body);
check('the record ends with the 0x02 delimiter', plain[plain.length - 1] === 2);

/* A retired install is reported so its row can be swept, not retried forever. */
globalThis.fetch = async () => ({ status: 410 });
check('a 410 marks the subscription gone',
  (await sendPush({ endpoint: 'https://web.push.apple.com/x', p256dh: b64url(subPublic), auth: b64url(authSecret) }, payload, vapid)).gone);

console.log(fails ? `\n${fails} check(s) failed` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
