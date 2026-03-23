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
      minHeight: '100vh', background: '#070B12',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'DM Sans', sans-serif",
      position: 'relative', overflow: 'hidden'
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        .login-input {
          width: 100%; background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1); border-radius: 10px;
          padding: 14px 16px; color: #fff; font-size: 14px;
          font-family: 'DM Sans', sans-serif; outline: none;
          transition: border-color 0.2s;
        }
        .login-input:focus { border-color: rgba(0,212,255,0.5); background: rgba(0,212,255,0.04); }
        .login-input::placeholder { color: rgba(255,255,255,0.25); }
        .login-btn {
          width: 100%; padding: 14px; border: none; border-radius: 10px;
          background: linear-gradient(135deg, #0066FF, #00D4FF);
          color: #fff; font-size: 14px; font-weight: 700; font-family: 'DM Sans', sans-serif;
          cursor: pointer; letter-spacing: 0.06em; text-transform: uppercase;
          transition: all 0.2s; box-shadow: 0 4px 20px rgba(0,150,255,0.3);
        }
        .login-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 28px rgba(0,150,255,0.45); }
        .login-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>

      {/* Background grid */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.04,
        backgroundImage: 'linear-gradient(rgba(0,212,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.5) 1px, transparent 1px)',
        backgroundSize: '40px 40px'
      }} />

      {/* Glow */}
      <div style={{
        position: 'absolute', width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,100,255,0.12) 0%, transparent 70%)',
        top: '20%', left: '50%', transform: 'translateX(-50%)'
      }} />

      <div style={{
        width: '100%', maxWidth: 420, padding: '0 24px', position: 'relative', zIndex: 1
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #0066FF, #00D4FF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 800, boxShadow: '0 8px 32px rgba(0,150,255,0.3)'
          }}>A</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>AxiomHealth</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 4 }}>Care Coordination Portal</div>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20, padding: '36px 32px', backdropFilter: 'blur(20px)'
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Sign in</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 28 }}>Access your dashboard</div>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Email</label>
              <input className="login-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Password</label>
              <input className="login-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>

            {error && (
              <div style={{
                background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)',
                borderRadius: 8, padding: '10px 14px', marginBottom: 20,
                fontSize: 13, color: '#FF6B6B'
              }}>{error}</div>
            )}

            <button className="login-btn" type="submit" disabled={submitting}>
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>
          Contact your director if you need access
        </div>
      </div>
    </div>
  );
}
