import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import { Plus, Search, DollarSign, Eye, CreditCard, ArrowRight } from 'lucide-react';
import { authDB } from '../../core/db';

const GHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;
const FREQ_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };

const EMPTY_FORM = {
  customerId: '', itemId: '', accountId: '',
  paymentFrequency: 'daily', downPayment: '',
  interestRate: '18', tenure: '', notes: '',
  createLoan: true,
};

export default function HPAgreements() {
  const { customers, accounts, hpItems, hpAgreements, hpPayments, loans, products,
          createHPAgreementWithLoan, recordHPPayment } = useApp();
  const navigate = useNavigate();
  const user = authDB.currentUser();

  const [tab, setTab] = useState('agreements');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [newModal, setNewModal] = useState(false);
  const [payModal, setPayModal] = useState(null);
  const [detailModal, setDetailModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [payAmount, setPayAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));
  const ft = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.checked }));

  // Handle both snake_case (Supabase) and camelCase
  const selectedItem = hpItems.find(i => i.id === form.itemId);
  const si = selectedItem ? {
    ...selectedItem,
    dailyPayment: selectedItem.daily_payment ?? selectedItem.dailyPayment ?? 0,
    weeklyPayment: selectedItem.weekly_payment ?? selectedItem.weeklyPayment ?? 0,
    price: selectedItem.price ?? 0,
  } : null;

  const custAccounts = useMemo(() =>
    accounts.filter(a =>
      (a.customer_id || a.customerId) === form.customerId &&
      a.status === 'active'
    ),
    [accounts, form.customerId]
  );

  const suggestedPayment = useMemo(() => {
    if (!si) return 0;
    if (form.paymentFrequency === 'daily') return si.dailyPayment;
    if (form.paymentFrequency === 'weekly') return si.weeklyPayment;
    return parseFloat((si.price / 12).toFixed(2));
  }, [si, form.paymentFrequency]);

  const loanAmount = si ? (si.price - (parseFloat(form.downPayment) || 0)) : 0;

  const enriched = useMemo(() =>
    hpAgreements.map(a => ({
      ...a,
      // AppContext normalises all fields — customer/item come from Supabase join via normHPAgreement
      loan: loans.find(l => l.id === a.loanId) || null,
      payments: hpPayments.filter(p => p.agreementId === a.id),
      progress: a.totalPrice > 0 ? Math.min(100, (a.totalPaid / a.totalPrice) * 100) : 0,
    })).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
    [hpAgreements, loans, hpPayments]
  );

  const filtered = useMemo(() =>
    enriched.filter(a => {
      const matchQ = !q || a.customer?.name.toLowerCase().includes(q.toLowerCase()) || a.item?.name.toLowerCase().includes(q.toLowerCase());
      const matchStatus = statusFilter === 'all' || a.status === statusFilter;
      return matchQ && matchStatus;
    }), [enriched, q, statusFilter]);

  // Get HP loan product rate as default
  const hpLoanProduct = useMemo(() =>
    (products || []).find(p => p.category === 'hire_purchase' && p.status === 'active'),
    [products]
  );
  const defaultRate = hpLoanProduct?.interestRate ?? hpLoanProduct?.interest_rate ?? 18;

  const openNew = () => {
    setForm({ ...EMPTY_FORM, interestRate: String(defaultRate) });
    setError(''); setNewModal(true);
  };

  const createAgreement = async (e) => {
    e.preventDefault();
    if (!form.customerId || !form.itemId) { setError('Select a customer and an item.'); return; }
    if (form.createLoan && !form.accountId) { setError('Select an account to link the loan.'); return; }
    const rate = parseFloat(form.interestRate);
    if (form.createLoan && (!rate || rate <= 0)) { setError('Enter a valid interest rate greater than 0.'); return; }
    if (form.createLoan && rate > 100) { setError('Interest rate cannot exceed 100%.'); return; }
    setSaving(true); setError('');
    try {
      const result = await createHPAgreementWithLoan({
        customerId: form.customerId,
        itemId: form.itemId,
        itemName: si?.name,
        totalPrice: si?.price,
        downPayment: parseFloat(form.downPayment) || 0,
        paymentFrequency: form.paymentFrequency,
        suggestedPayment,
        notes: form.notes,
        accountId: form.createLoan ? form.accountId : null,
        interestRate: rate,
        tenure: form.tenure ? parseInt(form.tenure) : null,
      }, user?.id);
      if (result?.error) { setError(result.error?.message || 'Failed to create agreement.'); setSaving(false); return; }
      setNewModal(false);
    } catch (err) { setError(err.message); }
    setSaving(false);
  };

  const doPayment = async () => {
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) return;
    setSaving(true);
    try {
      await recordHPPayment({
        agreementId: payModal.id,
        amount: amt,
        note: '',
        collectedBy: user?.name,
      });
    } catch (err) { console.error(err); }
    setPayModal(null); setPayAmount(''); setSaving(false);
  };

  const totalRevenue = hpPayments.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Hire Purchase Agreements</div>
          <div className="page-desc">Item agreements with linked loan tracking</div>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={openNew}><Plus size={15} />New Agreement</button>
        </div>
      </div>

      {/* Summary */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
        {[
          { label: 'Active', value: hpAgreements.filter(a => a.status === 'active').length, color: 'var(--green)' },
          { label: 'Completed', value: hpAgreements.filter(a => a.status === 'completed').length, color: 'var(--blue)' },
          { label: 'Linked Loans', value: hpAgreements.filter(a => a.loanId).length, color: 'var(--brand)' },
          { label: 'Total Collected', value: GHS(hpPayments.reduce((s, p) => s + p.amount, 0)), color: 'var(--purple)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="tabs">
        <div className={`tab ${tab === 'agreements' ? 'active' : ''}`} onClick={() => setTab('agreements')}>Agreements</div>
        <div className={`tab ${tab === 'payments' ? 'active' : ''}`} onClick={() => setTab('payments')}>Payment History</div>
      </div>

      {tab === 'agreements' && (
        <div className="card">
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <div className="search-box" style={{ flex: 1, minWidth: 200 }}>
              <Search size={15} />
              <input className="form-control" placeholder="Search customer or item…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <select className="form-control" style={{ width: 140 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="table-empty">No agreements found</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filtered.map(a => (
                <div key={a.id} style={{ border: `1px solid ${a.status === 'completed' ? '#a7f3d0' : 'var(--border)'}`, borderRadius: 10, padding: 16, background: a.status === 'completed' ? '#f0fdf4' : 'var(--surface)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ width: 48, height: 48, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
                        {a.item?.image || '📦'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{a.item?.name || a.itemName}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                          {a.customer?.name} · {FREQ_LABELS[a.paymentFrequency]} · {a.payments.length} payments
                        </div>
                        {/* Loan badge */}
                        {a.loan && (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, padding: '2px 8px', background: 'var(--blue-bg)', borderRadius: 20, fontSize: 11, color: '#1e40af', fontWeight: 600 }}>
                            <CreditCard size={10} />
                            Loan #{a.loan.id.slice(-6)} · {GHS(a.loan.outstanding)} outstanding
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                      <Badge status={a.status} />
                      <button className="btn btn-ghost btn-sm btn-icon" title="Details" onClick={() => setDetailModal(a)}><Eye size={14} /></button>
                      {a.loan && (
                        <button className="btn btn-ghost btn-sm btn-icon" title="View Loan" onClick={() => navigate('/loans')} style={{ color: 'var(--brand)' }}>
                          <ArrowRight size={14} />
                        </button>
                      )}
                      {a.status === 'active' && (
                        <button className="btn btn-success btn-sm" onClick={() => { setPayModal(a); setPayAmount(String(a.suggestedPayment || '')); }}>
                          <DollarSign size={13} />Pay
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                      <span style={{ color: 'var(--text-3)' }}>Paid: <strong style={{ color: 'var(--green)' }}>{GHS(a.totalPaid)}</strong></span>
                      <span style={{ color: 'var(--text-3)' }}>Remaining: <strong style={{ color: a.remaining > 0 ? 'var(--red)' : 'var(--green)' }}>{GHS(a.remaining)}</strong></span>
                      <strong>{a.progress.toFixed(0)}%</strong>
                    </div>
                    <div className="progress">
                      <div className="progress-bar" style={{ width: `${a.progress}%`, background: a.status === 'completed' ? 'var(--green)' : 'var(--brand)' }} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-3)', flexWrap: 'wrap' }}>
                    <span>Total: <strong style={{ color: 'var(--text)' }}>{GHS(a.totalPrice)}</strong></span>
                    <span>Suggested: <strong style={{ color: 'var(--text)' }}>{GHS(a.suggestedPayment)}/{a.paymentFrequency}</strong></span>
                    {a.lastPaymentDate && <span>Last paid: <strong style={{ color: 'var(--text)' }}>{new Date(a.lastPaymentDate).toLocaleDateString()}</strong></span>}
                    {a.loan && <span>Next due: <strong style={{ color: a.loan.status === 'overdue' ? 'var(--red)' : 'var(--text)' }}>{a.loan.nextDueDate ? new Date(a.loan.nextDueDate).toLocaleDateString() : '—'}</strong></span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'payments' && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Date</th><th>Customer</th><th>Item</th><th>Amount</th><th>Remaining</th><th>Loan Updated</th><th>By</th></tr>
              </thead>
              <tbody>
                {hpPayments.length === 0 ? (
                  <tr><td colSpan={7} className="table-empty">No payments yet</td></tr>
                ) : [...hpPayments].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).map(p => {
                  const agr = hpAgreements.find(a => a.id === p.agreementId);
                  const cust = agr?.customer || customers.find(c => c.id === agr?.customerId);
                  return (
                    <tr key={p.id}>
                      <td style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{p.createdAt ? new Date(p.createdAt).toLocaleString() : '—'}</td>
                      <td style={{ fontWeight: 600 }}>{cust?.name || '—'}</td>
                      <td>{agr?.itemName || '—'}</td>
                      <td style={{ fontWeight: 700, color: 'var(--green)' }}>{GHS(p.amount)}</td>
                      <td>{GHS(p.remaining)}</td>
                      <td>
                        {agr?.loanId
                          ? <span className="badge badge-blue">Yes</span>
                          : <span className="badge badge-gray">No loan</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{p.collectedBy || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── New Agreement Modal ─────────────────────────────────────────────── */}
      <Modal open={newModal} onClose={() => setNewModal(false)} title="New HP Agreement" size="lg"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setNewModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={createAgreement} disabled={saving}>{saving ? 'Creating…' : 'Create Agreement'}</button>
        </>}>
        <form onSubmit={createAgreement}>
          {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Customer <span className="required">*</span></label>
              <select className="form-control" value={form.customerId} onChange={(e) => setForm(p => ({ ...p, customerId: e.target.value, accountId: '' }))}>
                <option value="">— Select customer —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Item <span className="required">*</span></label>
              <select className="form-control" value={form.itemId} onChange={f('itemId')}>
                <option value="">— Select item —</option>
                {hpItems.filter(i => i.stock > 0).map(i => (
                  <option key={i.id} value={i.id}>{i.image} {i.name} — {GHS(i.price)}</option>
                ))}
              </select>
            </div>
          </div>

          {si && (
            <div style={{ padding: 14, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 32 }}>{si.image}</span>
              <div>
                <div style={{ fontWeight: 700 }}>{si.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{si.description}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--brand)', marginTop: 4 }}>{GHS(si.price)}</div>
              </div>
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Payment Frequency</label>
              <select className="form-control" value={form.paymentFrequency} onChange={f('paymentFrequency')}>
                <option value="daily">Daily — {GHS(si?.dailyPayment || 0)}/day</option>
                <option value="weekly">Weekly — {GHS(si?.weeklyPayment || 0)}/week</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Down Payment (GH₵)</label>
              <input className="form-control" type="number" step="0.01" min="0" value={form.downPayment} onChange={f('downPayment')} placeholder="0.00" />
              {loanAmount > 0 && <div className="form-hint">Balance to finance: <strong>{GHS(loanAmount)}</strong></div>}
            </div>
          </div>

          {/* Loan section */}
          <div style={{ padding: 16, border: '2px solid var(--border)', borderRadius: 10, marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: form.createLoan ? 16 : 0 }}>
              <input type="checkbox" checked={form.createLoan} onChange={ft('createLoan')} style={{ width: 16, height: 16, accentColor: 'var(--brand)' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Generate a linked Hire Purchase Loan</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Creates a loan record for the balance, enabling repayment tracking and overdue alerts</div>
              </div>
            </label>

            {form.createLoan && (
              <div>
                <div className="form-group">
                  <label className="form-label">Linked Account <span className="required">*</span></label>
                  <select className="form-control" value={form.accountId} onChange={f('accountId')} disabled={!form.customerId}>
                    <option value="">— Select account —</option>
                    {custAccounts.map(a => {
                      const accNum = a.account_number || a.accountNumber;
                      const accType = a.type;
                      const accBal = a.balance ?? 0;
                      return <option key={a.id} value={a.id}>{accNum} ({accType}) — {GHS(accBal)}</option>;
                    })}
                  </select>
                  <div className="form-hint">Payments will be debited from this account</div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Interest Rate (% p.a.) <span className="required">*</span></label>
                    <input className="form-control" type="number" step="0.1" min="0.1" max="100"
                      value={form.interestRate} onChange={f('interestRate')}
                      style={{ fontWeight: 700, fontSize: 16, textAlign: 'center' }} />
                    <div className="form-hint">
                      {hpLoanProduct
                        ? `Default from "${hpLoanProduct.name}": ${defaultRate}%`
                        : 'Set the annual interest rate for this HP loan'}
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tenure (months)</label>
                    <input className="form-control" type="number" min="1" value={form.tenure} onChange={f('tenure')} placeholder="Auto from frequency" />
                    <div className="form-hint">Leave blank to auto-calculate</div>
                  </div>
                </div>
                {loanAmount > 0 && form.interestRate && (
                  <div style={{ padding: 12, background: 'var(--blue-bg)', borderRadius: 8, fontSize: 12, color: '#1e40af' }}>
                    {(() => {
                      const principal = loanAmount;
                      const rate = parseFloat(form.interestRate) || 0;
                      const months = form.tenure ? parseInt(form.tenure) : (form.paymentFrequency === 'daily' ? 6 : form.paymentFrequency === 'weekly' ? 12 : 24);
                      const mr = rate / 100 / 12;
                      const monthly = mr > 0
                        ? (principal * mr * Math.pow(1 + mr, months)) / (Math.pow(1 + mr, months) - 1)
                        : principal / months;
                      const totalRepay = monthly * months;
                      const totalInterest = totalRepay - principal;
                      const GHSf = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;
                      return (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div><span style={{ opacity: .7 }}>Principal:</span> <strong>{GHSf(principal)}</strong></div>
                          <div><span style={{ opacity: .7 }}>Rate:</span> <strong>{rate}% p.a.</strong></div>
                          <div><span style={{ opacity: .7 }}>Tenure:</span> <strong>{months} months</strong></div>
                          <div><span style={{ opacity: .7 }}>Monthly:</span> <strong>{GHSf(monthly)}</strong></div>
                          <div><span style={{ opacity: .7 }}>Total Interest:</span> <strong style={{ color: '#dc2626' }}>{GHSf(totalInterest)}</strong></div>
                          <div><span style={{ opacity: .7 }}>Total Repayment:</span> <strong style={{ color: '#065f46' }}>{GHSf(totalRepay)}</strong></div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-control" value={form.notes} onChange={f('notes')} rows={2} placeholder="Any additional notes…" />
          </div>
        </form>
      </Modal>

      {/* ── Record Payment Modal ────────────────────────────────────────────── */}
      <Modal open={!!payModal} onClose={() => { setPayModal(null); setPayAmount(''); }} title="Record HP Payment"
        footer={<>
          <button className="btn btn-secondary" onClick={() => { setPayModal(null); setPayAmount(''); }}>Cancel</button>
          <button className="btn btn-success" onClick={doPayment} disabled={saving || !payAmount}>{saving ? 'Recording…' : 'Record Payment'}</button>
        </>}>
        {payModal && (
          <div>
            <div style={{ padding: 14, background: 'var(--surface-2)', borderRadius: 8, marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 24 }}>{payModal.item?.image || '📦'}</span>
                <div>
                  <div style={{ fontWeight: 700 }}>{payModal.item?.name || payModal.itemName}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{payModal.customer?.name}</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
                <span style={{ color: 'var(--text-3)' }}>Remaining balance</span>
                <strong style={{ color: 'var(--red)' }}>{GHS(payModal.remaining)}</strong>
              </div>
              <div className="progress">
                <div className="progress-bar" style={{ width: `${payModal.progress}%`, background: 'var(--brand)' }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{payModal.progress?.toFixed(0)}% complete</div>
              {payModal.loan && (
                <div style={{ marginTop: 10, padding: '6px 10px', background: 'var(--blue-bg)', borderRadius: 6, fontSize: 12, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CreditCard size={12} />
                  Linked loan outstanding: <strong>{GHS(payModal.loan.outstanding)}</strong> — will be updated automatically
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Amount (GH₵) <span className="required">*</span></label>
              <input className="form-control" type="number" step="0.01" min="0.01"
                max={payModal.remaining} value={payAmount}
                onChange={e => setPayAmount(e.target.value)} autoFocus />
              <div className="form-hint">
                Suggested: <strong>{GHS(payModal.suggestedPayment)}</strong> ({payModal.paymentFrequency})
                {payModal.loan && ' · Payment will also reduce loan outstanding'}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Detail Modal ────────────────────────────────────────────────────── */}
      <Modal open={!!detailModal} onClose={() => setDetailModal(null)} title="Agreement Details" size="lg">
        {detailModal && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              {[
                ['Customer', detailModal.customer?.name],
                ['Item', detailModal.item?.name || detailModal.itemName],
                ['Total Price', GHS(detailModal.totalPrice)],
                ['Down Payment', GHS(detailModal.downPayment)],
                ['Total Paid', GHS(detailModal.totalPaid)],
                ['Remaining', GHS(detailModal.remaining)],
                ['Frequency', FREQ_LABELS[detailModal.paymentFrequency]],
                ['Suggested Payment', GHS(detailModal.suggestedPayment)],
                ['Status', detailModal.status],
                ['Started', new Date(detailModal.createdAt).toLocaleDateString()],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>{k}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2, textTransform: 'capitalize' }}>{String(v)}</div>
                </div>
              ))}
            </div>

            {detailModal.loan && (
              <div style={{ padding: 14, background: 'var(--blue-bg)', borderRadius: 8, marginBottom: 20, border: '1px solid #bfdbfe' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CreditCard size={13} />Linked Loan — Interest Breakdown
                </div>
                {(() => {
                  const loan = detailModal.loan;
                  const principal = Number(loan.amount ?? 0);
                  const outstanding = Number(loan.outstanding ?? 0);
                  const rate = Number(loan.interest_rate ?? loan.interestRate ?? 0);
                  const tenure = Number(loan.tenure ?? 0);
                  const monthly = Number(loan.monthly_payment ?? loan.monthlyPayment ?? 0);
                  const totalRepay = monthly * tenure;
                  const totalInterest = totalRepay - principal;
                  const paidPrincipal = principal - outstanding;
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      {[
                        ['Principal', GHS(principal)],
                        ['Outstanding', GHS(outstanding)],
                        ['Rate', `${rate}% p.a.`],
                        ['Tenure', `${tenure} months`],
                        ['Monthly Payment', GHS(monthly)],
                        ['Total Interest', GHS(totalInterest > 0 ? totalInterest : 0)],
                        ['Total Repayment', GHS(totalRepay > 0 ? totalRepay : principal)],
                        ['Paid So Far', GHS(paidPrincipal > 0 ? paidPrincipal : 0)],
                        ['Status', loan.status],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <div style={{ fontSize: 10, color: '#1e40af', fontWeight: 700, textTransform: 'uppercase' }}>{k}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e3a8a', textTransform: 'capitalize' }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Payment History ({detailModal.payments?.length})</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Amount</th><th>Remaining</th><th>By</th></tr></thead>
                <tbody>
                  {!detailModal.payments?.length ? (
                    <tr><td colSpan={4} className="table-empty">No payments yet</td></tr>
                  ) : detailModal.payments.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontSize: 12 }}>{new Date(p.createdAt).toLocaleString()}</td>
                      <td style={{ fontWeight: 700, color: 'var(--green)' }}>{GHS(p.amount)}</td>
                      <td>{GHS(p.remaining)}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{p.collectedBy || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

