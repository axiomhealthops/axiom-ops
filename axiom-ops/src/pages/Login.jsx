import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';

export default function Login() {
  const { user, signIn, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  async function handleLogin(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    const { error } = await signIn(email, password);
    if (error) setError(error.message);
    setSubmitting(false);
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #F9F5F4 0%, #FDF0EC 50%, #F5F0EF 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'DM Sans', sans-serif",
      position: 'relative', overflow: 'hidden'
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        .login-input {
          width: 100%; background: #fff;
          border: 1.5px solid #E8D5D0; border-radius: 10px;
          padding: 13px 16px; color: #1A1A1A; font-size: 14px;
          font-family: 'DM Sans', sans-serif; outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .login-input:focus { border-color: #D94F2B; box-shadow: 0 0 0 3px rgba(217,79,43,0.1); }
        .login-input::placeholder { color: #BBA8A4; }
        .login-btn {
          width: 100%; padding: 14px; border: none; border-radius: 10px;
          background: linear-gradient(135deg, #D94F2B, #8B1A10);
          color: #fff; font-size: 14px; font-weight: 700; font-family: 'DM Sans', sans-serif;
          cursor: pointer; letter-spacing: 0.04em;
          transition: all 0.2s; box-shadow: 0 4px 16px rgba(217,79,43,0.35);
        }
        .login-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(217,79,43,0.45); }
        .login-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>

      {/* Decorative background shapes */}
      <div style={{ position: 'absolute', top: -80, right: -80, width: 320, height: 320, borderRadius: '50%', background: 'rgba(217,79,43,0.07)' }} />
      <div style={{ position: 'absolute', bottom: -60, left: -60, width: 240, height: 240, borderRadius: '50%', background: 'rgba(139,26,16,0.06)' }} />
      <div style={{ position: 'absolute', top: '40%', left: '10%', width: 120, height: 120, borderRadius: '50%', background: 'rgba(232,118,58,0.05)' }} />

      <div style={{ width: '100%', maxWidth: 420, padding: '0 24px', position: 'relative', zIndex: 1 }}>
        {/* Logo lockup */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          {/* Icon mark */}
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 64, height: 64, borderRadius: 18,
            background: 'linear-gradient(135deg, #D94F2B, #8B1A10)',
            boxShadow: '0 8px 24px rgba(217,79,43,0.35)',
            marginBottom: 14 }}>
            <svg width="34" height="34" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M17 4L6 10V18C6 23.5 11 28.5 17 30C23 28.5 28 23.5 28 18V10L17 4Z" fill="rgba(255,255,255,0.15)" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M12 17L15.5 20.5L22 14" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          {/* Wordmark */}
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            AxiomHealth Management
          </div>
          <div style={{ fontSize: 11, color: '#BBA8A4', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 6 }}>
            Care Coordination Portal
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: '#fff', border: '1px solid #F0E4E0',
          borderRadius: 20, padding: '36px 32px',
          boxShadow: '0 8px 40px rgba(139,26,16,0.1), 0 2px 8px rgba(0,0,0,0.06)'
        }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1A1A1A', marginBottom: 4 }}>Sign in</div>
          <div style={{ fontSize: 13, color: '#8B6B64', marginBottom: 28 }}>Access your dashboard</div>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#8B6B64', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, fontWeight: 600 }}>Email</label>
              <input className="login-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#8B6B64', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, fontWeight: 600 }}>Password</label>
              <input className="login-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>

            {error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#DC2626' }}>{error}</div>
            )}

            <button className="login-btn" type="submit" disabled={submitting}>
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: '#BBA8A4' }}>
          Contact your director if you need access
        </div>
      </div>
    </div>
  );
}
