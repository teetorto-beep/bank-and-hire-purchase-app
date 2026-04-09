import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Bell, X, CheckCheck, ArrowUpRight, ArrowDownRight, CreditCard, ShoppingBag, Users, AlertCircle } from 'lucide-react';
import { supabase } from '../../core/supabase';
import { notificationsDB } from '../../core/db';

const TITLES = {
  '/dashboard': 'Dashboard',
  '/customers': 'Customers',
  '/customers/new': 'Add Customer',
  '/accounts': 'Accounts',
  '/accounts/open': 'Open Account',
  '/accounts/search': 'Search Account',
  '/accounts/360': 'Account 360°',
  '/transactions': 'Transaction History',
  '/transactions/post': 'Post Transaction',
  '/transactions/statement': 'Account Statement',
  '/transactions/approvals': 'Transaction Approvals',
  '/loans': 'Loans & HP Agreements',
  '/loans/apply': 'New Loan / HP Agreement',
  '/loans/calculator': 'Loan Calculator',
  '/hp/items': 'HP Items Catalogue',
  '/hp/agreements': 'HP Agreements',
  '/collectors': 'Collectors',
  '/collections/record': 'Record Collection',
  '/collections/report': 'Collection Report',
  '/products': 'Bank Products',
  '/reports': 'Reports',
  '/approvals': 'Pending Approvals',
  '/users': 'User Management',
  '/settings': 'Settings',
};

const TYPE_ICON = {
  credit: ArrowDownRight,
  debit: ArrowUpRight,
  loan: CreditCard,
  hp: ShoppingBag,
  collection: Users,
  warning: AlertCircle,
  info: Bell,
};

const TYPE_COLOR = {
  info: '#3b82f6', success: '#10b981', warning: '#f59e0b', error: '#ef4444',
  credit: '#10b981', debit: '#ef4444', loan: '#3b82f6', hp: '#8b5cf6',
  collection: '#f59e0b',
};

const GHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

// ── In-app toast ──────────────────────────────────────────────────────────────
function Toast({ toasts, onDismiss }) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none',
    }}>
      {toasts.map(t => {
        const color = TYPE_COLOR[t.type] || '#3b82f6';
        return (
          <div key={t.id} style={{
            pointerEvents: 'all',
            background: 'var(--surface)',
            border: `1px solid var(--border)`,
            borderLeft: `4px solid ${color}`,
            borderRadius: 10,
            padding: '12px 16px',
            minWidth: 280, maxWidth: 360,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            display: 'flex', alignItems: 'flex-start', gap: 10,
            animation: 'slideIn .25s ease',
          }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Bell size={14} style={{ color }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 2 }}>{t.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.4 }}>{t.message}</div>
            </div>
            <button onClick={() => onDismiss(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, flexShrink: 0 }}>
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default function TopBar({ user }) {
  const location = useLocation();
  const title = TITLES[location.pathname] || 'Majupat Love Enterprise';

  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const ref = useRef(null);
  const toastTimers = useRef({});

  // ── Load notifications ──────────────────────────────────────────────────────
  const loadNotifs = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await notificationsDB.getForUser(user.id, 30);
    setNotifs(data || []);
    setUnread((data || []).filter(n => !n.read).length);
  }, [user?.id]);

  // ── Show toast ──────────────────────────────────────────────────────────────
  const showToast = useCallback((title, message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(p => [...p.slice(-3), { id, title, message, type }]);
    toastTimers.current[id] = setTimeout(() => {
      setToasts(p => p.filter(t => t.id !== id));
      delete toastTimers.current[id];
    }, 5000);
  }, []);

  const dismissToast = (id) => {
    clearTimeout(toastTimers.current[id]);
    delete toastTimers.current[id];
    setToasts(p => p.filter(t => t.id !== id));
  };

  // ── Supabase Realtime subscriptions ─────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;

    loadNotifs();

    // Subscribe to transactions table — fires on every INSERT
    const txnSub = supabase
      .channel('realtime-transactions')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, (payload) => {
        const row = payload.new;
        if (!row) return;
        const amt = GHS(row.amount);
        const type = row.type === 'credit' ? 'credit' : 'debit';
        const title = row.type === 'credit' ? `Credit: ${amt}` : `Debit: ${amt}`;
        const msg = `${row.narration || 'Transaction'} · ${row.channel || 'teller'}`;
        showToast(title, msg, type);
        // Reload notifications list
        loadNotifs();
      })
      .subscribe();

    // Subscribe to collections table
    const colSub = supabase
      .channel('realtime-collections')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'collections' }, (payload) => {
        const row = payload.new;
        if (!row) return;
        const amt = GHS(row.amount);
        const pt = row.payment_type === 'loan' ? 'Loan Repayment' : row.payment_type === 'hp' ? 'HP Repayment' : 'Savings Deposit';
        showToast(`Collection: ${amt}`, `${pt} · ${row.customer_name || 'Customer'} · by ${row.collector_name || 'Collector'}`, 'collection');
        loadNotifs();
      })
      .subscribe();

    // Subscribe to pending_transactions — new approval requests
    const pendSub = supabase
      .channel('realtime-pending')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pending_transactions' }, (payload) => {
        const row = payload.new;
        if (!row) return;
        // Only notify admins/managers
        if (user.role === 'admin' || user.role === 'manager') {
          const amt = GHS(row.amount);
          showToast('Approval Required', `${row.type?.toUpperCase()} ${amt} submitted by ${row.submitter_name || 'teller'}`, 'warning');
          loadNotifs();
        }
      })
      .subscribe();

    // Subscribe to loans — status changes
    const loanSub = supabase
      .channel('realtime-loans')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'loans' }, (payload) => {
        const row = payload.new;
        const old = payload.old;
        if (!row || row.status === old?.status) return;
        if (row.status === 'active') {
          showToast('Loan Approved', `${row.type?.replace('_', ' ')} loan of ${GHS(row.amount)} has been approved`, 'loan');
        } else if (row.status === 'completed') {
          showToast('Loan Completed', `Loan fully repaid — ${GHS(row.amount)}`, 'success');
        } else if (row.status === 'overdue') {
          showToast('Loan Overdue', `A loan of ${GHS(row.outstanding)} is now overdue`, 'warning');
        }
        loadNotifs();
      })
      .subscribe();

    // Subscribe to notifications table for this user
    const notifSub = supabase
      .channel(`realtime-notifs-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload) => {
        const row = payload.new;
        if (!row) return;
        setNotifs(p => [row, ...p]);
        setUnread(p => p + 1);
        showToast(row.title, row.message, row.type || 'info');
      })
      .subscribe();

    return () => {
      supabase.removeChannel(txnSub);
      supabase.removeChannel(colSub);
      supabase.removeChannel(pendSub);
      supabase.removeChannel(loanSub);
      supabase.removeChannel(notifSub);
    };
  }, [user?.id, user?.role, loadNotifs, showToast]);

  // Cleanup toast timers on unmount
  useEffect(() => {
    return () => Object.values(toastTimers.current).forEach(clearTimeout);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markRead = async (id) => {
    await notificationsDB.markRead(id);
    setNotifs(p => p.map(n => n.id === id ? { ...n, read: true } : n));
    setUnread(p => Math.max(0, p - 1));
  };

  const markAll = async () => {
    await notificationsDB.markAllRead(user.id);
    setNotifs(p => p.map(n => ({ ...n, read: true })));
    setUnread(0);
  };

  return (
    <>
      {/* Toast container */}
      <Toast toasts={toasts} onDismiss={dismissToast} />

      <header className="topbar">
        <div className="topbar-left">
          <span className="topbar-title">{title}</span>
        </div>
        <div className="topbar-right">

          {/* Notification Bell */}
          <div ref={ref} style={{ position: 'relative' }}>
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => { setOpen(p => !p); if (!open) loadNotifs(); }}
              style={{ position: 'relative' }}
              title="Notifications"
            >
              <Bell size={18} />
              {unread > 0 && (
                <span style={{
                  position: 'absolute', top: 2, right: 2,
                  minWidth: 16, height: 16, borderRadius: 8,
                  background: 'var(--red)', color: '#fff',
                  fontSize: 9, fontWeight: 800, padding: '0 3px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid var(--surface)',
                }}>
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>

            {open && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                width: 360, background: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: 12,
                boxShadow: '0 12px 40px rgba(0,0,0,0.15)', zIndex: 200,
                overflow: 'hidden',
              }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                    Notifications
                    {unread > 0 && <span style={{ fontSize: 11, background: 'var(--red)', color: '#fff', borderRadius: 10, padding: '1px 7px' }}>{unread} new</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {unread > 0 && (
                      <button className="btn btn-ghost btn-sm" onClick={markAll} style={{ fontSize: 11 }}>
                        <CheckCheck size={12} /> Mark all read
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setOpen(false)}><X size={14} /></button>
                  </div>
                </div>

                {/* List */}
                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                  {notifs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-3)', fontSize: 13 }}>
                      <Bell size={32} style={{ margin: '0 auto 10px', display: 'block', opacity: .25 }} />
                      No notifications yet
                    </div>
                  ) : notifs.map(n => {
                    const color = TYPE_COLOR[n.type] || '#3b82f6';
                    return (
                      <div key={n.id}
                        onClick={() => markRead(n.id)}
                        style={{
                          padding: '11px 16px',
                          borderBottom: '1px solid var(--border)',
                          background: n.read ? 'var(--surface)' : color + '10',
                          cursor: 'pointer',
                          display: 'flex', gap: 10, alignItems: 'flex-start',
                        }}
                      >
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: n.read ? 'var(--border)' : color, marginTop: 5, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: n.read ? 500 : 700, fontSize: 13 }}>{n.title}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.4 }}>{n.message}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
                            {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />

          {/* User info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700 }}>
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{user?.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'capitalize' }}>{user?.role}</div>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}



