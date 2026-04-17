import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import {
  Wallet, Users, CreditCard, TrendingUp, AlertCircle,
  ArrowUpRight, ArrowDownRight, Activity, Clock, ShoppingBag,
  CheckCircle, PiggyBank, BarChart2, Zap, Target, Smartphone,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { authDB } from '../../core/db';
import { supabase } from '../../core/supabase';

const GHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (n) => Number(n || 0).toLocaleString('en-GH');

function KPICard({ label, value, sub, icon: Icon, color, onClick, trend }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.1 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="card"
      onClick={onClick}
      style={{
        padding: '18px 20px',
        cursor: onClick ? 'pointer' : 'default',
        borderLeft: `4px solid ${color}`,
        position: 'relative',
        overflow: 'hidden',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(16px)',
        transition: 'opacity .4s ease, transform .4s ease, box-shadow .2s ease',
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.transform = 'translateY(-3px)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {/* Background icon watermark */}
      <div style={{ position: 'absolute', right: 12, top: 12, opacity: .06, transition: 'opacity .2s, transform .2s' }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '.12'; e.currentTarget.style.transform = 'scale(1.1) rotate(-8deg)'; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '.06'; e.currentTarget.style.transform = ''; }}>
        <Icon size={52} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1.1, marginBottom: 4,
        animation: visible ? 'countUp .5s ease both' : 'none' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{sub}</div>}
      {trend !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 12, color: trend >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
          {trend >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          {Math.abs(trend)}% vs last month
        </div>
      )}
      {/* Bottom shimmer line on hover */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, height: 2, width: '100%',
        background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        opacity: 0, transition: 'opacity .2s' }}
        className="kpi-shimmer" />
    </div>
  );
}

export default function Dashboard() {
  const { stats, transactions, accounts, loans, customers, pendingTxns, hpAgreements, collections, collectors } = useApp();
  const navigate = useNavigate();
  const user = authDB.currentUser();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const [appUserCount, setAppUserCount] = useState(0);
  useEffect(() => {
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .not('push_token', 'is', null)
      .then(({ count }) => setAppUserCount(count || 0));
  }, []);

  const pendingApprovals = pendingTxns.filter(p => p.status === 'pending');
  const actionable = pendingApprovals.filter(p => p.submittedBy !== user?.id);

  // ── Today stats ─────────────────────────────────────────────────────────────
  const today = new Date().toDateString();
  const todayTxns = transactions.filter(t => t.createdAt && new Date(t.createdAt).toDateString() === today);
  const todayCredits = todayTxns.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
  const todayDebits = todayTxns.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
  const todayCollections = collections.filter(c => c.createdAt && new Date(c.createdAt).toDateString() === today);
  const todayCollected = todayCollections.reduce((s, c) => s + Number(c.amount || 0), 0);

  // ── Monthly chart data ───────────────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const m = d.getMonth(); const y = d.getFullYear();
      const txns = transactions.filter(t => {
        const td = new Date(t.createdAt);
        return !isNaN(td) && td.getMonth() === m && td.getFullYear() === y;
      });
      const cols = collections.filter(c => {
        const cd = new Date(c.createdAt);
        return !isNaN(cd) && cd.getMonth() === m && cd.getFullYear() === y;
      });
      months.push({
        name: d.toLocaleString('default', { month: 'short' }),
        deposits: txns.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0),
        withdrawals: txns.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0),
        collections: cols.reduce((s, c) => s + Number(c.amount || 0), 0),
      });
    }
    return months;
  }, [transactions, collections]);

  // ── Loan portfolio breakdown ─────────────────────────────────────────────────
  const loanBreakdown = useMemo(() => {
    const types = {};
    loans.filter(l => l.status === 'active').forEach(l => {
      const t = (l.type || 'other').replace('_', ' ');
      if (!types[t]) types[t] = 0;
      types[t] += Number(l.outstanding || 0);
    });
    const colors = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4'];
    return Object.entries(types).map(([name, value], i) => ({ name, value, color: colors[i % colors.length] }));
  }, [loans]);

  // ── Account type distribution ────────────────────────────────────────────────
  const accountDist = useMemo(() => {
    const types = {};
    accounts.forEach(a => {
      const t = (a.type || 'other').replace('_', ' ');
      if (!types[t]) types[t] = { count: 0, balance: 0 };
      types[t].count++;
      types[t].balance += Number(a.balance || 0);
    });
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444'];
    return Object.entries(types).map(([name, v], i) => ({ name, value: v.count, balance: v.balance, color: colors[i % colors.length] }));
  }, [accounts]);

  // ── Recent transactions ──────────────────────────────────────────────────────
  const recentTxns = useMemo(() =>
    [...transactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6),
    [transactions]
  );

  // ── HP portfolio ─────────────────────────────────────────────────────────────
  const activeHP = hpAgreements.filter(a => a.status === 'active');
  const hpOutstanding = activeHP.reduce((s, a) => s + Number(a.remaining || 0), 0);

  // ── Collection rate ──────────────────────────────────────────────────────────
  const totalLoanBook = loans.filter(l => l.status === 'active').reduce((s, l) => s + Number(l.outstanding || 0), 0);
  const totalSavings = accounts.filter(a => ['savings','current','fixed_deposit','micro_savings','susu','joint'].includes(a.type)).reduce((s, a) => s + Number(a.balance || 0), 0);

  const overdueLoans = loans.filter(l => l.status === 'overdue');
  const pendingLoans = loans.filter(l => l.status === 'pending');

  return (
    <div className="fade-in">

      {/* ── Urgent alert banner ─────────────────────────────────────────────── */}
      {isAdmin && actionable.length > 0 && (
        <div
          onClick={() => navigate('/transactions/approvals')}
          style={{
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            borderRadius: 10, padding: '14px 20px', marginBottom: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', boxShadow: '0 4px 12px rgba(245,158,11,0.3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Clock size={20} style={{ color: '#fff' }} />
            <div>
              <div style={{ fontWeight: 800, color: '#fff', fontSize: 14 }}>
                {actionable.length} transaction{actionable.length > 1 ? 's' : ''} awaiting your approval
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>Click to review and approve or reject</div>
            </div>
          </div>
          <ArrowUpRight size={20} style={{ color: '#fff' }} />
        </div>
      )}

      {/* ── KPI Row 1: Core metrics ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 14 }}>
        <KPICard
          label="Total Savings"
          value={GHS(totalSavings)}
          sub={`${accounts.filter(a => ['savings','current','fixed_deposit','micro_savings','susu','joint'].includes(a.type)).length} accounts`}
          icon={PiggyBank}
          color="#10b981"
          onClick={() => navigate('/reports')}
        />
        <KPICard
          label="Loan Book"
          value={GHS(totalLoanBook)}
          sub={`${stats.activeLoans} active loans`}
          icon={CreditCard}
          color="#3b82f6"
          onClick={() => navigate('/loans')}
        />
        <KPICard
          label="HP Portfolio"
          value={GHS(hpOutstanding)}
          sub={`${activeHP.length} active agreements`}
          icon={ShoppingBag}
          color="#8b5cf6"
          onClick={() => navigate('/hp/agreements')}
        />
        <KPICard
          label="Total Customers"
          value={fmt(stats.totalCustomers)}
          sub={`${accounts.length} accounts opened`}
          icon={Users}
          color="#06b6d4"
          onClick={() => navigate('/customers')}
        />
        <KPICard
          label="App Users"
          value={fmt(appUserCount)}
          sub={`of ${fmt(stats.totalCustomers)} customers`}
          icon={Smartphone}
          color="#f59e0b"
          onClick={() => navigate('/customers')}
        />
      </div>

      {/* ── KPI Row 2: Today's activity ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        <KPICard
          label="Today's Deposits"
          value={GHS(todayCredits)}
          sub={`${todayTxns.filter(t => t.type === 'credit').length} transactions`}
          icon={ArrowDownRight}
          color="#10b981"
        />
        <KPICard
          label="Today's Withdrawals"
          value={GHS(todayDebits)}
          sub={`${todayTxns.filter(t => t.type === 'debit').length} transactions`}
          icon={ArrowUpRight}
          color="#ef4444"
        />
        <KPICard
          label="Today's Collections"
          value={GHS(todayCollected)}
          sub={`${todayCollections.length} collections`}
          icon={Target}
          color="#f59e0b"
          onClick={() => navigate('/collectors/report')}
        />
        <KPICard
          label="Pending Approvals"
          value={pendingApprovals.length}
          sub={actionable.length > 0 ? `${actionable.length} need your action` : 'All clear'}
          icon={Clock}
          color={pendingApprovals.length > 0 ? '#ef4444' : '#10b981'}
          onClick={() => navigate('/transactions/approvals')}
        />
      </div>

      {/* ── Charts row ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Monthly volume chart */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Monthly Activity</div>
              <div className="card-subtitle">Deposits, withdrawals & collections — last 6 months</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => GHS(v)} contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }} />
              <Bar dataKey="deposits" fill="#10b981" name="Deposits" radius={[3, 3, 0, 0]} />
              <Bar dataKey="withdrawals" fill="#ef4444" name="Withdrawals" radius={[3, 3, 0, 0]} />
              <Bar dataKey="collections" fill="#f59e0b" name="Collections" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Account distribution */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Account Types</div>
              <div className="card-subtitle">Distribution by type</div>
            </div>
          </div>
          {accountDist.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={accountDist} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                  {accountDist.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip
                  formatter={(v, name, props) => [`${v} accounts · ${GHS(props.payload.balance)}`, name]}
                  contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 11 }}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              No account data yet
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom row ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>

        {/* Recent transactions */}
        <div className="card" style={{ gridColumn: 'span 1' }}>
          <div className="card-header">
            <div className="card-title">Recent Transactions</div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/transactions')}>View all</button>
          </div>
          {recentTxns.length === 0 ? (
            <div className="table-empty">No transactions yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {recentTxns.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                      background: t.type === 'credit' ? 'var(--green-bg)' : 'var(--red-bg)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {t.type === 'credit'
                        ? <ArrowDownRight size={14} style={{ color: 'var(--green)' }} />
                        : <ArrowUpRight size={14} style={{ color: 'var(--red)' }} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.narration}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{new Date(t.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: t.type === 'credit' ? 'var(--green)' : 'var(--red)', flexShrink: 0 }}>
                    {t.type === 'credit' ? '+' : '-'}{GHS(t.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Loan portfolio health */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Loan Portfolio</div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/loans')}>View all</button>
          </div>

          {/* Loan type breakdown */}
          {loanBreakdown.length > 0 ? (
            <div style={{ marginBottom: 16 }}>
              {loanBreakdown.map(item => (
                <div key={item.name} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ textTransform: 'capitalize', color: 'var(--text-2)' }}>{item.name}</span>
                    <span style={{ fontWeight: 700, color: item.color }}>{GHS(item.value)}</span>
                  </div>
                  <div style={{ height: 5, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: `${totalLoanBook > 0 ? (item.value / totalLoanBook) * 100 : 0}%`, height: '100%', background: item.color, borderRadius: 99 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>No active loans</div>
          )}

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            {[
              { label: 'Active', count: stats.activeLoans, color: 'var(--green)' },
              { label: 'Pending', count: stats.pendingLoans, color: '#f59e0b' },
              { label: 'Overdue', count: stats.overdueLoans, color: 'var(--red)' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{item.label}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: item.color }}>{item.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts & quick actions */}
        <div className="card">
          <div className="card-header"><div className="card-title">Alerts</div></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {isAdmin && actionable.length > 0 && (
              <div className="alert alert-warning" style={{ cursor: 'pointer', fontSize: 12 }} onClick={() => navigate('/transactions/approvals')}>
                <Clock size={13} />
                <div><strong>{actionable.length} transaction(s)</strong> awaiting approval</div>
              </div>
            )}
            {overdueLoans.length > 0 && (
              <div className="alert alert-error" style={{ cursor: 'pointer', fontSize: 12 }} onClick={() => navigate('/loans')}>
                <AlertCircle size={13} />
                <div><strong>{overdueLoans.length} overdue loan(s)</strong> — action required</div>
              </div>
            )}
            {pendingLoans.length > 0 && (
              <div className="alert alert-warning" style={{ cursor: 'pointer', fontSize: 12 }} onClick={() => navigate('/loans')}>
                <AlertCircle size={13} />
                <div><strong>{pendingLoans.length} loan(s)</strong> pending approval</div>
              </div>
            )}
            {overdueLoans.length === 0 && pendingLoans.length === 0 && actionable.length === 0 && (
              <div className="alert alert-success" style={{ fontSize: 12 }}>
                <CheckCircle size={13} />
                <div>All clear — no pending alerts</div>
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Quick Actions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { label: 'New Customer', path: '/customers', color: '#10b981' },
                  { label: 'Open Account', path: '/accounts/open', color: '#3b82f6' },
                  { label: 'New Loan', path: '/loans/apply', color: '#f59e0b' },
                  { label: 'Record Collection', path: '/collectors/record', color: '#8b5cf6' },
                ].map(a => (
                  <button key={a.label} className="btn btn-ghost btn-sm"
                    onClick={() => navigate(a.path)}
                    style={{ justifyContent: 'flex-start', borderLeft: `3px solid ${a.color}`, borderRadius: 6, paddingLeft: 10, fontSize: 12 }}>
                    <Zap size={12} style={{ color: a.color }} />{a.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>HP Portfolio</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: 'var(--text-2)' }}>Active Agreements</span>
                <span style={{ fontWeight: 700, color: '#8b5cf6' }}>{activeHP.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-2)' }}>Outstanding</span>
                <span style={{ fontWeight: 700 }}>{GHS(hpOutstanding)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
