import { supabase } from '../../lib/supabase';
import { isNative } from '../billing/platform';
import type { OAuthProvider } from './authService';

/* SIGNING IN INSIDE THE APP.

   On the web, sign-in sends the whole page to Google or Apple and they send it
   back. Inside the iOS app that left the app for Safari and never returned:
   the return address was the app's own internal page, which Safari cannot
   open. (Google also refuses to sign in inside an app's own web view.)

   So the app opens the sign-in page in the system browser sheet that slides up
   over it, and asks to be sent back on a link only this app answers to. iOS
   hands that link to the app, the sheet closes, and the one-time code on the
   link becomes the session. */
export const NATIVE_AUTH_RETURN = 'com.forgetraining.forge://auth';

export async function signInInsideApp(provider: OAuthProvider) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: NATIVE_AUTH_RETURN, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Sign-in could not start. Try again.');
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url: data.url, presentationStyle: 'popover' });
}

async function finishSignIn(link: string) {
  if (!link.startsWith(NATIVE_AUTH_RETURN)) return;
  const { Browser } = await import('@capacitor/browser');
  void Browser.close().catch(() => undefined);
  const url = new URL(link);
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
  const code = url.searchParams.get('code');
  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
    return;
  }
  const access_token = fragment.get('access_token');
  const refresh_token = fragment.get('refresh_token');
  if (access_token && refresh_token) await supabase.auth.setSession({ access_token, refresh_token });
}

/* Called once at startup. A no-op in a browser. */
export function listenForSignInReturn() {
  if (!isNative()) return;
  void import('@capacitor/app').then(({ App }) => {
    void App.addListener('appUrlOpen', ({ url }) => { void finishSignIn(url).catch(error => console.error('[forge] sign-in return failed', error)); });
  });
}
