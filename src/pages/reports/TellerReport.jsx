import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Download, CheckCircle, XCircle, AlertCircle, User, Printer } from 'lucide-react';
import { exportCSV } from '../../core/export';
import { authDB } from '../../core/db';

const GHS = (n) => `GH\u20B5 ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;
const fmtTime = (v) => v ? new Date(v).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '\u2014';
const fmtDate = (v) => v ? new Date(v).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' }) : '\u2014';

const PRINT_STYLES = `
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:Arial,sans-serif; font-size:12px; color:#1a1a2e; padding:24px; }
.header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #1a56db; padding-bottom:14px; margin-bottom:18px; }
.bank-name { font-size:22px; font-weight:900; color:#1a56db; }
.summary { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; margin-bottom:16px; }
.sum-box { border:1px solid #e2e8f0; border-radius:6px; padding:10px 12px; text-align:center; }
.sum-label { font-size:9px; color:#64748b; font-weight:600; text-transform:uppercase; margin-bottom:4px; }
.sum-value { font-size:14px; font-weight:800; }
.section-title { font-size:11px; font-weight:700; color:#1a56db; text-transform:uppercase; margin:16px 0 8px; padding:6px 10px; background:#eff6ff; border-left:4px solid #1a56db; }
table { width:100%; border-collapse:collapse; font-size:11px; margin-bottom:16px; }
thead tr { background:#1a56db; color:#fff; }
th { padding:7px 8px; text-align:left; font-weight:700; font-size:10px; text-transform:uppercase; }
td { padding:6px 8px; border-bottom:1px solid #f1f5f9; }
.closing-box { background:#0f172a; color:#fff; padding:16px 20px; border-radius:8px; margin-top:16px; display:flex; justify-content:space-between; align-items:center; }
.footer { margin-top:20px; font-size:9px; color:#94a3b8; border-top:1px solid #e2e8f0; padding-top:10px; display:flex; justify-content:space-between; }
@media print { body { padding:10px; } @page { margin:10mm; } }
`;

export default function TellerReport() {
  const { transactions, accounts, customers, users } = useApp();
  const user = authDB.currentUser();

  const today = new Date().toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo]     = useState(today);
  const [tellerFilter, setTellerFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('teller');
  const [showReversed, setShowReversed] = useState(false);

  // Build teller list from registered users (role teller/admin/manager) + legacy transaction posters
  const tellers = useMemo(() => {
    const map = {};
    (users || [])
      .filter(u => ['admin', 'manager', 'teller'].includes(u.role))
      .forEach(u => { map[u.name] = { name: u.name, phone: u.phone || '', id: u.id }; });
    transactions.forEach(t => {
      if (t.posterName && !map[t.posterName])
        map[t.posterName] = { name: t.posterName, phone: t.posterPhone || '', id: null };
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [users, transactions]);

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      const d = t.createdAt ? t.createdAt.slice(0, 10) : '';
      if (d < dateFrom || d > dateTo) return false;
      if (tellerFilter !== 'all' && t.posterName !== tellerFilter) return false;
      if (channelFilter !== 'all' && (t.channel || 'teller') !== channelFilter) return false;
      if (!showReversed && t.reversed) return false;
      return true;
    }).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }, [transactions, dateFrom, dateTo, tellerFilter, channelFilter, showReversed]);

  const totalCredits = filtered.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
  const totalDebits  = filtered.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
  const netCash      = totalCredits - totalDebits;

  const byTeller = useMemo(() => {
    const map = {};
    filtered.forEach(t => {
      const key = t.posterName || 'Unknown';
      if (!map[key]) map[key] = { name: key, phone: t.posterPhone || '', credits: 0, debits: 0, count: 0, txns: [] };
      map[key].txns.push(t);
      map[key].count++;
      if (t.type === 'credit') map[key].credits += t.amount;
      else map[key].debits += t.amount;
    });
    return Object.values(map).sort((a, b) => (b.credits + b.debits) - (a.credits + a.debits));
  }, [filtered]);

  const openingBalance = useMemo(() => {
    if (filtered.length === 0) return 0;
    const first = filtered[0];
    return first.type === 'credit'
      ? Number(first.balanceAfter || 0) - Number(first.amount || 0)
      : Number(first.balanceAfter || 0) + Number(first.amount || 0);
  }, [filtered]);

  const closingBalance = openingBalance + totalCredits - totalDebits;

  // ── Build transaction rows HTML for a given list of txns ──────────────────
  const buildTxnRows = (txns) => txns.map((t, i) => {
    const acc  = accounts.find(a => a.id === t.accountId);
    const cust = customers.find(c => c.id === (acc?.customerId || acc?.customer_id));
    return `<tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
      <td style="white-space:nowrap;font-size:11px">${fmtTime(t.createdAt)}</td>
      <td style="font-family:monospace;font-size:10px">${t.reference}</td>
      <td style="font-family:monospace;font-size:11px">${acc?.accountNumber || acc?.account_number || '\u2014'}</td>
      <td style="font-size:11px">${cust?.name || t.customerName || '\u2014'}</td>
      <td style="font-size:11px;max-width:160px">${t.narration || '\u2014'}</td>
      <td style="text-align:right;color:#dc2626;font-weight:700">${t.type === 'debit' ? GHS(t.amount) : ''}</td>
      <td style="text-align:right;color:#16a34a;font-weight:700">${t.type === 'credit' ? GHS(t.amount) : ''}</td>
      <td style="text-align:right;font-size:11px">${GHS(t.balanceAfter)}</td>
      <td style="font-size:11px">${t.posterName || '\u2014'}</td>
      <td style="font-size:10px;color:${t.reversed ? '#dc2626' : '#16a34a'}">${t.reversed ? 'REVERSED' : 'POSTED'}</td>
    </tr>`;
  }).join('');

  // ── Print combined report (all tellers or filtered teller) ────────────────
  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=1000,height=800');
    const tellerRows = byTeller.map(t => `
      <tr>
        <td><strong>${t.name}</strong></td>
        <td>${t.phone || '\u2014'}</td>
        <td style="text-align:right;color:#16a34a;font-weight:700">${GHS(t.credits)}</td>
        <td style="text-align:right;color:#dc2626;font-weight:700">${GHS(t.debits)}</td>
        <td style="text-align:right;font-weight:700;color:${(t.credits - t.debits) >= 0 ? '#16a34a' : '#dc2626'}">${GHS(t.credits - t.debits)}</td>
        <td style="text-align:center">${t.count}</td>
      </tr>`).join('');

    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Teller Call-Over Report</title>
<style>${PRINT_STYLES}</style></head><body>
<div class="header">
  <div>
    <div class="bank-name">Majupat Love Enterprise</div>
    <div style="font-size:10px;color:#64748b;margin-top:2px">Developed by Maxbraynn Technology &amp; Systems</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:16px;font-weight:800;text-transform:uppercase;letter-spacing:1px">Teller Call-Over Report</div>
    <div style="font-size:11px;color:#64748b;margin-top:4px">Period: ${dateFrom} to ${dateTo} &nbsp;|&nbsp; Generated: ${new Date().toLocaleString()}</div>
    ${tellerFilter !== 'all' ? `<div style="font-size:11px;color:#1a56db;font-weight:700;margin-top:2px">Teller: ${tellerFilter}</div>` : ''}
  </div>
</div>
<div class="summary">
  <div class="sum-box"><div class="sum-label">Opening Balance</div><div class="sum-value" style="color:#1a56db">${GHS(openingBalance)}</div></div>
  <div class="sum-box"><div class="sum-label">Total Credits</div><div class="sum-value" style="color:#16a34a">${GHS(totalCredits)}</div><div style="font-size:9px;color:#64748b">${filtered.filter(t => t.type === 'credit').length} txns</div></div>
  <div class="sum-box"><div class="sum-label">Total Debits</div><div class="sum-value" style="color:#dc2626">${GHS(totalDebits)}</div><div style="font-size:9px;color:#64748b">${filtered.filter(t => t.type === 'debit').length} txns</div></div>
  <div class="sum-box"><div class="sum-label">Net Cash</div><div class="sum-value" style="color:${netCash >= 0 ? '#16a34a' : '#dc2626'}">${GHS(netCash)}</div></div>
  <div class="sum-box"><div class="sum-label">Transactions</div><div class="sum-value" style="color:#7c3aed">${filtered.length}</div><div style="font-size:9px;color:#64748b">${byTeller.length} teller(s)</div></div>
</div>
${byTeller.length > 1 ? `<div class="section-title">Teller Breakdown</div>
<table><thead><tr><th>Teller</th><th>Phone</th><th style="text-align:right">Credits</th><th style="text-align:right">Debits</th><th style="text-align:right">Net</th><th style="text-align:center">Count</th></tr></thead>
<tbody>${tellerRows}</tbody></table>` : ''}
<div class="section-title">Transaction Details (${filtered.length})</div>
<table><thead><tr><th>Time</th><th>Reference</th><th>Account</th><th>Customer</th><th>Narration</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th><th style="text-align:right">Balance</th><th>Teller</th><th>Status</th></tr></thead>
<tbody>${buildTxnRows(filtered)}</tbody>
<tfoot><tr style="background:#1e293b;color:#fff;font-weight:700">
  <td colspan="5">TOTALS</td>
  <td style="text-align:right;color:#fca5a5">${GHS(totalDebits)}</td>
  <td style="text-align:right;color:#86efac">${GHS(totalCredits)}</td>
  <td colspan="3"></td>
</tr></tfoot></table>
<div class="closing-box">
  <div>
    <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Closing Balance</div>
    <div style="font-size:28px;font-weight:900;color:#fff">${GHS(closingBalance)}</div>
    <div style="font-size:11px;color:#64748b;margin-top:4px">Opening ${GHS(openingBalance)} + Credits ${GHS(totalCredits)} \u2212 Debits ${GHS(totalDebits)}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:11px;color:#64748b;margin-bottom:8px">Teller Signature: ________________________</div>
    <div style="font-size:11px;color:#64748b;margin-bottom:8px">Supervisor Signature: ________________________</div>
    <div style="font-size:11px;color:#64748b">Date: ________________________</div>
  </div>
</div>
<div class="footer">
  <span>Majupat Love Enterprise &mdash; Teller Call-Over Report &mdash; ${dateFrom} to ${dateTo}</span>
  <span>Printed: ${new Date().toLocaleString()}</span>
</div>
<script>window.onload=()=>{window.print();}<\/script>
</body></html>`);
    win.document.close();
  };

  // ── Print individual teller sheet ─────────────────────────────────────────
  const printTellerSheet = (teller) => {
    const win = window.open('', '_blank', 'width=1000,height=800');
    const txns = filtered.filter(t => t.posterName === teller.name);
    const tc = txns.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
    const td = txns.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
    const tOpen = txns.length > 0
      ? (txns[0].type === 'credit'
          ? Number(txns[0].balanceAfter || 0) - Number(txns[0].amount || 0)
          : Number(txns[0].balanceAfter || 0) + Number(txns[0].amount || 0))
      : 0;
    const tClose = tOpen + tc - td;

    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Teller Sheet - ${teller.name}</title>
<style>${PRINT_STYLES}</style></head><body>
<div class="header">
  <div>
    <div class="bank-name">Majupat Love Enterprise</div>
    <div style="font-size:10px;color:#64748b;margin-top:2px">Developed by Maxbraynn Technology &amp; Systems</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:16px;font-weight:800;text-transform:uppercase;letter-spacing:1px">Teller Call-Over Sheet</div>
    <div style="font-size:13px;color:#1a56db;font-weight:700;margin-top:4px">${teller.name}${teller.phone ? ' &nbsp;&bull;&nbsp; ' + teller.phone : ''}</div>
    <div style="font-size:11px;color:#64748b;margin-top:2px">Period: ${dateFrom} to ${dateTo} &nbsp;|&nbsp; Generated: ${new Date().toLocaleString()}</div>
  </div>
</div>
<div class="summary">
  <div class="sum-box"><div class="sum-label">Opening Balance</div><div class="sum-value" style="color:#1a56db">${GHS(tOpen)}</div></div>
  <div class="sum-box"><div class="sum-label">Total Credits</div><div class="sum-value" style="color:#16a34a">${GHS(tc)}</div><div style="font-size:9px;color:#64748b">${txns.filter(t => t.type === 'credit').length} txns</div></div>
  <div class="sum-box"><div class="sum-label">Total Debits</div><div class="sum-value" style="color:#dc2626">${GHS(td)}</div><div style="font-size:9px;color:#64748b">${txns.filter(t => t.type === 'debit').length} txns</div></div>
  <div class="sum-box"><div class="sum-label">Net Cash</div><div class="sum-value" style="color:${(tc - td) >= 0 ? '#16a34a' : '#dc2626'}">${GHS(tc - td)}</div></div>
  <div class="sum-box"><div class="sum-label">Transactions</div><div class="sum-value" style="color:#7c3aed">${txns.length}</div></div>
</div>
<div class="section-title">Transaction Details (${txns.length})</div>
<table><thead><tr><th>Time</th><th>Reference</th><th>Account</th><th>Customer</th><th>Narration</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th><th style="text-align:right">Balance</th><th>Teller</th><th>Status</th></tr></thead>
<tbody>${buildTxnRows(txns)}</tbody>
<tfoot><tr style="background:#1e293b;color:#fff;font-weight:700">
  <td colspan="5">TOTALS</td>
  <td style="text-align:right;color:#fca5a5">${GHS(td)}</td>
  <td style="text-align:right;color:#86efac">${GHS(tc)}</td>
  <td colspan="3"></td>
</tr></tfoot></table>
<div class="closing-box">
  <div>
    <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Closing Balance</div>
    <div style="font-size:28px;font-weight:900;color:#fff">${GHS(tClose)}</div>
    <div style="font-size:11px;color:#64748b;margin-top:4px">Opening ${GHS(tOpen)} + Credits ${GHS(tc)} \u2212 Debits ${GHS(td)}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:11px;color:#64748b;margin-bottom:8px">Teller Signature: ________________________</div>
    <div style="font-size:11px;color:#64748b;margin-bottom:8px">Supervisor Signature: ________________________</div>
    <div style="font-size:11px;color:#64748b">Date: ________________________</div>
  </div>
</div>
<div class="footer">
  <span>Majupat Love Enterprise &mdash; ${teller.name} &mdash; ${dateFrom} to ${dateTo}</span>
  <span>Printed: ${new Date().toLocaleString()}</span>
</div>
<script>window.onload=()=>{window.print();}<\/script>
</body></html>`);
    win.document.close();
  };
  const handleExportCSV = () => {
    exportCSV(filtered.map(t => {
      const acc  = accounts.find(a => a.id === t.accountId);
      const cust = customers.find(c => c.id === (acc?.customerId || acc?.customer_id));
      return {
        Time: fmtTime(t.createdAt), Date: t.createdAt?.slice(0, 10),
        Reference: t.reference,
        Account: acc?.accountNumber || acc?.account_number || '—',
        Customer: cust?.name || '—',
        Narration: t.narration,
        Type: t.type, Amount: t.amount,
        BalanceAfter: t.balanceAfter,
        Teller: t.posterName || '—',
        Phone: t.posterPhone || '—',
        Channel: t.channel || 'teller',
        Reversed: t.reversed ? 'Yes' : 'No',
      };
    }), `teller-report-${dateFrom}-${dateTo}`);
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Teller Call-Over Report</div>
          <div className="page-desc">
            {tellerFilter !== 'all'
              ? `Report for: ${tellerFilter} · ${dateFrom === dateTo ? fmtDate(dateFrom) : `${fmtDate(dateFrom)} — ${fmtDate(dateTo)}`}`
              : 'Select a teller or print all'}
          </div>
        </div>
        <div className="page-header-right">
          <button className="btn btn-secondary" onClick={handleExportCSV}><Download size={14} /> CSV</button>
          <button className="btn btn-primary" onClick={handlePrint}><Printer size={14} /> Print Report</button>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label className="form-label">From</label>
              <input type="date" className="form-control" value={dateFrom} max={today}
                onChange={e => setDateFrom(e.target.value)} style={{ width: 150 }} />
            </div>
            <div>
              <label className="form-label">To</label>
              <input type="date" className="form-control" value={dateTo} max={today}
                onChange={e => setDateTo(e.target.value)} style={{ width: 150 }} />
            </div>
            <div style={{ minWidth: 220 }}>
              <label className="form-label">Teller</label>
              <select className="form-control" value={tellerFilter} onChange={e => setTellerFilter(e.target.value)}
                style={{ borderColor: tellerFilter !== 'all' ? 'var(--brand)' : undefined, fontWeight: tellerFilter !== 'all' ? 700 : 400 }}>
                <option value="all">All Tellers</option>
                {tellers.map(t => (
                  <option key={t.id || t.name} value={t.name}>
                    {t.name}{t.phone ? ` (${t.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ minWidth: 160 }}>
              <label className="form-label">Channel</label>
              <select className="form-control" value={channelFilter} onChange={e => setChannelFilter(e.target.value)}>
                <option value="all">All Channels</option>
                <option value="teller">Teller</option>
                <option value="collection">Collection</option>
                <option value="transfer">Transfer</option>
                <option value="gl">GL Entry</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={showReversed} onChange={e => setShowReversed(e.target.checked)} />
                Show Reversed
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Opening Balance', value: GHS(openingBalance), color: '#1a56db', bg: '#eff6ff' },
          { label: 'Total Credits',   value: GHS(totalCredits),   color: '#16a34a', bg: '#f0fdf4', sub: `${filtered.filter(t => t.type === 'credit').length} txns` },
          { label: 'Total Debits',    value: GHS(totalDebits),    color: '#dc2626', bg: '#fef2f2', sub: `${filtered.filter(t => t.type === 'debit').length} txns` },
          { label: 'Net Cash',        value: GHS(netCash),        color: netCash >= 0 ? '#16a34a' : '#dc2626', bg: netCash >= 0 ? '#f0fdf4' : '#fef2f2' },
          { label: 'Closing Balance', value: GHS(closingBalance), color: '#0f172a', bg: '#f1f5f9', bold: true },
          { label: 'Transactions',    value: filtered.length,     color: '#7c3aed', bg: '#f5f3ff', sub: `${byTeller.length} teller(s)` },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: 16, background: s.bg, border: `1px solid ${s.color}22` }}>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: s.bold ? 20 : 18, fontWeight: 800, color: s.color }}>{s.value}</div>
            {s.sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Closing Balance Banner */}
      <div style={{ background: '#0f172a', borderRadius: 12, padding: '20px 28px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Closing Balance</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#fff' }}>{GHS(closingBalance)}</div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
            Opening {GHS(openingBalance)} + Credits {GHS(totalCredits)} &minus; Debits {GHS(totalDebits)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#475569', marginBottom: 6 }}>
            Period: {dateFrom === dateTo ? fmtDate(dateFrom) : `${fmtDate(dateFrom)} \u2014 ${fmtDate(dateTo)}`}
          </div>
          <div style={{ fontSize: 11, color: '#475569' }}>{filtered.length} transactions &nbsp;|&nbsp; {byTeller.length} teller(s)</div>
        </div>
      </div>

      {/* Per-Teller Breakdown with individual print buttons */}
      {byTeller.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><div className="card-title">Teller Breakdown</div></div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Teller</th>
                  <th>Phone</th>
                  <th style={{ textAlign: 'right' }}>Credits</th>
                  <th style={{ textAlign: 'right' }}>Debits</th>
                  <th style={{ textAlign: 'right' }}>Net</th>
                  <th style={{ textAlign: 'center' }}>Transactions</th>
                  <th style={{ textAlign: 'center' }}>Print</th>
                </tr>
              </thead>
              <tbody>
                {byTeller.map(t => (
                  <tr key={t.name}>
                    <td style={{ fontWeight: 700 }}>
                      <User size={13} style={{ marginRight: 6, color: 'var(--text-3)' }} />{t.name}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'monospace' }}>{t.phone || '\u2014'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>{GHS(t.credits)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--red)' }}>{GHS(t.debits)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: (t.credits - t.debits) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {GHS(t.credits - t.debits)}
                    </td>
                    <td style={{ textAlign: 'center' }}>{t.count}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => printTellerSheet(t)} title={`Print ${t.name}'s sheet`}>
                        <Printer size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--surface-2)', fontWeight: 800 }}>
                  <td colSpan={2}>TOTAL</td>
                  <td style={{ textAlign: 'right', color: 'var(--green)' }}>{GHS(totalCredits)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--red)' }}>{GHS(totalDebits)}</td>
                  <td style={{ textAlign: 'right', color: netCash >= 0 ? 'var(--green)' : 'var(--red)' }}>{GHS(netCash)}</td>
                  <td style={{ textAlign: 'center' }}>{filtered.length}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transaction Details */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Transaction Details ({filtered.length})</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={handleExportCSV}><Download size={13} /> CSV</button>
            <button className="btn btn-primary btn-sm" onClick={handlePrint}><Printer size={13} /> Print</button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th><th>Reference</th><th>Account</th><th>Customer</th>
                <th>Narration</th><th>Channel</th>
                <th style={{ textAlign: 'right' }}>Debit</th>
                <th style={{ textAlign: 'right' }}>Credit</th>
                <th style={{ textAlign: 'right' }}>Balance After</th>
                <th>Teller</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={11} className="table-empty"><AlertCircle size={14} /> No transactions found</td></tr>
              ) : filtered.map((t, idx) => {
                const acc  = accounts.find(a => a.id === t.accountId);
                const cust = customers.find(c => c.id === (acc?.customerId || acc?.customer_id));
                return (
                  <tr key={t.id} style={{ opacity: t.reversed ? 0.5 : 1, background: idx % 2 === 0 ? '#fff' : 'var(--surface)' }}>
                    <td style={{ fontSize: 11, whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{fmtTime(t.createdAt)}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 10 }}>{t.reference}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{acc?.accountNumber || acc?.account_number || '\u2014'}</td>
                    <td style={{ fontSize: 12 }}>{cust?.name || t.customerName || '\u2014'}</td>
                    <td style={{ fontSize: 12, maxWidth: 200 }}>{t.narration}</td>
                    <td><span className="badge badge-gray" style={{ fontSize: 10 }}>{t.channel || 'teller'}</span></td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--red)', whiteSpace: 'nowrap' }}>
                      {t.type === 'debit' ? GHS(t.amount) : ''}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green)', whiteSpace: 'nowrap' }}>
                      {t.type === 'credit' ? GHS(t.amount) : ''}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{GHS(t.balanceAfter)}</td>
                    <td style={{ fontSize: 12 }}>{t.posterName || '\u2014'}</td>
                    <td>
                      {t.reversed
                        ? <span className="badge badge-gray"><XCircle size={11} /> Reversed</span>
                        : <span className="badge badge-green"><CheckCircle size={11} /> Posted</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr style={{ background: '#1e293b' }}>
                  <td colSpan={6} style={{ padding: '10px 12px', color: '#fff', fontWeight: 700 }}>TOTALS</td>
                  <td style={{ textAlign: 'right', color: '#fca5a5', fontWeight: 800, padding: '10px 12px', whiteSpace: 'nowrap' }}>{GHS(totalDebits)}</td>
                  <td style={{ textAlign: 'right', color: '#86efac', fontWeight: 800, padding: '10px 12px', whiteSpace: 'nowrap' }}>{GHS(totalCredits)}</td>
                  <td colSpan={3} style={{ textAlign: 'right', color: '#fff', fontWeight: 800, padding: '10px 12px', whiteSpace: 'nowrap' }}>Closing: {GHS(closingBalance)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
