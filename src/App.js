import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { authDB } from './core/db';
import { supabase } from './core/supabase';
import { AppProvider, useApp } from './context/AppContext';
import AutoRefreshIndicator from './components/AutoRefreshIndicator';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import Login from './pages/auth/Login';
import Dashboard from './pages/dashboard/Dashboard';
import Customers from './pages/customers/Customers';
import CustomerDetail from './pages/customers/CustomerDetail';
import Accounts from './pages/accounts/Accounts';
import AccountOpening from './pages/accounts/AccountOpening';
import AccountSearch from './pages/accounts/AccountSearch';
import Account360 from './pages/accounts/Account360';
import PostTransaction from './pages/transactions/PostTransaction';
import TransactionHistory from './pages/transactions/TransactionHistory';
import Statement from './pages/transactions/Statement';
import Approvals from './pages/transactions/Approvals';
import Loans from './pages/loans/Loans';
import LoanApplication from './pages/loans/LoanApplication';
import LoanCalculator from './pages/loans/LoanCalculator';
import Collectors from './pages/collectors/Collectors';
import RecordCollection from './pages/collectors/RecordCollection';
import CollectionReport from './pages/collectors/CollectionReport';
import BankProducts from './pages/products/BankProducts';
import HPItems from './pages/hirepurchase/HPItems';
import HPAgreements from './pages/hirepurchase/HPAgreements';
import UserManagement from './pages/users/UserManagement';
import Reports from './pages/reports/Reports';
import TellerSession from './pages/teller/TellerSession';
import TellerReport from './pages/reports/TellerReport';
import Settings from './pages/settings/Settings';
import GeneralLedger from './pages/gl/GeneralLedger';
import PendingApprovals from './pages/approvals/PendingApprovals';
import AccessDenied from './pages/AccessDenied';
import './styles/globals.css';

// Maps route paths to permission module names (same as Sidebar MODULE_MAP)
const ROUTE_MODULE_MAP = {
  '/dashboard':              'Dashboard',
  '/customers':              'Customers',
  '/customers/new':          'Customers',
  '/accounts':               'Accounts',
  '/accounts/open':          'Accounts',
  '/accounts/search':        'Accounts',
  '/accounts/360':           'Accounts',
  '/transactions':           'Transactions',
  '/transactions/post':      'Transactions',
  '/transactions/statement': 'Transactions',
  '/transactions/approvals': 'Transactions',
  '/teller/session':         'Teller',
  '/reports/teller':         'Teller',
  '/loans':                  'Loans',
  '/loans/apply':            'Loans',
  '/loans/calculator':       'Loans',
  '/hp/items':               'HP Items',
  '/hp/agreements':          'Loans',
  '/collectors':             'Collections',
  '/collections/record':     'Collections',
  '/collections/report':     'Collections',
  '/products':               'Products',
  '/reports':                'Reports',
  '/gl':                     'GL & Accounting',
  '/approvals':              'Approvals',
  '/users':                  'User Management',
  '/settings':               'Settings',
};

const ROLE_PERMISSIONS = {
  admin:     null,
  manager:   ['Dashboard','Customers','Accounts','Transactions','Loans','Collections','Products','HP Items','Reports','GL & Accounting','Approvals'],
  teller:    ['Dashboard','Customers','Accounts','Transactions','Teller','Collections'],
  collector: ['Dashboard','Collections'],
  viewer:    ['Dashboard','Reports'],
};

function canAccessRoute(user, path) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const module = ROUTE_MODULE_MAP[path];
  if (!module) return true; // unknown route, let it through (will hit * redirect)
  const perms = (user.permissions && user.permissions.length > 0)
    ? user.permissions
    : (ROLE_PERMISSIONS[user.role] || []);
  if (perms === null) return true;
  return perms.includes(module);
}

// Returns the first route path the user can access, or null if none
function firstAccessiblePath(user) {
  const ordered = [
    '/dashboard', '/customers', '/accounts', '/transactions',
    '/teller/session', '/loans', '/collections/record', '/collectors',
    '/reports', '/gl', '/approvals', '/users', '/settings',
  ];
  return ordered.find(p => canAccessRoute(user, p)) || null;
}

function ProtectedRoute({ user, path, element, onLogout }) {
  if (!canAccessRoute(user, path)) {
    return <AccessDenied user={user} onLogout={onLogout} />;
  }
  return element;
}

// Root redirect: go to first accessible page, or access-denied
function RootRedirect({ user }) {
  const first = firstAccessiblePath(user);
  return first ? <Navigate to={first} replace /> : <Navigate to="/access-denied" replace />;
}

function AppShell({ user, onLogout }) {
  return (
    <AppProvider>
      <AppContent user={user} onLogout={onLogout} />
    </AppProvider>
  );
}

function AppContent({ user, onLogout }) {
  const { lastRefresh } = useApp();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  return (
    <>
      <div className="app-shell">
        {/* Mobile overlay backdrop */}
        {sidebarOpen && (
          <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
        )}
        <Sidebar user={user} onLogout={onLogout} mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="main-area">
          <TopBar user={user} onMenuClick={() => setSidebarOpen(p => !p)} />
          <main className="page-content">
            <Routes>
              <Route path="/" element={<RootRedirect user={user} />} />
              <Route path="/dashboard" element={<ProtectedRoute user={user} path="/dashboard" element={<Dashboard />} onLogout={onLogout} />} />
              <Route path="/customers" element={<ProtectedRoute user={user} path="/customers" element={<Customers />} onLogout={onLogout} />} />
              <Route path="/customers/new" element={<ProtectedRoute user={user} path="/customers/new" element={<Customers />} onLogout={onLogout} />} />
              <Route path="/customers/:id" element={<ProtectedRoute user={user} path="/customers" element={<CustomerDetail />} onLogout={onLogout} />} />
              <Route path="/accounts" element={<ProtectedRoute user={user} path="/accounts" element={<Accounts />} onLogout={onLogout} />} />
              <Route path="/accounts/open" element={<ProtectedRoute user={user} path="/accounts/open" element={<AccountOpening />} onLogout={onLogout} />} />
              <Route path="/accounts/search" element={<ProtectedRoute user={user} path="/accounts/search" element={<AccountSearch />} onLogout={onLogout} />} />
              <Route path="/accounts/360" element={<ProtectedRoute user={user} path="/accounts/360" element={<Account360 />} onLogout={onLogout} />} />
              <Route path="/transactions" element={<ProtectedRoute user={user} path="/transactions" element={<TransactionHistory />} onLogout={onLogout} />} />
              <Route path="/transactions/post" element={<ProtectedRoute user={user} path="/transactions/post" element={<PostTransaction />} onLogout={onLogout} />} />
              <Route path="/transactions/statement" element={<ProtectedRoute user={user} path="/transactions/statement" element={<Statement />} onLogout={onLogout} />} />
              <Route path="/transactions/approvals" element={<ProtectedRoute user={user} path="/transactions/approvals" element={<Approvals />} onLogout={onLogout} />} />
              <Route path="/loans" element={<ProtectedRoute user={user} path="/loans" element={<Loans />} onLogout={onLogout} />} />
              <Route path="/loans/apply" element={<ProtectedRoute user={user} path="/loans/apply" element={<LoanApplication />} onLogout={onLogout} />} />
              <Route path="/loans/calculator" element={<ProtectedRoute user={user} path="/loans/calculator" element={<LoanCalculator />} onLogout={onLogout} />} />
              <Route path="/hp/items" element={<ProtectedRoute user={user} path="/hp/items" element={<HPItems />} onLogout={onLogout} />} />
              <Route path="/hp/agreements" element={<ProtectedRoute user={user} path="/hp/agreements" element={<HPAgreements />} onLogout={onLogout} />} />
              <Route path="/collectors" element={<ProtectedRoute user={user} path="/collectors" element={<Collectors />} onLogout={onLogout} />} />
              <Route path="/collections/record" element={<ProtectedRoute user={user} path="/collections/record" element={<RecordCollection />} onLogout={onLogout} />} />
              <Route path="/collections/report" element={<ProtectedRoute user={user} path="/collections/report" element={<CollectionReport />} onLogout={onLogout} />} />
              <Route path="/products" element={<ProtectedRoute user={user} path="/products" element={<BankProducts />} onLogout={onLogout} />} />
              <Route path="/reports" element={<ProtectedRoute user={user} path="/reports" element={<Reports />} onLogout={onLogout} />} />
              <Route path="/reports/teller" element={<ProtectedRoute user={user} path="/reports/teller" element={<TellerReport />} onLogout={onLogout} />} />
              <Route path="/teller/session" element={<ProtectedRoute user={user} path="/teller/session" element={<TellerSession />} onLogout={onLogout} />} />
              <Route path="/gl" element={<ProtectedRoute user={user} path="/gl" element={<GeneralLedger />} onLogout={onLogout} />} />
              <Route path="/users" element={<ProtectedRoute user={user} path="/users" element={<UserManagement />} onLogout={onLogout} />} />
              <Route path="/approvals" element={<ProtectedRoute user={user} path="/approvals" element={<PendingApprovals />} onLogout={onLogout} />} />
              <Route path="/settings" element={<ProtectedRoute user={user} path="/settings" element={<Settings />} onLogout={onLogout} />} />
              <Route path="/access-denied" element={<AccessDenied user={user} onLogout={onLogout} />} />
              <Route path="*" element={<RootRedirect user={user} />} />
            </Routes>
          </main>
        </div>
      </div>
      <AutoRefreshIndicator lastRefresh={lastRefresh} />
    </>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const u = authDB.currentUser();
    if (u) {
      setUser(u);
      // Re-fetch from DB to pick up any permission changes since last login
      supabase.from('users').select('*').eq('id', u.id).single()
        .then(({ data }) => {
          if (data) {
            sessionStorage.setItem('current_user', JSON.stringify(data));
            setUser(data);
          }
        });
    }
    setReady(true);
  }, []);

  if (!ready) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', flexDirection: 'column', gap: 16 }}>
      <div style={{ width: 48, height: 48, background: '#1a56db', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#fff' }}>M</div>
      <div style={{ color: '#94a3b8', fontSize: 14 }}>Loading Majupat Love Enterprise…</div>
    </div>
  );

  return (
    <BrowserRouter>
      {user
        ? <AppShell user={user} onLogout={() => { authDB.logout(); setUser(null); }} />
        : <Routes>
            <Route path="*" element={<Login onLogin={setUser} />} />
          </Routes>
      }
    </BrowserRouter>
  );
}
