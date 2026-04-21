import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldOff, LogOut } from 'lucide-react';
import { authDB } from '../core/db';

const ROLE_PERMISSIONS = {
  admin:     null,
  manager:   ['Dashboard','Customers','Accounts','Transactions','Loans','Collections','Products','HP Items','Reports','GL & Accounting','Approvals'],
  teller:    ['Dashboard','Customers','Accounts','Transactions','Teller','Collections'],
  collector: ['Dashboard','Collections'],
  viewer:    ['Dashboard','Reports'],
};

const MODULE_ICONS = {
  'Dashboard':        '🏠',
  'Customers':        '👥',
  'Accounts':         '🏦',
  'Transactions':     '💳',
  'Teller':           '🖥️',
  'Loans':            '📋',
  'HP Items':         '🛍️',
  'Products':         '📦',
  'Collections':      '💰',
  'Reports':          '📊',
  'GL & Accounting':  '📒',
  'Approvals':        '✅',
  'User Management':  '👤',
  'Settings':         '⚙️',
};

const MODULE_PATHS = {
  'Dashboard':        '/dashboard',
  'Customers':        '/customers',
  'Accounts':         '/accounts',
  'Transactions':     '/transactions',
  'Teller':           '/teller/session',
  'Loans':            '/loans',
  'HP Items':         '/hp/items',
  'Products':         '/products',
  'Collections':      '/collectors',
  'Reports':          '/reports',
  'GL & Accounting':  '/gl',
  'Approvals':        '/approvals',
  'User Management':  '/users',
  'Settings':         '/settings',
};

export default function AccessDenied({ user, onLogout }) {
  const navigate = useNavigate();

  const effectivePerms = user
    ? (user.role === 'admin'
        ? null
        : (user.permissions && user.permissions.length > 0)
          ? user.permissions
          : (ROLE_PERMISSIONS[user.role] || []))
    : [];

  const accessibleModules = effectivePerms === null
    ? Object.keys(MODULE_ICONS)
    : (effectivePerms || []);

  const handleLogout = () => {
    authDB.logout();
    onLogout?.();
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#0f172a', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
        {/* Icon */}
        <div style={{
          width: 72, height: 72, borderRadius: 20, background: 'rgba(239,68,68,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
        }}>
          <ShieldOff size={32} color="#ef4444" />
        </div>

        <h1 style={{ color: '#f1f5f9', fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
          Access Restricted
        </h1>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 32, lineHeight: 1.7 }}>
          Your account <strong style={{ color: '#94a3b8' }}>{user?.name}</strong> does not have access to this page.
          Contact your administrator to request access.
        </p>

        {/* What they CAN access */}
        {accessibleModules.length > 0 && (
          <div style={{
            background: '#1e293b', borderRadius: 16, padding: 24,
            border: '1px solid #334155', marginBottom: 24, textAlign: 'left',
          }}>
            <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>
              Your accessible modules
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
              {accessibleModules.map(mod => (
                <button
                  key={mod}
                  onClick={() => MODULE_PATHS[mod] && navigate(MODULE_PATHS[mod])}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: '#0f172a', border: '1px solid #334155',
                    borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
                    color: '#cbd5e1', fontSize: 13, fontWeight: 500,
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#1a56db'; e.currentTarget.style.background = 'rgba(26,86,219,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#334155'; e.currentTarget.style.background = '#0f172a'; }}
                >
                  <span style={{ fontSize: 16 }}>{MODULE_ICONS[mod] || '📄'}</span>
                  {mod}
                </button>
              ))}
            </div>
          </div>
        )}

        {accessibleModules.length === 0 && (
          <div style={{
            background: '#1e293b', borderRadius: 16, padding: 24,
            border: '1px solid #334155', marginBottom: 24, color: '#64748b', fontSize: 14,
          }}>
            You currently have no module access. Please contact your administrator.
          </div>
        )}

        <button
          onClick={handleLogout}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'transparent', border: '1px solid #334155',
            borderRadius: 10, padding: '10px 20px', cursor: 'pointer',
            color: '#94a3b8', fontSize: 13, fontWeight: 600,
          }}
        >
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </div>
  );
}
