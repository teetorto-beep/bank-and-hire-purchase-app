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

          {/* Tab switcher */}
          <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 10, padding: 4, marginBottom: 28, border: '1px solid var(--border)' }}>
            {[['login', 'Sign In'], ['signup', 'Create Account']].map(([key, label]) => (
              <button key={key} onClick={() => { setMode(key); setLoginError(''); setSignupError(''); }}
                style={{ flex: 1, padding: '9px 0', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, transition: 'all .15s',
                  background: mode === key ? 'var(--brand)' : 'transparent',
                  color: mode === key ? '#fff' : 'var(--text-3)',
                  boxShadow: mode === key ? '0 2px 8px rgba(26,86,219,0.3)' : 'none',
                }}>
                {label}
              </button>
            ))}
          </div>

          {/* ── SIGN IN ── */}
          {mode === 'login' && (
            <>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>Welcome back</div>
                <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>Sign in to your account to continue</div>
              </div>

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

              {/* Quick fill demo */}
              <div style={{ marginTop: 24, padding: 14, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Quick Demo Login</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" style={{ flex: 1, fontSize: 11 }} onClick={() => setLoginForm({ email: 'admin@majupat.com', password: 'admin123' })}>
                    <Shield size={11} />Admin
                  </button>
                  <button className="btn btn-secondary btn-sm" style={{ flex: 1, fontSize: 11 }} onClick={() => setLoginForm({ email: 'teller@majupat.com', password: 'teller123' })}>
                    <User size={11} />Teller
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── SIGN UP ── */}
          {mode === 'signup' && (
            <>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>Create Account</div>
                <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>Register a new staff account</div>
              </div>

              {signupError && (
                <div className="alert alert-error" style={{ marginBottom: 16 }}>
                  <Lock size={13} />{signupError}
                </div>
              )}

              <form onSubmit={handleSignup}>
                <div className="form-group">
                  <label className="form-label">Full Name <span className="required">*</span></label>
                  <div style={{ position: 'relative' }}>
                    <User size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
                    <input className="form-control" placeholder="Kwame Asante" value={signupForm.name} onChange={sf('name')} required style={{ paddingLeft: 34 }} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Email Address <span className="required">*</span></label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
                    <input className="form-control" type="email" placeholder="you@majupat.com" value={signupForm.email} onChange={sf('email')} required style={{ paddingLeft: 34 }} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Phone Number</label>
                  <div style={{ position: 'relative' }}>
                    <Phone size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
                    <input className="form-control" placeholder="0551234567" value={signupForm.phone} onChange={sf('phone')} style={{ paddingLeft: 34 }} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-control" value={signupForm.role} onChange={sf('role')}>
                    <option value="teller">Teller</option>
                    <option value="collector">Collector</option>
                    <option value="viewer">Viewer (Read-only)</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                  <div className="form-hint">Admin accounts should be created by an existing admin via User Management</div>
                </div>

                <div className="form-group">
                  <label className="form-label">Password <span className="required">*</span></label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
                    <input className="form-control" type={showSignupPass ? 'text' : 'password'} placeholder="Min 6 characters"
                      value={signupForm.password} onChange={sf('password')} required style={{ paddingLeft: 34, paddingRight: 40 }} />
                    <button type="button" onClick={() => setShowSignupPass(p => !p)}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
                      {showSignupPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {/* Password strength indicator */}
                  {signupForm.password && (
                    <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
                      {[1,2,3,4].map(i => (
                        <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: signupForm.password.length >= i * 3 ? (signupForm.password.length >= 10 ? 'var(--green)' : signupForm.password.length >= 6 ? 'var(--yellow)' : 'var(--red)') : 'var(--border)' }} />
                      ))}
                      <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 4 }}>
                        {signupForm.password.length < 6 ? 'Weak' : signupForm.password.length < 10 ? 'Fair' : 'Strong'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Confirm Password <span className="required">*</span></label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
                    <input className="form-control" type="password" placeholder="Re-enter password"
                      value={signupForm.confirmPassword} onChange={sf('confirmPassword')} required style={{ paddingLeft: 34 }} />
                  </div>
                  {signupForm.confirmPassword && signupForm.password !== signupForm.confirmPassword && (
                    <div className="form-error">Passwords do not match</div>
                  )}
                  {signupForm.confirmPassword && signupForm.password === signupForm.confirmPassword && (
                    <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 4 }}>✓ Passwords match</div>
                  )}
                </div>

                <button className="btn btn-primary btn-lg" type="submit" disabled={signupLoading} style={{ width: '100%', marginTop: 4 }}>
                  {signupLoading ? 'Creating account…' : 'Create Account'}
                </button>
              </form>

              <div style={{ marginTop: 16, textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>
                Already have an account?{' '}
                <button onClick={() => setMode('login')} style={{ background: 'none', border: 'none', color: 'var(--brand)', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                  Sign in
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
