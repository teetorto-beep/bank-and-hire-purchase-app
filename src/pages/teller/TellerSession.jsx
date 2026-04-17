import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { authDB } from '../../core/db';
import { Search, Printer, Download, CheckCircle, AlertCircle, TrendingUp, DollarSign, BookOpen, Monitor } from 'lucide-react';
import { exportCSV } from '../../core/export';
import { loadApprovalRules, requiresApproval } from '../../core/approvalRules';

const GHS = (n) => `GH₵ ${Number(n||0).toLocaleString('en-GH',{minimumFractionDigits:2})}`;

const NARRATION_PRESETS = [
  'Cash deposit',
  'Cash withdrawal',
  'Loan repayment',
  'Account opening deposit',
  'Transfer in',
  'Transfer out',
  'Charges',
  'Interest payment',
];

function printReceipt({ ref, account, customer, type, amount, balanceAfter, tellerName }) {
  const win = window.open('', '_blank', 'width=400,height=600');
  const date = new Date().toLocaleString('en-GH');
  win.document.write(`<!DOCTYPE html><html><head><title>Receipt</title>
  <style>
    body { font-family: 'Courier New', monospace; font-size: 12px; margin: 0; padding: 16px; color: #111; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .divider { border-top: 1px dashed #555; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; margin: 4px 0; }
    h2 { margin: 0 0 2px; font-size: 15px; }
    h4 { margin: 0 0 8px; font-size: 11px; font-weight: normal; }
  </style></head><body>
  <div class="center">
    <h2>Majupat Love Enterprise</h2>
    <h4>Maxbraynn Technology &amp; Systems</h4>
  </div>
  <div class="divider"></div>
  <div class="row"><span>Date/Time:</span><span>${date}</span></div>
  <div class="row"><span>Reference:</span><span class="bold">${ref}</span></div>
  <div class="divider"></div>
  <div class="row"><span>Account No:</span><span>${account?.accountNumber || ''}</span></div>
  <div class="row"><span>Customer:</span><span>${customer?.name || ''}</span></div>
  <div class="row"><span>Type:</span><span class="bold" style="color:${type==='credit'?'green':'red'}">${type?.toUpperCase()}</span></div>
  <div class="row"><span>Amount:</span><span class="bold">${GHS(amount)}</span></div>
  <div class="row"><span>Balance After:</span><span>${GHS(balanceAfter)}</span></div>
  <div class="divider"></div>
  <div class="row"><span>Teller:</span><span>${tellerName}</span></div>
  <div class="divider"></div>
  <div class="center" style="margin-top:12px;font-size:10px;">Thank you for banking with us.</div>
  </body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

export default function TellerSession() {
  const { accounts, customers, transactions, postTransaction, glTransfer, submitForApproval } = useApp();
  const currentUser = authDB.currentUser();

  const [tab, setTab] = useState('post');

  // --- Post Transaction state ---
  const [search, setSearch] = useState('');
  const [selAcc, setSelAcc] = useState(null);
  const [txType, setTxType] = useState('credit');
  const [amount, setAmount] = useState('');
  const [narration, setNarration] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [pendingMsg, setPendingMsg] = useState('');

  // --- My Report state ---
  const today = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);

  // --- My History state ---
  const [histSearch, setHistSearch] = useState('');
  const [histDateFrom, setHistDateFrom] = useState(today);
  const [histDateTo, setHistDateTo] = useState(today);
  const [histType, setHistType] = useState('all');

  // --- Closing Entry state ---
  const [glCode, setGlCode] = useState('1020');
  const [glAmount, setGlAmount] = useState('');
  const [glNarration, setGlNarration] = useState('Teller closing balance');
  const [glType, setGlType] = useState('debit');
  const [glPosting, setGlPosting] = useState(false);
  const [glError, setGlError] = useState('');
  const [glSuccess, setGlSuccess] = useState('');

  // Account search results
  const searchResults = useMemo(() => {
    if (!search || search.length < 2) return [];
    const q = search.toLowerCase();
    return (accounts || []).filter(a =>
      a.accountNumber?.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [search, accounts]);

  const getCustomer = (acc) => (customers || []).find(c => c.id === acc?.customerId);

  // My Report: teller's transactions in date range
  const reportTxns = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter(t => {
      const d = (t.createdAt || t.date || '').slice(0, 10);
      return (
        (t.tellerId === currentUser?.id || t.createdBy === currentUser?.id) &&
        d >= fromDate && d <= toDate
      );
    });
  }, [transactions, currentUser, fromDate, toDate]);

  // My History: searchable/filterable list of this teller's transactions
  const historyTxns = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter(t => {
      const d = (t.createdAt || '').slice(0, 10);
      const matchDate = (!histDateFrom || d >= histDateFrom) && (!histDateTo || d <= histDateTo);
      const matchType = histType === 'all' || t.type === histType;
      const isMine = t.createdBy === currentUser?.id || t.posterName === currentUser?.name;
      if (!isMine) return false;
      if (!matchDate || !matchType) return false;
      if (!histSearch.trim()) return true;
      const q = histSearch.trim().toLowerCase();
      const acc = (accounts || []).find(a => a.id === t.accountId);
      const cust = (customers || []).find(c => c.id === acc?.customerId);
      return (
        (t.reference || '').toLowerCase().includes(q) ||
        (t.narration || '').toLowerCase().includes(q) ||
        (acc?.accountNumber || '').toLowerCase().includes(q) ||
        (cust?.name || '').toLowerCase().includes(q) ||
        String(t.amount || '').includes(q)
      );
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [transactions, currentUser, histSearch, histDateFrom, histDateTo, histType, accounts, customers]);

  const openingBalance = useMemo(() => {    // Sum of account balances before the period — approximate as first balance in period
    return 0; // Placeholder; real impl would need historical snapshots
  }, [reportTxns]);

  const totalCredits = useMemo(() => reportTxns.filter(t => t.type === 'credit').reduce((s, t) => s + Number(t.amount || 0), 0), [reportTxns]);
  const totalDebits = useMemo(() => reportTxns.filter(t => t.type === 'debit').reduce((s, t) => s + Number(t.amount || 0), 0), [reportTxns]);
  const closingBalance = openingBalance + totalCredits - totalDebits;

  // Today's closing entries (GL transfers by this teller today)
  const closingEntries = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter(t => {
      const d = (t.createdAt || t.date || '').slice(0, 10);
      return (
        t.channel === 'gl' &&
        (t.tellerId === currentUser?.id || t.createdBy === currentUser?.id) &&
        d === today
      );
    });
  }, [transactions, currentUser, today]);

  // --- Handlers ---
  const handlePost = async (e) => {
    e.preventDefault();
    if (!selAcc) return setPostError('Select an account first.');
    if (!amount || isNaN(amount) || Number(amount) <= 0) return setPostError('Enter a valid amount.');
    if (!narration.trim()) return setPostError('Enter a narration.');
    setPosting(true);
    setPostError('');
    setPendingMsg('');
    try {
      const rules = await loadApprovalRules();
      const role  = currentUser?.role || 'teller';
      const amt   = Number(amount);
      const action = txType === 'credit' ? 'credit' : 'debit';
      const needsApproval = requiresApproval(action, role, amt, rules);

      if (needsApproval) {
        // Submit for approval instead of posting directly
        await submitForApproval('transaction', {
          accountId: selAcc.id,
          type: txType,
          amount: amt,
          narration,
          channel: 'teller',
          accountNumber: selAcc.accountNumber,
          customerName: getCustomer(selAcc)?.name || '—',
        });
        setPendingMsg(`Transaction of ${GHS(amt)} submitted for approval. A manager must approve before it posts.`);
        setAmount('');
        setNarration('');
        setSearch('');
        setSelAcc(null);
      } else {
        const result = await postTransaction({
          accountId: selAcc.id,
          type: txType,
          amount: amt,
          narration,
          channel: 'teller',
        });
        const cust = getCustomer(selAcc);
        setReceipt({
          ref: result?.reference || result?.id || `TXN-${Date.now()}`,
          account: selAcc,
          customer: cust,
          type: txType,
          amount: amt,
          balanceAfter: result?.balanceAfter ?? (txType === 'credit' ? (selAcc.balance || 0) + amt : (selAcc.balance || 0) - amt),
          tellerName: currentUser?.name || 'Teller',
        });
        setAmount('');
        setNarration('');
        setSearch('');
        setSelAcc(null);
      }
    } catch (err) {
      setPostError(err?.message || 'Transaction failed.');
    }
    setPosting(false);
  };

  const handleGLSubmit = async (e) => {
    e.preventDefault();
    if (!glAmount || isNaN(glAmount) || Number(glAmount) <= 0) return setGlError('Enter a valid amount.');
    if (!glCode.trim()) return setGlError('Enter a GL account code.');
    setGlPosting(true);
    setGlError('');
    setGlSuccess('');
    try {
      // Closing entry: post directly to GL as a journal entry
      // Dr/Cr the teller cash account (1020) against the vault/main account (1010)
      const { supabase } = await import('../../core/supabase');
      const amt = Number(glAmount);
      const now = new Date();
      const journalRef = `CLO${Date.now()}`;
      const narr = glNarration || `Teller closing balance — ${currentUser?.name} — ${now.toLocaleDateString()}`;

      // Look up GL account IDs
      const counterCode = glType === 'debit' ? '1010' : '1010';
      const { data: glAccounts } = await supabase
        .from('gl_accounts')
        .select('id, code, name, balance, type')
        .in('code', [glCode, counterCode]);

      if (!glAccounts || glAccounts.length === 0) {
        throw new Error(`GL account ${glCode} not found. Check your GL chart of accounts.`);
      }

      const mainAcc = glAccounts.find(a => a.code === glCode);
      const counterAcc = glAccounts.find(a => a.code === counterCode && a.code !== glCode)
        || glAccounts.find(a => a.code === counterCode);

      if (!mainAcc) throw new Error(`GL account ${glCode} not found.`);

      const entries = [
        {
          journal_ref: journalRef,
          gl_account_id: mainAcc.id,
          gl_account_code: mainAcc.code,
          gl_account_name: mainAcc.name,
          entry_type: glType,
          amount: amt,
          narration: narr,
          source_type: 'teller_closing',
          posted_by: currentUser?.name,
          period_month: now.getMonth() + 1,
          period_year: now.getFullYear(),
        },
      ];

      // Add counter entry if we have a different counter account
      if (counterAcc && counterAcc.id !== mainAcc.id) {
        entries.push({
          journal_ref: journalRef,
          gl_account_id: counterAcc.id,
          gl_account_code: counterAcc.code,
          gl_account_name: counterAcc.name,
          entry_type: glType === 'debit' ? 'credit' : 'debit',
          amount: amt,
          narration: narr,
          source_type: 'teller_closing',
          posted_by: currentUser?.name,
          period_month: now.getMonth() + 1,
          period_year: now.getFullYear(),
        });
      }

      await supabase.from('gl_entries').insert(entries);

      // Update GL account balance
      const isDebitNormal = mainAcc.type === 'asset' || mainAcc.type === 'expense';
      const delta = glType === 'debit'
        ? (isDebitNormal ? amt : -amt)
        : (isDebitNormal ? -amt : amt);
      await supabase.from('gl_accounts')
        .update({ balance: Number(mainAcc.balance) + delta, updated_at: now.toISOString() })
        .eq('id', mainAcc.id);

      setGlSuccess(`Closing entry posted. Ref: ${journalRef}`);
      setGlAmount('');
    } catch (err) {
      setGlError(err?.message || 'GL entry failed.');
    }
    setGlPosting(false);
  };

  const handleExportCSV = () => {
    const rows = reportTxns.map(t => {
      const acc = (accounts || []).find(a => a.id === t.accountId);
      const cust = getCustomer(acc);
      return {
        Date: (t.createdAt || t.date || '').slice(0, 10),
        Reference: t.reference || t.id,
        Account: acc?.accountNumber || '',
        Customer: cust?.name || '',
        Type: t.type,
        Amount: t.amount,
        Narration: t.narration,
      };
    });
    exportCSV(rows, `teller-report-${fromDate}-${toDate}.csv`);
  };

  const handlePrintCallOver = () => {
    const win = window.open('', '_blank', 'width=800,height=600');
    const rows = reportTxns.map(t => {
      const acc = (accounts || []).find(a => a.id === t.accountId);
      const cust = getCustomer(acc);
      return `<tr>
        <td>${(t.createdAt || t.date || '').slice(0, 16)}</td>
        <td>${t.reference || t.id || ''}</td>
        <td>${acc?.accountNumber || ''}</td>
        <td>${cust?.name || ''}</td>
        <td style="color:${t.type==='credit'?'green':'red'}">${t.type?.toUpperCase()}</td>
        <td style="text-align:right">${GHS(t.amount)}</td>
        <td>${t.narration || ''}</td>
      </tr>`;
    }).join('');
    win.document.write(`<!DOCTYPE html><html><head><title>Call-Over Sheet</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:12px;padding:20px}
      h2{text-align:center;margin-bottom:4px}
      h4{text-align:center;font-weight:normal;margin-bottom:16px}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
      th{background:#f1f5f9}
      .summary{display:flex;gap:24px;margin-bottom:16px;font-size:13px}
      .summary div{background:#f8fafc;border:1px solid #e2e8f0;padding:8px 16px;border-radius:6px}
    </style></head><body>
    <h2>Majupat Love Enterprise</h2>
    <h4>Teller Call-Over Sheet — ${currentUser?.name} — ${fromDate} to ${toDate}</h4>
    <div class="summary">
      <div><strong>Total Credits:</strong> ${GHS(totalCredits)}</div>
      <div><strong>Total Debits:</strong> ${GHS(totalDebits)}</div>
      <div><strong>Net:</strong> ${GHS(closingBalance)}</div>
    </div>
    <table>
      <thead><tr><th>Date/Time</th><th>Reference</th><th>Account</th><th>Customer</th><th>Type</th><th>Amount</th><th>Narration</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  const reprintReceipt = (t) => {
    const acc  = (accounts || []).find(a => a.id === t.accountId);
    const cust = (customers || []).find(c => c.id === acc?.customerId);
    printReceipt({
      ref:          t.reference || t.id,
      account:      acc,
      customer:     cust,
      type:         t.type,
      amount:       t.amount,
      balanceAfter: t.balanceAfter,
      tellerName:   t.posterName || currentUser?.name || 'Teller',
    });
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Monitor size={20} /> Teller Session
          </div>
          <div className="page-desc">Workstation for {currentUser?.name}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #1e293b' }}>
        {[
          { key: 'post',    label: 'Post Transaction' },
          { key: 'history', label: 'My History' },
          { key: 'report',  label: 'My Report' },
          { key: 'closing', label: 'Closing Entry' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 20px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: tab === t.key ? 700 : 400,
              color: tab === t.key ? 'var(--primary, #1a56db)' : '#64748b',
              borderBottom: tab === t.key ? '2px solid var(--primary, #1a56db)' : '2px solid transparent',
              marginBottom: -2,
              fontSize: 14,
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* ===== POST TRANSACTION TAB ===== */}
      {tab === 'post' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Post Transaction</div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {/* Account Search */}
              <div style={{ marginBottom: 14 }}>
                <label className="form-label">Search Account</label>
                <div style={{ position: 'relative' }}>
                  <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                  <input
                    className="form-control"
                    style={{ paddingLeft: 32 }}
                    placeholder="Account number, name or phone…"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setSelAcc(null); setReceipt(null); }}
                  />
                </div>
                {searchResults.length > 0 && !selAcc && (
                  <div style={{ border: '1px solid #1e293b', borderRadius: 6, marginTop: 4, background: '#0f172a', maxHeight: 200, overflowY: 'auto' }}>
                    {searchResults.map(acc => {
                      const cust = getCustomer(acc);
                      return (
                        <div
                          key={acc.id}
                          onClick={() => { setSelAcc(acc); setSearch(acc.accountNumber); }}
                          style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #1e293b', fontSize: 13 }}
                          onMouseEnter={e => e.currentTarget.style.background = '#1e293b'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <div style={{ fontWeight: 600 }}>{acc.accountNumber}</div>
                          <div style={{ color: '#94a3b8', fontSize: 12 }}>{cust?.name} · {cust?.phone}</div>
                          <div style={{ color: '#64748b', fontSize: 11 }}>Balance: {GHS(acc.balance)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Selected account info */}
              {selAcc && (
                <div style={{ background: '#1e293b', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
                  <div style={{ fontWeight: 700 }}>{selAcc.accountNumber} — {getCustomer(selAcc)?.name}</div>
                  <div style={{ color: '#94a3b8' }}>Balance: <strong style={{ color: '#22c55e' }}>{GHS(selAcc.balance)}</strong></div>
                </div>
              )}

              {/* Credit / Debit toggle */}
              <div style={{ marginBottom: 14 }}>
                <label className="form-label">Transaction Type</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['credit', 'debit'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTxType(t)}
                      style={{
                        flex: 1, padding: '8px', border: '1px solid',
                        borderColor: txType === t ? (t === 'credit' ? '#22c55e' : '#ef4444') : '#1e293b',
                        borderRadius: 6, background: txType === t ? (t === 'credit' ? '#14532d' : '#450a0a') : 'transparent',
                        color: txType === t ? '#fff' : '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                        textTransform: 'capitalize',
                      }}
                    >{t}</button>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div style={{ marginBottom: 14 }}>
                <label className="form-label">Amount (GH₵)</label>
                <input
                  className="form-control"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                />
              </div>

              {/* Narration */}
              <div style={{ marginBottom: 14 }}>
                <label className="form-label">Narration</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                  {NARRATION_PRESETS.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setNarration(p)}
                      style={{
                        fontSize: 11, padding: '3px 8px', border: '1px solid #1e293b',
                        borderRadius: 12, background: narration === p ? '#1a56db' : 'transparent',
                        color: narration === p ? '#fff' : '#94a3b8', cursor: 'pointer',
                      }}
                    >{p}</button>
                  ))}
                </div>
                <input
                  className="form-control"
                  placeholder="Or type narration…"
                  value={narration}
                  onChange={e => setNarration(e.target.value)}
                />
              </div>

              {postError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444', fontSize: 13, marginBottom: 10 }}>
                  <AlertCircle size={14} /> {postError}
                </div>
              )}
              {pendingMsg && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400e', marginBottom: 10 }}>
                  <AlertCircle size={14} style={{ marginTop: 1, flexShrink: 0, color: '#d97706' }} />
                  <span>{pendingMsg}</span>
                </div>
              )}

              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={handlePost}
                disabled={posting}
              >
                {posting ? 'Posting…' : `Post ${txType === 'credit' ? 'Credit' : 'Debit'}`}
              </button>
            </div>
          </div>

          {/* Receipt panel */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Receipt</div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {receipt ? (
                <div style={{ textAlign: 'center' }}>
                  <CheckCircle size={40} style={{ color: '#22c55e', marginBottom: 12 }} />
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Transaction Successful</div>
                  <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Ref: {receipt.ref}</div>
                  <div style={{ background: '#1e293b', borderRadius: 8, padding: '14px 16px', textAlign: 'left', fontSize: 13, marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ color: '#94a3b8' }}>Account</span>
                      <span>{receipt.account?.accountNumber}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ color: '#94a3b8' }}>Customer</span>
                      <span>{receipt.customer?.name}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ color: '#94a3b8' }}>Type</span>
                      <span className={receipt.type === 'credit' ? 'badge badge-green' : 'badge badge-red'}>{receipt.type?.toUpperCase()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ color: '#94a3b8' }}>Amount</span>
                      <span style={{ fontWeight: 700 }}>{GHS(receipt.amount)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Balance After</span>
                      <span>{GHS(receipt.balanceAfter)}</span>
                    </div>
                  </div>
                  <button
                    className="btn btn-secondary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={() => printReceipt(receipt)}
                  >
                    <Printer size={14} /> Print Receipt
                  </button>
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: '#475569', paddingTop: 40 }}>
                  <DollarSign size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
                  <div>Receipt will appear here after a successful transaction.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== MY HISTORY TAB ===== */}
      {tab === 'history' && (
        <div>
          {/* Filters */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ padding: '14px 20px', display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 220px' }}>
                <label className="form-label">Search</label>
                <input className="form-control" placeholder="Reference, account, name, amount…"
                  value={histSearch} onChange={e => setHistSearch(e.target.value)} />
              </div>
              <div>
                <label className="form-label">From</label>
                <input type="date" className="form-control" value={histDateFrom}
                  onChange={e => setHistDateFrom(e.target.value)} style={{ width: 145 }} />
              </div>
              <div>
                <label className="form-label">To</label>
                <input type="date" className="form-control" value={histDateTo}
                  onChange={e => setHistDateTo(e.target.value)} style={{ width: 145 }} />
              </div>
              <div>
                <label className="form-label">Type</label>
                <select className="form-control" value={histType} onChange={e => setHistType(e.target.value)} style={{ width: 130 }}>
                  <option value="all">All</option>
                  <option value="credit">Credits</option>
                  <option value="debit">Debits</option>
                </select>
              </div>
              <div style={{ paddingBottom: 2 }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{historyTxns.length} transaction{historyTxns.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>

          {/* Transaction list */}
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Reference</th>
                    <th>Account</th>
                    <th>Customer</th>
                    <th>Narration</th>
                    <th>Type</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th style={{ textAlign: 'right' }}>Balance After</th>
                    <th style={{ textAlign: 'center' }}>Reprint</th>
                  </tr>
                </thead>
                <tbody>
                  {historyTxns.length === 0 ? (
                    <tr><td colSpan={9} className="table-empty">No transactions found</td></tr>
                  ) : historyTxns.map((t, idx) => {
                    const acc  = (accounts || []).find(a => a.id === t.accountId);
                    const cust = (customers || []).find(c => c.id === acc?.customerId);
                    return (
                      <tr key={t.id} style={{ background: idx % 2 === 0 ? '#fff' : 'var(--surface)', opacity: t.reversed ? 0.5 : 1 }}>
                        <td style={{ fontSize: 12, whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                          {t.createdAt ? new Date(t.createdAt).toLocaleString('en-GH') : '—'}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{t.reference}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{acc?.accountNumber || '—'}</td>
                        <td style={{ fontSize: 12 }}>{cust?.name || '—'}</td>
                        <td style={{ fontSize: 12, maxWidth: 180 }}>{t.narration}</td>
                        <td>
                          <span className={`badge badge-${t.type === 'credit' ? 'green' : 'red'}`}>{t.type}</span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: t.type === 'credit' ? 'var(--green)' : 'var(--red)', whiteSpace: 'nowrap' }}>
                          {t.type === 'credit' ? '+' : '-'}{GHS(t.amount)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{GHS(t.balanceAfter)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <button className="btn btn-ghost btn-sm" title="Reprint receipt"
                            onClick={() => reprintReceipt(t)}>
                            <Printer size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {historyTxns.length > 0 && (
                  <tfoot>
                    <tr style={{ background: '#1e293b' }}>
                      <td colSpan={6} style={{ padding: '10px 12px', color: '#fff', fontWeight: 700 }}>TOTALS</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, padding: '10px 12px', whiteSpace: 'nowrap', color: '#86efac' }}>
                        {GHS(historyTxns.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0))}
                        {' / '}
                        <span style={{ color: '#fca5a5' }}>
                          {GHS(historyTxns.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0))}
                        </span>
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===== MY REPORT TAB ===== */}
      {tab === 'report' && (
        <div>
          {/* Date range filter */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ padding: '14px 20px', display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label className="form-label">From</label>
                <input className="form-control" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
              </div>
              <div>
                <label className="form-label">To</label>
                <input className="form-control" type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={handlePrintCallOver}>
                  <Printer size={14} /> Print Call-Over
                </button>
                <button className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={handleExportCSV}>
                  <Download size={14} /> Export CSV
                </button>
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
            {[
              { label: 'Opening Balance', value: GHS(openingBalance), icon: BookOpen, color: '#64748b' },
              { label: 'Total Credits', value: GHS(totalCredits), icon: TrendingUp, color: '#22c55e' },
              { label: 'Total Debits', value: GHS(totalDebits), icon: TrendingUp, color: '#ef4444' },
              { label: 'Closing Balance', value: GHS(closingBalance), icon: DollarSign, color: '#1a56db' },
            ].map(card => (
              <div key={card.label} className="card" style={{ padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{card.label}</div>
                  <card.icon size={16} style={{ color: card.color }} />
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: card.color }}>{card.value}</div>
              </div>
            ))}
          </div>

          {/* Transactions table */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Transactions ({reportTxns.length})</div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date/Time</th>
                    <th>Reference</th>
                    <th>Account</th>
                    <th>Customer</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Narration</th>
                  </tr>
                </thead>
                <tbody>
                  {reportTxns.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: '#475569', padding: 24 }}>No transactions in this period.</td></tr>
                  ) : reportTxns.map(t => {
                    const acc = (accounts || []).find(a => a.id === t.accountId);
                    const cust = getCustomer(acc);
                    return (
                      <tr key={t.id}>
                        <td style={{ fontSize: 12 }}>{(t.createdAt || t.date || '').slice(0, 16)}</td>
                        <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{t.reference || t.id}</td>
                        <td>{acc?.accountNumber || '—'}</td>
                        <td>{cust?.name || '—'}</td>
                        <td><span className={t.type === 'credit' ? 'badge badge-green' : 'badge badge-red'}>{t.type?.toUpperCase()}</span></td>
                        <td style={{ fontWeight: 600 }}>{GHS(t.amount)}</td>
                        <td style={{ fontSize: 12, color: '#94a3b8' }}>{t.narration}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===== CLOSING ENTRY TAB ===== */}
      {tab === 'closing' && (
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 20 }}>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Post Closing Entry</div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {/* Account search for GL */}
              <div style={{ marginBottom: 14 }}>
                <label className="form-label">Search Account</label>
                <div style={{ position: 'relative' }}>
                  <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                  <input
                    className="form-control"
                    style={{ paddingLeft: 32 }}
                    placeholder="Account number, name or phone…"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setSelAcc(null); }}
                  />
                </div>
                {searchResults.length > 0 && !selAcc && (
                  <div style={{ border: '1px solid #1e293b', borderRadius: 6, marginTop: 4, background: '#0f172a', maxHeight: 180, overflowY: 'auto' }}>
                    {searchResults.map(acc => {
                      const cust = getCustomer(acc);
                      return (
                        <div
                          key={acc.id}
                          onClick={() => { setSelAcc(acc); setSearch(acc.accountNumber); }}
                          style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #1e293b', fontSize: 13 }}
                          onMouseEnter={e => e.currentTarget.style.background = '#1e293b'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <div style={{ fontWeight: 600 }}>{acc.accountNumber}</div>
                          <div style={{ color: '#94a3b8', fontSize: 12 }}>{cust?.name}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {selAcc && (
                <div style={{ background: '#1e293b', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>{selAcc.accountNumber}</span> — {getCustomer(selAcc)?.name}
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <label className="form-label">GL Account Code</label>
                <input
                  className="form-control"
                  value={glCode}
                  onChange={e => setGlCode(e.target.value)}
                  placeholder="e.g. 1020"
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label className="form-label">Amount (GH₵)</label>
                <input
                  className="form-control"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={glAmount}
                  onChange={e => setGlAmount(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label className="form-label">Narration</label>
                <input
                  className="form-control"
                  value={glNarration}
                  onChange={e => setGlNarration(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="form-label">Direction</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['debit', 'credit'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setGlType(t)}
                      style={{
                        flex: 1, padding: '8px', border: '1px solid',
                        borderColor: glType === t ? (t === 'credit' ? '#22c55e' : '#ef4444') : '#1e293b',
                        borderRadius: 6, background: glType === t ? (t === 'credit' ? '#14532d' : '#450a0a') : 'transparent',
                        color: glType === t ? '#fff' : '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                        textTransform: 'capitalize',
                      }}
                    >{t}</button>
                  ))}
                </div>
              </div>

              {glError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444', fontSize: 13, marginBottom: 10 }}>
                  <AlertCircle size={14} /> {glError}
                </div>
              )}
              {glSuccess && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#22c55e', fontSize: 13, marginBottom: 10 }}>
                  <CheckCircle size={14} /> {glSuccess}
                </div>
              )}

              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={handleGLSubmit}
                disabled={glPosting}
              >
                {glPosting ? 'Posting…' : 'Post Closing Entry'}
              </button>
            </div>
          </div>

          {/* Today's closing entries */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Today's Closing Entries</div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Reference</th>
                    <th>GL Code</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Narration</th>
                  </tr>
                </thead>
                <tbody>
                  {closingEntries.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: '#475569', padding: 24 }}>No closing entries today.</td></tr>
                  ) : closingEntries.map(t => (
                    <tr key={t.id}>
                      <td style={{ fontSize: 12 }}>{(t.createdAt || t.date || '').slice(11, 16)}</td>
                      <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{t.reference || t.id}</td>
                      <td>{t.glCode || '—'}</td>
                      <td><span className={t.type === 'credit' ? 'badge badge-green' : 'badge badge-red'}>{t.type?.toUpperCase()}</span></td>
                      <td style={{ fontWeight: 600 }}>{GHS(t.amount)}</td>
                      <td style={{ fontSize: 12, color: '#94a3b8' }}>{t.narration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
