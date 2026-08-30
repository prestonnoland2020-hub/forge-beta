import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { signInWithProvider, type OAuthProvider } from '../features/auth/authService';
import { useAuth } from '../features/auth/AuthProvider';
import { platform } from '../features/billing/platform';

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

  /* On iOS, Apple leads: it is the platform's own identity, and Apple expects
     its button to be at least as prominent as any third-party one. Everywhere
     else Google leads, because that is what most athletes are already signed
     into. */
  const appleFirst = platform() === 'ios';

  const appleButton = (
    <button className="apple-button" onClick={() => void signIn('apple')} disabled={loading || Boolean(busy)}>
      <svg className="provider-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M16.36 12.78c.02 2.62 2.3 3.49 2.33 3.5-.02.06-.36 1.25-1.2 2.47-.72 1.06-1.47 2.1-2.66 2.13-1.16.02-1.54-.69-2.87-.69-1.33 0-1.75.67-2.85.71-1.14.04-2.01-1.15-2.74-2.2-1.5-2.17-2.64-6.12-1.1-8.8.76-1.32 2.12-2.16 3.6-2.19 1.12-.02 2.18.75 2.87.75.68 0 1.97-.93 3.32-.79.57.02 2.16.23 3.18 1.72-.08.05-1.9 1.11-1.88 3.31M14.2 5.4c.61-.74 1.02-1.77.9-2.79-.88.03-1.94.58-2.57 1.32-.56.65-1.05 1.7-.92 2.7.98.08 1.98-.5 2.59-1.23" />
      </svg>
      {busy === 'apple' ? 'Opening Apple…' : 'Continue with Apple'}
    </button>
  );

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

        <div className="login-providers">
          {appleFirst ? <>{appleButton}{googleButton}</> : <>{googleButton}{appleButton}</>}
        </div>

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
