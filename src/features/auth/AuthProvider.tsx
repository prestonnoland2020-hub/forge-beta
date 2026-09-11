import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { isDemoMode } from '../../lib/env';
import { signOut as signOutOfSupabase } from './authService';

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

/* WHOSE DATA IS ON THIS DEVICE. Training history, goals, the split, the AI
   block and the library are cached in localStorage under fixed keys — the
   right choice for a phone that is one athlete's, and a leak the moment a
   second account signs in on the same browser: the first athlete's goals
   merged into the second's, their history showed until the server answered,
   and the next save wrote it under the new owner. The cache belongs to one
   account at a time; a different account arriving clears it first.
   Appearance is the device's, not the account's, and stays. */
const LAST_USER_KEY = 'forge-last-user-id';
const DEVICE_KEYS = ['forge-appearance-v5', 'forge-appearance-v4', 'forge-appearance-v3', 'forge-appearance-v2', LAST_USER_KEY];
export function clearAccountCache() {
  try {
    Object.keys(localStorage)
      .filter(key => key.startsWith('forge-') && !DEVICE_KEYS.includes(key))
      .forEach(key => localStorage.removeItem(key));
  } catch { /* storage unavailable — nothing cached to leak */ }
}
/* Returns true when a DIFFERENT account was here before — the cache is
   already cleared by then, and the app needs a fresh start to forget the
   state its providers read at mount. */
function claimDevice(userId: string): boolean {
  try {
    const last = localStorage.getItem(LAST_USER_KEY);
    if (last && last !== userId) { clearAccountCache(); localStorage.setItem(LAST_USER_KEY, userId); return true; }
    localStorage.setItem(LAST_USER_KEY, userId);
  } catch { /* ignore */ }
  return false;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const previewSession = isDemoMode ? ({
    user: { id: 'preview-user', email: 'preston@example.com' },
  } as Session) : null;
  const [session, setSession] = useState<Session | null>(previewSession);
  const [loading, setLoading] = useState(!isDemoMode);

  useEffect(() => {
    if (isDemoMode) return;
    let active = true;

    /* THE USER IS THE SAME PERSON UNTIL THEY ARE NOT. auth-js hands over a
       freshly parsed session on every event — token refresh, tab focus,
       INITIAL_SESSION — and each one used to become a new `user` object,
       which every provider keyed its hydration on. An hour into a workout
       the JWT refreshed, the profile reloaded, the gate showed "Loading your
       training profile…", and the log with its unsaved sets unmounted. The
       session only changes here when the account does. */
    const adopt = (next: Session | null) => {
      setSession(current => {
        if (!next) return null;
        if (current?.user?.id === next.user?.id) return current;
        if (next.user?.id && claimDevice(next.user.id)) { window.location.reload(); return current; }
        return next;
      });
      setLoading(false);
    };

    void supabase.auth.getSession().then(({ data }) => { if (active) adopt(data.session); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => adopt(nextSession));

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  /* NOTHING UNSAVED IS THROWN AWAY, AND NOTHING IS CLEARED UNTIL THE SIGN-OUT
     ACTUALLY HAPPENS.

     This wiped the cache first and signed out second. Two ways that cost
     someone their training. A session logged with no signal sits in the
     outbox — the banner says it is still saved on this device — and sign-out
     deleted it under a dialog reading "Your training is saved to your
     account", when it was not. And when the sign-out itself failed (offline is
     exactly when the outbox has something in it), the cache was already gone
     while the session stayed live.

     So: refuse while work is pending, sign out first, clear only once it has
     succeeded. */
  const signOut = useCallback(async () => {
    let pending = 0;
    try { pending = (JSON.parse(localStorage.getItem('forge-workout-pending-v1') || '[]') as unknown[]).length; } catch { pending = 0; }
    if (pending) {
      throw new Error(`${pending === 1 ? 'One training day has' : `${pending} training days have`} not reached your account yet. Stay signed in until the sync finishes, or they will be lost.`);
    }
    await signOutOfSupabase();
    clearAccountCache();
    try { localStorage.removeItem(LAST_USER_KEY); } catch { /* ignore */ }
    if (!isDemoMode) { setSession(null); window.location.hash = '/login'; }
  }, []);

  const value = useMemo(
    () => ({ session, user: session?.user ?? null, loading, signOut }),
    [session, loading, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
