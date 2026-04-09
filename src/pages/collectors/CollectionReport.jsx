/* CollectionReport v2 */
import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Download, FileText, Trash2, Calendar, TrendingUp, Users, DollarSign, Printer, RotateCcw } from 'lucide-react';
import { exportCSV, exportCollectionReportPDF } from '../../core/export';
import { authDB } from '../../core/db';
import { supabase } from '../../core/supabase';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const GHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

const PERIOD_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'this_week', label: 'This Week' },
  { key: 'last_week', label: 'Last Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'this_quarter', label: 'This Quarter' },
  { key: 'this_year', label: 'This Year' },
  { key: 'custom', label: 'Custom' },
];

function getPeriodDates(key) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  switch (key) {
    case 'today': return { from: today, to: today };
    case 'yesterday': {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      const ys = y.toISOString().slice(0, 10);
      return { from: ys, to: ys };
    }
    case 'this_week': {
      const d = new Date(now); d.setDate(d.getDate() - d.getDay());
      return { from: d.toISOString().slice(0, 10), to: today };
    }
    case 'last_week': {
      const end = new Date(now); end.setDate(end.getDate() - end.getDay() - 1);
      const start = new Date(end); start.setDate(start.getDate() - 6);
      return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
    }
    case 'this_month':
      return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, to: today };
    case 'last_month': {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lme = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: lm.toISOString().slice(0, 10), to: lme.toISOString().slice(0, 10) };
    }
    case 'this_quarter': {
      const qm = Math.floor(now.getMonth() / 3) * 3;
      return { from: new Date(now.getFullYear(), qm, 1).toISOString().slice(0, 10), to: today };
    }
    case 'this_year':
      return { from: `${now.getFullYear()}-01-01`, to: today };
    default:
      return { from: '', to: '' };
  }
}

const ptBadge = (type) => {
  if (type === 'loan') return <span className="badge badge-blue">Loan Repayment</span>;
  if (type === 'hp') return <span className="badge badge-purple">HP Repayment</span>;
  return <span className="badge badge-green">Savings Deposit</span>;
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function CollectionReport() {
  const { collections, collectors, accounts, loans, refresh, transactions } = useApp();

  const [period, setPeriod] = useState('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [collectorFilter, setCollectorFilter] = useState('all');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState('all');
  const [tab, setTab] = useState('summary');
  const [deleteModal, setDeleteModal] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const user = authDB.currentUser();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const { from, to } = period === 'custom'
    ? { from: customFrom, to: customTo }
    : getPeriodDates(period);

  // ── Normalised + filtered collections ──────────────────────────────────────
  const filtered = useMemo(() => {
    // Build collections from transactions where channel = 'collection'
    const collectionsFromTxns = transactions
      .filter(t => t.channel === 'collection' || (t.narration && t.narration.includes('—')))
      .map(t => {
        // Extract collector name from narration (e.g., "Savings Deposit — DOMINIC")
        const match = t.narration?.match(/—\s*(.+?)(?:\s*\(|$)/);
        const collectorName = match ? match[1].trim() : 'Unknown';
        
        // Find collector by name
        const collector = collectors.find(c => c.name === collectorName);
        
        return {
          id: t.id,
          collectorId: collector?.id || '',
          collectorName: collectorName,
          customerId: t.customerId || '',
          customerName: t.customerName || accounts.find(a => a.id === t.accountId)?.customerName || '—',
          accountId: t.accountId,
          createdAt: t.createdAt,
          amount: Number(t.amount || 0),
          paymentType: t.narration?.includes('Loan') ? 'loan' : t.narration?.includes('HP') ? 'hp' : 'savings',
          status: t.status || 'completed',
          notes: t.narration || '',
        };
      });

    // Merge with actual collections table data
    const allCollections = [
      ...collectionsFromTxns,
      ...collections.map(c => ({
        ...c,
        collectorId: c.collector_id || c.collectorId || '',
        collectorName: c.collector_name || c.collectorName || '—',
        customerId: c.customer_id || c.customerId || '',
        customerName: c.customer_name || c.customerName || '—',
        accountId: c.account_id || c.accountId || '',
        createdAt: c.created_at || c.createdAt || '',
        amount: Number(c.amount || 0),
        paymentType: c.payment_type || c.paymentType || 'savings',
      }))
    ];

    // Remove duplicates (prefer collections table over transactions)
    const uniqueCollections = allCollections.reduce((acc, curr) => {
      const existing = acc.find(c => 
        c.accountId === curr.accountId && 
        c.amount === curr.amount && 
        Math.abs(new Date(c.createdAt) - new Date(curr.createdAt)) < 5000 // within 5 seconds
      );
      if (!existing) {
        acc.push(curr);
      } else if (curr.id && curr.id.length > 10 && !existing.id) {
        // Replace transaction-based with actual collection if it exists
        const idx = acc.indexOf(existing);
        acc[idx] = curr;
      }
      return acc;
    }, []);

    return uniqueCollections
      .filter(c => {
        if (collectorFilter !== 'all' && c.collectorId !== collectorFilter) return false;
        if (paymentTypeFilter !== 'all' && c.paymentType !== paymentTypeFilter) return false;
        if (from && c.createdAt && c.createdAt.slice(0, 10) < from) return false;
        if (to && c.createdAt && c.createdAt.slice(0, 10) > to) return false;
        return true;
      })
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  }, [collections, transactions, accounts, collectors, collectorFilter, paymentTypeFilter, from, to]);

  const grandTotal = useMemo(() => filtered.reduce((s, c) => s + c.amount, 0), [filtered]);

  const byCollector = useMemo(() =>
    collectors.map(col => {
      const cols = filtered.filter(c => c.collectorId === col.id);
      // Build unique customer list with totals
      const custMap = {};
      cols.forEach(c => {
        const key = c.customerId || c.customerName;
        if (!custMap[key]) {
          custMap[key] = {
            customerId: c.customerId,
            customerName: c.customerName,
            accountId: c.accountId,
            collections: [],
            total: 0,
          };
        }
        custMap[key].collections.push(c);
        custMap[key].total += c.amount;
      });
      return {
        ...col,
        count: cols.length,
        total: cols.reduce((s, c) => s + c.amount, 0),
        recent: cols.slice(0, 3),
        customers: Object.values(custMap).sort((a, b) => b.total - a.total),
        allCollections: cols,
      };
    }),
    [collectors, filtered]
  );

  // ── Chart data ──────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const isWeekly = period === 'this_week' || period === 'last_week';
    const isMonthly = period === 'this_month' || period === 'last_month';
    const isLong = period === 'this_quarter' || period === 'this_year';

    if (isLong) {
      // Group by month
      const map = {};
      filtered.forEach(c => {
        if (!c.createdAt) return;
        const key = c.createdAt.slice(0, 7); // YYYY-MM
        map[key] = (map[key] || 0) + c.amount;
      });
      return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({
        label: k,
        amount: v,
      }));
    }

    // Daily grouping
    const days = isWeekly ? 7 : isMonthly ? 30 : 14;
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      if (period === 'last_week') d.setDate(d.getDate() - d.getDay() - 1 - i + 6);
      else if (period === 'last_month') {
        const lme = new Date(d.getFullYear(), d.getMonth(), 0);
        d.setTime(lme.getTime());
        d.setDate(d.getDate() - i);
      } else {
        d.setDate(d.getDate() - i);
      }
      const key = d.toISOString().slice(0, 10);
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      const amount = filtered
        .filter(c => c.createdAt && c.createdAt.slice(0, 10) === key)
        .reduce((s, c) => s + c.amount, 0);
      result.push({ label, amount });
    }
    return result;
  }, [filtered, period]);

  // ── Delete ──────────────────────────────────────────────────────────────────
  const doDelete = async () => {
    setDeleting(true);
    await supabase.from('collections').delete().eq('id', deleteModal.id);
    await refresh();
    setDeleteModal(null);
    setDeleting(false);
  };

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    exportCSV(
      filtered.map(c => ({
        Date: c.createdAt ? new Date(c.createdAt).toLocaleString() : '—',
        Collector: c.collectorName,
        Customer: c.customerName,
        AccountNumber: accounts?.find(a => a.id === c.accountId)?.accountNumber || '—',
        PaymentType: c.paymentType,
        Amount: c.amount,
        CustomerBalance: accounts?.find(a => a.id === c.accountId)?.balance ?? '—',
        LoanOutstanding: loans?.filter(l => l.customerId === c.customerId && (l.status === 'active' || l.status === 'overdue')).reduce((s, l) => s + (l.outstanding || 0), 0) || 0,
        Status: c.status || 'completed',
        Notes: c.notes || '',
      })),
      'collection-report'
    );
  };

  const handleExportPDF = () => {
    exportCollectionReportPDF({
      collections: filtered.map(c => ({
        ...c,
        account: accounts?.find(a => a.id === c.accountId),
      })),
      period: `${from || 'All'} to ${to || 'All'}`,
    });
  };

  // ── Print per-collector call-over sheet ────────────────────────────────────
  const printCollectorSheet = (col) => {
    const w = window.open('', '_blank', 'width=800,height=900');
    const periodLabel = PERIOD_PRESETS.find(p => p.key === period)?.label || `${from} to ${to}`;
    const rows = col.allCollections.map(c => {
      const acc = accounts?.find(a => a.id === c.accountId);
      const custLoans = loans?.filter(l => l.customerId === c.customerId && (l.status === 'active' || l.status === 'overdue'));
      const loanOut = custLoans?.reduce((s, l) => s + (l.outstanding || 0), 0) || 0;
      return { ...c, acc, loanOut };
    });

    w.document.write(`<html><head><title>Collector Sheet - ${col.name}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; font-size: 12px; color: #111; }
      h2 { margin: 0 0 2px; font-size: 18px; }
      .sub { color: #666; font-size: 12px; margin-bottom: 4px; }
      .meta { display: flex; gap: 24px; margin: 12px 0 20px; padding: 10px 14px; background: #f1f5f9; border-radius: 6px; }
      .meta div { display: flex; flex-direction: column; }
      .meta .lbl { font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; }
      .meta .val { font-size: 14px; font-weight: 800; color: #0f172a; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th { background: #1a56db; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; }
      td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
      tr:nth-child(even) td { background: #f8fafc; }
      .amt { font-weight: 700; color: #16a34a; }
      .out { font-weight: 700; color: #dc2626; }
      .badge { display: inline-block; padding: 1px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; }
      .savings { background: #dcfce7; color: #166534; }
      .loan { background: #dbeafe; color: #1e40af; }
      .hp { background: #ede9fe; color: #5b21b6; }
      .totals td { background: #f1f5f9 !important; font-weight: 800; border-top: 2px solid #cbd5e1; }
      .footer { margin-top: 24px; padding-top: 12px; border-top: 1px dashed #cbd5e1; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
      @media print { body { padding: 12px; } }
    </style></head><body>
    <h2>Majupat Love Enterprise</h2>
    <div class="sub">Collection Call-Over Sheet &mdash; Maxbraynn Technology &amp; Systems</div>
    <div class="meta">
      <div><span class="lbl">Collector</span><span class="val">${col.name}</span></div>
      ${col.zone ? `<div><span class="lbl">Zone</span><span class="val">${col.zone}</span></div>` : ''}
      <div><span class="lbl">Phone</span><span class="val">${col.phone}</span></div>
      <div><span class="lbl">Period</span><span class="val">${periodLabel}</span></div>
      <div><span class="lbl">Total Collected</span><span class="val">GH₵ ${col.total.toLocaleString('en-GH', { minimumFractionDigits: 2 })}</span></div>
      <div><span class="lbl">No. of Collections</span><span class="val">${col.count}</span></div>
      <div><span class="lbl">Customers</span><span class="val">${col.customers.length}</span></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Date &amp; Time</th>
          <th>Customer Name</th>
          <th>Account No.</th>
          <th>Payment Type</th>
          <th>Amount (GH₵)</th>
          <th>Acct Balance</th>
          <th>Loan Outstanding</th>
          <th>Notes</th>
          <th>Verified ✓</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r, i) => `
          <tr>
            <td>${i + 1}</td>
            <td style="white-space:nowrap">${r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}</td>
            <td><strong>${r.customerName}</strong></td>
            <td style="font-family:monospace">${r.acc?.accountNumber || r.acc?.account_number || '—'}</td>
            <td><span class="badge ${r.paymentType}">${r.paymentType === 'savings' ? 'Savings' : r.paymentType === 'loan' ? 'Loan' : 'HP'}</span></td>
            <td class="amt">GH₵ ${Number(r.amount).toLocaleString('en-GH', { minimumFractionDigits: 2 })}</td>
            <td>${r.acc ? 'GH₵ ' + Number(r.acc.balance).toLocaleString('en-GH', { minimumFractionDigits: 2 }) : '—'}</td>
            <td class="${r.loanOut > 0 ? 'out' : ''}">${r.loanOut > 0 ? 'GH₵ ' + r.loanOut.toLocaleString('en-GH', { minimumFractionDigits: 2 }) : '—'}</td>
            <td>${r.notes || '—'}</td>
            <td style="text-align:center">□</td>
          </tr>
        `).join('')}
        <tr class="totals">
          <td colspan="5" style="text-align:right">TOTAL</td>
          <td>GH₵ ${col.total.toLocaleString('en-GH', { minimumFractionDigits: 2 })}</td>
          <td colspan="4"></td>
        </tr>
      </tbody>
    </table>
    <div class="footer">
      <span>Collector Signature: ________________________</span>
      <span>Supervisor Signature: ________________________</span>
      <span>Printed: ${new Date().toLocaleString()}</span>
    </div>
    </body></html>`);
    w.document.close();
    w.print();
  };

  const activeCollectors = byCollector.filter(c => c.count > 0).length;
  const avgPerCollection = filtered.length > 0 ? grandTotal / filtered.length : 0;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Collection Report</div>
          <div className="page-desc">{filtered.length} collections · {GHS(grandTotal)}</div>
        </div>
        <div className="page-header-right">
          <button className="btn btn-ghost" onClick={refresh} title="Refresh data">
            <RotateCcw size={14} /> Refresh
          </button>
          <button className="btn btn-secondary" onClick={handleExportCSV}>
            <Download size={14} /> Export CSV
          </button>
          <button className="btn btn-primary" onClick={handleExportPDF}>
            <FileText size={14} /> Export PDF
          </button>
        </div>
      </div>

      {/* ── Period Selector ── */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {PERIOD_PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`btn btn-sm ${period === p.key ? 'btn-primary' : 'btn-secondary'}`}
              style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={14} style={{ color: 'var(--text-3)' }} />
              <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>From</label>
              <input
                type="date"
                className="form-control"
                style={{ width: 160 }}
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>To</label>
              <input
                type="date"
                className="form-control"
                style={{ width: 160 }}
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={14} style={{ color: 'var(--text-3)' }} />
          <select
            className="form-control"
            style={{ minWidth: 180 }}
            value={collectorFilter}
            onChange={e => setCollectorFilter(e.target.value)}
          >
            <option value="all">All Collectors</option>
            {collectors.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <DollarSign size={14} style={{ color: 'var(--text-3)' }} />
          <select
            className="form-control"
            style={{ minWidth: 180 }}
            value={paymentTypeFilter}
            onChange={e => setPaymentTypeFilter(e.target.value)}
          >
            <option value="all">All Payment Types</option>
            <option value="savings">Savings Deposit</option>
            <option value="loan">Loan Repayment</option>
            <option value="hp">HP Repayment</option>
          </select>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--green-light, #dcfce7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={16} style={{ color: 'var(--green)' }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Total Collected</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>{GHS(grandTotal)}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--brand-light, #dbeafe)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={16} style={{ color: 'var(--brand)' }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Collections</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--brand)' }}>{filtered.length}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={16} style={{ color: 'var(--purple)' }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Active Collectors</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--purple)' }}>{activeCollectors}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fef9c3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={16} style={{ color: 'var(--yellow)' }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Avg per Collection</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--yellow)' }}>{GHS(avgPerCollection)}</div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--border)' }}>
        {[
          { key: 'summary', label: 'Summary' },
          { key: 'by_collector', label: 'By Collector' },
          { key: 'collections', label: 'All Collections' },
          { key: 'chart', label: 'Chart' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 18px', fontWeight: 600, fontSize: 13,
            background: 'none', border: 'none',
            borderBottom: tab === t.key ? '2px solid var(--brand)' : '2px solid transparent',
            color: tab === t.key ? 'var(--brand)' : 'var(--text-3)',
            cursor: 'pointer', marginBottom: -2,
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── By Collector Tab ── */}
      {tab === 'by_collector' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {byCollector.filter(col => col.count > 0).length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>
              No collections in this period
            </div>
          ) : byCollector.filter(col => col.count > 0).map(col => (
            <div key={col.id} className="card">
              {/* Collector header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg, var(--brand), #1e40af)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 800, flexShrink: 0 }}>
                    {col.name?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{col.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      {col.zone ? `${col.zone} · ` : ''}{col.phone} · {col.count} collections · {col.customers.length} customers
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Total Collected</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--green)' }}>{GHS(col.total)}</div>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => printCollectorSheet(col)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Printer size={14} /> Print Call-Over Sheet
                  </button>
                </div>
              </div>

              {/* Customer breakdown */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                  Customers Collected From ({col.customers.length})
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>#</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>Customer</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>Account No.</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>Payment Types</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>Collections</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>Total Amount</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>Acct Balance</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>Loan Outstanding</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>Last Collection</th>
                      </tr>
                    </thead>
                    <tbody>
                      {col.customers.map((cust, idx) => {
                        const acc = accounts?.find(a => a.id === cust.accountId);
                        const custLoans = loans?.filter(l => l.customerId === cust.customerId && (l.status === 'active' || l.status === 'overdue'));
                        const loanOut = custLoans?.reduce((s, l) => s + (l.outstanding || 0), 0) || 0;
                        const types = [...new Set(cust.collections.map(c => c.paymentType))];
                        const lastDate = cust.collections.sort((a, b) => b.createdAt > a.createdAt ? 1 : -1)[0]?.createdAt;
                        return (
                          <tr key={cust.customerId || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px 10px', color: 'var(--text-3)', fontSize: 12 }}>{idx + 1}</td>
                            <td style={{ padding: '8px 10px', fontWeight: 700 }}>{cust.customerName}</td>
                            <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 12 }}>{acc?.accountNumber || acc?.account_number || '—'}</td>
                            <td style={{ padding: '8px 10px' }}>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {types.map(t => (
                                  <span key={t} className={`badge ${t === 'savings' ? 'badge-green' : t === 'loan' ? 'badge-blue' : 'badge-purple'}`} style={{ fontSize: 10 }}>
                                    {t === 'savings' ? 'Savings' : t === 'loan' ? 'Loan' : 'HP'}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{cust.collections.length}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--green)' }}>{GHS(cust.total)}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: acc?.balance < 0 ? 'var(--red)' : 'var(--text)' }}>
                              {acc ? GHS(acc.balance) : '—'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: loanOut > 0 ? 'var(--red)' : 'var(--text-3)' }}>
                              {loanOut > 0 ? GHS(loanOut) : '—'}
                            </td>
                            <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                              {lastDate ? new Date(lastDate).toLocaleString() : '—'}
                            </td>
                          </tr>
                        );
                      })}
                      {/* Totals row */}
                      <tr style={{ background: 'var(--surface-2)', fontWeight: 800 }}>
                        <td colSpan={5} style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12, color: 'var(--text-3)' }}>TOTAL</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--green)', fontSize: 14 }}>{GHS(col.total)}</td>
                        <td colSpan={3}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Summary Tab ── */}
      {tab === 'summary' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {byCollector.length === 0 ? (
            <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: 48 }}>
              <Users size={36} style={{ color: 'var(--text-3)', margin: '0 auto 12px', display: 'block', opacity: .3 }} />
              <div style={{ fontWeight: 700, marginBottom: 4 }}>No collections in this period</div>
              <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Try adjusting the date range or filters</div>
            </div>
          ) : (
            byCollector.map(col => (
              <div key={col.id} className="card" style={{ padding: 20 }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--brand), #1e40af)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 18, fontWeight: 800, flexShrink: 0,
                  }}>
                    {col.name?.[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{col.name}</div>
                    {col.zone && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{col.zone}</div>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{col.count} collections</div>
                  </div>
                </div>

                {/* Total */}
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)', marginBottom: 10 }}>
                  {GHS(col.total)}
                </div>

                {/* Progress bar */}
                {grandTotal > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>
                      <span>Share of total</span>
                      <span>{Math.round((col.total / grandTotal) * 100)}%</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.round((col.total / grandTotal) * 100)}%`,
                        background: 'linear-gradient(90deg, var(--brand), var(--green))',
                        borderRadius: 99,
                        transition: 'width .4s',
                      }} />
                    </div>
                  </div>
                )}

                {/* Recent collections */}
                {col.recent.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase' }}>Recent</div>
                    {col.recent.map((c, i) => (
                      <div key={c.id || i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                        <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{c.customerName}</span>
                        <span style={{ fontWeight: 700, color: 'var(--green)', flexShrink: 0 }}>{GHS(c.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── All Collections Tab ── */}
      {tab === 'collections' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48 }}>
              <FileText size={36} style={{ color: 'var(--text-3)', margin: '0 auto 12px', display: 'block', opacity: .3 }} />
              <div style={{ fontWeight: 700, marginBottom: 4 }}>No collections found</div>
              <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Adjust the filters or date range</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date &amp; Time</th>
                    <th>Collector</th>
                    <th>Customer</th>
                    <th>Account No.</th>
                    <th>Payment Type</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th style={{ textAlign: 'right' }}>Cust. Balance</th>
                    <th style={{ textAlign: 'right' }}>Loan Outstanding</th>
                    <th>Status</th>
                    <th>Notes</th>
                    {isAdmin && <th style={{ textAlign: 'center' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => {
                    const acc = accounts?.find(a => a.id === c.accountId);
                    const custLoans = loans?.filter(l => l.customerId === c.customerId && (l.status === 'active' || l.status === 'overdue'));
                    const totalOutstanding = custLoans?.reduce((s, l) => s + (l.outstanding || 0), 0) || 0;
                    return (
                      <tr key={c.id}>
                        <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                          {c.createdAt ? new Date(c.createdAt).toLocaleString() : '—'}
                        </td>
                        <td style={{ fontWeight: 600 }}>{c.collectorName}</td>
                        <td>{c.customerName}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{acc?.accountNumber || '—'}</td>
                        <td>{ptBadge(c.paymentType)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green)', whiteSpace: 'nowrap' }}>
                          {GHS(c.amount)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: acc?.balance < 0 ? 'var(--red)' : 'var(--text)', whiteSpace: 'nowrap' }}>
                          {acc ? GHS(acc.balance) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: totalOutstanding > 0 ? 'var(--red)' : 'var(--green)', whiteSpace: 'nowrap' }}>
                          {totalOutstanding > 0 ? GHS(totalOutstanding) : '—'}
                        </td>
                        <td><Badge status={c.status || 'completed'} /></td>
                        <td style={{ fontSize: 12, color: 'var(--text-3)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.notes || '—'}
                        </td>
                        {isAdmin && (
                          <td style={{ textAlign: 'center' }}>
                            <button
                              className="btn btn-ghost btn-icon btn-sm"
                              style={{ color: 'var(--red)' }}
                              title="Delete collection"
                              onClick={() => setDeleteModal(c)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Chart Tab ── */}
      {tab === 'chart' && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Collections Over Time</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20 }}>
            {PERIOD_PRESETS.find(p => p.key === period)?.label || 'Custom'} · {filtered.length} collections · {GHS(grandTotal)}
          </div>
          {chartData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>No data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} tickFormatter={v => `GH₵${v.toLocaleString()}`} />
                <Tooltip
                  formatter={(v) => [GHS(v), 'Amount']}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }}
                />
                <Bar dataKey="amount" fill="var(--brand)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {isAdmin && (
        <Modal
          open={!!deleteModal}
          onClose={() => !deleting && setDeleteModal(null)}
          title="Delete Collection"
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDeleteModal(null)} disabled={deleting}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={doDelete} disabled={deleting}
                style={{ background: 'var(--red)', color: '#fff', border: 'none' }}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </>
          }
        >
          {deleteModal && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Collection Details</div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span><strong>Customer:</strong> {deleteModal.customerName}</span>
                  <span><strong>Collector:</strong> {deleteModal.collectorName}</span>
                  <span><strong>Amount:</strong> {GHS(deleteModal.amount)}</span>
                  <span><strong>Date:</strong> {deleteModal.createdAt ? new Date(deleteModal.createdAt).toLocaleString() : '—'}</span>
                  <span><strong>Type:</strong> {deleteModal.paymentType}</span>
                </div>
              </div>
              <div style={{
                padding: '10px 14px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                fontSize: 13,
                color: '#b91c1c',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <Trash2 size={14} />
                This action cannot be undone. The collection record will be permanently deleted.
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
