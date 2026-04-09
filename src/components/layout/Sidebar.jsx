import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Wallet, ArrowLeftRight, CreditCard,
  Truck, BarChart3, Settings, ChevronDown, ChevronRight, LogOut,
  PlusCircle, List, Search, UserCheck, FileText, Calculator,
  Receipt, Package, ShoppingBag, UserCog, Clock, Eye, BookOpen, CheckCircle
} from 'lucide-react';
import { authDB } from '../../core/db';

const NAV = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  {
    label: 'Customers', icon: Users,
    children: [
      { label: 'All Customers', path: '/customers', icon: List },
      { label: 'Add Customer', path: '/customers/new', icon: PlusCircle },
    ]
  },
  {
    label: 'Accounts', icon: Wallet,
    children: [
      { label: 'All Accounts', path: '/accounts', icon: List },
      { label: 'Open Account', path: '/accounts/open', icon: PlusCircle },
      { label: 'Account 360°', path: '/accounts/360', icon: Eye },
      { label: 'Search Account', path: '/accounts/search', icon: Search },
    ]
  },
  {
    label: 'Transactions', icon: ArrowLeftRight,
    children: [
      { label: 'Post Transaction', path: '/transactions/post', icon: PlusCircle },
      { label: 'Approvals Queue', path: '/transactions/approvals', icon: Clock },
      { label: 'Account Statement', path: '/transactions/statement', icon: BookOpen },
      { label: 'History', path: '/transactions', icon: List },
    ]
  },
  {
    label: 'Loans & HP', icon: CreditCard,
    children: [
      { label: 'All Loans & Agreements', path: '/loans', icon: List },
      { label: 'New Loan / HP', path: '/loans/apply', icon: PlusCircle },
      { label: 'Calculator', path: '/loans/calculator', icon: Calculator },
      { label: 'HP Items Catalogue', path: '/hp/items', icon: Package },
    ]
  },
  {
    label: 'Collections', icon: Truck,
    children: [
      { label: 'Collectors', path: '/collectors', icon: UserCheck },
      { label: 'Record Collection', path: '/collections/record', icon: Receipt },
      { label: 'Collection Report', path: '/collections/report', icon: FileText },
    ]
  },
  { label: 'Bank Products', path: '/products', icon: Package },
  { label: 'Reports', path: '/reports', icon: BarChart3 },
  {
    label: 'GL & Accounting', icon: BookOpen,
    children: [
      { label: 'General Ledger', path: '/gl', icon: BookOpen },
    ]
  },
  { label: 'Approvals', path: '/approvals', icon: CheckCircle },
  { label: 'Users', path: '/users', icon: UserCog },
  { label: 'Settings', path: '/settings', icon: Settings },
];

// Map nav labels to permission module names
const MODULE_MAP = {
  'Dashboard':      'Dashboard',
  'Customers':      'Customers',
  'Accounts':       'Accounts',
  'Transactions':   'Transactions',
  'Loans & HP':     'Loans',
  'Collections':    'Collections',
  'Bank Products':  'Products',
  'Reports':        'Reports',
  'GL & Accounting':'GL & Accounting',
  'Approvals':      'Approvals',
  'Users':          'User Management',
  'Settings':       'Settings',
};

const ROLE_PERMISSIONS = {
  admin:     null, // null = all access
  manager:   ['Dashboard','Customers','Accounts','Transactions','Loans','Collections','Products','HP Items','Reports','GL & Accounting','Approvals'],
  teller:    ['Dashboard','Customers','Accounts','Transactions','Collections'],
  collector: ['Dashboard','Collections'],
  viewer:    ['Dashboard','Reports'],
};

function canAccess(user, moduleLabel) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  // Custom permissions override role defaults (only if explicitly set as non-null non-empty)
  const perms = (user.permissions && user.permissions.length > 0)
    ? user.permissions
    : (ROLE_PERMISSIONS[user.role] || []);
  if (perms === null) return true; // null = all access
  const mod = MODULE_MAP[moduleLabel] || moduleLabel;
  return perms.includes(mod);
}

export default function Sidebar({ user, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState({});

  const isActive = (path) => location.pathname === path;
  const isGroupActive = (children) => children?.some(c => location.pathname.startsWith(c.path));

  const toggle = (label) => setOpen(p => ({ ...p, [label]: !p[label] }));

  const handleLogout = () => { authDB.logout(); onLogout(); };

  // Pending approvals count for badge — reads from sessionStorage cache set by AppContext
  const pendingCount = 0; // Will be driven by AppContext in child components

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-mark">
          <div className="logo-icon">M</div>
          <div>
            <div className="logo-text">Majupat Love Enterprise</div>
            <div className="logo-sub">Maxbraynn Technology & Systems</div>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV.filter(item => canAccess(user, item.label)).map((item) => {
          if (!item.children) {
            return (
              <div key={item.path} className="nav-section">
                <a
                  className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
                  onClick={() => navigate(item.path)}
                >
                  <item.icon size={16} />
                  {item.label}
                  {item.path === '/approvals' && pendingCount > 0 && (
                    <span style={{ marginLeft: 'auto', background: 'var(--red)', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 6px', minWidth: 18, textAlign: 'center' }}>{pendingCount}</span>
                  )}
                </a>
              </div>
            );
          }
          const expanded = open[item.label] !== undefined ? open[item.label] : isGroupActive(item.children);
          return (
            <div key={item.label} className="nav-group">
              <div className="nav-group-header" onClick={() => toggle(item.label)}>
                <span className="left"><item.icon size={16} />{item.label}</span>
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </div>
              {expanded && (
                <div className="nav-group-children">
                  {item.children.map(child => (
                    <a
                      key={child.path}
                      className={`nav-item ${isActive(child.path) ? 'active' : ''}`}
                      onClick={() => navigate(child.path)}
                    >
                      <child.icon size={14} />
                      {child.label}
                      {child.path === '/transactions/approvals' && pendingCount > 0 && (
                        <span style={{ marginLeft: 'auto', background: 'var(--red)', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 6px', minWidth: 18, textAlign: 'center' }}>{pendingCount}</span>
                      )}
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user" onClick={handleLogout} title="Logout">
          <div className="avatar">{user?.name?.[0]?.toUpperCase()}</div>
          <div className="user-info">
            <div className="user-name">{user?.name}</div>
            <div className="user-role">{user?.role}</div>
          </div>
          <LogOut size={14} style={{ color: '#64748b', flexShrink: 0 }} />
        </div>
        <div style={{ padding: '10px 12px 4px', borderTop: '1px solid #1e293b', marginTop: 4 }}>
          <div style={{ fontSize: 10, color: '#334155', lineHeight: 1.6, textAlign: 'center' }}>
            <div style={{ fontWeight: 700, color: '#475569', fontSize: 10 }}>Majupat Love Enterprise</div>
            <div style={{ color: '#334155' }}>© {new Date().getFullYear()} Maxbraynn Technology</div>
            <div style={{ color: '#334155' }}>& Systems. All rights reserved.</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

