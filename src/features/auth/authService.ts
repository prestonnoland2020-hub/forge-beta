import { supabase } from '../../lib/supabase';
import { isDemoMode } from '../../lib/env';

/* SIGN IN WITH APPLE IS NOT OPTIONAL.

   App Store Review Guideline 4.8: an app that uses a third-party or social
   login to set up the primary account must ALSO offer an equivalent login
   that limits collection to name and email, lets the user keep their email
   address private, and does not collect in-app activity for advertising.
   Google Sign-In on its own is a rejection at review. Apple's qualifies — and
   it gives iOS users the private-relay address, which a good number of them
   will prefer anyway.

   Both providers resolve to the same Supabase identity, so an athlete who
   signed up with Google and later taps Apple with the same verified email
   lands in their existing account rather than a second empty one. */
export type OAuthProvider = 'google' | 'apple';

export async function signInWithProvider(provider: OAuthProvider) {
  if (isDemoMode) {
    window.location.hash = '/';
    return;
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
    },
  });
  if (error) throw error;
}

export const signInWithGoogle = () => signInWithProvider('google');
export const signInWithApple = () => signInWithProvider('apple');

export async function signOut() {
  if (isDemoMode) {
    window.location.hash = '/login';
    return;
  }
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function beginTotpEnrollment() {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Workout Log Authenticator',
  });
  if (error) throw error;
  return data;
}

export async function verifyTotpEnrollment(factorId: string, code: string) {
  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error) throw challenge.error;

  const verification = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code,
  });
  if (verification.error) throw verification.error;
  return verification.data;
}
