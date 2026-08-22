import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { signInWithGoogle } from '../features/auth/authService';
import { useAuth } from '../features/auth/AuthProvider';

export function LoginPage() {
  const { user, loading } = useAuth();
  const [error, setError] = useState('');

  if (!loading && user) return <Navigate to="/" replace />;

  async function handleGoogleLogin() {
    try {
      setError('');
      await signInWithGoogle();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign-in failed.');
    }
  }

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

        <button className="google-button" onClick={handleGoogleLogin} disabled={loading}>
          <span className="google-mark" aria-hidden="true">G</span>
          {loading ? 'Checking your account…' : 'Continue with Google'}
        </button>

        {error && <div className="login-error" role="alert">{error}</div>}
        <p className="login-note">Secure sign-in. Your training stays with your account.</p>
      </section>

      <p className="login-footer">TRAIN WITH INTENT</p>
    </main>
  );
}
