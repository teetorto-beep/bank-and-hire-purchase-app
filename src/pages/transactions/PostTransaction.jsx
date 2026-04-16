import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, ArrowLeft, Search, Clock, AlertCircle, Send, ArrowRightLeft, BookOpen } from 'lucide-react';
import { authDB } from '../../core/db';
import { loadApprovalRules, requiresApproval } from '../../core/approvalRules';

const GHS = n => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

const NARRATIONS = {
  credit: ['Cash Deposit', 'Salary Credit', 'Transfer In', 'Loan Disbursement', 'Interest Credit', 'Refund', 'Mobile Money Deposit', 'Cheque Deposit'],
  debit:  ['Cash Withdrawal', 'ATM Withdrawal', 'Transfer Out', 'Loan Repayment', 'HP Repayment', 'Utility Payment', 'Fee Charge', 'Mobile Money Withdrawal'],
};

const PAYMENT_MODES = [
  { id: 'regular',  label: 'Regular',      desc: 'Credit / Debit',          icon: '💳' },
  { id: 'loan',     label: 'Loan Payment', desc: 'Pay off a loan',           icon: '📋' },
  { id: 'hp',       label: 'HP Payment',   desc: 'Hire-purchase instalment', icon: '🛍️' },
  { id: 'transfer', label: 'Transfer',     desc: 'Account to account',       icon: '↔️' },
  { id: 'gl',       label: 'GL Entry',     desc: 'Post to General Ledger',   icon: '📒' },
];

const EMPTY_FORM = {
  type: 'credit', amount: '', preset: '', narration: '',
  requireAuth: false, paymentMode: 'regular',
  linkedId: '', linkedHpId: '', linkedLoanId: '',
  toSearch: '', toAccId: '', toAcc: null,
  glCode: '', glType: 'debit',
};

export default function PostTransaction() {
  const { accounts, customers, loans, hpAgreements, postTransaction, submitForApproval, transferFunds, glTransfer } = useApp();
  const navigate = useNavigate();
  const user     = authDB.currentUser();
  const isTeller = user?.role === 'teller';

  const [rules, setRules] = useState(null);
  useEffect(() => { loadApprovalRules().then(setRules); }, []);

  const [search,  setSearch]  = useState('');
  const [selAcc,  setSelAcc]  = useState(null);
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [done,    setDone]    = useState(null);

  const f  = k => e => setForm(p => ({ ...p, [k]: e.target.value }));
  const fb = k => e => setForm(p => ({ ...p, [k]: e.target.checked }));

  // ── Source account search ─────────────────────────────────────────────────
  const results = useMemo(() => {
    if (!search || search.length < 2) return [];
    const q = search.toLowerCase();
    return accounts
      .filter(a => {
        const c = customers.find(x => x.id === (a.customer_id || a.customerId));
        return (a.account_number || a.accountNumber || '').toLowerCase().includes(q)
          || (c?.phone || '').includes(q)
          || (c?.name  || '').toLowerCase().includes(q);
      })
      .slice(0, 8)
      .map(a => ({ ...a, customer: customers.find(c => c.id === (a.customer_id || a.customerId)) }));
  }, [search, accounts, customers]);

  // ── Destination account search (transfer mode) ────────────────────────────
  const toResults = useMemo(() => {
    if (!form.toSearch || form.toSearch.length < 2) return [];
    const q = form.toSearch.toLowerCase();
    return accounts
      .filter(a => a.id !== selAcc?.id)
      .filter(a => {
        const c = customers.find(x => x.id === (a.customer_id || a.customerId));
        return (a.account_number || a.accountNumber || '').toLowerCase().includes(q)
          || (c?.phone || '').includes(q)
          || (c?.name  || '').toLowerCase().includes(q);
      })
      .slice(0, 6)
      .map(a => ({ ...a, customer: customers.find(c => c.id === (a.customer_id || a.customerId)) }));
  }, [form.toSearch, accounts, customers, selAcc]);

  const selCustomer = selAcc?.customer || null;
  const finalNarr   = (form.preset && form.preset !== '__custom__') ? form.preset : form.narration;
  const amount      = parseFloat(form.amount) || 0;
  const balance     = Number(selAcc?.balance || 0);

  // Determine if approval is needed based on rules + role + amount
  const txnAction = form.type === 'credit' ? 'credit' : 'debit';
  const willAuth = form.requireAuth || (rules
    ? requiresApproval(
        form.paymentMode === 'transfer' ? 'transfer' : txnAction,
        user?.role, amount, rules
      )
    : isTeller); // fallback while rules load

  const customerId  = selAcc ? (selAcc.customer_id || selAcc.customerId) : null;
  const activeLoans = useMemo(() =>
    loans.filter(l => (l.customer_id || l.customerId) === customerId && l.status === 'active'),
    [loans, customerId]);
  const activeHP = useMemo(() =>
    hpAgreements.filter(a => (a.customer_id || a.customerId) === customerId && a.status === 'active'),
    [hpAgreements, customerId]);

  const selectAccount = a => { setSelAcc(a); setSearch(a.account_number || a.accountNumber || ''); setError(''); };
  const selectToAccount = a => setForm(p => ({
    ...p, toAccId: a.id, toAcc: a,
    toSearch: a.account_number || a.accountNumber || '',
    narration: p.narration || `Transfer to ${a.account_number || a.accountNumber}`,
  }));

  const handleLinkedId = (id) => {
    setForm(p => {
      if (p.paymentMode === 'loan') {
        const loan = activeLoans.find(l => l.id === id);
        const hpAgrId = loan?.hpAgreementId || loan?.hp_agreement_id || null;
        return { ...p, linkedId: id, linkedHpId: hpAgrId, type: 'debit',
          amount: loan ? String(loan.monthlyPayment || '') : p.amount,
          preset: loan?.type === 'hire_purchase' ? 'HP Repayment' : 'Loan Repayment',
          narration: loan ? `${loan.type === 'hire_purchase' ? 'HP' : 'Loan'} repayment – ${loan.purpose || loan.itemName || loan.type}` : p.narration };
      }
      if (p.paymentMode === 'hp') {
        const agr = activeHP.find(a => a.id === id);
        const linkedLoan = agr ? loans.find(l => l.id === (agr.loanId || agr.loan_id)) : null;
        return { ...p, linkedId: id, linkedLoanId: linkedLoan?.id || null, type: 'debit',
          amount: agr ? String(agr.suggestedPayment || '') : p.amount,
          preset: 'HP Repayment',
          narration: agr ? `HP payment – ${agr.itemName || agr.item_name || agr.id}` : p.narration };
      }
      return { ...p, linkedId: id };
    });
  };

  const reset = () => { setSearch(''); setSelAcc(null); setForm(EMPTY_FORM); setDone(null); setError(''); };

  const submit = async e => {
    e.preventDefault();
    if (!selAcc) { setError('Select a source account first.'); return; }
    if (amount <= 0) { setError('Enter a valid amount.'); return; }

    const mode = form.paymentMode;

    // Mode-specific validation
    if (mode === 'transfer') {
      if (!form.toAccId) { setError('Select a destination account.'); return; }
      if (balance < amount) { setError(`Insufficient balance. Available: ${GHS(balance)}`); return; }
    } else if (mode === 'gl') {
      if (!form.glCode.trim()) { setError('Enter a GL account code.'); return; }
    } else {
      if (!finalNarr.trim() && mode !== 'loan' && mode !== 'hp') { setError('Enter a narration.'); return; }
      if (mode === 'loan' && !form.linkedId) { setError('Select a loan.'); return; }
      if (mode === 'hp'   && !form.linkedId) { setError('Select an HP agreement.'); return; }
      // For loan/HP: always debit from account — check balance
      if ((mode === 'loan' || mode === 'hp') && balance < amount) {
        setError(`Insufficient balance. Account has ${GHS(balance)}, payment is ${GHS(amount)}.`); return;
      }
      if (mode === 'regular' && form.type === 'debit' && balance < amount) {
        setError(`Insufficient balance. Available: ${GHS(balance)}`); return;
      }
    }

    setSaving(true); setError('');

    try {
      if (mode === 'transfer') {
        const { error: err } = await transferFunds({
          fromAccountId: selAcc.id,
          toAccountId:   form.toAccId,
          amount,
          narration: form.narration || `Transfer`,
        });
        if (err) { setError(err.message || 'Transfer failed.'); setSaving(false); return; }
        setDone({ type: 'transfer', amount, from: selAcc, to: form.toAcc });

      } else if (mode === 'gl') {
        const { error: err } = await glTransfer({
          accountId: selAcc.id,
          glCode:    form.glCode.trim(),
          type:      form.glType,
          amount,
          narration: form.narration || `GL entry – ${form.glCode}`,
        });
        if (err) { setError(err.message || 'GL entry failed.'); setSaving(false); return; }
        setDone({ type: 'gl', amount, acc: selAcc, glCode: form.glCode });

      } else {
        const payload = {
          account_id: selAcc.id, accountId: selAcc.id,
          type: form.type, amount,
          narration: finalNarr.trim(),
          channel: 'teller',
          ...(mode === 'loan' && form.linkedId   ? { loan_id: form.linkedId } : {}),
          ...(mode === 'loan' && form.linkedHpId ? { hp_agreement_id: form.linkedHpId } : {}),
          ...(mode === 'hp'   && form.linkedId   ? { hp_agreement_id: form.linkedId } : {}),
          ...(mode === 'hp'   && form.linkedLoanId ? { loan_id: form.linkedLoanId } : {}),
        };
        if (willAuth) {
          const { data, error: err } = await submitForApproval(payload);
          if (err) { setError(err.message || 'Failed to submit.'); setSaving(false); return; }
          setDone({ type: 'pending', ref: data?.id || '—' });
        } else {
          const { data: txn, error: err } = await postTransaction(payload);
          if (err) { setError(err.message || 'Failed to post.'); setSaving(false); return; }
          setDone({ type: 'posted', txn, acc: selAcc, customer: selCustomer });
        }
      }
    } catch (ex) {
      setError(ex.message || 'Unexpected error.');
    }
    setSaving(false);
  };

  // ── Success screens ───────────────────────────────────────────────────────
  if (done?.type === 'pending') return (
    <div className="fade-in" style={{ maxWidth: 480, margin: '0 auto' }}>
      <div className="card" style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--yellow-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <Clock size={34} style={{ color: 'var(--yellow)' }} />
        </div>
        <h2 style={{ marginBottom: 8 }}>Submitted for Approval</h2>
        <p style={{ color: 'var(--text-3)', marginBottom: 28 }}>Ref: <code>{done.ref}</code></p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button className="btn btn-secondary" onClick={reset}>New Transaction</button>
          <button className="btn btn-primary" onClick={() => navigate('/transactions/approvals')}>View Approvals</button>
        </div>
      </div>
    </div>
  );

  if (done?.type === 'transfer') return (
    <div className="fade-in" style={{ maxWidth: 520, margin: '0 auto' }}>
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--green-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <CheckCircle size={34} style={{ color: 'var(--green)' }} />
        </div>
        <h2 style={{ marginBottom: 4 }}>Transfer Complete</h2>
        <p style={{ color: 'var(--text-3)', marginBottom: 20 }}>{GHS(done.amount)} moved successfully</p>
        <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '16px 20px', marginBottom: 24, textAlign: 'left' }}>
          {[
            ['From', `${done.from?.account_number || done.from?.accountNumber} · ${done.from?.customer?.name || ''}`],
            ['To',   `${done.to?.account_number   || done.to?.accountNumber}   · ${done.to?.customer?.name   || ''}`],
            ['Amount', GHS(done.amount)],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>{k}</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={reset}>New Transaction</button>
          <button className="btn btn-primary"   style={{ flex: 1 }} onClick={() => navigate('/transactions')}>View History</button>
        </div>
      </div>
    </div>
  );

  if (done?.type === 'gl') return (
    <div className="fade-in" style={{ maxWidth: 480, margin: '0 auto' }}>
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--green-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <CheckCircle size={34} style={{ color: 'var(--green)' }} />
        </div>
        <h2 style={{ marginBottom: 4 }}>GL Entry Posted</h2>
        <p style={{ color: 'var(--text-3)', marginBottom: 4 }}>{GHS(done.amount)} posted to GL <strong>{done.glCode}</strong></p>
        <p style={{ color: 'var(--text-3)', fontSize: 12, marginBottom: 24 }}>Account: {done.acc?.account_number || done.acc?.accountNumber}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button className="btn btn-secondary" onClick={reset}>New Transaction</button>
          <button className="btn btn-primary" onClick={() => navigate('/gl')}>View GL</button>
        </div>
      </div>
    </div>
  );

  if (done?.type === 'posted') {
    const txn = done.txn || {};
    const rows = [
      ['Reference',   txn.reference   || '—'],
      ['Account',     done.acc?.account_number || done.acc?.accountNumber || '—'],
      ['Customer',    done.customer?.name || '—'],
      ['Type',        (txn.type || form.type || '').toUpperCase()],
      ['Amount',      GHS(txn.amount || amount)],
      ['New Balance', GHS(txn.balance_after ?? txn.balanceAfter ?? 0)],
      ['Narration',   txn.narration   || finalNarr],
      ['Posted By',   txn.poster_name || txn.posterName || user?.name || '—'],
      ['Date',        txn.created_at || txn.createdAt ? new Date(txn.created_at || txn.createdAt).toLocaleString() : new Date().toLocaleString()],
    ];
    return (
      <div className="fade-in" style={{ maxWidth: 520, margin: '0 auto' }}>
        <div className="card" style={{ padding: 40 }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--green-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <CheckCircle size={34} style={{ color: 'var(--green)' }} />
            </div>
            <h2 style={{ marginBottom: 4 }}>Transaction Posted</h2>
          </div>
          <div style={{ background: 'var(--surface-2)', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
            {rows.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>{k}</span>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: k === 'Reference' ? 'monospace' : 'inherit', maxWidth: '60%', textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={reset}>New Transaction</button>
            <button className="btn btn-primary"   style={{ flex: 1 }} onClick={() => navigate('/transactions')}>View History</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  const mode = form.paymentMode;

  return (
    <div className="fade-in" style={{ maxWidth: 680, margin: '0 auto' }}>
      <div className="page-header">
        <div className="page-header-left">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/transactions')} style={{ marginBottom: 4 }}>
            <ArrowLeft size={14} /> Back
          </button>
          <div className="page-title">Post Transaction</div>
          <div className="page-desc">Search by account number, phone, or customer name</div>
        </div>
      </div>

      {/* ── Step 1: Source account ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><div className="card-title">1 · {mode === 'transfer' ? 'From Account' : 'Find Account'}</div></div>

        <div className="search-box" style={{ marginBottom: 8 }}>
          <Search size={15} />
          <input className="form-control" placeholder="Account number, phone, or name…"
            value={search} autoFocus
            onChange={e => { setSearch(e.target.value); setSelAcc(null); }} />
        </div>

        {results.length > 0 && !selAcc && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {results.map(a => (
              <div key={a.id} onClick={() => selectAccount(a)}
                style={{ padding: '11px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <div>
                  <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 14 }}>{a.account_number || a.accountNumber}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{a.customer?.name} · {a.customer?.phone} · {(a.type||'').replace(/_/g,' ')}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800 }}>{GHS(a.balance)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'capitalize' }}>{a.status}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {selAcc && (
          <div style={{ padding: 16, background: 'var(--brand-light)', borderRadius: 10, border: '1px solid #bfdbfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: 16 }}>{selAcc.account_number || selAcc.accountNumber}</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 3 }}>{selCustomer?.name} · {selCustomer?.phone}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, textTransform: 'capitalize' }}>{(selAcc.type||'').replace(/_/g,' ')} · {selAcc.status}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>Balance</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: balance < 0 ? 'var(--red)' : 'var(--text)' }}>{GHS(balance)}</div>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 6, fontSize: 11 }} onClick={() => { setSelAcc(null); setSearch(''); }}>Change</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Step 2: Transaction form ── */}
      {selAcc && (
        <div className="card">
          <div className="card-header"><div className="card-title">2 · Transaction Details</div></div>

          {error && <div className="alert alert-error" style={{ marginBottom: 16 }}><AlertCircle size={14} /> {error}</div>}

          <form onSubmit={submit}>

            {/* Payment Mode */}
            <div className="form-group">
              <label className="form-label">Transaction Type</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PAYMENT_MODES.map(m => (
                  <div key={m.id}
                    onClick={() => setForm(p => ({ ...EMPTY_FORM, paymentMode: m.id, type: ['loan','hp','gl'].includes(m.id) ? 'debit' : p.type }))}
                    style={{
                      flex: 1, minWidth: 100, padding: '10px 8px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                      border: `2px solid ${mode === m.id ? 'var(--brand)' : 'var(--border)'}`,
                      background: mode === m.id ? 'var(--brand-light)' : 'var(--surface)',
                      transition: 'all .15s',
                    }}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>{m.icon}</div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: mode === m.id ? 'var(--brand)' : 'var(--text-2)' }}>{m.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{m.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Transfer: destination account ── */}
            {mode === 'transfer' && (
              <div className="form-group">
                <label className="form-label">To Account <span className="required">*</span></label>
                <div className="search-box" style={{ marginBottom: 8 }}>
                  <Search size={15} />
                  <input className="form-control" placeholder="Search destination account…"
                    value={form.toSearch}
                    onChange={e => setForm(p => ({ ...p, toSearch: e.target.value, toAccId: '', toAcc: null }))} />
                </div>
                {toResults.length > 0 && !form.toAccId && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
                    {toResults.map(a => (
                      <div key={a.id} onClick={() => selectToAccount(a)}
                        style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}>
                        <div>
                          <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 13 }}>{a.account_number || a.accountNumber}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{a.customer?.name} · {(a.type||'').replace(/_/g,' ')}</div>
                        </div>
                        <div style={{ fontWeight: 800, fontSize: 13 }}>{GHS(a.balance)}</div>
                      </div>
                    ))}
                  </div>
                )}
                {form.toAcc && (
                  <div style={{ padding: 12, background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontFamily: 'monospace' }}>{form.toAcc.account_number || form.toAcc.accountNumber}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{form.toAcc.customer?.name} · {(form.toAcc.type||'').replace(/_/g,' ')}</div>
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm(p => ({ ...p, toSearch: '', toAccId: '', toAcc: null }))}>Change</button>
                  </div>
                )}
              </div>
            )}

            {/* ── GL: code + direction ── */}
            {mode === 'gl' && (
              <>
                <div className="form-group">
                  <label className="form-label">GL Account Code <span className="required">*</span></label>
                  <input className="form-control" placeholder="e.g. 1020, 2010, 4001…"
                    value={form.glCode} onChange={f('glCode')} />
                </div>
                <div className="form-group">
                  <label className="form-label">Direction</label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {['debit','credit'].map(t => (
                      <div key={t} onClick={() => setForm(p => ({ ...p, glType: t }))}
                        style={{ flex: 1, padding: '12px 10px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                          border: `2px solid ${form.glType === t ? (t === 'credit' ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`,
                          background: form.glType === t ? (t === 'credit' ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--surface)' }}>
                        <div style={{ fontWeight: 800, fontSize: 14, textTransform: 'uppercase', color: form.glType === t ? (t === 'credit' ? 'var(--green)' : 'var(--red)') : 'var(--text-3)' }}>
                          {t === 'credit' ? '↑ Credit' : '↓ Debit'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── Loan picker ── */}
            {mode === 'loan' && (
              <div className="form-group">
                <label className="form-label">Select Loan <span className="required">*</span></label>
                {activeLoans.length === 0
                  ? <div className="alert alert-warning"><AlertCircle size={13} /> No active loans for this customer.</div>
                  : <>
                      <select className="form-control" value={form.linkedId} onChange={e => handleLinkedId(e.target.value)}>
                        <option value="">— Choose a loan —</option>
                        {activeLoans.map(l => (
                          <option key={l.id} value={l.id}>
                            {l.purpose || (l.type||'').replace(/_/g,' ')} · Outstanding: {GHS(l.outstanding)} · Monthly: {GHS(l.monthlyPayment)}
                          </option>
                        ))}
                      </select>
                      {/* Loan + account context card */}
                      {form.linkedId && (() => {
                        const loan = activeLoans.find(l => l.id === form.linkedId);
                        if (!loan) return null;
                        const monthly = Number(loan.monthlyPayment || 0);
                        const outstanding = Number(loan.outstanding || 0);
                        const maxPayable = Math.min(balance, outstanding);
                        return (
                          <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                            {/* Balance vs outstanding */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                              {[
                                ['Account Balance', GHS(balance), balance > 0 ? 'var(--green)' : 'var(--red)'],
                                ['Loan Outstanding', GHS(outstanding), outstanding > 0 ? 'var(--red)' : 'var(--green)'],
                                ['Max Payable', GHS(maxPayable), 'var(--brand)'],
                              ].map(([l, v, c]) => (
                                <div key={l} style={{ padding: '10px 14px', borderRight: '1px solid var(--border)' }}>
                                  <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>{l}</div>
                                  <div style={{ fontSize: 15, fontWeight: 800, color: c }}>{v}</div>
                                </div>
                              ))}
                            </div>
                            {/* Quick-fill buttons */}
                            <div style={{ padding: '10px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>Quick fill:</span>
                              {monthly > 0 && monthly <= balance && (
                                <button type="button" className="btn btn-secondary btn-sm"
                                  onClick={() => setForm(p => ({ ...p, amount: String(monthly) }))}>
                                  Monthly {GHS(monthly)}
                                </button>
                              )}
                              {maxPayable > 0 && maxPayable !== monthly && (
                                <button type="button" className="btn btn-secondary btn-sm"
                                  onClick={() => setForm(p => ({ ...p, amount: String(maxPayable) }))}>
                                  Max payable {GHS(maxPayable)}
                                </button>
                              )}
                              {outstanding > 0 && outstanding <= balance && outstanding !== monthly && (
                                <button type="button" className="btn btn-primary btn-sm"
                                  onClick={() => setForm(p => ({ ...p, amount: String(outstanding) }))}>
                                  Full outstanding {GHS(outstanding)}
                                </button>
                              )}
                            </div>
                            {balance < monthly && (
                              <div style={{ padding: '8px 14px', background: 'var(--yellow-bg)', fontSize: 12, color: '#92400e', borderTop: '1px solid var(--border)' }}>
                                ⚠️ Account balance ({GHS(balance)}) is less than the monthly payment ({GHS(monthly)}). You can still make a partial payment.
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </>}
              </div>
            )}

            {/* ── HP picker ── */}
            {mode === 'hp' && (
              <div className="form-group">
                <label className="form-label">Select HP Agreement <span className="required">*</span></label>
                {activeHP.length === 0
                  ? <div className="alert alert-warning"><AlertCircle size={13} /> No active HP agreements for this customer.</div>
                  : <>
                      <select className="form-control" value={form.linkedId} onChange={e => handleLinkedId(e.target.value)}>
                        <option value="">— Choose an agreement —</option>
                        {activeHP.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.itemName || a.item_name} · Remaining: {GHS(a.remaining)} · Suggested: {GHS(a.suggestedPayment)}
                          </option>
                        ))}
                      </select>
                      {/* HP + account context card */}
                      {form.linkedId && (() => {
                        const agr = activeHP.find(a => a.id === form.linkedId);
                        if (!agr) return null;
                        const suggested = Number(agr.suggestedPayment || 0);
                        const remaining = Number(agr.remaining || 0);
                        const maxPayable = Math.min(balance, remaining);
                        return (
                          <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                              {[
                                ['Account Balance', GHS(balance),   balance > 0 ? 'var(--green)' : 'var(--red)'],
                                ['HP Remaining',    GHS(remaining),  remaining > 0 ? 'var(--red)' : 'var(--green)'],
                                ['Max Payable',     GHS(maxPayable), 'var(--brand)'],
                              ].map(([l, v, c]) => (
                                <div key={l} style={{ padding: '10px 14px', borderRight: '1px solid var(--border)' }}>
                                  <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>{l}</div>
                                  <div style={{ fontSize: 15, fontWeight: 800, color: c }}>{v}</div>
                                </div>
                              ))}
                            </div>
                            <div style={{ padding: '10px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>Quick fill:</span>
                              {suggested > 0 && suggested <= balance && (
                                <button type="button" className="btn btn-secondary btn-sm"
                                  onClick={() => setForm(p => ({ ...p, amount: String(suggested) }))}>
                                  Suggested {GHS(suggested)}
                                </button>
                              )}
                              {maxPayable > 0 && maxPayable !== suggested && (
                                <button type="button" className="btn btn-secondary btn-sm"
                                  onClick={() => setForm(p => ({ ...p, amount: String(maxPayable) }))}>
                                  Max payable {GHS(maxPayable)}
                                </button>
                              )}
                              {remaining > 0 && remaining <= balance && remaining !== suggested && (
                                <button type="button" className="btn btn-primary btn-sm"
                                  onClick={() => setForm(p => ({ ...p, amount: String(remaining) }))}>
                                  Full remaining {GHS(remaining)}
                                </button>
                              )}
                            </div>
                            {balance < suggested && (
                              <div style={{ padding: '8px 14px', background: 'var(--yellow-bg)', fontSize: 12, color: '#92400e', borderTop: '1px solid var(--border)' }}>
                                ⚠️ Balance ({GHS(balance)}) is less than suggested ({GHS(suggested)}). You can still make a partial payment.
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </>}
              </div>
            )}

            {/* ── Credit/Debit toggle (regular only) ── */}
            {mode === 'regular' && (
              <div className="form-group">
                <label className="form-label">Type <span className="required">*</span></label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {['credit','debit'].map(t => (
                    <div key={t} onClick={() => setForm(p => ({ ...p, type: t, preset: '', narration: '' }))}
                      style={{ flex: 1, padding: '14px 10px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                        border: `2px solid ${form.type === t ? (t === 'credit' ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`,
                        background: form.type === t ? (t === 'credit' ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--surface)' }}>
                      <div style={{ fontWeight: 800, fontSize: 15, textTransform: 'uppercase', color: form.type === t ? (t === 'credit' ? 'var(--green)' : 'var(--red)') : 'var(--text-3)' }}>
                        {t === 'credit' ? '↑ Credit' : '↓ Debit'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>{t === 'credit' ? 'Money coming in' : 'Money going out'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Amount */}
            <div className="form-group">
              <label className="form-label">Amount (GH₵) <span className="required">*</span></label>
              <input className="form-control" type="number" min="0.01" step="0.01"
                value={form.amount} onChange={f('amount')} placeholder="0.00"
                style={{ fontSize: 22, fontWeight: 800, textAlign: 'center' }} />
              {/* Loan/HP mode: show both account balance after AND loan outstanding after */}
              {(mode === 'loan' || mode === 'hp') && amount > 0 && form.linkedId && (() => {
                const linked = mode === 'loan'
                  ? activeLoans.find(l => l.id === form.linkedId)
                  : activeHP.find(a => a.id === form.linkedId);
                const outstanding = Number(linked?.outstanding ?? linked?.remaining ?? 0);
                const balAfter = balance - amount;
                const outAfter = Math.max(0, outstanding - amount);
                return (
                  <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ padding: '8px 12px', borderRadius: 8, background: balAfter < 0 ? 'var(--red-bg)' : 'var(--green-bg)', border: `1px solid ${balAfter < 0 ? 'var(--red)' : 'var(--green)'}` }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: balAfter < 0 ? 'var(--red)' : 'var(--green)', textTransform: 'uppercase', marginBottom: 2 }}>Account Balance After</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: balAfter < 0 ? 'var(--red)' : 'var(--green)' }}>{GHS(balAfter)}</div>
                      {balAfter < 0 && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 2 }}>Insufficient funds</div>}
                    </div>
                    <div style={{ padding: '8px 12px', borderRadius: 8, background: outAfter <= 0 ? 'var(--green-bg)' : 'var(--yellow-bg)', border: `1px solid ${outAfter <= 0 ? 'var(--green)' : 'var(--yellow)'}` }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: outAfter <= 0 ? 'var(--green)' : 'var(--yellow)', textTransform: 'uppercase', marginBottom: 2 }}>{mode === 'hp' ? 'HP Remaining After' : 'Loan Outstanding After'}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: outAfter <= 0 ? 'var(--green)' : '#92400e' }}>{GHS(outAfter)}</div>
                      {outAfter <= 0 && <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 2 }}>Fully paid off ✓</div>}
                    </div>
                  </div>
                );
              })()}
              {mode === 'regular' && form.type === 'debit' && amount > 0 && (
                <div className="form-hint" style={{ color: amount > balance ? 'var(--red)' : 'var(--text-3)' }}>
                  Balance after: {GHS(balance - amount)}{amount > balance ? ' — Insufficient funds' : ''}
                </div>
              )}
              {mode === 'transfer' && amount > 0 && (
                <div className="form-hint" style={{ color: amount > balance ? 'var(--red)' : 'var(--text-3)' }}>
                  From balance after: {GHS(balance - amount)}{amount > balance ? ' — Insufficient funds' : ''}
                </div>
              )}
              {mode !== 'transfer' && mode !== 'gl' && form.type === 'credit' && amount > 0 && (
                <div className="form-hint">Balance after: {GHS(balance + amount)}</div>
              )}
            </div>

            {/* Narration */}
            <div className="form-group">
              <label className="form-label">Narration {mode !== 'gl' && <span className="required">*</span>}</label>
              {mode === 'regular' && (
                <select className="form-control" value={form.preset} onChange={f('preset')} style={{ marginBottom: 8 }}>
                  <option value="">— Select a preset —</option>
                  {NARRATIONS[form.type].map(n => <option key={n} value={n}>{n}</option>)}
                  <option value="__custom__">Custom…</option>
                </select>
              )}
              <input className="form-control" value={form.narration} onChange={f('narration')}
                placeholder={form.preset && form.preset !== '__custom__' ? `Using "${form.preset}" — type to override` : 'Type narration…'} />
              {finalNarr && mode === 'regular' && (
                <div className="form-hint">Will post as: <strong>{finalNarr}</strong></div>
              )}
            </div>

            {/* Auth (not for transfer/gl) */}
            {mode !== 'transfer' && mode !== 'gl' && (
              <div style={{ padding: 14, borderRadius: 10, marginBottom: 20,
                border: `2px solid ${willAuth ? 'var(--yellow)' : 'var(--border)'}`,
                background: willAuth ? 'var(--yellow-bg)' : 'var(--surface)' }}>
                {isTeller ? (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <Clock size={16} style={{ color: 'var(--yellow)', marginTop: 2, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#92400e' }}>Requires Authorisation</div>
                      <div style={{ fontSize: 12, color: '#92400e', opacity: .8, marginTop: 2 }}>As a teller, your transactions must be approved before posting.</div>
                    </div>
                  </div>
                ) : (
                  <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.requireAuth} onChange={fb('requireAuth')}
                      style={{ width: 16, height: 16, marginTop: 2, accentColor: 'var(--brand)' }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>Submit for Authoriser Approval</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Queue for second-level approval before posting</div>
                    </div>
                  </label>
                )}
                {amount >= 10000 && !willAuth && (
                  <div className="alert alert-warning" style={{ marginTop: 10, marginBottom: 0 }}>
                    <AlertCircle size={13} /> High-value transaction — authorisation recommended
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" type="button" onClick={reset} style={{ flex: 1 }}>Cancel</button>
              <button className="btn btn-primary btn-lg" type="submit" disabled={saving} style={{ flex: 2 }}>
                {saving ? 'Processing…'
                  : mode === 'transfer' ? <><ArrowRightLeft size={14} style={{ marginRight: 6 }} />Transfer Funds</>
                  : mode === 'gl'       ? <><BookOpen size={14} style={{ marginRight: 6 }} />Post to GL</>
                  : willAuth            ? <><Send size={14} style={{ marginRight: 6 }} />Submit for Approval</>
                  : `Post ${form.type === 'credit' ? 'Credit' : 'Debit'}`}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
