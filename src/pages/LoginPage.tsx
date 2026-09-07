import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { signInWithProvider, type OAuthProvider } from '../features/auth/authService';
import { useAuth } from '../features/auth/AuthProvider';

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

  /* SIGN IN WITH APPLE IS NOT OFFERED HERE.

     The button was on this screen and did not complete a sign-in, which is
     worse than not offering it: the athlete taps the more prominent of the two
     options, lands nowhere, and has no reason to trust the other one. Google
     is the single route until Apple is configured end to end and verified on
     a real device.

     Worth knowing before it comes back: App Review Guideline 4.8 asks an app
     using a third-party login to also offer a login that limits data
     collection to name and email, hides the email if the user wants, and does
     no advertising tracking without consent. Sign in with Apple is the usual
     way to satisfy it. That makes this a submission blocker to resolve, not a
     decision to leave settled. */
  const googleButton = (
    <button className="google-button" onClick={() => void signIn('google')} disabled={loading || Boolean(busy)}>
      <span className="google-mark" aria-hidden="true">G</span>
      {loading ? 'Checking your account…' : busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
    </button>
  );

  return (
    <main className="login-page">
      <a className="login-brand" href="#/" aria-label="Forge home">
        <span className="brand-mark"><i /></span>
        <span>FORGE</span>
      </a>

      <section className="login-card" aria-labelledby="login-title">
        <span className="eyebrow accent">YOUR TRAINING, CONNECTED</span>
        <h1 id="login-title">Show up.<br />Forge ahead.</h1>
        <p>Today’s workout, your progress, and one coach that learns from every session.</p>

        <div className="login-providers">{googleButton}</div>

        {error && <div className="login-error" role="alert">{error}</div>}
        <p className="login-note">Secure sign-in. Your training stays with your account.</p>
        {/* Guideline 5.1.1(i) wants the privacy policy reachable inside the
            app, and sign-in is the first screen where it can be. */}
        <p className="login-legal">
          By continuing you agree to the <a href="#/legal/terms">Terms</a> and <a href="#/legal/privacy">Privacy Policy</a>.
        </p>
      </section>

      <p className="login-footer">TRAIN WITH INTENT</p>
    </main>
  );
}
