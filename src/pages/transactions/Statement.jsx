import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { Search, Download, Printer, FileText, ArrowDownRight, ArrowUpRight, ChevronDown } from 'lucide-react';
import { exportStatementPDF, exportCSV } from '../../core/export';
import { authDB } from '../../core/db';

const GHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function mondayOfWeek() {
  const d = new Date();
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function lastMonthRange() {
  const d = new Date();
  const firstThisMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  const lastLast = new Date(firstThisMonth - 1);
  const firstLast = new Date(lastLast.getFullYear(), lastLast.getMonth(), 1);
  const fmt = (x) => x.toISOString().slice(0, 10);
  return { from: fmt(firstLast), to: fmt(lastLast) };
}

export default function Statement() {
  const { accounts, customers, transactions } = useApp();
  const navigate = useNavigate();
  const statementRef = useRef(null);

  // Account search
  const [searchQ, setSearchQ] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Date range
  const [preset, setPreset] = useState('this_month');
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo] = useState(todayStr());

  // Statement state
  const [statement, setStatement] = useState(null);
  const [generating, setGenerating] = useState(false);

  // ── Account search dropdown ──────────────────────────────────────────────
  const searchResults = useMemo(() => {
    if (!searchQ.trim()) return [];
    const q = searchQ.toLowerCase();
    return accounts
      .filter(a => {
        const cust = customers.find(c => c.id === a.customerId);
        return (
          a.accountNumber.includes(q) ||
          cust?.phone?.includes(q) ||
          cust?.name?.toLowerCase().includes(q)
        );
      })
      .slice(0, 8)
      .map(a => ({ ...a, customer: customers.find(c => c.id === a.customerId) }));
  }, [searchQ, accounts, customers]);

  const selectAccount = (acc) => {
    setSelectedAccount(acc);
    setSelectedCustomer(acc.customer);
    setSearchQ(`${acc.accountNumber} — ${acc.customer?.name || ''}`);
    setShowDropdown(false);
    setStatement(null);
  };

  // ── Preset logic ─────────────────────────────────────────────────────────
  const applyPreset = (p) => {
    setPreset(p);
    setStatement(null);
    if (p === 'today') { setDateFrom(todayStr()); setDateTo(todayStr()); }
    else if (p === 'this_week') { setDateFrom(mondayOfWeek()); setDateTo(todayStr()); }
    else if (p === 'this_month') { setDateFrom(firstOfMonth()); setDateTo(todayStr()); }
    else if (p === 'last_month') { const r = lastMonthRange(); setDateFrom(r.from); setDateTo(r.to); }
    // custom: leave dates as-is
  };

  // ── Generate statement ───────────────────────────────────────────────────
  const generate = () => {
    if (!selectedAccount) return;
    setGenerating(true);
    setTimeout(() => {
      const acctTxns = transactions
        .filter(t => t.accountId === selectedAccount.id)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      const from = dateFrom ? new Date(dateFrom + 'T00:00:00') : null;
      const to = dateTo ? new Date(dateTo + 'T23:59:59') : null;

      const periodTxns = acctTxns.filter(t => {
        const d = new Date(t.createdAt);
        return (!from || d >= from) && (!to || d <= to);
      });

      // Opening balance: balanceAfter of the txn just before the period, or 0
      let openingBalance = 0;
      if (periodTxns.length > 0) {
        const first = periodTxns[0];
        openingBalance = first.type === 'credit'
          ? first.balanceAfter - first.amount
          : first.balanceAfter + first.amount;
      } else {
        // No txns in period — use current balance as both opening and closing
        openingBalance = selectedAccount.balance;
      }

      const totalCredits = periodTxns.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
      const totalDebits = periodTxns.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
      const closingBalance = openingBalance + totalCredits - totalDebits;

      setStatement({
        account: selectedAccount,
        customer: selectedCustomer,
        dateFrom,
        dateTo,
        generatedAt: new Date().toISOString(),
        transactions: periodTxns,
        openingBalance,
        totalCredits,
        totalDebits,
        closingBalance,
      });
      setGenerating(false);
    }, 300);
  };

  // ── Print ────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    if (!statement) return;
    const win = window.open('', '_blank', 'width=900,height=700');
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Bank Statement — ${statement.account.accountNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a2e; background: #fff; padding: 24px; }
    .bank-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a56db; padding-bottom: 14px; margin-bottom: 18px; }
    .bank-name { font-size: 22px; font-weight: 900; color: #1a56db; letter-spacing: -0.5px; }
    .bank-tagline { font-size: 10px; color: #64748b; margin-top: 2px; }
    .stmt-title { font-size: 14px; font-weight: 700; text-align: right; }
    .stmt-sub { font-size: 10px; color: #64748b; text-align: right; margin-top: 2px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; margin-bottom: 16px; }
    .info-row { display: flex; gap: 8px; }
    .info-label { font-size: 10px; color: #64748b; font-weight: 600; text-transform: uppercase; min-width: 110px; }
    .info-value { font-size: 11px; font-weight: 700; color: #0f172a; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
    .sum-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; text-align: center; }
    .sum-label { font-size: 9px; color: #64748b; font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
    .sum-value { font-size: 13px; font-weight: 800; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead tr { background: #1a56db; color: #fff; }
    th { padding: 7px 8px; text-align: left; font-weight: 700; font-size: 10px; text-transform: uppercase; }
    th.num { text-align: right; }
    td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    td.num { text-align: right; }
    tr:nth-child(even) { background: #f8fafc; }
    .ref { font-family: monospace; font-size: 10px; }
    .debit { color: #dc2626; font-weight: 700; }
    .credit { color: #16a34a; font-weight: 700; }
    .reversed-tag { font-size: 9px; background: #fef3c7; color: #92400e; padding: 1px 4px; border-radius: 3px; margin-left: 4px; }
    .tfoot-row { background: #1e293b !important; color: #fff; font-weight: 700; }
    .tfoot-row td { border-bottom: none; color: #fff; }
    .footer-note { margin-top: 20px; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
    @media print { body { padding: 10px; } @page { margin: 10mm; } }
  </style>
</head>
<body>
  <div class="bank-header">
    <div>
      <div class="bank-name">Majupat Love Enterprise</div>
      <div class="bank-tagline">Developed by Maxbraynn Technology & Systems</div>
    </div>
    <div>
      <div class="stmt-title">ACCOUNT STATEMENT</div>
      <div class="stmt-sub">Generated: ${new Date(statement.generatedAt).toLocaleString()}</div>
    </div>
  </div>
  <div class="info-grid">
    <div class="info-row"><span class="info-label">Account Number</span><span class="info-value">${statement.account.accountNumber}</span></div>
    <div class="info-row"><span class="info-label">Account Type</span><span class="info-value">${(statement.account.type || '').replace('_', ' ').toUpperCase()}</span></div>
    <div class="info-row"><span class="info-label">Customer Name</span><span class="info-value">${statement.customer?.name || '—'}</span></div>
    <div class="info-row"><span class="info-label">Phone</span><span class="info-value">${statement.customer?.phone || '—'}</span></div>
    <div class="info-row"><span class="info-label">Address</span><span class="info-value">${statement.customer?.address || '—'}</span></div>
    <div class="info-row"><span class="info-label">Statement Period</span><span class="info-value">${fmtDate(statement.dateFrom + 'T00:00:00')} — ${fmtDate(statement.dateTo + 'T00:00:00')}</span></div>
  </div>
  <div class="summary">
    <div class="sum-box"><div class="sum-label">Opening Balance</div><div class="sum-value" style="color:#1a56db">${GHS(statement.openingBalance)}</div></div>
    <div class="sum-box"><div class="sum-label">Total Credits</div><div class="sum-value" style="color:#16a34a">${GHS(statement.totalCredits)}</div></div>
    <div class="sum-box"><div class="sum-label">Total Debits</div><div class="sum-value" style="color:#dc2626">${GHS(statement.totalDebits)}</div></div>
    <div class="sum-box"><div class="sum-label">Closing Balance</div><div class="sum-value" style="color:#0f172a">${GHS(statement.closingBalance)}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Date</th><th>Value Date</th><th>Reference</th><th>Description / Narration</th>
        <th class="num">Debit (GH₵)</th><th class="num">Credit (GH₵)</th><th class="num">Balance (GH₵)</th>
      </tr>
    </thead>
    <tbody>
      ${statement.transactions.map(t => `
      <tr>
        <td style="white-space:nowrap">${fmtDate(t.createdAt)}</td>
        <td style="white-space:nowrap">${fmtDate(t.createdAt)}</td>
        <td class="ref">${t.reference}</td>
        <td>${t.narration || '—'}${t.reversed ? '<span class="reversed-tag">REVERSED</span>' : ''}</td>
        <td class="num debit">${t.type === 'debit' ? Number(t.amount).toLocaleString('en-GH', { minimumFractionDigits: 2 }) : ''}</td>
        <td class="num credit">${t.type === 'credit' ? Number(t.amount).toLocaleString('en-GH', { minimumFractionDigits: 2 }) : ''}</td>
        <td class="num">${Number(t.balanceAfter || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}</td>
      </tr>`).join('')}
    </tbody>
    <tfoot>
      <tr class="tfoot-row">
        <td colspan="4"><strong>TOTALS</strong></td>
        <td class="num">${Number(statement.totalDebits).toLocaleString('en-GH', { minimumFractionDigits: 2 })}</td>
        <td class="num">${Number(statement.totalCredits).toLocaleString('en-GH', { minimumFractionDigits: 2 })}</td>
        <td class="num">${Number(statement.closingBalance).toLocaleString('en-GH', { minimumFractionDigits: 2 })}</td>
      </tr>
    </tfoot>
  </table>
  <div class="footer-note">
    This is a computer-generated statement and does not require a signature. For queries, contact your nearest Majupat Love Enterprise branch.
    Statement generated on ${new Date(statement.generatedAt).toLocaleString()} | ${statement.transactions.length} transaction(s) in period.
  </div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;
    win.document.write(html);
    win.document.close();
  };

  // ── Export CSV ───────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    if (!statement) return;
    const rows = statement.transactions.map(t => ({
      Date: fmtDate(t.createdAt),
      'Value Date': fmtDate(t.createdAt),
      Reference: t.reference,
      Narration: t.narration + (t.reversed ? ' [REVERSED]' : ''),
      Debit: t.type === 'debit' ? t.amount : '',
      Credit: t.type === 'credit' ? t.amount : '',
      Balance: t.balanceAfter,
    }));
    exportCSV(rows, `statement-${statement.account.accountNumber}`);
  };

  // ── Export PDF ───────────────────────────────────────────────────────────
  const handleExportPDF = () => {
    if (!statement) return;
    exportStatementPDF({
      account: statement.account,
      customer: statement.customer,
      transactions: statement.transactions,
      dateFrom: statement.dateFrom,
      dateTo: statement.dateTo,
    });
  };

  const PRESETS = [
    { key: 'today', label: 'Today' },
    { key: 'this_week', label: 'This Week' },
    { key: 'this_month', label: 'This Month' },
    { key: 'last_month', label: 'Last Month' },
    { key: 'custom', label: 'Custom' },
  ];

  return (
    <div className="fade-in">
      {/* Page header */}
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Account Statement</div>
          <div className="page-desc">Generate a professional bank statement for any account</div>
        </div>
        {statement && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={handlePrint}>
              <Printer size={14} style={{ marginRight: 5 }} />Print
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleExportCSV}>
              <Download size={14} style={{ marginRight: 5 }} />CSV
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleExportPDF}>
              <FileText size={14} style={{ marginRight: 5 }} />PDF
            </button>
          </div>
        )}
      </div>

      {/* Controls card */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>

          {/* Account search */}
          <div style={{ flex: '1 1 280px', position: 'relative' }}>
            <label className="form-label">Account / Customer</label>
            <div className="search-box">
              <Search size={14} />
              <input
                className="form-control"
                placeholder="Search by account no., phone, or name…"
                value={searchQ}
                onChange={e => { setSearchQ(e.target.value); setShowDropdown(true); setSelectedAccount(null); setStatement(null); }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 180)}
              />
            </div>
            {showDropdown && searchResults.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4,
              }}>
                {searchResults.map(acc => (
                  <div
                    key={acc.id}
                    onMouseDown={() => selectAccount(acc)}
                    style={{
                      padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, fontFamily: 'monospace' }}>{acc.accountNumber}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{acc.customer?.name} · {acc.customer?.phone}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase' }}>{acc.type?.replace('_', ' ')}</div>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{GHS(acc.balance)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Period presets */}
          <div style={{ flex: '0 0 auto' }}>
            <label className="form-label">Period</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {PRESETS.map(p => (
                <button
                  key={p.key}
                  onClick={() => applyPreset(p.key)}
                  style={{
                    padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: preset === p.key ? '2px solid var(--primary)' : '1px solid var(--border)',
                    background: preset === p.key ? 'var(--primary)' : 'var(--surface)',
                    color: preset === p.key ? '#fff' : 'var(--text-2)',
                    transition: 'all 0.15s',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date inputs (always visible, editable in custom mode) */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div>
              <label className="form-label">From</label>
              <input
                className="form-control"
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setPreset('custom'); setStatement(null); }}
                style={{ width: 145 }}
              />
            </div>
            <div>
              <label className="form-label">To</label>
              <input
                className="form-control"
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setPreset('custom'); setStatement(null); }}
                style={{ width: 145 }}
              />
            </div>
          </div>

          {/* Generate button */}
          <div style={{ paddingBottom: 1 }}>
            <button
              className="btn btn-primary"
              onClick={generate}
              disabled={!selectedAccount || generating}
              style={{ height: 38, paddingLeft: 20, paddingRight: 20 }}
            >
              {generating ? 'Generating…' : 'Generate Statement'}
            </button>
          </div>
        </div>
      </div>

      {/* No account selected hint */}
      {!selectedAccount && !statement && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-3)' }}>
          <FileText size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No account selected</div>
          <div style={{ fontSize: 13 }}>Search for an account above to generate a statement</div>
        </div>
      )}

      {/* Statement output */}
      {statement && (
        <div ref={statementRef} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

          {/* Bank header */}
          <div style={{ background: 'linear-gradient(135deg, #1a56db 0%, #1e40af 100%)', padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>Majupat Love Enterprise</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>Developed by Maxbraynn Technology & Systems</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: 1 }}>Account Statement</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
                Generated: {new Date(statement.generatedAt).toLocaleString()}
              </div>
            </div>
          </div>

          {/* Account info grid */}
          <div style={{ padding: '20px 28px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 32px' }}>
              {[
                ['Account Number', statement.account.accountNumber],
                ['Account Type', (statement.account.type || '').replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())],
                ['Account Status', (statement.account.status || '').toUpperCase()],
                ['Customer Name', statement.customer?.name || '—'],
                ['Phone', statement.customer?.phone || '—'],
                ['Address', statement.customer?.address || '—'],
                ['Statement Period', `${fmtDate(statement.dateFrom + 'T00:00:00')} — ${fmtDate(statement.dateTo + 'T00:00:00')}`],
                ['Transactions', `${statement.transactions.length} transaction(s)`],
                ['Branch', 'Head Office'],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', fontFamily: label === 'Account Number' ? 'monospace' : 'inherit' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Summary boxes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, borderBottom: '1px solid #e2e8f0' }}>
            {[
              { label: 'Opening Balance', value: statement.openingBalance, color: '#1a56db', icon: <ArrowDownRight size={16} /> },
              { label: 'Total Credits', value: statement.totalCredits, color: '#16a34a', icon: <ArrowUpRight size={16} /> },
              { label: 'Total Debits', value: statement.totalDebits, color: '#dc2626', icon: <ArrowDownRight size={16} /> },
              { label: 'Closing Balance', value: statement.closingBalance, color: '#0f172a', icon: <ArrowUpRight size={16} /> },
            ].map((s, i) => (
              <div key={s.label} style={{
                padding: '16px 20px',
                borderRight: i < 3 ? '1px solid #e2e8f0' : 'none',
                background: '#fff',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
                  <span style={{ color: s.color, opacity: 0.6 }}>{s.icon}</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{GHS(s.value)}</div>
              </div>
            ))}
          </div>

          {/* Transaction table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#1e293b' }}>
                  {['Date', 'Value Date', 'Reference', 'Description / Narration', 'Debit (GH₵)', 'Credit (GH₵)', 'Balance (GH₵)'].map((h, i) => (
                    <th key={h} style={{
                      padding: '10px 12px', color: '#fff', fontWeight: 700, fontSize: 10,
                      textTransform: 'uppercase', letterSpacing: 0.5,
                      textAlign: i >= 4 ? 'right' : 'left',
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {statement.transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: 13 }}>
                      No transactions found in this period
                    </td>
                  </tr>
                ) : statement.transactions.map((t, idx) => (
                  <tr key={t.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc', opacity: t.reversed ? 0.6 : 1 }}>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: '#475569', fontSize: 11 }}>{fmtDate(t.createdAt)}</td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: '#475569', fontSize: 11 }}>{fmtDate(t.createdAt)}</td>
                    <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 10, color: '#334155', whiteSpace: 'nowrap' }}>{t.reference}</td>
                    <td style={{ padding: '9px 12px', color: '#0f172a', maxWidth: 260 }}>
                      {t.narration || '—'}
                      {t.reversed && (
                        <span style={{ fontSize: 9, background: '#fef3c7', color: '#92400e', padding: '1px 5px', borderRadius: 3, marginLeft: 6, fontWeight: 700 }}>
                          REVERSED
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#dc2626', whiteSpace: 'nowrap' }}>
                      {t.type === 'debit' ? Number(t.amount).toLocaleString('en-GH', { minimumFractionDigits: 2 }) : ''}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#16a34a', whiteSpace: 'nowrap' }}>
                      {t.type === 'credit' ? Number(t.amount).toLocaleString('en-GH', { minimumFractionDigits: 2 }) : ''}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>
                      {Number(t.balanceAfter || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#1e293b' }}>
                  <td colSpan={4} style={{ padding: '10px 12px', color: '#fff', fontWeight: 700, fontSize: 11 }}>TOTALS</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#fca5a5', fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}>
                    {Number(statement.totalDebits).toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#86efac', fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}>
                    {Number(statement.totalCredits).toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#fff', fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}>
                    {Number(statement.closingBalance).toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Statement footer */}
          <div style={{ padding: '14px 28px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 10, color: '#94a3b8', maxWidth: 500 }}>
              This is a computer-generated statement and does not require a signature or stamp.
              For queries or disputes, please contact your nearest Majupat Love Enterprise branch within 30 days of this statement date.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={handlePrint}>
                <Printer size={13} style={{ marginRight: 4 }} />Print
              </button>
              <button className="btn btn-secondary btn-sm" onClick={handleExportCSV}>
                <Download size={13} style={{ marginRight: 4 }} />CSV
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleExportPDF}>
                <FileText size={13} style={{ marginRight: 4 }} />PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


