import { supabase } from '../../lib/supabase';
import { isDemoMode } from '../../lib/env';

export async function signInWithGoogle() {
  if (isDemoMode) {
    window.location.hash = '/';
    return;
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
    },
  });
  if (error) throw error;
}

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
