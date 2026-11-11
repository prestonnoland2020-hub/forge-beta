import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/* Inside the iOS/Android app the sign-in page opens in a system browser sheet
   and comes back through a link (see features/auth/nativeSignIn). PKCE returns
   a one-time code on that link instead of the tokens themselves. */
const insideNativeApp = Boolean((globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());

export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: insideNativeApp ? 'pkce' : 'implicit',
  },
});
