import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { Search, Download, Printer, FileText, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { exportStatementPDF, exportCSV } from '../../core/export';

const GHS = (n) => `GH\u20B5 ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function fmtDate(iso) {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function mondayOfWeek() {
  const d = new Date(); const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
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
  const { accounts, customers, transactions, loans, hpAgreements } = useApp();
  const navigate = useNavigate();
  const statementRef = useRef(null);

  const [searchQ, setSearchQ] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [preset, setPreset] = useState('this_month');
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo] = useState(todayStr());
  const [statement, setStatement] = useState(null);
  const [generating, setGenerating] = useState(false);

  const searchResults = useMemo(() => {
    if (!searchQ.trim()) return [];
    const q = searchQ.toLowerCase();
    return accounts
      .filter(a => {
        const cust = customers.find(c => c.id === a.customerId);
        return (a.accountNumber || '').includes(q) || (cust?.phone || '').includes(q) || (cust?.name || '').toLowerCase().includes(q);
      })
      .slice(0, 8)
      .map(a => ({ ...a, customer: customers.find(c => c.id === a.customerId) }));
  }, [searchQ, accounts, customers]);

  const selectAccount = (acc) => {
    setSelectedAccount(acc);
    setSelectedCustomer(acc.customer);
    setSearchQ(`${acc.accountNumber} \u2014 ${acc.customer?.name || ''}`);
    setShowDropdown(false);
    setStatement(null);
  };

  const applyPreset = (p) => {
    setPreset(p); setStatement(null);
    if (p === 'today') { setDateFrom(todayStr()); setDateTo(todayStr()); }
    else if (p === 'this_week') { setDateFrom(mondayOfWeek()); setDateTo(todayStr()); }
    else if (p === 'this_month') { setDateFrom(firstOfMonth()); setDateTo(todayStr()); }
    else if (p === 'last_month') { const r = lastMonthRange(); setDateFrom(r.from); setDateTo(r.to); }
  };

  const generate = () => {
    if (!selectedAccount) return;
    setGenerating(true);
    setTimeout(() => {
      const acctTxns = transactions
        .filter(t => t.accountId === selectedAccount.id)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      const from = dateFrom ? new Date(dateFrom + 'T00:00:00') : null;
      const to   = dateTo   ? new Date(dateTo   + 'T23:59:59') : null;

      const periodTxns = acctTxns.filter(t => {
        const d = new Date(t.createdAt);
        return (!from || d >= from) && (!to || d <= to);
      });

      // ── Classify transactions ─────────────────────────────────────────────
      // Collector cash payments (debit + channel=collection) do NOT affect
      // the account balance — cash is collected in the field, not from account.
      const isCollectorCashPayment = (t) =>
        t.type === 'debit' && t.channel === 'collection';

      // Loan-related = collector cash + any teller loan/HP/offset transactions
      const isLoanRelated = (t) =>
        isCollectorCashPayment(t) ||
        (t.narration || '').toLowerCase().includes('loan repayment') ||
        (t.narration || '').toLowerCase().includes('hp repayment') ||
        (t.narration || '').toLowerCase().includes('loan offset') ||
        !!(t.loanId || t.loan_id) ||
        !!(t.hpAgreementId || t.hp_agreement_id);

      // ALL period transactions go into the main statement table
      const loanTxns = periodTxns.filter(t => isLoanRelated(t));

      // ALL-time loan-related txns for the account (for accurate repayment totals)
      const allLoanTxns = acctTxns.filter(t => isLoanRelated(t));

      // ── Compute opening balance reliably ──────────────────────────────────
      const currentBalance = Number(selectedAccount.balance || 0);
      const txnsAfterPeriod = acctTxns.filter(t => {
        if (!to) return false;
        return new Date(t.createdAt) > to;
      });
      let closingBalance = currentBalance;
      for (const t of txnsAfterPeriod) {
        if (isCollectorCashPayment(t)) continue;
        if (t.type === 'credit') closingBalance -= t.amount;
        else closingBalance += t.amount;
      }

      const totalCredits = periodTxns.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
      const totalDebits  = periodTxns.filter(t => t.type === 'debit' && !isCollectorCashPayment(t)).reduce((s, t) => s + t.amount, 0);
      const openingBalance = closingBalance - totalCredits + totalDebits;

      // Recompute running balance for ALL transactions in order
      let runningBal = openingBalance;
      const allTxnsWithBal = periodTxns.map(t => {
        if (isCollectorCashPayment(t)) {
          return { ...t, computedBalance: runningBal, balanceUnchanged: true };
        }
        if (t.type === 'credit') runningBal += t.amount;
        else runningBal -= t.amount;
        return { ...t, computedBalance: runningBal };
      });

      const acctLoans = loans.filter(l =>
        l.accountId === selectedAccount.id || l.account_id === selectedAccount.id
      );

      const acctHP = hpAgreements.filter(a =>
        a.customerId === selectedCustomer?.id || a.customer_id === selectedCustomer?.id
      );

      setStatement({
        account: selectedAccount,
        customer: selectedCustomer,
        dateFrom, dateTo,
        generatedAt: new Date().toISOString(),
        transactions: allTxnsWithBal,
        loanTransactions: loanTxns,
        allLoanTxns,           // all-time for repayment totals
        acctLoans,
        acctHP,
        openingBalance, totalCredits, totalDebits, closingBalance,
      });
      setGenerating(false);
    }, 300);
  };

  const handlePrint = () => {
    if (!statement) return;
    const win = window.open('', '_blank', 'width=900,height=700');
    const loanRows = (statement.acctLoans || []).map(loan => {
      const monthly = Number(loan.monthlyPayment || 0);
      const tenure  = Number(loan.tenure || 0);
      const principal = Number(loan.amount || 0);
      const totalRepay = monthly > 0 && tenure > 0 ? monthly * tenure : principal;
      return `<tr>
        <td style="text-transform:capitalize">${(loan.type||'').replace(/_/g,' ')}</td>
        <td>${loan.disbursedAt ? new Date(loan.disbursedAt).toLocaleDateString() : '\u2014'}</td>
        <td style="text-align:right;font-weight:700">${GHS(principal)}</td>
        <td style="text-align:right">${loan.interestRate}%</td>
        <td style="text-align:right">${GHS(monthly)}</td>
        <td style="text-align:right;font-weight:700;color:#1d4ed8">${GHS(totalRepay)}</td>
        <td style="text-align:right;font-weight:700;color:${Number(loan.outstanding)>0?'#dc2626':'#16a34a'}">${GHS(loan.outstanding)}</td>
        <td style="text-align:center">${(loan.status||'').toUpperCase()}</td>
      </tr>`;
    }).join('');

    const loanRepayRows = (statement.loanTransactions || []).map(t => `<tr>
      <td>${fmtDate(t.createdAt)}</td>
      <td style="font-family:monospace;font-size:10px">${t.reference}</td>
      <td>${t.narration||'\u2014'}</td>
      <td style="text-align:right;font-weight:700;color:#1d4ed8">${GHS(t.amount)}</td>
    </tr>`).join('');

    const hpRows = (statement.acctHP || []).map((agr, i) => `<tr>
      <td style="font-weight:600">${agr.itemName||agr.item_name||'\u2014'}</td>
      <td style="text-align:right;font-weight:700">${GHS(agr.totalPrice||agr.total_price||0)}</td>
      <td style="text-align:right">${GHS(agr.downPayment||agr.down_payment||0)}</td>
      <td style="text-align:right">${GHS((agr.totalPrice||agr.total_price||0)-(agr.downPayment||agr.down_payment||0))}</td>
      <td style="text-align:right;font-weight:700;color:#16a34a">${GHS(agr.totalPaid||agr.total_paid||0)}</td>
      <td style="text-align:right;font-weight:700;color:${Number(agr.remaining||0)>0?'#dc2626':'#16a34a'}">${GHS(agr.remaining||0)}</td>
      <td style="text-align:right">${GHS(agr.suggestedPayment||agr.suggested_payment||0)}</td>
      <td style="text-align:center">${(agr.status||'').toUpperCase()}</td>
    </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Statement \u2014 ${statement.account.accountNumber}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:Arial,sans-serif; font-size:12px; color:#1a1a2e; background:#fff; padding:24px; }
.bank-header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #1a56db; padding-bottom:14px; margin-bottom:18px; }
.bank-name { font-size:22px; font-weight:900; color:#1a56db; }
.bank-tagline { font-size:10px; color:#64748b; margin-top:2px; }
.stmt-title { font-size:14px; font-weight:700; text-align:right; }
.info-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 24px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:14px; margin-bottom:16px; }
.info-row { display:flex; gap:8px; }
.info-label { font-size:10px; color:#64748b; font-weight:600; text-transform:uppercase; min-width:110px; }
.info-value { font-size:11px; font-weight:700; color:#0f172a; }
.summary { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:16px; }
.sum-box { border:1px solid #e2e8f0; border-radius:6px; padding:10px 12px; text-align:center; }
.sum-label { font-size:9px; color:#64748b; font-weight:600; text-transform:uppercase; margin-bottom:4px; }
.sum-value { font-size:13px; font-weight:800; }
table { width:100%; border-collapse:collapse; font-size:11px; margin-bottom:16px; }
thead tr { background:#1a56db; color:#fff; }
th { padding:7px 8px; text-align:left; font-weight:700; font-size:10px; text-transform:uppercase; }
td { padding:6px 8px; border-bottom:1px solid #f1f5f9; }
tr:nth-child(even) { background:#f8fafc; }
.tfoot-row td { background:#1e293b; color:#fff; font-weight:700; border:none; }
.section-title { font-size:11px; font-weight:700; color:#92400e; text-transform:uppercase; margin:16px 0 8px; padding:8px 12px; background:#fffbeb; border-left:4px solid #f59e0b; }
.footer-note { margin-top:20px; font-size:9px; color:#94a3b8; border-top:1px solid #e2e8f0; padding-top:10px; }
@media print { body { padding:10px; } @page { margin:10mm; } }
</style></head><body>
<div class="bank-header">
  <div><div class="bank-name">Majupat Love Enterprise</div><div class="bank-tagline">Developed by Maxbraynn Technology &amp; Systems</div></div>
  <div><div class="stmt-title">ACCOUNT STATEMENT</div><div style="font-size:10px;color:#64748b;text-align:right">Generated: ${new Date(statement.generatedAt).toLocaleString()}</div></div>
</div>
<div class="info-grid">
  <div class="info-row"><span class="info-label">Account Number</span><span class="info-value">${statement.account.accountNumber}</span></div>
  <div class="info-row"><span class="info-label">Account Type</span><span class="info-value">${(statement.account.type||'').replace('_',' ').toUpperCase()}</span></div>
  <div class="info-row"><span class="info-label">Account Status</span><span class="info-value">${(statement.account.status||'').toUpperCase()}</span></div>
  <div class="info-row"><span class="info-label">Customer Name</span><span class="info-value">${statement.customer?.name||'\u2014'}</span></div>
  <div class="info-row"><span class="info-label">Phone</span><span class="info-value">${statement.customer?.phone||'\u2014'}</span></div>
  <div class="info-row"><span class="info-label">Address</span><span class="info-value">${statement.customer?.address||'\u2014'}</span></div>
  <div class="info-row"><span class="info-label">Statement Period</span><span class="info-value">${fmtDate(statement.dateFrom+'T00:00:00')} \u2014 ${fmtDate(statement.dateTo+'T00:00:00')}</span></div>
  <div class="info-row"><span class="info-label">Transactions</span><span class="info-value">${statement.transactions.length} transaction(s)</span></div>
  <div class="info-row"><span class="info-label">Branch</span><span class="info-value">Head Office</span></div>
</div>
<div class="summary">
  <div class="sum-box"><div class="sum-label">Opening Balance</div><div class="sum-value" style="color:#1a56db">${GHS(statement.openingBalance)}</div></div>
  <div class="sum-box"><div class="sum-label">Total Credits</div><div class="sum-value" style="color:#16a34a">${GHS(statement.totalCredits)}</div></div>
  <div class="sum-box"><div class="sum-label">Total Debits</div><div class="sum-value" style="color:#dc2626">${GHS(statement.totalDebits)}</div></div>
  <div class="sum-box"><div class="sum-label">Closing Balance</div><div class="sum-value">${GHS(statement.closingBalance)}</div></div>
</div>
<table>
  <thead><tr><th>Date</th><th>Value Date</th><th>Reference</th><th>Description</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th><th style="text-align:right">Balance</th></tr></thead>
  <tbody>
    ${statement.transactions.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:20px;color:#94a3b8">No transactions in this period</td></tr>' :
      statement.transactions.map(t => `<tr>
        <td style="white-space:nowrap">${fmtDate(t.createdAt)}</td>
        <td style="white-space:nowrap">${fmtDate(t.createdAt)}</td>
        <td style="font-family:monospace;font-size:10px">${t.reference}</td>
        <td>${t.narration||'\u2014'}${t.reversed?'<span style="font-size:9px;background:#fef3c7;color:#92400e;padding:1px 4px;border-radius:3px;margin-left:4px">REVERSED</span>':''}</td>
        <td style="text-align:right;color:#dc2626;font-weight:700">${t.type==='debit'?Number(t.amount).toLocaleString('en-GH',{minimumFractionDigits:2}):''}</td>
        <td style="text-align:right;color:#16a34a;font-weight:700">${t.type==='credit'?Number(t.amount).toLocaleString('en-GH',{minimumFractionDigits:2}):''}</td>
        <td style="text-align:right;font-weight:600">${Number(t.computedBalance ?? t.balanceAfter ?? 0).toLocaleString('en-GH',{minimumFractionDigits:2})}</td>
      </tr>`).join('')}
  </tbody>
  <tfoot><tr class="tfoot-row">
    <td colspan="4"><strong>TOTALS</strong></td>
    <td style="text-align:right">${Number(statement.totalDebits).toLocaleString('en-GH',{minimumFractionDigits:2})}</td>
    <td style="text-align:right">${Number(statement.totalCredits).toLocaleString('en-GH',{minimumFractionDigits:2})}</td>
    <td style="text-align:right">${Number(statement.closingBalance).toLocaleString('en-GH',{minimumFractionDigits:2})}</td>
  </tr></tfoot>
</table>
${loanRows ? `<div class="section-title">Loan Summary</div>
<table>
  <thead><tr><th>Type</th><th>Disbursed</th><th style="text-align:right">Principal</th><th style="text-align:right">Rate</th><th style="text-align:right">Monthly</th><th style="text-align:right">Total Repayable</th><th style="text-align:right">Outstanding</th><th style="text-align:center">Status</th></tr></thead>
  <tbody>${loanRows}</tbody>
</table>` : ''}
${loanRepayRows ? `<div class="section-title">Loan Repayments in Period</div>
<table>
  <thead><tr><th>Date</th><th>Reference</th><th>Description</th><th style="text-align:right">Amount Paid</th></tr></thead>
  <tbody>${loanRepayRows}</tbody>
</table>` : ''}
${hpRows ? `<div class="section-title">🛍️ Hire Purchase Summary</div>
<table>
  <thead><tr><th>Item</th><th style="text-align:right">Cash Price</th><th style="text-align:right">Down Payment</th><th style="text-align:right">Loan Amount</th><th style="text-align:right">Total Paid</th><th style="text-align:right">Remaining</th><th style="text-align:right">Suggested</th><th style="text-align:center">Status</th></tr></thead>
  <tbody>${hpRows}</tbody>
</table>` : ''}
<div class="footer-note">This is a computer-generated statement and does not require a signature or stamp. For queries, contact your nearest Majupat Love Enterprise branch within 30 days.<br/>Generated: ${new Date(statement.generatedAt).toLocaleString()} | ${statement.transactions.length} savings transaction(s) | ${statement.loanTransactions?.length||0} loan repayment(s)</div>
<script>window.onload=()=>{window.print();}<\/script>
</body></html>`;
    win.document.write(html);
    win.document.close();
  };

  const handleExportCSV = () => {
    if (!statement) return;
    const rows = statement.transactions.map(t => ({
      Date: fmtDate(t.createdAt), Reference: t.reference,
      Narration: t.narration + (t.reversed ? ' [REVERSED]' : ''),
      Debit: t.type === 'debit' ? t.amount : '',
      Credit: t.type === 'credit' ? t.amount : '',
      Balance: t.computedBalance ?? t.balanceAfter,
    }));
    exportCSV(rows, `statement-${statement.account.accountNumber}`);
  };

  const handleExportPDF = () => {
    if (!statement) return;
    exportStatementPDF({ account: statement.account, customer: statement.customer, transactions: statement.transactions, dateFrom: statement.dateFrom, dateTo: statement.dateTo });
  };

  const PRESETS = [
    { key: 'today', label: 'Today' }, { key: 'this_week', label: 'This Week' },
    { key: 'this_month', label: 'This Month' }, { key: 'last_month', label: 'Last Month' },
    { key: 'custom', label: 'Custom' },
  ];

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Account Statement</div>
          <div className="page-desc">Generate a professional bank statement for any account</div>
        </div>
        {statement && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={handlePrint}><Printer size={14} style={{ marginRight: 5 }} />Print</button>
            <button className="btn btn-secondary btn-sm" onClick={handleExportCSV}><Download size={14} style={{ marginRight: 5 }} />CSV</button>
            <button className="btn btn-primary btn-sm" onClick={handleExportPDF}><FileText size={14} style={{ marginRight: 5 }} />PDF</button>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 280px', position: 'relative' }}>
            <label className="form-label">Account / Customer</label>
            <div className="search-box">
              <Search size={14} />
              <input className="form-control" placeholder="Search by account no., phone, or name..."
                value={searchQ}
                onChange={e => { setSearchQ(e.target.value); setShowDropdown(true); setSelectedAccount(null); setStatement(null); }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 180)} />
            </div>
            {showDropdown && searchResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4 }}>
                {searchResults.map(acc => (
                  <div key={acc.id} onMouseDown={() => selectAccount(acc)}
                    style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
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

          <div style={{ flex: '0 0 auto' }}>
            <label className="form-label">Period</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {PRESETS.map(p => (
                <button key={p.key} onClick={() => applyPreset(p.key)}
                  style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: preset === p.key ? '2px solid var(--brand)' : '1px solid var(--border)', background: preset === p.key ? 'var(--brand)' : 'var(--surface)', color: preset === p.key ? '#fff' : 'var(--text-2)' }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div>
              <label className="form-label">From</label>
              <input className="form-control" type="date" value={dateFrom} style={{ width: 145 }}
                onChange={e => { setDateFrom(e.target.value); setPreset('custom'); setStatement(null); }} />
            </div>
            <div>
              <label className="form-label">To</label>
              <input className="form-control" type="date" value={dateTo} style={{ width: 145 }}
                onChange={e => { setDateTo(e.target.value); setPreset('custom'); setStatement(null); }} />
            </div>
          </div>

          <div style={{ paddingBottom: 1 }}>
            <button className="btn btn-primary" onClick={generate} disabled={!selectedAccount || generating} style={{ height: 38, paddingLeft: 20, paddingRight: 20 }}>
              {generating ? 'Generating...' : 'Generate Statement'}
            </button>
          </div>
        </div>
      </div>

      {!selectedAccount && !statement && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-3)' }}>
          <FileText size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No account selected</div>
          <div style={{ fontSize: 13 }}>Search for an account above to generate a statement</div>
        </div>
      )}

      {statement && (
        <div ref={statementRef} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

          {/* Bank header */}
          <div style={{ background: 'linear-gradient(135deg, #1a56db 0%, #1e40af 100%)', padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>Majupat Love Enterprise</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>Developed by Maxbraynn Technology &amp; Systems</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: 1 }}>Account Statement</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>Generated: {new Date(statement.generatedAt).toLocaleString()}</div>
            </div>
          </div>

          {/* Account info */}
          <div style={{ padding: '20px 28px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 32px' }}>
              {[
                ['Account Number', statement.account.accountNumber],
                ['Account Type', (statement.account.type || '').replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())],
                ['Account Status', (statement.account.status || '').toUpperCase()],
                ['Customer Name', statement.customer?.name || '\u2014'],
                ['Phone', statement.customer?.phone || '\u2014'],
                ['Address', statement.customer?.address || '\u2014'],
                ['Statement Period', `${fmtDate(statement.dateFrom + 'T00:00:00')} \u2014 ${fmtDate(statement.dateTo + 'T00:00:00')}`],
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid #e2e8f0' }}>
            {[
              { label: 'Opening Balance', value: statement.openingBalance, color: '#1a56db' },
              { label: 'Total Credits',   value: statement.totalCredits,   color: '#16a34a' },
              { label: 'Total Debits',    value: statement.totalDebits,    color: '#dc2626' },
              { label: 'Closing Balance', value: statement.closingBalance, color: '#0f172a' },
            ].map((s, i) => (
              <div key={s.label} style={{ padding: '16px 20px', borderRight: i < 3 ? '1px solid #e2e8f0' : 'none', background: '#fff' }}>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{GHS(s.value)}</div>
              </div>
            ))}
          </div>

          {/* Transaction table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#1e293b' }}>
                  {['Date', 'Value Date', 'Reference', 'Description / Narration', 'Debit (GH\u20B5)', 'Credit (GH\u20B5)', 'Balance (GH\u20B5)'].map((h, i) => (
                    <th key={h} style={{ padding: '10px 12px', color: '#fff', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: i >= 4 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {statement.transactions.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: 13 }}>No transactions found in this period</td></tr>
                ) : statement.transactions.map((t, idx) => (
                  <tr key={t.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc', opacity: t.reversed ? 0.6 : 1 }}>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: '#475569', fontSize: 11 }}>{fmtDate(t.createdAt)}</td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: '#475569', fontSize: 11 }}>{fmtDate(t.createdAt)}</td>
                    <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 10, color: '#334155', whiteSpace: 'nowrap' }}>{t.reference}</td>
                    <td style={{ padding: '9px 12px', color: '#0f172a', maxWidth: 260 }}>
                      {t.narration || '\u2014'}
                      {t.reversed && <span style={{ fontSize: 9, background: '#fef3c7', color: '#92400e', padding: '1px 5px', borderRadius: 3, marginLeft: 6, fontWeight: 700 }}>REVERSED</span>}
                      {t.balanceUnchanged && <span style={{ fontSize: 9, background: '#eff6ff', color: '#1d4ed8', padding: '1px 5px', borderRadius: 3, marginLeft: 6, fontWeight: 700 }}>COLLECTION</span>}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: t.balanceUnchanged ? '#94a3b8' : '#dc2626', whiteSpace: 'nowrap' }}>
                      {t.type === 'debit' ? Number(t.amount).toLocaleString('en-GH', { minimumFractionDigits: 2 }) : ''}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#16a34a', whiteSpace: 'nowrap' }}>
                      {t.type === 'credit' ? Number(t.amount).toLocaleString('en-GH', { minimumFractionDigits: 2 }) : ''}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, color: t.balanceUnchanged ? '#94a3b8' : '#0f172a', whiteSpace: 'nowrap' }}>
                      {t.balanceUnchanged ? '—' : Number(t.computedBalance ?? t.balanceAfter ?? 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#1e293b' }}>
                  <td colSpan={4} style={{ padding: '10px 12px', color: '#fff', fontWeight: 700, fontSize: 11 }}>TOTALS</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#fca5a5', fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}>{Number(statement.totalDebits).toLocaleString('en-GH', { minimumFractionDigits: 2 })}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#86efac', fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}>{Number(statement.totalCredits).toLocaleString('en-GH', { minimumFractionDigits: 2 })}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#fff', fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}>{Number(statement.closingBalance).toLocaleString('en-GH', { minimumFractionDigits: 2 })}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Loan Summary — one section per loan */}
          {statement.acctLoans && statement.acctLoans.length > 0 && (
            <div style={{ padding: '20px 28px', borderTop: '1px solid #e2e8f0', background: '#fffbeb' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📋</span> Loan Summary ({statement.acctLoans.length} loan{statement.acctLoans.length > 1 ? 's' : ''})
              </div>

              {statement.acctLoans.map((loan, lIdx) => {
                const monthly = Number(loan.monthlyPayment || 0);
                const tenure  = Number(loan.tenure || 0);
                const principal = Number(loan.amount || 0);
                const totalRepay = monthly > 0 && tenure > 0 ? monthly * tenure : principal;

                // Match repayments to this loan using ALL-time txns:
                // 1. Direct loan_id match
                // 2. hp_agreement_id matches loan's hpAgreementId
                // 3. Collector debits (no loan_id stored) matched by narration containing item name
                const itemNameLower = (loan.itemName || '').toLowerCase();
                const allRepayTxns = (statement.allLoanTxns || statement.loanTransactions || []).filter(t => {
                  if (t.loanId === loan.id || t.loan_id === loan.id) return true;
                  if (loan.hpAgreementId && (t.hpAgreementId === loan.hpAgreementId || t.hp_agreement_id === loan.hpAgreementId)) return true;
                  // Collector transactions often have no loan_id — match by item name in narration
                  if (itemNameLower && (t.narration || '').toLowerCase().includes(itemNameLower)) return true;
                  return false;
                });

                // Period repayments for the repayment table
                const periodFrom = statement.dateFrom ? new Date(statement.dateFrom + 'T00:00:00') : null;
                const periodTo   = statement.dateTo   ? new Date(statement.dateTo   + 'T23:59:59') : null;
                const thisLoanTxns = allRepayTxns.filter(t => {
                  const d = new Date(t.createdAt);
                  return (!periodFrom || d >= periodFrom) && (!periodTo || d <= periodTo);
                });

                // Total repaid = use loan's own outstanding vs principal, or sum all-time txns
                const totalRepaid = allRepayTxns.reduce((s, t) => s + Number(t.amount || 0), 0);

                return (
                  <div key={loan.id} style={{ marginBottom: lIdx < statement.acctLoans.length - 1 ? 24 : 0, border: '1px solid #fde68a', borderRadius: 10, overflow: 'hidden' }}>
                    {/* Loan header */}
                    <div style={{ background: loan.status === 'completed' ? '#f0fdf4' : loan.status === 'overdue' ? '#fef2f2' : '#fefce8', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #fde68a' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 18 }}>{loan.status === 'completed' ? '✅' : loan.status === 'overdue' ? '⚠️' : '📋'}</span>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 13, textTransform: 'capitalize' }}>{(loan.type || '').replace(/_/g, ' ')}{loan.itemName ? ` — ${loan.itemName}` : ''}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Disbursed: {loan.disbursedAt ? new Date(loan.disbursedAt).toLocaleDateString() : '—'}</div>
                        </div>
                      </div>
                      <span style={{ padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 800, background: loan.status === 'active' ? '#dcfce7' : loan.status === 'overdue' ? '#fee2e2' : loan.status === 'completed' ? '#d1fae5' : '#f1f5f9', color: loan.status === 'active' ? '#15803d' : loan.status === 'overdue' ? '#dc2626' : loan.status === 'completed' ? '#065f46' : '#64748b' }}>
                        {(loan.status || '').toUpperCase()}
                      </span>
                    </div>

                    {/* Loan figures */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 0, background: '#fff' }}>
                      {[
                        ['Principal',       GHS(principal),                                '#0f172a'],
                        ['Rate',            `${loan.interestRate}%`,                       '#475569'],
                        ['Monthly',         GHS(monthly),                                  '#1d4ed8'],
                        ['Total Repayable', GHS(totalRepay),                               '#1d4ed8'],
                        ['Total Repaid',    GHS(Math.max(0, principal - Number(loan.outstanding || 0))), '#16a34a'],
                        ['Outstanding',     GHS(loan.outstanding),                         Number(loan.outstanding) > 0 ? '#dc2626' : '#16a34a'],
                      ].map(([k, v, col], i) => (
                        <div key={k} style={{ padding: '10px 14px', borderRight: i < 5 ? '1px solid #fde68a' : 'none', borderTop: '1px solid #fde68a' }}>
                          <div style={{ fontSize: 10, color: '#92400e', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{k}</div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: col }}>{v}</div>
                        </div>
                      ))}
                    </div>

                    {/* This loan's repayments */}
                    {thisLoanTxns.length > 0 && (
                      <div style={{ borderTop: '1px solid #fde68a' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', padding: '8px 14px', background: '#fef9c3', display: 'flex', justifyContent: 'space-between' }}>
                          <span>Repayments in Period ({thisLoanTxns.length}) — {GHS(thisLoanTxns.reduce((s,t)=>s+Number(t.amount||0),0))}</span>
                          {allRepayTxns.length > thisLoanTxns.length && (
                            <span style={{ color: '#64748b', fontWeight: 400 }}>All-time: {GHS(totalRepaid)} ({allRepayTxns.length} payments)</span>
                          )}
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                          <thead>
                            <tr style={{ background: '#f1f5f9' }}>
                              {['Date', 'Reference', 'Description', 'Via', 'Amount Paid'].map((h, i) => (
                                <th key={h} style={{ padding: '6px 10px', textAlign: i === 4 ? 'right' : 'left', fontSize: 10, color: '#64748b', fontWeight: 700 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {thisLoanTxns.map((t, i) => (
                              <tr key={t.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '6px 10px', color: '#64748b' }}>{fmtDate(t.createdAt)}</td>
                                <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 10 }}>{t.reference}</td>
                                <td style={{ padding: '6px 10px' }}>{t.narration}</td>
                                <td style={{ padding: '6px 10px' }}>
                                  <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, fontWeight: 700, background: t.channel === 'collection' ? '#eff6ff' : '#f0fdf4', color: t.channel === 'collection' ? '#1d4ed8' : '#15803d' }}>
                                    {t.channel === 'collection' ? 'Collector' : 'Teller'}
                                  </span>
                                </td>
                                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>{GHS(t.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {thisLoanTxns.length === 0 && (
                      <div style={{ padding: '10px 14px', fontSize: 12, color: '#94a3b8', borderTop: '1px solid #fde68a', background: '#fff' }}>
                        No repayments in selected period
                        {allRepayTxns.length > 0 && <span style={{ color: '#92400e', marginLeft: 8 }}>({allRepayTxns.length} payment(s) outside this period — total {GHS(totalRepaid)})</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* HP Agreement Summary */}
          {statement.acctHP && statement.acctHP.length > 0 && (
            <div style={{ padding: '20px 28px', borderTop: '1px solid #e2e8f0', background: '#faf5ff' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6b21a8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🛍️</span> Hire Purchase Summary
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#1e293b' }}>
                      {['Item', 'Cash Price', 'Down Payment', 'Loan Amount', 'Total Paid', 'Remaining', 'Suggested Payment', 'Status'].map((h, i) => (
                        <th key={h} style={{ padding: '8px 10px', color: '#fff', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', textAlign: i >= 1 ? 'right' : 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {statement.acctHP.map((agr, i) => (
                      <tr key={agr.id} style={{ background: i % 2 === 0 ? '#fff' : '#f5f3ff' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{agr.itemName || agr.item_name || '\u2014'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{GHS(agr.totalPrice || agr.total_price || 0)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>{GHS(agr.downPayment || agr.down_payment || 0)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>{GHS((agr.totalPrice || agr.total_price || 0) - (agr.downPayment || agr.down_payment || 0))}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>{GHS(agr.totalPaid || agr.total_paid || 0)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: Number(agr.remaining || 0) > 0 ? '#dc2626' : '#16a34a' }}>{GHS(agr.remaining || 0)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>{GHS(agr.suggestedPayment || agr.suggested_payment || 0)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: agr.status === 'active' ? '#ede9fe' : agr.status === 'completed' ? '#dcfce7' : '#fee2e2', color: agr.status === 'active' ? '#6b21a8' : agr.status === 'completed' ? '#15803d' : '#dc2626' }}>
                            {(agr.status || '').toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{ padding: '14px 28px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 10, color: '#94a3b8', maxWidth: 500 }}>
              This is a computer-generated statement and does not require a signature or stamp.
              For queries or disputes, please contact your nearest Majupat Love Enterprise branch within 30 days of this statement date.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={handlePrint}><Printer size={13} style={{ marginRight: 4 }} />Print</button>
              <button className="btn btn-secondary btn-sm" onClick={handleExportCSV}><Download size={13} style={{ marginRight: 4 }} />CSV</button>
              <button className="btn btn-primary btn-sm" onClick={handleExportPDF}><FileText size={13} style={{ marginRight: 4 }} />PDF</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
