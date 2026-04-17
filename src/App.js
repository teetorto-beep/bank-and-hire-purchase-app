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
import './styles/globals.css';

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
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/customers/new" element={<Customers />} />
              <Route path="/customers/:id" element={<CustomerDetail />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/accounts/open" element={<AccountOpening />} />
              <Route path="/accounts/search" element={<AccountSearch />} />
              <Route path="/accounts/360" element={<Account360 />} />
              <Route path="/transactions" element={<TransactionHistory />} />
              <Route path="/transactions/post" element={<PostTransaction />} />
              <Route path="/transactions/statement" element={<Statement />} />
              <Route path="/transactions/approvals" element={<Approvals />} />
              <Route path="/loans" element={<Loans />} />
              <Route path="/loans/apply" element={<LoanApplication />} />
              <Route path="/loans/calculator" element={<LoanCalculator />} />
              <Route path="/hp/items" element={<HPItems />} />
              <Route path="/hp/agreements" element={<HPAgreements />} />
              <Route path="/collectors" element={<Collectors />} />
              <Route path="/collections/record" element={<RecordCollection />} />
              <Route path="/collections/report" element={<CollectionReport />} />
              <Route path="/products" element={<BankProducts />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/reports/teller" element={<TellerReport />} />
              <Route path="/teller/session" element={<TellerSession />} />
              <Route path="/gl" element={<GeneralLedger />} />
              <Route path="/users" element={<UserManagement />} />
              <Route path="/approvals" element={<PendingApprovals />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
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
