import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { signInWithProvider, type OAuthProvider } from '../features/auth/authService';
import { useAuth } from '../features/auth/AuthProvider';
import { isDemoMode } from '../lib/env';
import { ForgeStrikeMark } from '../components/ForgeStrikeMark';
// Roboto Medium is the face Google specifies for its button label; bundled so it renders offline in the iOS shell too.
import '@fontsource/roboto/latin-500.css';

export function LoginPage() {
  const { user, loading } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<OAuthProvider | null>(null);

  if (!loading && user) return <Navigate to="/" replace />;

  async function signIn(provider: OAuthProvider) {
    try {
      setError('');
      setBusy(provider);
      await signInWithProvider(provider);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign-in failed.');
      setBusy(null);
    }
  }

  /* SIGN IN WITH APPLE IS BEHIND A SWITCH, NOT GONE.

     The button was on this screen once and did not complete a sign-in, which
     is worse than not offering it: the athlete taps the more prominent of the
     two options, lands nowhere, and has no reason to trust the other one. So
     it shows only where it can work — every preview build, and a real build
     with VITE_APPLE_SIGN_IN=true, which is set once Apple is configured in
     Supabase and verified on a real device.

     It has to come back before submission: App Review Guideline 4.8 asks an
     app using a third-party login to also offer one that limits collection to
     name and email and can hide the email. Sign in with Apple is that login. */
  const appleButton = (isDemoMode || import.meta.env.VITE_APPLE_SIGN_IN === 'true') && (
    <button className="apple-button" onClick={() => void signIn('apple')} disabled={loading || Boolean(busy)}>
      {/* A drawn mark, not the U+F8FF glyph — that character exists only in
          Apple's own fonts, so it vanished in Chrome and on Android. */}
      <svg className="apple-mark" aria-hidden="true" viewBox="0 0 814 1000" width="17" height="20" fill="currentColor"><path d="M788 341c-6 4-108 62-108 190 0 148 130 200 134 202-1 3-21 72-69 142-43 62-88 124-156 124s-86-40-165-40c-77 0-104 41-167 41s-106-57-156-127C43 791 0 674 0 563c0-178 116-272 230-272 61 0 111 40 149 40 37 0 94-42 163-42 26 0 120 2 182 92zM555 175c28-34 49-81 49-127 0-7-1-13-2-19-46 2-101 31-134 70-26 30-50 76-50 124 0 7 1 15 2 17 3 1 8 1 12 1 41 0 93-28 123-66z" /></svg>
      {busy === 'apple' ? 'Opening Apple…' : 'Continue with Apple'}
    </button>
  );
  /* GOOGLE'S OWN BUTTON, DRAWN TO ITS BRANDING GUIDELINES.

     Google allows only its approved labels on this button, so the words never
     change while it works — the wait shows as the disabled state and
     aria-busy instead of "Opening Google…". The G is Google's four-colour mark
     exactly as its own rendered button draws it; it is never recoloured, in
     either theme. It stays a plain button on the Supabase OAuth redirect, so
     the web build and the iOS shell behave the same. */
  const googleButton = (
    <button className="google-button" onClick={() => void signIn('google')} disabled={loading || Boolean(busy)} aria-busy={loading || busy === 'google'}>
      <svg className="google-mark" aria-hidden="true" viewBox="0 0 48 48" width="20" height="20"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" /><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" /></svg>
      <span className="google-label">Continue with Google</span>
    </button>
  );

  return (
    <main className="login-page">
      <a className="login-brand" href="#/" aria-label="Forge home">
        <ForgeStrikeMark />
        <span className="strike-word"><span>F</span><span>O</span><span>R</span><span>G</span><span>E</span></span>
      </a>

      <section className="login-card" aria-labelledby="login-title">
        <span className="eyebrow accent">YOUR TRAINING, CONNECTED</span>
        <h1 id="login-title">Show up.<br />Forge ahead.</h1>
        <p>Today’s workout, your progress, and one coach that learns from every session.</p>

        <div className="login-providers">{appleButton}{googleButton}</div>

        {error && <div className="login-error" role="alert">{error}</div>}
        <p className="login-note">Secure sign-in. Your training stays with your account.</p>
        {/* Guideline 5.1.1(i) wants the privacy policy reachable inside the
            app, and sign-in is the first screen where it can be. */}
        <p className="login-legal">
          By continuing you agree to the <a href="#/legal/terms">Terms</a> and <a href="#/legal/privacy">Privacy Policy</a>. See also the <a href="#/legal/health">Consumer Health Data Notice</a> and <a href="#/legal/cookies">Cookie Policy</a>.
        </p>
      </section>

      <p className="login-footer">TRAIN WITH INTENT</p>
    </main>
  );
}
