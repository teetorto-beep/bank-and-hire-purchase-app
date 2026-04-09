import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle, ArrowLeft, Search, Printer,
  PiggyBank, CreditCard, ShoppingBag, AlertCircle,
} from 'lucide-react';
import { authDB } from '../../core/db';

const GHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

export default function RecordCollection() {
  const { collectors, customers, accounts, loans, hpAgreements, recordCollection } = useApp();
  const navigate = useNavigate();
  const user = authDB.currentUser();

  const [step, setStep] = useState(1);
  const [collectorId, setCollectorId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [paymentType, setPaymentType] = useState('savings');
  const [loanId, setLoanId] = useState('');
  const [hpAgreementId, setHpAgreementId] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [custSearch, setCustSearch] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const activeCollectors = collectors.filter(c => c.status === 'active');
  const selectedCollector = collectors.find(c => c.id === collectorId);
  const selectedCustomer = customers.find(c => c.id === customerId);
  const selectedAccount = accounts.find(a => a.id === accountId);
  const selectedLoan = loans.find(l => l.id === loanId);
  const selectedHP = hpAgreements.find(a => a.id === hpAgreementId);

  const custResults = useMemo(() => {
    const q = custSearch.trim().toLowerCase();
    const pool = customers;
    if (!q) return pool.slice(0, 30);
    return pool.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q)
    ).slice(0, 30);
  }, [customers, custSearch]);

  const custAccounts = accounts.filter(a =>
    (a.customerId || a.customer_id) === customerId && a.status === 'active'
  );

  const customerLoans = loans.filter(l =>
    (l.customerId || l.customer_id) === customerId &&
    ['active', 'overdue'].includes(l.status)
  );

  const customerHP = hpAgreements.filter(a =>
    (a.customerId || a.customer_id) === customerId && a.status === 'active'
  );

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError('');
    const amt = parseFloat(amount);

    if (!collectorId) { setError('Select a collector.'); return; }
    if (!customerId) { setError('Select a customer.'); return; }
    if (!accountId) { setError('Select an account.'); return; }
    if (paymentType === 'loan' && !loanId) { setError('Select a loan.'); return; }
    if (paymentType === 'hp' && !hpAgreementId) { setError('Select an HP agreement.'); return; }
    if (!amt || amt <= 0) { setError('Enter a valid amount greater than 0.'); return; }

    setSaving(true);
    try {
      const { data, error: err } = await recordCollection({
        collectorId,
        collectorName: selectedCollector?.name,
        customerId,
        customerName: selectedCustomer?.name,
        accountId,
        amount: amt,
        notes,
        paymentType,
        loanId: loanId || undefined,
        loanType: selectedLoan?.type,
        hpAgreementId: hpAgreementId || undefined,
        itemName: selectedHP?.itemName || selectedHP?.item_name,
      });

      if (err) {
        setError(err.message || 'Failed to record collection.');
        setSaving(false);
        return;
      }

      setDone({
        collector: selectedCollector,
        customer: selectedCustomer,
        account: selectedAccount,
        amount: amt,
        paymentType,
        notes,
        loanType: selectedLoan?.type,
        hpItem: selectedHP?.itemName || selectedHP?.item_name,
        date: new Date().toLocaleString(),
      });
    } catch (e) {
      setError(e.message || 'Unexpected error.');
    }
    setSaving(false);
  };

  const reset = () => {
    setCollectorId(''); setCustomerId(''); setAccountId('');
    setPaymentType('savings'); setLoanId(''); setHpAgreementId('');
    setAmount(''); setNotes(''); setCustSearch('');
    setError(''); setDone(null); setStep(1);
  };

  const printReceipt = () => {
    if (!done) return;
    const w = window.open('', '_blank', 'width=420,height=620');
    const typeColor = done.paymentType === 'savings' ? '#166534' : done.paymentType === 'loan' ? '#1e40af' : '#5b21b6';
    const typeBg = done.paymentType === 'savings' ? '#dcfce7' : done.paymentType === 'loan' ? '#dbeafe' : '#ede9fe';
    const typeLabel = done.paymentType === 'savings' ? 'Savings Deposit' : done.paymentType === 'loan' ? 'Loan Repayment' : 'HP Repayment';
    w.document.write(`<html><head><title>Receipt</title>
    <style>body{font-family:'Courier New',monospace;padding:24px;font-size:13px}
    h2{text-align:center;margin-bottom:2px}
    .sub{text-align:center;color:#666;font-size:11px;margin-bottom:18px}
    hr{border:none;border-top:1px dashed #999;margin:10px 0}
    .row{display:flex;justify-content:space-between;margin-bottom:5px}
    .lbl{color:#555}.val{font-weight:bold}
    .amt{font-size:22px;font-weight:900;text-align:center;margin:14px 0}
    .badge{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${typeBg};color:${typeColor}}
    .footer{text-align:center;font-size:11px;color:#888;margin-top:18px}
    </style></head><body>
    <h2>Majupat Love Enterprise</h2>
    <div class="sub">Collection Receipt</div><hr/>
    <div class="row"><span class="lbl">Date</span><span class="val">${done.date}</span></div>
    <div class="row"><span class="lbl">Collector</span><span class="val">${done.collector?.name || '—'}</span></div>
    <div class="row"><span class="lbl">Customer</span><span class="val">${done.customer?.name || '—'}</span></div>
    <div class="row"><span class="lbl">Account</span><span class="val">${done.account?.accountNumber || done.account?.account_number || '—'}</span></div>
    <div class="row"><span class="lbl">Type</span><span class="val"><span class="badge">${typeLabel}</span></span></div>
    ${done.loanType ? `<div class="row"><span class="lbl">Loan</span><span class="val">${done.loanType}</span></div>` : ''}
    ${done.hpItem ? `<div class="row"><span class="lbl">Item</span><span class="val">${done.hpItem}</span></div>` : ''}
    ${done.notes ? `<div class="row"><span class="lbl">Notes</span><span class="val">${done.notes}</span></div>` : ''}
    <hr/><div class="amt">GH₵ ${Number(done.amount).toLocaleString('en-GH', { minimumFractionDigits: 2 })}</div><hr/>
    <div class="footer">Thank you. Keep this receipt for your records.<br/>Maxbraynn Technology & Systems</div>
    </body></html>`);
    w.document.close(); w.print();
  };

  // ── Success screen ──────────────────────────────────────────────────────────
  if (done) {
    const typeColor = done.paymentType === 'savings' ? '#16a34a' : done.paymentType === 'loan' ? '#1d4ed8' : '#7c3aed';
    const typeBg = done.paymentType === 'savings' ? '#f0fdf4' : done.paymentType === 'loan' ? '#eff6ff' : '#faf5ff';
    const typeLabel = done.paymentType === 'savings' ? 'Savings Deposit' : done.paymentType === 'loan' ? 'Loan Repayment' : 'HP Repayment';
    return (
      <div className="fade-in" style={{ maxWidth: 500, margin: '40px auto', padding: '0 16px' }}>
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <CheckCircle size={56} style={{ color: '#16a34a', margin: '0 auto 16px', display: 'block' }} />
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Payment Recorded!</div>
          <div style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 20 }}>Collection saved successfully.</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 20, marginBottom: 20, background: typeBg, color: typeColor, fontWeight: 700, fontSize: 13 }}>
            {typeLabel}
          </div>
          <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: 18, marginBottom: 24, textAlign: 'left' }}>
            {[
              ['Collector', done.collector?.name],
              ['Customer', done.customer?.name],
              ['Account', done.account?.accountNumber || done.account?.account_number],
              ['Amount', GHS(done.amount)],
              done.loanType ? ['Loan', done.loanType] : null,
              done.hpItem ? ['HP Item', done.hpItem] : null,
              done.notes ? ['Notes', done.notes] : null,
              ['Date', done.date],
            ].filter(Boolean).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ color: 'var(--text-3)' }}>{k}</span>
                <span style={{ fontWeight: 600 }}>{v || '—'}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={printReceipt}><Printer size={14} /> Print Receipt</button>
            <button className="btn btn-primary" onClick={reset}>Record Another</button>
            <button className="btn btn-ghost" onClick={() => navigate('/collectors')}><ArrowLeft size={14} /> Back</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/collectors')} style={{ marginRight: 8 }}>
            <ArrowLeft size={15} />
          </button>
          <div>
            <div className="page-title">Record Collection</div>
            <div className="page-desc">Record a payment from a customer</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto' }}>

        {/* Error banner */}
        {error && (
          <div className="alert alert-error" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertCircle size={16} />
            <span style={{ flex: 1 }}>{error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, color: 'inherit' }}>×</button>
          </div>
        )}

        {/* ── 1. Collector ── */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
            Step 1 · Collector
          </div>
          <select
            className="form-control"
            value={collectorId}
            onChange={e => { setCollectorId(e.target.value); setCustomerId(''); setAccountId(''); }}
          >
            <option value="">— Select collector —</option>
            {activeCollectors.map(c => (
              <option key={c.id} value={c.id}>{c.name}{c.zone ? ` · ${c.zone}` : ''} · {c.phone}</option>
            ))}
          </select>
          {activeCollectors.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>
              No active collectors. <button className="btn btn-ghost btn-sm" onClick={() => navigate('/collectors')}>Add one</button>
            </div>
          )}
        </div>

        {/* ── 2. Customer ── */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
            Step 2 · Customer
          </div>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
            <input
              className="form-control"
              style={{ paddingLeft: 32 }}
              placeholder="Search by name or phone…"
              value={custSearch}
              onChange={e => setCustSearch(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
            {custResults.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-3)', fontSize: 13 }}>No customers found</div>
            ) : custResults.map(c => {
              const sel = customerId === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => { setCustomerId(c.id); setAccountId(''); setLoanId(''); setHpAgreementId(''); }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                    border: `2px solid ${sel ? 'var(--brand)' : 'var(--border)'}`,
                    background: sel ? 'var(--brand-light)' : 'var(--surface)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: sel ? 'var(--brand)' : 'var(--surface-2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: sel ? '#fff' : 'var(--text-3)', fontWeight: 800, fontSize: 14,
                    }}>
                      {(c.name || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{c.phone}</div>
                    </div>
                  </div>
                  {sel && <CheckCircle size={18} style={{ color: 'var(--brand)', flexShrink: 0 }} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 3. Payment Type ── */}
        {customerId && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
              Step 3 · Payment Type
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              {[
                { key: 'savings', label: 'Savings Deposit', sub: 'Credit account', icon: PiggyBank, color: '#16a34a', bg: '#f0fdf4' },
                { key: 'loan', label: 'Loan Repayment', sub: 'Reduce loan balance', icon: CreditCard, color: '#1d4ed8', bg: '#eff6ff' },
                { key: 'hp', label: 'HP Repayment', sub: 'Reduce HP balance', icon: ShoppingBag, color: '#7c3aed', bg: '#faf5ff' },
              ].map(pt => {
                const Icon = pt.icon;
                const active = paymentType === pt.key;
                return (
                  <button
                    key={pt.key}
                    type="button"
                    onClick={() => { setPaymentType(pt.key); setLoanId(''); setHpAgreementId(''); }}
                    style={{
                      padding: '14px 8px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                      border: `2px solid ${active ? pt.color : 'var(--border)'}`,
                      background: active ? pt.bg : 'var(--surface)',
                    }}
                  >
                    <Icon size={22} style={{ color: active ? pt.color : 'var(--text-3)', margin: '0 auto 6px', display: 'block' }} />
                    <div style={{ fontWeight: 700, fontSize: 12, color: active ? pt.color : 'var(--text)', marginBottom: 2 }}>{pt.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{pt.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 4. Account ── */}
        {customerId && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
              Step 4 · Account
            </div>
            {custAccounts.length === 0 ? (
              <div style={{ padding: 12, background: '#fef9c3', borderRadius: 8, fontSize: 13, color: '#854d0e' }}>
                No active accounts for this customer.
              </div>
            ) : (
              <select className="form-control" value={accountId} onChange={e => setAccountId(e.target.value)}>
                <option value="">— Select account —</option>
                {custAccounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.accountNumber || a.account_number} ({a.type}) — {GHS(a.balance)}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* ── 5a. Loan selector ── */}
        {customerId && paymentType === 'loan' && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
              Step 5 · Select Loan
            </div>
            {customerLoans.length === 0 ? (
              <div style={{ padding: 12, background: '#fef9c3', borderRadius: 8, fontSize: 13, color: '#854d0e' }}>
                No active loans for this customer.
              </div>
            ) : (
              <>
                <select className="form-control" value={loanId} onChange={e => setLoanId(e.target.value)}>
                  <option value="">— Select loan —</option>
                  {customerLoans.map(l => (
                    <option key={l.id} value={l.id}>
                      {(l.type || '').replace('_', ' ')} — Outstanding: {GHS(l.outstanding)} · {l.status}
                    </option>
                  ))}
                </select>
                {selectedLoan && (
                  <div style={{ marginTop: 10, padding: 12, background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                    {[
                      ['Outstanding', GHS(selectedLoan.outstanding)],
                      ['Monthly', GHS(selectedLoan.monthlyPayment || selectedLoan.monthly_payment)],
                      ['Rate', `${selectedLoan.interestRate || selectedLoan.interest_rate || 0}%`],
                      ['Status', selectedLoan.status],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <div style={{ fontSize: 10, color: '#3b82f6', fontWeight: 700, textTransform: 'uppercase' }}>{k}</div>
                        <div style={{ fontWeight: 700 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── 5b. HP Agreement selector ── */}
        {customerId && paymentType === 'hp' && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
              Step 5 · Select HP Agreement
            </div>
            {customerHP.length === 0 ? (
              <div style={{ padding: 12, background: '#fef9c3', borderRadius: 8, fontSize: 13, color: '#854d0e' }}>
                No active HP agreements for this customer.
              </div>
            ) : (
              <>
                <select className="form-control" value={hpAgreementId} onChange={e => setHpAgreementId(e.target.value)}>
                  <option value="">— Select agreement —</option>
                  {customerHP.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.itemName || a.item_name || 'HP Item'} — Remaining: {GHS(a.remaining)}
                    </option>
                  ))}
                </select>
                {selectedHP && (
                  <div style={{ marginTop: 10, padding: 12, background: '#faf5ff', border: '1px solid #c4b5fd', borderRadius: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                    {[
                      ['Item', selectedHP.itemName || selectedHP.item_name],
                      ['Remaining', GHS(selectedHP.remaining)],
                      ['Suggested', GHS(selectedHP.suggestedPayment || selectedHP.suggested_payment)],
                      ['Frequency', selectedHP.paymentFrequency || selectedHP.payment_frequency],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <div style={{ fontSize: 10, color: '#8b5cf6', fontWeight: 700, textTransform: 'uppercase' }}>{k}</div>
                        <div style={{ fontWeight: 700 }}>{v || '—'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── 6. Amount ── */}
        {customerId && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
              {paymentType !== 'savings' ? 'Step 6' : 'Step 5'} · Amount
            </div>
            <input
              className="form-control"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              style={{ fontSize: 32, fontWeight: 900, textAlign: 'center', padding: '16px', letterSpacing: 1 }}
            />
            {paymentType === 'loan' && selectedLoan && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, textAlign: 'center' }}>
                Outstanding: <strong>{GHS(selectedLoan.outstanding)}</strong>
                {' · '}Monthly: <strong>{GHS(selectedLoan.monthlyPayment || selectedLoan.monthly_payment)}</strong>
              </div>
            )}
            {paymentType === 'hp' && selectedHP && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, textAlign: 'center' }}>
                Remaining: <strong>{GHS(selectedHP.remaining)}</strong>
                {' · '}Suggested: <strong>{GHS(selectedHP.suggestedPayment || selectedHP.suggested_payment)}</strong>
              </div>
            )}
            <textarea
              className="form-control"
              style={{ marginTop: 10 }}
              rows={2}
              placeholder="Notes (optional)…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        )}

        {/* ── Submit button ── */}
        {customerId && (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingBottom: 40 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={reset}
              disabled={saving}
            >
              Clear
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ minWidth: 180, fontSize: 15, padding: '12px 24px' }}
              disabled={saving || !amount || parseFloat(amount) <= 0}
              onClick={handleSubmit}
            >
              {saving
                ? 'Recording…'
                : paymentType === 'savings'
                  ? 'Record Savings Deposit'
                  : paymentType === 'loan'
                    ? 'Record Loan Repayment'
                    : 'Record HP Repayment'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
