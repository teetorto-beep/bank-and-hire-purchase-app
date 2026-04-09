import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, ArrowLeft, Search, Package, AlertTriangle, User, Wallet, DollarSign, ClipboardCheck } from 'lucide-react';
import { authDB } from '../../core/db';

const GHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

const CAT_ICONS = {
  savings: '💰', current: '🏦', hire_purchase: '🛍️',
  joint: '👥', fixed_deposit: '🔒', micro_savings: '🪙', susu: '🤝',
};

const STEPS = [
  { label: 'Customer', icon: User },
  { label: 'Product', icon: Wallet },
  { label: 'Deposit', icon: DollarSign },
  { label: 'Review', icon: ClipboardCheck },
];

export default function AccountOpening() {
  const { customers, accounts, products, openAccount, postTransaction, submitForApproval } = useApp();
  const navigate = useNavigate();
  const user = authDB.currentUser();
  const isTeller = user?.role === 'teller';

  const activeProducts = useMemo(() =>
    (products || []).filter(p => p.status === 'active'),
    [products]
  );

  const [step, setStep] = useState(0);
  const [custSearch, setCustSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [form, setForm] = useState({
    customerId: '', type: '',
    initialDeposit: '', depositNarration: 'Initial Deposit', requireAuth: false,
  });
  const [created, setCreated] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));
  const selectedCustomer = customers.find(c => c.id === form.customerId);

  // ── Duplicate check: active or frozen accounts of same type ────────────────
  const duplicateAccounts = useMemo(() =>
    accounts.filter(a => {
      const cid = a.customer_id || a.customerId;
      const type = a.type;
      const status = a.status;
      return cid === form.customerId &&
        type === form.type &&
        (status === 'active' || status === 'frozen');
    }),
    [accounts, form.customerId, form.type]
  );
  const hasDuplicate = duplicateAccounts.length > 0;

  const custResults = useMemo(() => {
    if (!custSearch.trim()) return customers.slice(0, 10);
    const q = custSearch.toLowerCase();
    return customers.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.ghana_card || c.ghanaCard || '').toLowerCase().includes(q)
    ).slice(0, 10);
  }, [customers, custSearch]);

  const next = () => {
    if (step === 0 && !form.customerId) { setError('Please select a customer.'); return; }
    if (step === 1) {
      if (!selectedProduct) { setError('Please select an account product.'); return; }
      if (hasDuplicate) { setError(`This customer already has an active/frozen ${selectedProduct.name} account. Delete or close it first.`); return; }
    }
    setError(''); setStep(s => s + 1);
  };
  const back = () => { setError(''); setStep(s => s - 1); };

  const submit = async () => {
    if (!selectedProduct) { setError('No product selected.'); return; }
    if (hasDuplicate) { setError('Duplicate account not allowed.'); return; }
    setSaving(true); setError('');
    try {
      const { data: acc, error: accErr } = await openAccount({
        customerId: form.customerId,
        type: selectedProduct.category,
        interestRate: selectedProduct.interest_rate ?? selectedProduct.interestRate ?? 0,
        initialDeposit: 0,
      });
      if (accErr) { setError(accErr.message || 'Failed to open account'); setSaving(false); return; }

      const depositAmt = parseFloat(form.initialDeposit) || 0;
      if (depositAmt > 0 && acc) {
        const txnData = {
          account_id: acc.id,
          type: 'credit',
          amount: depositAmt,
          narration: form.depositNarration || 'Initial Deposit',
          channel: 'teller',
        };
        if (isTeller || form.requireAuth) {
          await submitForApproval(txnData);
        } else {
          await postTransaction(txnData);
        }
      }
      setCreated(acc);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  // ── Success screen ─────────────────────────────────────────────────────────
  if (created) return (
    <div className="fade-in" style={{ maxWidth: 560, margin: '0 auto' }}>
      <div className="card" style={{ padding: 40 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 72, height: 72, background: 'var(--green-bg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <CheckCircle size={36} style={{ color: 'var(--green)' }} />
          </div>
          <h2 style={{ marginBottom: 6 }}>Account Opened</h2>
          <p style={{ color: 'var(--text-3)', fontSize: 13 }}>The account is now active and ready to use.</p>
        </div>

        {/* Account card */}
        <div style={{ background: 'linear-gradient(135deg, #1a56db, #1e40af)', borderRadius: 12, padding: 24, color: '#fff', marginBottom: 20 }}>
          <div style={{ fontSize: 11, opacity: .7, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Account Number</div>
          <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 800, letterSpacing: 2, marginBottom: 16 }}>
            {created.account_number || created.accountNumber}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 11, opacity: .7 }}>Customer</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{selectedCustomer?.name}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, opacity: .7 }}>Product</div>
              <div style={{ fontWeight: 700 }}>{selectedProduct?.name}</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          {[
            ['Interest Rate', `${created.interest_rate ?? created.interestRate ?? 0}% p.a.`],
            ['Status', 'Active'],
            ['Opened By', user?.name],
            ['Date', new Date(created.opened_at || created.openedAt || Date.now()).toLocaleDateString()],
          ].map(([k, v]) => (
            <div key={k} style={{ padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>{k}</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{v}</div>
            </div>
          ))}
        </div>

        {(isTeller || form.requireAuth) && parseFloat(form.initialDeposit) > 0 && (
          <div className="alert alert-warning" style={{ marginBottom: 16 }}>
            Initial deposit of {GHS(parseFloat(form.initialDeposit))} submitted for authoriser approval.
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => {
            setStep(0); setSelectedProduct(null);
            setForm({ customerId: '', type: '', initialDeposit: '', depositNarration: 'Initial Deposit', requireAuth: false });
            setCreated(null); setCustSearch('');
          }}>Open Another</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => navigate('/accounts')}>View Accounts</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fade-in" style={{ maxWidth: 700, margin: '0 auto' }}>
      <div className="page-header">
        <div className="page-header-left">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/accounts')} style={{ marginBottom: 4 }}>
            <ArrowLeft size={14} /> Back
          </button>
          <div className="page-title">Open New Account</div>
        </div>
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28, background: 'var(--surface)', borderRadius: 12, padding: '16px 20px', border: '1px solid var(--border)' }}>
        {STEPS.map((s, i) => (
          <React.Fragment key={s.label}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: i < STEPS.length - 1 ? 'none' : 'none' }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, flexShrink: 0, transition: 'all .2s',
                background: step > i ? 'var(--green)' : step === i ? 'var(--brand)' : 'var(--surface-2)',
                color: step >= i ? '#fff' : 'var(--text-3)',
                border: step === i ? '2px solid var(--brand)' : step > i ? '2px solid var(--green)' : '2px solid var(--border)',
              }}>
                {step > i ? '✓' : <s.icon size={15} />}
              </div>
              <span style={{ fontSize: 12, fontWeight: step === i ? 700 : 500, color: step === i ? 'var(--text)' : step > i ? 'var(--green)' : 'var(--text-3)', whiteSpace: 'nowrap' }}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: step > i ? 'var(--green)' : 'var(--border)', margin: '0 12px', borderRadius: 2, transition: 'background .2s' }} />
            )}
          </React.Fragment>
        ))}
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <AlertTriangle size={14} />{error}
        </div>
      )}

      {/* ── Step 0: Customer ─────────────────────────────────────────────── */}
      {step === 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Select Customer</div>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{customers.length} customers</span>
          </div>
          <div className="search-box" style={{ marginBottom: 14 }}>
            <Search size={14} />
            <input className="form-control" placeholder="Search by name, phone, or Ghana Card…"
              value={custSearch} onChange={e => setCustSearch(e.target.value)} autoFocus />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
            {custResults.length === 0 && (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-3)', fontSize: 13 }}>No customers found</div>
            )}
            {custResults.map(c => {
              const kycStatus = c.kyc_status || c.kycStatus;
              const ghanaCard = c.ghana_card || c.ghanaCard;
              const custAccounts = accounts.filter(a => (a.customer_id || a.customerId) === c.id);
              const isSelected = form.customerId === c.id;
              return (
                <div key={c.id} onClick={() => setForm(p => ({ ...p, customerId: c.id }))}
                  style={{ padding: '12px 14px', border: `2px solid ${isSelected ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 10, cursor: 'pointer', background: isSelected ? 'var(--brand-light)' : 'var(--surface)', transition: 'all .15s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 38, height: 38, borderRadius: '50%', background: isSelected ? 'var(--brand)' : 'var(--surface-2)', border: `2px solid ${isSelected ? 'var(--brand)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isSelected ? '#fff' : 'var(--text-3)', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                      {c.name?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>
                        {c.phone}{ghanaCard ? ` · ${ghanaCard}` : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: kycStatus === 'verified' ? 'var(--green-bg)' : 'var(--yellow-bg)', color: kycStatus === 'verified' ? '#065f46' : '#92400e' }}>
                      {kycStatus}
                    </span>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{custAccounts.length} account(s)</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={next} disabled={!form.customerId}>
              Next → Select Product
            </button>
          </div>
        </div>
      )}

      {/* ── Step 1: Product ──────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Choose Account Product</div>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{activeProducts.length} available</span>
          </div>

          {activeProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48 }}>
              <Package size={40} style={{ color: 'var(--text-3)', margin: '0 auto 12px', display: 'block' }} />
              <div style={{ fontWeight: 700, marginBottom: 6 }}>No products configured</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>Create products in Bank Products first.</div>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/products')}>Go to Bank Products</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activeProducts.map(p => {
                const rate = p.interest_rate ?? p.interestRate ?? 0;
                const minBal = p.min_balance ?? p.minBalance ?? 0;
                const icon = CAT_ICONS[p.category] || '🏦';
                const isSelected = selectedProduct?.id === p.id;
                // Check if this product type already has active/frozen account
                const existingActive = accounts.filter(a =>
                  (a.customer_id || a.customerId) === form.customerId &&
                  a.type === p.category &&
                  (a.status === 'active' || a.status === 'frozen')
                );
                const blocked = existingActive.length > 0;

                return (
                  <div key={p.id}
                    onClick={() => {
                      if (blocked) return;
                      setSelectedProduct(p);
                      setForm(f => ({ ...f, type: p.category }));
                    }}
                    style={{
                      padding: '14px 16px', borderRadius: 10, transition: 'all .15s',
                      border: `2px solid ${blocked ? 'var(--border)' : isSelected ? 'var(--brand)' : 'var(--border)'}`,
                      background: blocked ? 'var(--surface-2)' : isSelected ? 'var(--brand-light)' : 'var(--surface)',
                      cursor: blocked ? 'not-allowed' : 'pointer',
                      opacity: blocked ? 0.6 : 1,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span style={{ fontSize: 26 }}>{icon}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{p.description || p.category}</div>
                        {blocked && (
                          <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <AlertTriangle size={11} />
                            Customer already has an active {p.name} account
                          </div>
                        )}
                        {!blocked && p.benefits?.length > 0 && (
                          <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 4 }}>
                            ✓ {p.benefits.slice(0, 2).join(' · ')}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: blocked ? 'var(--text-3)' : 'var(--brand)' }}>{rate}% p.a.</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Min: {GHS(minBal)}</div>
                      {(p.monthly_fee ?? p.monthlyFee) > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Fee: {GHS(p.monthly_fee ?? p.monthlyFee)}/mo</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between' }}>
            <button className="btn btn-secondary" onClick={back}>← Back</button>
            <button className="btn btn-primary" onClick={next} disabled={!selectedProduct || hasDuplicate}>
              Next → Initial Deposit
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Initial Deposit ──────────────────────────────────────── */}
      {step === 2 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Initial Deposit</div>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Optional</span>
          </div>

          {/* Selected product summary */}
          <div style={{ padding: 14, background: 'var(--brand-light)', borderRadius: 10, border: '1px solid #bfdbfe', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 28 }}>{CAT_ICONS[selectedProduct?.category] || '🏦'}</span>
            <div>
              <div style={{ fontWeight: 700 }}>{selectedProduct?.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {selectedProduct?.interest_rate ?? 0}% p.a. · Min: {GHS(selectedProduct?.min_balance ?? 0)}
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Deposit Amount (GH₵)</label>
            <input className="form-control" type="number" min="0" step="0.01"
              value={form.initialDeposit} onChange={f('initialDeposit')}
              placeholder="0.00" style={{ fontSize: 22, fontWeight: 700, textAlign: 'center' }} />
            {(selectedProduct?.min_balance ?? 0) > 0 && (
              <div className="form-hint">Minimum balance: {GHS(selectedProduct?.min_balance ?? 0)}</div>
            )}
          </div>

          {parseFloat(form.initialDeposit) > 0 && (
            <div className="form-group">
              <label className="form-label">Narration</label>
              <input className="form-control" value={form.depositNarration} onChange={f('depositNarration')} />
            </div>
          )}

          {parseFloat(form.initialDeposit) > 0 && !isTeller && (
            <div style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 8, marginBottom: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.requireAuth} onChange={e => setForm(p => ({ ...p, requireAuth: e.target.checked }))} style={{ width: 16, height: 16, accentColor: 'var(--brand)' }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Require authoriser approval for deposit</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Account opens now; deposit posts after approval</div>
                </div>
              </label>
            </div>
          )}
          {isTeller && parseFloat(form.initialDeposit) > 0 && (
            <div className="alert alert-warning">Deposit will be submitted for authoriser approval.</div>
          )}

          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between' }}>
            <button className="btn btn-secondary" onClick={back}>← Back</button>
            <button className="btn btn-primary" onClick={next}>Next → Review</button>
          </div>
        </div>
      )}

      {/* ── Step 3: Review ───────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="card">
          <div className="card-header"><div className="card-title">Review & Confirm</div></div>

          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            {[
              ['Customer', selectedCustomer?.name],
              ['Phone', selectedCustomer?.phone],
              ['KYC', selectedCustomer?.kyc_status || selectedCustomer?.kycStatus],
              ['Product', selectedProduct?.name],
              ['Category', selectedProduct?.category?.replace(/_/g, ' ')],
              ['Interest Rate', `${selectedProduct?.interest_rate ?? 0}% p.a.`],
              ['Initial Deposit', parseFloat(form.initialDeposit) > 0 ? GHS(parseFloat(form.initialDeposit)) : 'None'],
              ['Deposit Approval', isTeller || form.requireAuth ? 'Required' : 'Direct'],
              ['Opened By', user?.name],
              ['Role', user?.role],
            ].map(([k, v]) => (
              <div key={k} style={{ padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'capitalize' }}>{v || '—'}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button className="btn btn-secondary" onClick={back}>← Back</button>
            <button className="btn btn-primary btn-lg" onClick={submit} disabled={saving}>
              {saving ? 'Opening Account…' : '✓ Confirm & Open Account'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
