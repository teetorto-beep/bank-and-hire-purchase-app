import React, { useState } from 'react';
import { authDB } from '../../core/db';
import { Eye, EyeOff, Lock, Mail, Shield, User, Phone, ChevronRight } from 'lucide-react';

const BRAND_LEFT = (
  <div style={{ maxWidth: 420 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 36 }}>
      <div style={{ width: 52, height: 52, background: 'var(--brand)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 900, color: '#fff', boxShadow: '0 8px 24px rgba(26,86,219,0.4)' }}>M</div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>Majupat Love Enterprise</div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Maxbraynn Technology & Systems</div>
      </div>
    </div>
    <h1 style={{ fontSize: 38, fontWeight: 900, color: '#fff', lineHeight: 1.15, marginBottom: 18, letterSpacing: '-0.5px' }}>
      Secure. Fast.<br />Reliable Banking.
    </h1>
    <p style={{ color: '#94a3b8', fontSize: 15, lineHeight: 1.8, marginBottom: 44 }}>
      Manage accounts, process transactions, track loans, and monitor collections — all in one place.
    </p>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {[
        { icon: Shield, text: 'Role-based access control' },
        { icon: Lock, text: 'Bank-grade data security' },
        { icon: Mail, text: 'Real-time transaction alerts' },
        { icon: ChevronRight, text: 'Full audit trail on every action' },
      ].map(({ icon: Icon, text }) => (
        <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#cbd5e1', fontSize: 14 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(26,86,219,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={14} style={{ color: '#93c5fd' }} />
          </div>
          {text}
        </div>
      ))}
    </div>
    <div style={{ marginTop: 48, fontSize: 11, color: '#334155' }}>
      © {new Date().getFullYear()} Maxbraynn Technology & Systems. All rights reserved.
    </div>
  </div>
);

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'

  // Login form
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Signup form
  const [signupForm, setSignupForm] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '', role: 'teller' });
  const [showSignupPass, setShowSignupPass] = useState(false);
  const [signupError, setSignupError] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);

  // ── Login ──────────────────────────────────────────────────────────────────
  const handleLogin = (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    authDB.login(loginForm.email, loginForm.password).then(({ data, error }) => {
      if (data) onLogin(data);
      else setLoginError(error?.message || error || 'Invalid email or password. Check your credentials.');
      setLoginLoading(false);
    }).catch(err => {
      setLoginError('Connection error — check your Supabase URL and key in .env');
      setLoginLoading(false);
    });
  };

  // ── Signup ─────────────────────────────────────────────────────────────────
  const handleSignup = (e) => {
    e.preventDefault();
    setSignupError('');
    if (!signupForm.name.trim()) { setSignupError('Full name is required.'); return; }
    if (!signupForm.email.trim()) { setSignupError('Email is required.'); return; }
    if (signupForm.password.length < 6) { setSignupError('Password must be at least 6 characters.'); return; }
    if (signupForm.password !== signupForm.confirmPassword) { setSignupError('Passwords do not match.'); return; }
    setSignupLoading(true);
    authDB.signup({
      name: signupForm.name,
      email: signupForm.email,
      phone: signupForm.phone,
      password: signupForm.password,
      role: signupForm.role,
    }).then(({ data, error }) => {
      if (data) onLogin(data);
      else setSignupError(error?.message || error || 'Signup failed. Please try again.');
      setSignupLoading(false);
    }).catch(err => {
      setSignupError('Connection error — check your Supabase URL and key in .env');
      setSignupLoading(false);
    });
  };

  const sf = (k) => (e) => setSignupForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <div className="login-page">
      {/* Left branding panel */}
      <div className="login-left">{BRAND_LEFT}</div>

      {/* Right form panel */}
      <div className="login-right">
        <div className="login-box">

          {/* Tab switcher — Sign In only, no public signup */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>Welcome back</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>Sign in to your account to continue</div>
          </div>

          {/* ── SIGN IN ── */}
          {mode === 'login' && (
            <>
              {loginError && (
                <div className="alert alert-error" style={{ marginBottom: 16 }}>
                  <Lock size={13} />{loginError}
                </div>
              )}

              <form onSubmit={handleLogin}>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
                    <input className="form-control" type="email" placeholder="you@majupat.com"
                      value={loginForm.email} onChange={e => setLoginForm(p => ({ ...p, email: e.target.value }))}
                      required autoFocus style={{ paddingLeft: 34 }} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
                    <input className="form-control" type={showLoginPass ? 'text' : 'password'} placeholder="••••••••"
                      value={loginForm.password} onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))}
                      required style={{ paddingLeft: 34, paddingRight: 40 }} />
                    <button type="button" onClick={() => setShowLoginPass(p => !p)}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
                      {showLoginPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <button className="btn btn-primary btn-lg" type="submit" disabled={loginLoading} style={{ width: '100%', marginTop: 4 }}>
                  {loginLoading ? 'Signing in…' : 'Sign In'}
                </button>
              </form>
            </>
          )}

          {/* Signup disabled — use User Management to create accounts */}
        </div>
      </div>
    </div>
  );
}
