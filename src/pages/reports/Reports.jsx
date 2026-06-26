import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Download, FileText, Calendar, Users } from 'lucide-react';
import { exportReportPDF, exportLoanReportPDF, exportCSV } from '../../core/export';

const GHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

const PERIODS = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'Last Month', value: 'last_month' },
  { label: 'This Quarter', value: 'quarter' },
  { label: 'This Year', value: 'year' },
  { label: 'Custom', value: 'custom' },
];

function getPeriodRange(period) {
  const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (period) {
    case 'today': return [today, now];
    case 'yesterday': { const y = new Date(today); y.setDate(y.getDate() - 1); const ye = new Date(y); ye.setHours(23,59,59); return [y, ye]; }
    case 'week': { const w = new Date(today); w.setDate(w.getDate() - w.getDay()); return [w, now]; }
    case 'month': return [new Date(now.getFullYear(), now.getMonth(), 1), now];
    case 'last_month': { const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); const lme = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59); return [lm, lme]; }
    case 'quarter': { const qm = Math.floor(now.getMonth() / 3) * 3; return [new Date(now.getFullYear(), qm, 1), now]; }
    case 'year': return [new Date(now.getFullYear(), 0, 1), now];
    default: return [null, null];
  }
}

export default function Reports() {
  const { customers, accounts, transactions, loans, collectors, collections, hpAgreements, hpPayments, auditLog, products } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [period, setPeriod] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  // Duplicates tab state
  const [dupSearch, setDupSearch] = useState('');
  const [selectedCust, setSelectedCust] = useState(null);

  const [from, to] = useMemo(() => {
    if (period === 'custom') return [customFrom ? new Date(customFrom) : null, customTo ? new Date(customTo + 'T23:59:59') : null];
    return getPeriodRange(period);
  }, [period, customFrom, customTo]);

  const inRange = (dateStr) => {
    const d = new Date(dateStr);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  const periodTxns = transactions.filter(t => inRange(t.createdAt));
  const periodLoans = loans.filter(l => inRange(l.createdAt));
  const periodHP = hpAgreements.filter(a => inRange(a.createdAt));
  const periodPayments = hpPayments.filter(p => inRange(p.createdAt));

  const monthlyData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const m = d.getMonth(); const y = d.getFullYear();
      const txns = transactions.filter(t => { const td = new Date(t.createdAt); return td.getMonth() === m && td.getFullYear() === y; });
      months.push({
        name: d.toLocaleString('default', { month: 'short' }),
        credits: txns.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0),
        debits: txns.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0),
        count: txns.length,
      });
    }
    return months;
  }, [transactions]);

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'transactions', label: 'Transactions' },
    { key: 'loans', label: 'Loans' },
    { key: 'savings', label: 'Savings' },
    { key: 'hp', label: 'Hire Purchase' },
    { key: 'products', label: 'By Product' },
    { key: 'customers', label: 'Customers' },
    { key: 'audit', label: 'Audit Trail' },
    { key: 'duplicates', label: '⚠ Duplicates' },
  ];

  // ── Export helpers ──────────────────────────────────────────────────────────
  const exportTxnPDF = () => exportReportPDF({
    title: 'Transaction Report',
    subtitle: `Period: ${from?.toLocaleDateString() || 'All'} to ${to?.toLocaleDateString() || 'Today'} · ${periodTxns.length} transactions`,
    columns: ['Date', 'Reference', 'Account', 'Narration', 'Type', 'Amount', 'Balance After', 'Posted By'],
    rows: periodTxns.map(t => {
      const acc = accounts.find(a => a.id === t.accountId);
      const amtStr = `GHC ${Number(t.amount||0).toLocaleString('en-GH',{minimumFractionDigits:2})}`;
      const balStr = `GHC ${Number(t.balanceAfter||0).toLocaleString('en-GH',{minimumFractionDigits:2})}`;
      return [new Date(t.createdAt).toLocaleString(), t.reference, acc?.accountNumber || '—', t.narration, t.type.toUpperCase(), amtStr, balStr, t.posterName || '—'];
    }),
    summary: [
      ['Total Credits', `GHC ${Number(periodTxns.filter(t=>t.type==='credit').reduce((s,t)=>s+t.amount,0)).toLocaleString('en-GH',{minimumFractionDigits:2})}`],
      ['Total Debits', `GHC ${Number(periodTxns.filter(t=>t.type==='debit').reduce((s,t)=>s+t.amount,0)).toLocaleString('en-GH',{minimumFractionDigits:2})}`],
    ],
  });

  const exportLoanPDF = () => exportLoanReportPDF({
    loans,
    customers,
    accounts,
    period: `${from?.toLocaleDateString() || 'All'} to ${to?.toLocaleDateString() || 'Today'}`,
  });

  const exportHPPDF = () => exportReportPDF({
    title: 'Hire Purchase Report',
    subtitle: `Period: ${from?.toLocaleDateString() || 'All'} to ${to?.toLocaleDateString() || 'Today'}`,
    columns: ['Customer', 'Item', 'Total Price', 'Paid', 'Remaining', 'Frequency', 'Status', 'Last Payment'],
    rows: hpAgreements.map(a => {
      const c = customers.find(x => x.id === a.customerId);
      const totalPriceStr = `GHC ${Number(a.totalPrice||0).toLocaleString('en-GH',{minimumFractionDigits:2})}`;
      const paidStr = `GHC ${Number(a.totalPaid||0).toLocaleString('en-GH',{minimumFractionDigits:2})}`;
      const remStr = `GHC ${Number(a.remaining||0).toLocaleString('en-GH',{minimumFractionDigits:2})}`;
      return [c?.name || '—', a.itemName, totalPriceStr, paidStr, remStr, a.paymentFrequency, a.status, a.lastPaymentDate ? new Date(a.lastPaymentDate).toLocaleDateString() : '—'];
    }),
    summary: [['Active', hpAgreements.filter(a => a.status === 'active').length], ['Completed', hpAgreements.filter(a => a.status === 'completed').length], ['Total Collected', `GHC ${Number(hpPayments.reduce((s, p) => s + p.amount, 0)).toLocaleString('en-GH',{minimumFractionDigits:2})}`]],
  });

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Reports</div>
          <div className="page-desc">Analytics, statements and data exports</div>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={() => navigate('/reports/teller')}>
            <Users size={16} />
            Teller Call-Over
          </button>
        </div>
      </div>

      {/* Period selector */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Calendar size={15} style={{ color: 'var(--text-3)' }} />
          {PERIODS.map(p => (
            <button key={p.value} className={`btn btn-sm ${period === p.value ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPeriod(p.value)}>{p.label}</button>
          ))}
          {period === 'custom' && (
            <>
              <input className="form-control" type="date" style={{ width: 150 }} value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
              <span style={{ color: 'var(--text-3)' }}>to</span>
              <input className="form-control" type="date" style={{ width: 150 }} value={customTo} onChange={e => setCustomTo(e.target.value)} />
            </>
          )}
        </div>
      </div>

      <div className="tabs">
        {TABS.map(t => <div key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</div>)}
      </div>

      {/* ── Overview ─────────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div>
          <div className="stat-grid" style={{ marginBottom: 20 }}>
            {[
              { label: 'Transactions', value: periodTxns.length, color: 'var(--brand)' },
              { label: 'Credits', value: GHS(periodTxns.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0)), color: 'var(--green)' },
              { label: 'Debits', value: GHS(periodTxns.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0)), color: 'var(--red)' },
              { label: 'New Loans', value: periodLoans.length, color: 'var(--yellow)' },
              { label: 'HP Agreements', value: periodHP.length, color: 'var(--purple)' },
              { label: 'HP Collected', value: GHS(periodPayments.reduce((s, p) => s + p.amount, 0)), color: 'var(--green)' },
            ].map(s => (
              <div key={s.label} className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div className="grid-2">
            <div className="card">
              <div className="card-header"><div className="card-title">Monthly Volume (6 months)</div></div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyData} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => GHS(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="credits" fill="#10b981" name="Credits" radius={[4,4,0,0]} />
                  <Bar dataKey="debits" fill="#ef4444" name="Debits" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <div className="card-header"><div className="card-title">Transaction Count Trend</div></div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={monthlyData} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="count" stroke="var(--brand)" strokeWidth={2} dot={{ r: 4 }} name="Transactions" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── Transactions ─────────────────────────────────────────────────────── */}
      {tab === 'transactions' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Transaction Report ({periodTxns.length})</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(periodTxns.map(t => { const acc = accounts.find(a => a.id === t.accountId); return { Date: new Date(t.createdAt).toLocaleString(), Reference: t.reference, Account: acc?.accountNumber, Narration: t.narration, Type: t.type, Amount: t.amount, BalanceAfter: t.balanceAfter, PostedBy: t.posterName, Channel: t.channel }; }), 'transactions')}><Download size={13} />CSV</button>
              <button className="btn btn-primary btn-sm" onClick={exportTxnPDF}><FileText size={13} />PDF</button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Reference</th><th>Account</th><th>Narration</th><th>Type</th><th>Amount</th><th>Balance After</th><th>Posted By</th><th>Channel</th></tr></thead>
              <tbody>
                {periodTxns.length === 0 ? <tr><td colSpan={9} className="table-empty">No transactions in period</td></tr>
                : periodTxns.slice(0, 200).map(t => {
                  const acc = accounts.find(a => a.id === t.accountId);
                  return (
                    <tr key={t.id} style={{ opacity: t.reversed ? 0.5 : 1 }}>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(t.createdAt).toLocaleString()}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{t.reference}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{acc?.accountNumber || '—'}</td>
                      <td style={{ fontSize: 12 }}>{t.narration}</td>
                      <td><span className={`badge ${t.type === 'credit' ? 'badge-green' : 'badge-red'}`}>{t.type}</span></td>
                      <td style={{ fontWeight: 700, color: t.type === 'credit' ? 'var(--green)' : 'var(--red)', whiteSpace: 'nowrap' }}>{t.type === 'credit' ? '+' : '-'}{GHS(t.amount)}</td>
                      <td>{GHS(t.balanceAfter)}</td>
                      <td style={{ fontSize: 12 }}>{t.posterName || '—'}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-3)' }}>{t.channel || 'teller'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Loans ────────────────────────────────────────────────────────────── */}
      {tab === 'loans' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Loan Portfolio Report ({loans.length})</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(loans.map(l => { const c = customers.find(x => x.id === l.customerId); return { Customer: c?.name, Type: l.type, Amount: l.amount, Outstanding: l.outstanding, Rate: l.interestRate, Tenure: l.tenure, Monthly: l.monthlyPayment, Status: l.status, NextDue: l.nextDueDate }; }), 'loans')}><Download size={13} />CSV</button>
              <button className="btn btn-primary btn-sm" onClick={exportLoanPDF}><FileText size={13} />PDF</button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Customer</th><th>Type</th><th>Amount</th><th>Outstanding</th><th>Rate</th><th>Monthly</th><th>Status</th><th>Next Due</th></tr></thead>
              <tbody>
                {loans.length === 0 ? <tr><td colSpan={8} className="table-empty">No loans</td></tr>
                : loans.map(l => {
                  const c = customers.find(x => x.id === l.customerId);
                  return (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 600 }}>{c?.name || '—'}</td>
                      <td style={{ textTransform: 'capitalize' }}>{l.type?.replace('_', ' ')}</td>
                      <td>{GHS(l.amount)}</td>
                      <td style={{ fontWeight: 700, color: l.outstanding > 0 ? 'var(--text)' : 'var(--green)' }}>{GHS(l.outstanding)}</td>
                      <td>{l.interestRate}%</td>
                      <td>{GHS(l.monthlyPayment)}</td>
                      <td><span className={`badge ${l.status === 'active' ? 'badge-green' : l.status === 'overdue' ? 'badge-red' : l.status === 'pending' ? 'badge-yellow' : 'badge-gray'}`}>{l.status}</span></td>
                      <td style={{ fontSize: 12, color: l.status === 'overdue' ? 'var(--red)' : 'var(--text-3)' }}>{l.nextDueDate ? new Date(l.nextDueDate).toLocaleDateString() : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── HP ───────────────────────────────────────────────────────────────── */}
      {tab === 'hp' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Hire Purchase Report ({hpAgreements.length})</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(hpAgreements.map(a => { const c = customers.find(x => x.id === a.customerId); return { Customer: c?.name, Item: a.itemName, TotalPrice: a.totalPrice, Paid: a.totalPaid, Remaining: a.remaining, Frequency: a.paymentFrequency, Status: a.status, LastPayment: a.lastPaymentDate }; }), 'hp-agreements')}><Download size={13} />CSV</button>
              <button className="btn btn-primary btn-sm" onClick={exportHPPDF}><FileText size={13} />PDF</button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Customer</th><th>Item</th><th>Total</th><th>Paid</th><th>Remaining</th><th>Progress</th><th>Frequency</th><th>Status</th></tr></thead>
              <tbody>
                {hpAgreements.length === 0 ? <tr><td colSpan={8} className="table-empty">No HP agreements</td></tr>
                : hpAgreements.map(a => {
                  const c = customers.find(x => x.id === a.customerId);
                  const pct = a.totalPrice > 0 ? Math.min(100, (a.totalPaid / a.totalPrice) * 100) : 0;
                  return (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600 }}>{c?.name || '—'}</td>
                      <td>{a.itemName}</td>
                      <td>{GHS(a.totalPrice)}</td>
                      <td style={{ color: 'var(--green)', fontWeight: 700 }}>{GHS(a.totalPaid)}</td>
                      <td style={{ color: 'var(--red)', fontWeight: 700 }}>{GHS(a.remaining)}</td>
                      <td style={{ minWidth: 100 }}>
                        <div className="progress"><div className="progress-bar" style={{ width: `${pct}%`, background: 'var(--brand)' }} /></div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{pct.toFixed(0)}%</div>
                      </td>
                      <td style={{ textTransform: 'capitalize' }}>{a.paymentFrequency}</td>
                      <td><span className={`badge ${a.status === 'completed' ? 'badge-green' : 'badge-blue'}`}>{a.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Savings Report ───────────────────────────────────────────────── */}
      {tab === 'savings' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Savings Report</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => {
                const savingsAccounts = accounts.filter(a => ['savings','current','fixed_deposit','micro_savings','susu','joint'].includes(a.type));
                exportCSV(savingsAccounts.map(a => {
                  const c = customers.find(x => x.id === a.customerId);
                  const txns = transactions.filter(t => t.accountId === a.id);
                  const credits = txns.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
                  const debits = txns.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
                  return { Customer: c?.name, Phone: c?.phone, AccountNumber: a.accountNumber, Type: a.type, Balance: a.balance, TotalDeposits: credits, TotalWithdrawals: debits, InterestRate: a.interestRate, Status: a.status, OpenedAt: a.openedAt };
                }), 'savings-report');
              }}><Download size={13} />CSV</button>
              <button className="btn btn-primary btn-sm" onClick={() => {
                const savingsAccounts = accounts.filter(a => ['savings','current','fixed_deposit','micro_savings','susu','joint'].includes(a.type));
                exportReportPDF({
                  title: 'Savings Report',
                  subtitle: `${savingsAccounts.length} savings accounts · Total: GHC ${Number(savingsAccounts.reduce((s, a) => s + a.balance, 0)).toLocaleString('en-GH',{minimumFractionDigits:2})}`,
                  columns: ['Customer', 'Account No.', 'Type', 'Balance', 'Interest Rate', 'Status'],
                  rows: savingsAccounts.map(a => {
                    const c = customers.find(x => x.id === a.customerId);
                    return [c?.name || '—', a.accountNumber, a.type, `GHC ${Number(a.balance||0).toLocaleString('en-GH',{minimumFractionDigits:2})}`, `${a.interestRate}%`, a.status];
                  }),
                  summary: [['Total Accounts', savingsAccounts.length], ['Total Balance', `GHC ${Number(savingsAccounts.reduce((s, a) => s + a.balance, 0)).toLocaleString('en-GH',{minimumFractionDigits:2})}`]],
                });
              }}><FileText size={13} />PDF</button>
            </div>
          </div>
          {/* Summary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
            {['savings','current','fixed_deposit','joint'].map(type => {
              const accs = accounts.filter(a => a.type === type);
              return (
                <div key={type} style={{ padding: 14, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{type.replace('_',' ')}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>{GHS(accs.reduce((s, a) => s + a.balance, 0))}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{accs.length} accounts</div>
                </div>
              );
            })}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Customer</th><th>Account No.</th><th>Type</th><th style={{ textAlign:'right' }}>Balance</th><th>Rate</th><th>Total Deposits</th><th>Total Withdrawals</th><th>Status</th><th>Opened</th></tr></thead>
              <tbody>
                {accounts.filter(a => ['savings','current','fixed_deposit','micro_savings','susu','joint'].includes(a.type)).map(a => {
                  const c = customers.find(x => x.id === a.customerId);
                  const txns = transactions.filter(t => t.accountId === a.id);
                  const credits = txns.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
                  const debits = txns.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
                  return (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600 }}>{c?.name || '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{a.accountNumber}</td>
                      <td style={{ textTransform: 'capitalize', fontSize: 12 }}>{a.type?.replace('_',' ')}</td>
                      <td style={{ textAlign:'right', fontWeight: 700, color: a.balance < 0 ? 'var(--red)' : 'var(--green)' }}>{GHS(a.balance)}</td>
                      <td>{a.interestRate}%</td>
                      <td style={{ color: 'var(--green)', fontWeight: 600 }}>{GHS(credits)}</td>
                      <td style={{ color: 'var(--red)', fontWeight: 600 }}>{GHS(debits)}</td>
                      <td><span className={`badge badge-${a.status === 'active' ? 'green' : 'gray'}`}>{a.status}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{a.openedAt ? new Date(a.openedAt).toLocaleDateString() : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── By Product Report ────────────────────────────────────────────────── */}
      {tab === 'products' && (
        <div>
          <div className="alert alert-info" style={{ marginBottom: 20 }}>
            <FileText size={14} />Select a product below to spool its individual report — showing all customers, balances, and activity for that product.
          </div>
          {(products || []).length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>No products configured</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {(products || []).filter(p => p.status === 'active').map(prod => {
                const isLoan = ['personal','hire_purchase','micro','mortgage','emergency','group'].includes(prod.category);
                const prodAccounts = accounts.filter(a => a.type === prod.category);
                const prodLoans = loans.filter(l => l.type === prod.category);
                const totalBalance = prodAccounts.reduce((s, a) => s + a.balance, 0);
                const totalOutstanding = prodLoans.filter(l => l.status === 'active').reduce((s, l) => s + l.outstanding, 0);

                return (
                  <div key={prod.id} className="card">
                    <div className="card-header">
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="card-title">{prod.name}</div>
                          <span className={`badge ${isLoan ? 'badge-blue' : 'badge-green'}`}>{isLoan ? '💳 Loan' : '💰 Savings'}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{prod.interestRate}% p.a.</span>
                        </div>
                        <div className="card-subtitle">{prod.description || prod.category?.replace(/_/g,' ')}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => {
                          const rows = isLoan
                            ? prodLoans.map(l => { const c = customers.find(x => x.id === l.customerId); const a = accounts.find(x => x.id === l.accountId); return { Customer: c?.name, Phone: c?.phone, AccountNumber: a?.accountNumber, Amount: l.amount, Outstanding: l.outstanding, Rate: l.interestRate, Monthly: l.monthlyPayment, Status: l.status, NextDue: l.nextDueDate }; })
                            : prodAccounts.map(a => { const c = customers.find(x => x.id === a.customerId); return { Customer: c?.name, Phone: c?.phone, AccountNumber: a.accountNumber, Balance: a.balance, Rate: a.interestRate, Status: a.status, Opened: a.openedAt }; });
                          exportCSV(rows, `${prod.name.replace(/\s+/g,'-').toLowerCase()}-report`);
                        }}><Download size={13} />CSV</button>
                        <button className="btn btn-primary btn-sm" onClick={() => {
                          const rows = isLoan
                            ? prodLoans.map(l => { const c = customers.find(x => x.id === l.customerId); const a = accounts.find(x => x.id === l.accountId); return [c?.name||'—', a?.accountNumber||'—', `GHC ${Number(l.amount||0).toLocaleString('en-GH',{minimumFractionDigits:2})}`, `GHC ${Number(l.outstanding||0).toLocaleString('en-GH',{minimumFractionDigits:2})}`, `${l.interestRate}%`, `GHC ${Number(l.monthlyPayment||0).toLocaleString('en-GH',{minimumFractionDigits:2})}`, l.status, l.nextDueDate ? new Date(l.nextDueDate).toLocaleDateString() : '—']; })
                            : prodAccounts.map(a => { const c = customers.find(x => x.id === a.customerId); return [c?.name||'—', a.accountNumber, `GHC ${Number(a.balance||0).toLocaleString('en-GH',{minimumFractionDigits:2})}`, `${a.interestRate}%`, a.status, a.openedAt ? new Date(a.openedAt).toLocaleDateString() : '—']; });
                          exportReportPDF({
                            title: `${prod.name} - Product Report`,
                            subtitle: `${isLoan ? `${prodLoans.length} loans · Outstanding: GHC ${Number(totalOutstanding).toLocaleString('en-GH',{minimumFractionDigits:2})}` : `${prodAccounts.length} accounts · Total Balance: GHC ${Number(totalBalance).toLocaleString('en-GH',{minimumFractionDigits:2})}`}`,
                            columns: isLoan ? ['Customer','Account','Amount','Outstanding','Rate','Monthly','Status','Next Due'] : ['Customer','Account No.','Balance','Rate','Status','Opened'],
                            rows,
                            summary: isLoan
                              ? [['Total Loans', prodLoans.length], ['Active', prodLoans.filter(l=>l.status==='active').length], ['Total Outstanding', `GHC ${Number(totalOutstanding).toLocaleString('en-GH',{minimumFractionDigits:2})}`]]
                              : [['Total Accounts', prodAccounts.length], ['Total Balance', `GHC ${Number(totalBalance).toLocaleString('en-GH',{minimumFractionDigits:2})}`]],
                          });
                        }}><FileText size={13} />PDF</button>
                      </div>
                    </div>

                    {/* Quick stats */}
                    <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                      {isLoan ? (
                        <>
                          <div style={{ padding: '8px 14px', background: 'var(--blue-bg)', borderRadius: 8 }}>
                            <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 600, textTransform: 'uppercase' }}>Total Loans</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#1e40af' }}>{prodLoans.length}</div>
                          </div>
                          <div style={{ padding: '8px 14px', background: 'var(--green-bg)', borderRadius: 8 }}>
                            <div style={{ fontSize: 11, color: '#065f46', fontWeight: 600, textTransform: 'uppercase' }}>Active</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#065f46' }}>{prodLoans.filter(l=>l.status==='active').length}</div>
                          </div>
                          <div style={{ padding: '8px 14px', background: 'var(--red-bg)', borderRadius: 8 }}>
                            <div style={{ fontSize: 11, color: '#991b1b', fontWeight: 600, textTransform: 'uppercase' }}>Overdue</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#991b1b' }}>{prodLoans.filter(l=>l.status==='overdue').length}</div>
                          </div>
                          <div style={{ padding: '8px 14px', background: 'var(--yellow-bg)', borderRadius: 8 }}>
                            <div style={{ fontSize: 11, color: '#92400e', fontWeight: 600, textTransform: 'uppercase' }}>Outstanding</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#92400e' }}>{GHS(totalOutstanding)}</div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ padding: '8px 14px', background: 'var(--green-bg)', borderRadius: 8 }}>
                            <div style={{ fontSize: 11, color: '#065f46', fontWeight: 600, textTransform: 'uppercase' }}>Accounts</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#065f46' }}>{prodAccounts.length}</div>
                          </div>
                          <div style={{ padding: '8px 14px', background: 'var(--blue-bg)', borderRadius: 8 }}>
                            <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 600, textTransform: 'uppercase' }}>Total Balance</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#1e40af' }}>{GHS(totalBalance)}</div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Mini table */}
                    <div className="table-wrap" style={{ maxHeight: 240, overflowY: 'auto' }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Customer</th><th>Account No.</th>
                            {isLoan ? <><th>Amount</th><th>Outstanding</th><th>Monthly</th><th>Status</th></> : <><th style={{ textAlign:'right' }}>Balance</th><th>Rate</th><th>Status</th></>}
                          </tr>
                        </thead>
                        <tbody>
                          {(isLoan ? prodLoans : prodAccounts).slice(0, 50).map(item => {
                            const c = customers.find(x => x.id === (item.customerId || item.customer_id));
                            const a = isLoan ? accounts.find(x => x.id === (item.accountId || item.account_id)) : item;
                            return (
                              <tr key={item.id}>
                                <td style={{ fontWeight: 600 }}>{c?.name || '—'}</td>
                                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{a?.accountNumber || '—'}</td>
                                {isLoan ? (
                                  <>
                                    <td>{GHS(item.amount)}</td>
                                    <td style={{ fontWeight: 700, color: item.outstanding > 0 ? 'var(--text)' : 'var(--green)' }}>{GHS(item.outstanding)}</td>
                                    <td>{GHS(item.monthlyPayment)}</td>
                                    <td><span className={`badge badge-${item.status === 'active' ? 'green' : item.status === 'overdue' ? 'red' : item.status === 'pending' ? 'yellow' : 'gray'}`}>{item.status}</span></td>
                                  </>
                                ) : (
                                  <>
                                    <td style={{ textAlign:'right', fontWeight: 700, color: item.balance < 0 ? 'var(--red)' : 'var(--green)' }}>{GHS(item.balance)}</td>
                                    <td>{item.interestRate}%</td>
                                    <td><span className={`badge badge-${item.status === 'active' ? 'green' : 'gray'}`}>{item.status}</span></td>
                                  </>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {tab === 'customers' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Customer Report ({customers.length})</div>
            <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(customers.map(c => ({ Name: c.name, Phone: c.phone, Email: c.email, GhanaCard: c.ghanaCard, KYC: c.kycStatus, Occupation: c.occupation, Income: c.monthlyIncome, Joined: c.createdAt })), 'customers')}><Download size={13} />CSV</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Phone</th><th>Ghana Card</th><th>KYC</th><th>Accounts</th><th>Active Loans</th><th>HP Agreements</th><th>Joined</th></tr></thead>
              <tbody>
                {customers.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.phone}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.ghanaCard || '—'}</td>
                    <td><span className={`badge ${c.kycStatus === 'verified' ? 'badge-green' : 'badge-yellow'}`}>{c.kycStatus}</span></td>
                    <td>{accounts.filter(a => a.customerId === c.id).length}</td>
                    <td>{loans.filter(l => l.customerId === c.id && l.status === 'active').length}</td>
                    <td>{hpAgreements.filter(a => a.customerId === c.id && a.status === 'active').length}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{new Date(c.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Audit Trail ──────────────────────────────────────────────────────── */}
      {tab === 'audit' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Audit Trail ({auditLog.length})</div>
            <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(auditLog.map(e => ({ Timestamp: e.timestamp, User: e.userName, Action: e.action, Entity: e.entity, Detail: e.detail })), 'audit-log')}><Download size={13} />CSV</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead>
              <tbody>
                {auditLog.length === 0 ? <tr><td colSpan={5} className="table-empty">No audit entries</td></tr>
                : [...auditLog].reverse().slice(0, 200).map(e => (
                  <tr key={e.id}>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: 'var(--text-3)' }}>{new Date(e.timestamp).toLocaleString()}</td>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{e.userName || '—'}</td>
                    <td><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'var(--blue-bg)', color: '#1e40af' }}>{e.action}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'capitalize' }}>{e.entity}</td>
                    <td style={{ fontSize: 12 }}>{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Duplicates Report ─────────────────────────────────────────────────── */}
      {tab === 'duplicates' && (() => {
        const norm = (s) => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
        const q = dupSearch.trim().toLowerCase();

        // 1. All customers with 2+ accounts
        const allMultiAcct = customers
          .map(c => ({ customer: c, accounts: accounts.filter(a => (a.customer_id || a.customerId) === c.id) }))
          .filter(r => r.accounts.length > 1)
          .sort((a, b) => b.accounts.length - a.accounts.length);
        const multiAcct = q ? allMultiAcct.filter(r =>
          norm(r.customer.name).includes(q) || (r.customer.phone||'').includes(q) ||
          (r.customer.ghana_card||r.customer.ghanaCard||'').toLowerCase().includes(q)
        ) : allMultiAcct;

        // 2. Exact duplicate names
        const nameGroups = {};
        customers.forEach(c => { const k = norm(c.name); if (!nameGroups[k]) nameGroups[k] = []; nameGroups[k].push(c); });
        const allExactDups = Object.values(nameGroups).filter(g => g.length > 1);
        const exactDups = q ? allExactDups.filter(g => g.some(c => norm(c.name).includes(q)||(c.phone||'').includes(q))) : allExactDups;

        // 3. Similar names (Levenshtein ≤ 2)
        const lev = (a, b) => {
          const dp = Array.from({length:a.length+1},(_,i)=>Array.from({length:b.length+1},(_,j)=>i===0?j:j===0?i:0));
          for(let i=1;i<=a.length;i++) for(let j=1;j<=b.length;j++)
            dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
          return dp[a.length][b.length];
        };
        const normed = customers.map(c=>({c,n:norm(c.name)}));
        const allSimilar=[]; const seen=new Set();
        for(let i=0;i<normed.length;i++) for(let j=i+1;j<normed.length;j++){
          const k=normed[i].c.id+'_'+normed[j].c.id; if(seen.has(k)) continue;
          const d=lev(normed[i].n,normed[j].n);
          if(d>0&&d<=2){seen.add(k);allSimilar.push({a:normed[i].c,b:normed[j].c,distance:d});}
        }
        const similarPairs = q ? allSimilar.filter(p=>norm(p.a.name).includes(q)||norm(p.b.name).includes(q)||(p.a.phone||'').includes(q)||(p.b.phone||'').includes(q)) : allSimilar;

        const tb = (type) => ({
          bg: type==='savings'?'#dcfce7':type==='hire_purchase'?'#ede9fe':type==='current'?'#dbeafe':'#f3f4f6',
          color: type==='savings'?'#16a34a':type==='hire_purchase'?'#7c3aed':type==='current'?'#2563eb':'#374151',
        });
        const exportDups = () => exportCSV(multiAcct.flatMap(r=>r.accounts.map(a=>({'Customer':r.customer.name,'Phone':r.customer.phone,'Ghana Card':r.customer.ghana_card||'','Account':a.account_number||a.accountNumber,'Type':a.type,'Balance':a.balance,'Status':a.status}))),'multi-account-customers');
        const exportSimilar = () => exportCSV([...exactDups.flatMap(g=>g.map(c=>({Type:'EXACT',Name:c.name,Phone:c.phone}))), ...similarPairs.map(p=>({Type:`SIMILAR(${p.distance})`,NameA:p.a.name,PhoneA:p.a.phone,NameB:p.b.name,PhoneB:p.b.phone}))],'similar-names');

        return (
          <>
            {/* Customer detail popup */}
            {selectedCust && (() => {
              const custAccts = accounts.filter(a=>(a.customer_id||a.customerId)===selectedCust.id);
              const custLoans = loans.filter(l=>(l.customer_id||l.customerId)===selectedCust.id&&['active','overdue'].includes(l.status));
              return (
                <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={()=>setSelectedCust(null)}>
                  <div style={{background:'var(--surface)',borderRadius:16,padding:28,maxWidth:580,width:'100%',maxHeight:'85vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,.3)'}} onClick={e=>e.stopPropagation()}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
                      <div>
                        <div style={{fontSize:20,fontWeight:900}}>{selectedCust.name}</div>
                        <div style={{fontSize:13,color:'var(--text-3)',marginTop:4}}>
                          📞 {selectedCust.phone}
                          {(selectedCust.ghana_card||selectedCust.ghanaCard)&&` · 🪪 ${selectedCust.ghana_card||selectedCust.ghanaCard}`}
                          {selectedCust.email&&` · ✉ ${selectedCust.email}`}
                        </div>
                      </div>
                      <button onClick={()=>setSelectedCust(null)} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'var(--text-3)'}}>✕</button>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:20}}>
                      {[{l:'Accounts',v:custAccts.length,c:'#2563eb'},{l:'Total Balance',v:GHS(custAccts.reduce((s,a)=>s+Number(a.balance||0),0)),c:'#16a34a'},{l:'Active Loans',v:custLoans.length,c:'#f59e0b'}].map(s=>(
                        <div key={s.l} style={{padding:'12px 14px',borderRadius:10,background:'var(--surface-2)',textAlign:'center'}}>
                          <div style={{fontSize:20,fontWeight:900,color:s.c}}>{s.v}</div>
                          <div style={{fontSize:11,color:'var(--text-3)',marginTop:2}}>{s.l}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{fontWeight:700,fontSize:12,marginBottom:8,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--text-3)'}}>Accounts ({custAccts.length})</div>
                    {custAccts.length===0?<div style={{color:'var(--text-3)',fontSize:13,marginBottom:16}}>No accounts.</div>:(
                      <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:16}}>
                        {custAccts.map((a,idx)=>{const t=tb(a.type);return(
                          <div key={a.id} style={{padding:'12px 14px',borderRadius:10,border:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                            <div style={{display:'flex',gap:10,alignItems:'center'}}>
                              <span style={{fontSize:11,fontWeight:700,padding:'3px 9px',borderRadius:20,background:t.bg,color:t.color,whiteSpace:'nowrap'}}>
                                {(a.type||'').replace(/_/g,' ')} {custAccts.filter(x=>x.type===a.type).length>1?idx+1:''}
                              </span>
                              <div>
                                <div style={{fontFamily:'monospace',fontWeight:700,fontSize:13}}>{a.account_number||a.accountNumber}</div>
                                <div style={{fontSize:11,color:'var(--text-3)',textTransform:'capitalize'}}>{a.status} · {a.interest_rate??a.interestRate??0}% p.a.</div>
                              </div>
                            </div>
                            <div style={{fontWeight:800,color:Number(a.balance)<0?'#ef4444':'var(--text)'}}>{GHS(a.balance)}</div>
                          </div>
                        );})}
                      </div>
                    )}
                    {custLoans.length>0&&(<>
                      <div style={{fontWeight:700,fontSize:12,marginBottom:8,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--text-3)'}}>Active Loans ({custLoans.length})</div>
                      {custLoans.map(l=>(
                        <div key={l.id} style={{padding:'10px 14px',borderRadius:8,background:'#fff7ed',border:'1px solid #fed7aa',display:'flex',justifyContent:'space-between',marginBottom:6}}>
                          <div><div style={{fontWeight:700,fontSize:13,textTransform:'capitalize'}}>{(l.type||'').replace(/_/g,' ')}</div>{l.item_name&&<div style={{fontSize:11,color:'#c2410c'}}>🛍 {l.item_name}</div>}</div>
                          <div style={{textAlign:'right'}}><div style={{color:'#ef4444',fontWeight:800}}>{GHS(l.outstanding)}</div><div style={{fontSize:11,color:'var(--text-3)'}}>outstanding</div></div>
                        </div>
                      ))}
                    </>)}
                    <div style={{marginTop:20,display:'flex',gap:10}}>
                      <button className="btn btn-primary" style={{flex:1}} onClick={()=>{setSelectedCust(null);navigate(`/customers/${selectedCust.id}`);}}>View Full Profile →</button>
                      <button className="btn btn-secondary" onClick={()=>setSelectedCust(null)}>Close</button>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div style={{display:'flex',flexDirection:'column',gap:20}}>
              {/* Search */}
              <div style={{display:'flex',gap:10,alignItems:'center'}}>
                <div className="search-box" style={{flex:1}}>
                  <Users size={15}/>
                  <input className="form-control" placeholder="Search by name, phone or Ghana Card…" value={dupSearch} onChange={e=>setDupSearch(e.target.value)}/>
                </div>
                {dupSearch&&<button className="btn btn-ghost btn-sm" onClick={()=>setDupSearch('')}>✕ Clear</button>}
              </div>

              {/* Summary */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
                {[{l:'Customers with 2+ Accounts',v:allMultiAcct.length,c:'#f59e0b',bg:'#fffbeb'},{l:'Exact Name Duplicates',v:allExactDups.reduce((s,g)=>s+g.length,0),c:'#ef4444',bg:'#fef2f2'},{l:'Similar Name Pairs',v:allSimilar.length,c:'#8b5cf6',bg:'#f5f3ff'}].map(s=>(
                  <div key={s.l} style={{padding:16,borderRadius:10,background:s.bg,border:`1px solid ${s.c}30`}}>
                    <div style={{fontSize:28,fontWeight:900,color:s.c}}>{s.v}</div>
                    <div style={{fontSize:12,color:'var(--text-3)',marginTop:4}}>{s.l}</div>
                  </div>
                ))}
              </div>

              {/* Multi-account table */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title">Customers with Multiple Accounts ({multiAcct.length})</div>
                  <button className="btn btn-secondary btn-sm" onClick={exportDups}><Download size={13}/>CSV</button>
                </div>
                <div style={{fontSize:12,color:'var(--text-3)',paddingBottom:10}}>👆 Click any row to see full account details</div>
                {multiAcct.length===0?<div className="table-empty">No customers found</div>:(
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Customer</th><th>Phone</th><th>Ghana Card</th><th style={{textAlign:'center'}}># Accts</th><th>Account Types</th><th>Total Balance</th></tr></thead>
                      <tbody>
                        {multiAcct.map(r=>(
                          <tr key={r.customer.id} style={{cursor:'pointer'}} onClick={()=>setSelectedCust(r.customer)}
                            onMouseEnter={e=>e.currentTarget.style.background='var(--surface-2)'}
                            onMouseLeave={e=>e.currentTarget.style.background=''}>
                            <td style={{fontWeight:700}}>{r.customer.name}</td>
                            <td className="font-mono" style={{fontSize:12}}>{r.customer.phone}</td>
                            <td className="font-mono" style={{fontSize:12}}>{r.customer.ghana_card||r.customer.ghanaCard||'—'}</td>
                            <td style={{textAlign:'center'}}><span style={{fontWeight:900,fontSize:18,color:'#f59e0b',background:'#fffbeb',padding:'2px 10px',borderRadius:20}}>{r.accounts.length}</span></td>
                            <td><div style={{display:'flex',flexWrap:'wrap',gap:4}}>{r.accounts.map(a=>{const t=tb(a.type);return(<span key={a.id} style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:20,background:t.bg,color:t.color}}>{(a.type||'').replace(/_/g,' ')}</span>);})}</div></td>
                            <td style={{fontWeight:700}}>{GHS(r.accounts.reduce((s,a)=>s+Number(a.balance||0),0))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Exact duplicates */}
              {/* Exact duplicates — same name, different details */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title" style={{color:'#ef4444'}}>
                    ⚠ Same Name, Different Details
                    {exactDups.length > 0 && <span style={{marginLeft:8,fontSize:13,fontWeight:400,color:'var(--text-3)'}}>({exactDups.length} groups, {allExactDups.reduce((s,g)=>s+g.length,0)} records)</span>}
                  </div>
                  <div style={{display:'flex',gap:8}}>
                    <button className="btn btn-secondary btn-sm" onClick={exportSimilar}><Download size={13}/>CSV</button>
                  </div>
                </div>

                {/* Dedicated search for same-name customers */}
                <div style={{marginBottom:14}}>
                  <div className="search-box">
                    <Users size={14}/>
                    <input className="form-control" placeholder="Search by exact name to find duplicates…"
                      value={dupSearch} onChange={e=>setDupSearch(e.target.value)}/>
                  </div>
                  {dupSearch && (
                    <div style={{fontSize:12,color:'var(--text-3)',marginTop:6}}>
                      Showing results for: <strong>"{dupSearch}"</strong> — {exactDups.length} group(s) found
                    </div>
                  )}
                </div>

                {exactDups.length===0 ? (
                  <div style={{padding:'20px 0',textAlign:'center',color:'var(--text-3)'}}>
                    {dupSearch ? `No same-name customers found for "${dupSearch}"` : 'No exact duplicate names found ✅'}
                  </div>
                ) : (
                  <div style={{display:'flex',flexDirection:'column',gap:16}}>
                    {exactDups.map((group, gi) => {
                      // Find what's different across the group
                      const phones = [...new Set(group.map(c=>c.phone))];
                      const cards = [...new Set(group.map(c=>c.ghana_card||c.ghanaCard||'').filter(Boolean))];
                      const emails = [...new Set(group.map(c=>c.email||'').filter(Boolean))];
                      const allPhoneSame = phones.length === 1;
                      const allCardSame = cards.length <= 1;
                      return (
                        <div key={gi} style={{border:'2px solid #fca5a5',borderRadius:12,overflow:'hidden'}}>
                          {/* Group header */}
                          <div style={{background:'#fef2f2',padding:'10px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid #fca5a5'}}>
                            <div>
                              <span style={{fontWeight:900,fontSize:15,color:'#dc2626'}}>{group[0].name}</span>
                              <span style={{marginLeft:10,fontSize:11,background:'#dc2626',color:'#fff',padding:'2px 8px',borderRadius:20,fontWeight:700}}>{group.length} records</span>
                            </div>
                            <div style={{display:'flex',gap:6,fontSize:11}}>
                              {!allPhoneSame && <span style={{background:'#fff7ed',color:'#c2410c',padding:'2px 8px',borderRadius:20,fontWeight:700,border:'1px solid #fed7aa'}}>📞 Different phones</span>}
                              {!allCardSame && <span style={{background:'#fefce8',color:'#a16207',padding:'2px 8px',borderRadius:20,fontWeight:700,border:'1px solid #fde68a'}}>🪪 Different Ghana Cards</span>}
                              {emails.length > 1 && <span style={{background:'#f0fdf4',color:'#15803d',padding:'2px 8px',borderRadius:20,fontWeight:700,border:'1px solid #bbf7d0'}}>✉ Different emails</span>}
                              {allPhoneSame && allCardSame && <span style={{background:'#dcfce7',color:'#16a34a',padding:'2px 8px',borderRadius:20,fontWeight:700}}>⚠ Identical details</span>}
                            </div>
                          </div>
                          {/* Records */}
                          <table style={{width:'100%',borderCollapse:'collapse'}}>
                            <thead>
                              <tr style={{background:'#fff5f5',fontSize:11,color:'var(--text-3)',textTransform:'uppercase'}}>
                                <th style={{padding:'8px 12px',textAlign:'left',fontWeight:700}}>#</th>
                                <th style={{padding:'8px 12px',textAlign:'left',fontWeight:700}}>Phone</th>
                                <th style={{padding:'8px 12px',textAlign:'left',fontWeight:700}}>Ghana Card</th>
                                <th style={{padding:'8px 12px',textAlign:'left',fontWeight:700}}>Email</th>
                                <th style={{padding:'8px 12px',textAlign:'left',fontWeight:700}}>KYC</th>
                                <th style={{padding:'8px 12px',textAlign:'left',fontWeight:700}}>Accounts</th>
                                <th style={{padding:'8px 12px',textAlign:'left',fontWeight:700}}>Joined</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.map((c, ci) => {
                                const cAccts = accounts.filter(a=>(a.customer_id||a.customerId)===c.id);
                                const phoneDiff = !allPhoneSame;
                                const cardDiff = cards.length > 1 && (c.ghana_card||c.ghanaCard);
                                return (
                                  <tr key={c.id} style={{cursor:'pointer',borderTop:'1px solid #fee2e2'}}
                                    onClick={()=>setSelectedCust(c)}
                                    onMouseEnter={e=>e.currentTarget.style.background='#fff5f5'}
                                    onMouseLeave={e=>e.currentTarget.style.background=''}>
                                    <td style={{padding:'10px 12px',fontWeight:700,color:'#dc2626'}}>{ci+1}</td>
                                    <td style={{padding:'10px 12px',fontFamily:'monospace',fontSize:12,
                                      color: phoneDiff ? '#dc2626' : 'var(--text)',
                                      fontWeight: phoneDiff ? 700 : 400,
                                    }}>
                                      {c.phone}
                                      {phoneDiff && <span style={{marginLeft:4,fontSize:10,color:'#dc2626'}}>⚠</span>}
                                    </td>
                                    <td style={{padding:'10px 12px',fontFamily:'monospace',fontSize:12,
                                      color: cardDiff ? '#a16207' : 'var(--text-3)',
                                      fontWeight: cardDiff ? 700 : 400,
                                    }}>
                                      {c.ghana_card||c.ghanaCard||'—'}
                                      {cardDiff && <span style={{marginLeft:4,fontSize:10,color:'#a16207'}}>⚠</span>}
                                    </td>
                                    <td style={{padding:'10px 12px',fontSize:12,color:'var(--text-3)'}}>{c.email||'—'}</td>
                                    <td style={{padding:'10px 12px',fontSize:12,textTransform:'capitalize'}}>{c.kyc_status||c.kycStatus}</td>
                                    <td style={{padding:'10px 12px'}}>
                                      <span style={{fontSize:12,fontWeight:700,color:'#2563eb'}}>{cAccts.length} account{cAccts.length!==1?'s':''}</span>
                                    </td>
                                    <td style={{padding:'10px 12px',fontSize:12,color:'var(--text-3)',whiteSpace:'nowrap'}}>
                                      {new Date(c.created_at||c.createdAt).toLocaleDateString()}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Similar names */}
              {similarPairs.length>0&&(
                <div className="card">
                  <div className="card-header"><div className="card-title" style={{color:'#8b5cf6'}}>⚠ Similar Names — Possible Duplicates ({similarPairs.length} pairs)</div></div>
                  <div style={{fontSize:12,color:'var(--text-3)',paddingBottom:10}}>👆 Click a name to see account details</div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Name A</th><th>Phone A</th><th>Name B</th><th>Phone B</th><th>Diff</th></tr></thead>
                      <tbody>
                        {similarPairs.map((p,i)=>(
                          <tr key={i}>
                            <td style={{fontWeight:700,cursor:'pointer',color:'var(--brand)'}} onClick={()=>setSelectedCust(p.a)}>{p.a.name}</td>
                            <td className="font-mono" style={{fontSize:12}}>{p.a.phone}</td>
                            <td style={{fontWeight:700,cursor:'pointer',color:'var(--brand)'}} onClick={()=>setSelectedCust(p.b)}>{p.b.name}</td>
                            <td className="font-mono" style={{fontSize:12}}>{p.b.phone}</td>
                            <td><span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:20,background:p.distance===1?'#fef2f2':'#f5f3ff',color:p.distance===1?'#ef4444':'#8b5cf6'}}>{p.distance} char</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {multiAcct.length===0&&exactDups.length===0&&similarPairs.length===0&&(
                <div className="card"><div style={{padding:32,textAlign:'center',color:'var(--text-3)'}}>
                  <div style={{fontSize:32,marginBottom:8}}>✅</div>
                  <div style={{fontWeight:700}}>No duplicates found{q?` for "${dupSearch}"`:''}.</div>
                </div></div>
              )}
            </div>
          </>
        );
      })()}
    </div>
  );
}