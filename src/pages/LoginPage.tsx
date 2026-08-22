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
      <section className="login-visual"><a className="brand" href="#/"><span className="brand-mark"><i /></span><span>FORGE</span></a><div className="login-copy"><span className="eyebrow accent">TRAIN WITH INTENT</span><h1>Earn every<br/>number.</h1><p>Log the set that matters, build a plan around your real progress, and train alongside people you trust.</p></div><div className="login-points"><span>TRUE 1RM TRACKING</span><span>SMART PROGRESSION</span><span>FRIEND INSIGHTS</span></div></section>
      <section className="login-panel"><div className="login-card">
        <span className="preview-badge">UI PREVIEW · NO LIVE ACCOUNT YET</span>
        <span className="eyebrow">WELCOME TO FORGE</span><h2>Your training.<br/>One account.</h2><p className="muted">Google keeps sign-in simple. Your app username powers friends, sharing, and comparisons.</p>
        <button className="google-button" onClick={handleGoogleLogin}>G&nbsp;&nbsp; Continue with Google</button>
        {error && <div className="error" role="alert">{error}</div>}
        <p className="legal">By continuing, you agree to the future Terms and Privacy Policy. This prototype does not collect account or payment data.</p>
      </div></section>
    </main>
  );
}
