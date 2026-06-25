import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle, Search, AlertCircle,
  ShoppingBag, Package, Edit2, X, CreditCard, TrendingUp,
} from 'lucide-react';
import { loadApprovalRules, requiresApproval } from '../../core/approvalRules';
import { authDB } from '../../core/db';
import { supabase } from '../../core/supabase';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const GHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

// Amortization (reducing balance) — standard banking
function calcAmortization(principal, annualRate, months) {
  if (!principal || !months) return { monthly: 0, total: principal, interest: 0 };
  const r = annualRate / 100 / 12;
  if (r === 0) return { monthly: principal / months, total: principal, interest: 0 };
  const monthly = (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  const total = monthly * months;
  return { monthly, total, interest: total - principal };
}

// Flat rate — simple interest on original principal
function calcFlatRate(principal, annualRate, months) {
  if (!principal || !months) return { monthly: 0, total: principal, interest: 0 };
  const totalInterest = principal * (annualRate / 100) * (months / 12);
  const total = principal + totalInterest;
  return { monthly: total / months, total, interest: totalInterest };
}

function calcLoan(principal, annualRate, months, method = 'amortization') {
  const result = method === 'flat'
    ? calcFlatRate(principal, annualRate, months)
    : calcAmortization(principal, annualRate, months);
  return {
    monthly: Math.round(result.monthly * 100) / 100,
    total: Math.round(result.total * 100) / 100,
    interest: Math.round(result.interest * 100) / 100,
    // Daily and weekly equivalents
    daily: Math.round((result.monthly / 30) * 100) / 100,
    weekly: Math.round((result.monthly / 4.33) * 100) / 100,
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────
const LOAN_CATEGORIES = [
  'personal', 'hire_purchase', 'micro', 'mortgage', 'emergency', 'group',
];
const FREQ_OPTIONS = [
  { value: 'daily',   label: 'Daily'   },
  { value: 'weekly',  label: 'Weekly'  },
  { value: 'monthly', label: 'Monthly' },
];

const CATEGORY_LABELS = {
  personal:      'Personal',
  hire_purchase: 'Hire Purchase',
  micro:         'Micro',
  mortgage:      'Mortgage',
  emergency:     'Emergency',
  group:         'Group',
};

export default function LoanApplication() {
  const navigate = useNavigate();
  const {
    customers, accounts, products, hpItems,
    addLoan, updateLoan, createHPAgreementWithLoan,
  } = useApp();
  const user     = authDB.currentUser();
  const isTeller = user?.role === 'teller';

  // ── Form state ──────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    customerId: '', accountId: '', productId: '',
    amount: '', tenure: '', interestRate: '', purpose: '',
    paymentFrequency: 'monthly', downPayment: '',
    calcMethod: 'amortization',
    requireAuth: false,
  });
  // Multi-item basket: [{ item, qty }]
  const [basket,       setBasket]       = useState([]);
  const [manualTotal,  setManualTotal]  = useState(''); // manual loan amount override
  const [shopOpen,     setShopOpen]     = useState(false); // popup shop modal
  const [custSearch,   setCustSearch]   = useState('');
  const [rateEdited,   setRateEdited]   = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState('');
  const [success,      setSuccess]      = useState(null);
  const [editingRate,  setEditingRate]  = useState(false);
  const [itemCategory, setItemCategory] = useState('All');
  const [itemSearch,   setItemSearch]   = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // ── Derived values ──────────────────────────────────────────────────────────
  const loanProducts = useMemo(
    () => (products || []).filter(p => p.status === 'active' && LOAN_CATEGORIES.includes(p.category)),
    [products]
  );

  const selectedProduct  = loanProducts.find(p => p.id === form.productId);
  const isHP             = selectedProduct?.category === 'hire_purchase';
  const rate             = rateEdited ? parseFloat(form.interestRate) || 0 : (selectedProduct?.interestRate ?? 0);
  const maxTenure        = selectedProduct?.tenureMonths ?? 360;

  const custAccounts     = (accounts || []).filter(a => a.customerId === form.customerId && a.status === 'active');
  const selectedCustomer = (customers || []).find(c => c.id === form.customerId);
  const selectedAccount  = custAccounts.find(a => a.id === form.accountId);

  // Show ALL items (including out-of-stock) so customers can still select them
  const hpItemsInStock   = useMemo(
    () => (hpItems || []),
    [hpItems]
  );

  const itemCategories = useMemo(() => {
    const cats = [...new Set(hpItemsInStock.map(i => i.category).filter(Boolean))];
    return ['All', ...cats];
  }, [hpItemsInStock]);

  const filteredItems = useMemo(() => {
    let items = itemCategory === 'All' ? hpItemsInStock : hpItemsInStock.filter(i => i.category === itemCategory);
    if (itemSearch.trim()) {
      const q = itemSearch.toLowerCase();
      items = items.filter(i => i.name?.toLowerCase().includes(q) || i.category?.toLowerCase().includes(q));
    }
    return items;
  }, [hpItemsInStock, itemCategory, itemSearch]);

  // Basket helpers
  const basketTotal  = basket.reduce((s, b) => s + b.item.price * b.qty, 0);
  const downPayment  = parseFloat(form.downPayment) || 0;
  // Use manual total if entered, otherwise use basket total (for all loan types)
  const effectiveTotal = manualTotal !== '' ? (parseFloat(manualTotal) || 0) : basketTotal;
  const loanPrincipal = isHP
    ? Math.max(0, effectiveTotal - downPayment)
    : effectiveTotal > 0
      ? Math.max(0, effectiveTotal - downPayment)  // cart total used for any loan type
      : parseFloat(form.amount) || 0;

  const addToBasket = (item) => {
    setBasket(p => {
      const existing = p.find(b => b.item.id === item.id);
      if (existing) return p.map(b => b.item.id === item.id ? { ...b, qty: b.qty + 1 } : b);
      return [...p, { item, qty: 1 }];
    });
  };
  const removeFromBasket = (itemId) => setBasket(p => p.filter(b => b.item.id !== itemId));
  const setBasketQty = (itemId, qty) => {
    const q = Math.max(1, parseInt(qty) || 1);
    setBasket(p => p.map(b => b.item.id === itemId ? { ...b, qty: q } : b));
  };

  const tenure       = parseInt(form.tenure) || 0;
  const loanCalc     = calcLoan(loanPrincipal, rate, tenure, form.calcMethod);
  const monthly      = loanCalc.monthly;
  const totalRepay   = loanCalc.total;
  const totalInterest = loanCalc.interest;

  const custResults = useMemo(() => {
    if (!custSearch.trim()) return [];
    const q = custSearch.toLowerCase();
    return (customers || [])
      .filter(c => c.name?.toLowerCase().includes(q) || c.phone?.includes(q))
      .slice(0, 8);
  }, [customers, custSearch]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  // For UI display — tellers always show "Submit for Approval" button label
  const willAuth = isTeller || form.requireAuth;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.customerId) return setError('Please select a customer.');
    if (!form.accountId)  return setError('Please select an account.');
    if (!form.productId)  return setError('Please select a loan product.');
    if (!tenure || tenure < 1) return setError('Please enter a valid tenure.');

    setSubmitting(true);
    try {
      // Check loan_creation approval rule from DB
      const rules = await loadApprovalRules();
      const role  = user?.role || 'teller';
      const needsApproval = requiresApproval('loan_creation', role, 0, rules) || form.requireAuth;
      if (isHP) {
        if (basket.length === 0 && effectiveTotal <= 0) { setError('Please select items from the shop or enter a loan amount.'); setSubmitting(false); return; }
        // Use first item for the HP agreement record; total covers all items
        const firstItem = basket[0].item;
        const itemNames = basket.map(b => b.qty > 1 ? `${b.item.name} x${b.qty}` : b.item.name).join(', ');
        const payload = {
          customerId:       form.customerId,
          accountId:        form.accountId,
          itemId:           firstItem.id,
          itemName:         basket.length === 1 ? firstItem.name : `${basket.length} items: ${itemNames}`,
          totalPrice:       effectiveTotal,
          downPayment,
          interestRate:     rate,
          tenure,
          paymentFrequency: form.paymentFrequency,
          purpose:          form.purpose || itemNames,
          monthlyPayment:   monthly,
          totalRepayment:   totalRepay,
          suggestedPayment: monthly,
        };
        const { data, error: err } = await createHPAgreementWithLoan(payload);
        if (err) throw new Error(err.message || 'Failed to create HP agreement.');

        // ── Auto-insert basket items into hp_loan_items ──────────────────
        // data.loan contains the created loan record
        const loanId = data?.loan?.id;
        if (loanId && basket.length > 0) {
          const rows = basket.map(b => ({
            loan_id:    loanId,
            item_id:    b.item.id,
            quantity:   b.qty,
            unit_price: b.item.price,
            item_name:  b.item.name,
            item_image: b.item.image || '',
            added_by:   user?.name || 'Loan Application',
          }));
          // Insert all basket items — ignore duplicates silently
          const { error: itemsErr } = await supabase
            .from('hp_loan_items')
            .insert(rows);
          if (itemsErr) console.warn('[HP Loan Items] Insert error:', itemsErr.message);
        }

        setSuccess({ type: 'hp', data, basket, customer: selectedCustomer, product: selectedProduct, pending: false });
      } else {
        // For non-HP: use cart total if no manual amount entered
        const finalAmount = parseFloat(form.amount) > 0 ? parseFloat(form.amount) : effectiveTotal;
        if (!finalAmount || finalAmount <= 0) { setError('Please enter a loan amount or select items from the shop.'); setSubmitting(false); return; }
        const payload = {
          customerId:     form.customerId,
          accountId:      form.accountId,
          type:           selectedProduct?.category || 'personal',
          amount:         finalAmount,
          interestRate:   rate,
          tenure,
          monthlyPayment: monthly,
          totalRepayment: totalRepay,
          purpose:        form.purpose,
          calcMethod:     form.calcMethod,
        };
        const { data, error: err } = await addLoan(payload);
        if (err) throw new Error(err.message || 'Failed to submit loan application.');

        // If no approval needed → disburse immediately
        if (!needsApproval && data) {
          await updateLoan(data.id, {
            status:        'active',
            disbursed_at:  new Date().toISOString(),
            next_due_date: new Date(Date.now() + 30 * 86400000).toISOString(),
          });
        }

        setSuccess({ type: 'loan', data, customer: selectedCustomer, product: selectedProduct, pending: needsApproval });
      }
    } catch (ex) {
      setError(ex.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setForm({ customerId: '', accountId: '', productId: '', amount: '', tenure: '', interestRate: '', purpose: '', paymentFrequency: 'monthly', downPayment: '', calcMethod: 'amortization', requireAuth: false });
    setBasket([]); setManualTotal(''); setCustSearch(''); setRateEdited(false); setEditingRate(false); setSuccess(null); setError(''); setItemSearch('');
  };

  // ── Success screen ──────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="page-content" style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="card" style={{ textAlign: 'center', padding: '48px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <CheckCircle size={56} color="var(--green)" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
            {success.type === 'hp' ? 'HP Agreement Created!' : success.pending ? 'Application Submitted!' : 'Loan Disbursed!'}
          </h2>
          <p style={{ color: 'var(--text-2)', marginBottom: 28 }}>
            {success.type === 'hp'
              ? 'The hire purchase agreement and linked loan have been created successfully.'
              : success.pending
                ? 'The loan application is pending approval. Approve it from the Loans page.'
                : 'The loan has been disbursed and is now active.'}
          </p>

          <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-lg)', padding: '20px 24px', textAlign: 'left', marginBottom: 28 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Customer</div>
                <div style={{ fontWeight: 700, marginTop: 2 }}>{success.customer?.name}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Product</div>
                <div style={{ fontWeight: 700, marginTop: 2 }}>{success.product?.name}</div>
              </div>
              {success.type === 'hp' && success.basket?.length > 0 && (
                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>Items Purchased</div>
                  {success.basket.map(b => (
                    <div key={b.item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                      <span>{b.item.image || '📦'} {b.item.name}{b.qty > 1 ? ` x${b.qty}` : ''}</span>
                      <span style={{ fontWeight: 600 }}>{GHS(b.item.price * b.qty)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Principal</div>
                <div style={{ fontWeight: 700, marginTop: 2, color: 'var(--brand)' }}>{GHS(loanPrincipal)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Monthly Payment</div>
                <div style={{ fontWeight: 700, marginTop: 2, color: 'var(--green)' }}>{GHS(monthly)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Total Repayment</div>
                <div style={{ fontWeight: 700, marginTop: 2 }}>{GHS(totalRepay)}</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={resetForm}>
              <CreditCard size={15} /> New Application
            </button>
            <button className="btn btn-primary" onClick={() => navigate('/loans')}>
              <TrendingUp size={15} /> View Loans
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn btn-ghost btn-icon" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800 }}>Loan Application</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>
            Regular loans &amp; hire purchase — one unified form
          </p>
        </div>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--red-bg)', color: '#991b1b', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 20, fontSize: 13 }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>

          {/* ── LEFT COLUMN ─────────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* STEP 1 — Customer */}
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Step 1 — Customer</div>
                  <div className="card-subtitle">Search and select the applicant</div>
                </div>
              </div>

              {!form.customerId ? (
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                    <input
                      className="form-control"
                      style={{ paddingLeft: 32 }}
                      placeholder="Search by name or phone…"
                      value={custSearch}
                      onChange={e => setCustSearch(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  {custResults.length > 0 && (
                    <div style={{ position: 'absolute', zIndex: 50, top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-md)', marginTop: 4, overflow: 'hidden' }}>
                      {custResults.map(c => (
                        <div
                          key={c.id}
                          style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                          onMouseLeave={e => e.currentTarget.style.background = ''}
                          onClick={() => { set('customerId', c.id); set('accountId', ''); setCustSearch(''); }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{c.phone}</div>
                          </div>
                          <span className={`badge badge-${c.kycStatus === 'verified' ? 'green' : 'yellow'}`}>{c.kycStatus}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {custSearch.trim() && custResults.length === 0 && (
                    <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-3)' }}>No customers found.</div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--brand-light)', borderRadius: 'var(--radius)', padding: '12px 14px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{selectedCustomer?.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                      {selectedCustomer?.phone}
                      {selectedCustomer?.monthlyIncome > 0 && (
                        <span style={{ marginLeft: 12 }}>Income: {GHS(selectedCustomer.monthlyIncome)}/mo</span>
                      )}
                    </div>
                  </div>
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => { set('customerId', ''); set('accountId', ''); }}>
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* STEP 2 — Account */}
            {form.customerId && (
              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Step 2 — Account</div>
                    <div className="card-subtitle">Select the linked account for disbursement</div>
                  </div>
                </div>
                {custAccounts.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '8px 0' }}>No active accounts found for this customer.</div>
                ) : (
                  <>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <select
                        className="form-control"
                        value={form.accountId}
                        onChange={e => set('accountId', e.target.value)}
                      >
                        <option value="">— Select account —</option>
                        {custAccounts.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.accountNumber} · {a.type} · {GHS(a.balance)}
                          </option>
                        ))}
                      </select>
                    </div>
                    {selectedAccount && (
                      <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-2)', background: 'var(--surface-2)', borderRadius: 'var(--radius)', padding: '8px 12px' }}>
                        Balance: <strong style={{ color: selectedAccount.balance >= 0 ? 'var(--green)' : 'var(--red)' }}>{GHS(selectedAccount.balance)}</strong>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* STEP 3 — Loan Product */}
            {form.customerId && (
              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Step 3 — Loan Product</div>
                    <div className="card-subtitle">Choose the loan type</div>
                  </div>
                </div>
                {loanProducts.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-3)' }}>No active loan products configured.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {loanProducts.map(p => {
                      const hp = p.category === 'hire_purchase';
                      const selected = form.productId === p.id;
                      return (
                        <div
                          key={p.id}
                          onClick={() => {
                            set('productId', p.id);
                            if (!rateEdited) set('interestRate', p.interestRate ?? 0);
                            set('itemId', '');
                          }}
                          style={{
                            border: `2px solid ${selected ? 'var(--brand)' : 'var(--border)'}`,
                            borderRadius: 'var(--radius-lg)',
                            padding: '14px',
                            cursor: 'pointer',
                            background: selected ? 'var(--brand-light)' : 'var(--surface)',
                            transition: 'all .15s',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
                            <span className={`badge ${hp ? 'badge-purple' : 'badge-blue'}`}>
                              {hp ? '🛍️ HP' : CATEGORY_LABELS[p.category] || p.category}
                            </span>
                          </div>
                          <div style={{ fontSize: 22, fontWeight: 800, color: hp ? 'var(--purple)' : 'var(--brand)', marginBottom: 4 }}>
                            {p.interestRate}%
                            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-3)', marginLeft: 4 }}>p.a.</span>
                          </div>
                          {p.tenureMonths && (
                            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>Up to {p.tenureMonths} months</div>
                          )}
                          {Array.isArray(p.benefits) && p.benefits.slice(0, 2).map((b, i) => (
                            <div key={i} style={{ fontSize: 11, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                              <span style={{ color: 'var(--green)' }}>✓</span> {b}
                            </div>
                          ))}
                          {hp && (
                            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--purple)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Package size={11} /> Includes item catalogue
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* STEP 4 — Shop Catalogue (available for all loan types) */}
            {form.productId && (
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: basket.length > 0 ? 14 : 0 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ShoppingBag size={16} style={{ color: '#7c3aed' }} /> Step 4 — Select Items (Optional)
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
                      {basket.length === 0 ? 'Browse the shop and add items — total auto-fills the loan amount' : `${basket.length} item${basket.length !== 1 ? 's' : ''} in cart · Total: ${GHS(basketTotal)}`}
                    </div>
                  </div>
                  <button type="button" className="btn btn-primary"
                    onClick={() => setShopOpen(true)}
                    style={{ background: 'linear-gradient(135deg, #1e40af, #7c3aed)', border: 'none' }}>
                    <ShoppingBag size={14} /> {basket.length > 0 ? 'Edit Cart' : 'Open Shop'}
                  </button>
                </div>

                {/* Cart preview */}
                {basket.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    {basket.map((b, i) => (
                      <div key={b.item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: i < basket.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <span style={{ fontSize: 18 }}>{b.item.image || '📦'}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{b.item.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{GHS(b.item.price)} × {b.qty}</div>
                        </div>
                        <span style={{ fontWeight: 700, color: '#7c3aed' }}>{GHS(b.item.price * b.qty)}</span>
                        <button type="button" onClick={() => removeFromBasket(b.item.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 2, display: 'flex' }}>
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 14, paddingTop: 10, marginTop: 4, borderTop: '2px solid #7c3aed' }}>
                      <span>Cart Total</span>
                      <span style={{ color: '#7c3aed' }}>{GHS(basketTotal)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Shop Popup Modal */}
            {form.productId && shopOpen && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                onClick={e => { if (e.target === e.currentTarget) setShopOpen(false); }}>
                <div style={{ background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 900, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                  {/* Modal header */}
                  <div style={{ background: 'linear-gradient(135deg, #1e40af, #7c3aed)', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ color: '#fff' }}>
                      <div style={{ fontWeight: 800, fontSize: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <ShoppingBag size={20} /> HP Item Shop
                      </div>
                      <div style={{ fontSize: 12, opacity: .8, marginTop: 2 }}>
                        {hpItems.length} items available · {basket.length} in cart · {GHS(basketTotal)}
                      </div>
                    </div>
                    <button type="button" onClick={() => setShopOpen(false)}
                      style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, padding: '8px 16px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                      Done ✓
                    </button>
                  </div>

                  {/* Search + filters */}
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                      <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
                      <input className="form-control" placeholder="Search items..."
                        value={itemSearch} onChange={e => setItemSearch(e.target.value)}
                        style={{ paddingLeft: 30, fontSize: 13 }} autoFocus />
                    </div>
                    {['All', ...new Set((hpItems || []).map(i => i.category).filter(Boolean))].map(cat => (
                      <button key={cat} type="button" onClick={() => setItemCategory(cat)}
                        style={{ padding: '5px 14px', borderRadius: 20, border: `1.5px solid ${itemCategory === cat ? '#7c3aed' : 'var(--border)'}`, background: itemCategory === cat ? '#7c3aed' : 'var(--surface)', color: itemCategory === cat ? '#fff' : 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Item grid — scrollable */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                    {(() => {
                      let items = itemCategory === 'All' ? (hpItems || []) : (hpItems || []).filter(i => i.category === itemCategory);
                      if (itemSearch.trim()) {
                        const q = itemSearch.toLowerCase();
                        items = items.filter(i => i.name?.toLowerCase().includes(q) || i.category?.toLowerCase().includes(q));
                      }
                      if (items.length === 0) return (
                        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>
                          <Package size={40} style={{ opacity: .2, display: 'block', margin: '0 auto 12px' }} />
                          <div style={{ fontWeight: 600 }}>No items match your filter</div>
                        </div>
                      );
                      return (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 12 }}>
                          {items.map(item => {
                            const inBasket = basket.find(b => b.item.id === item.id);
                            return (
                              <div key={item.id} style={{ border: `2px solid ${inBasket ? '#7c3aed' : 'var(--border)'}`, borderRadius: 12, overflow: 'hidden', background: inBasket ? '#faf5ff' : 'var(--surface)', position: 'relative' }}>
                                {inBasket && (
                                  <div style={{ position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: '50%', background: '#7c3aed', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                                    {inBasket.qty}
                                  </div>
                                )}
                                <div style={{ padding: '14px 12px 8px', textAlign: 'center' }}>
                                  <div style={{ fontSize: 34, marginBottom: 6 }}>{item.image || '📦'}</div>
                                  <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.3, marginBottom: 3 }}>{item.name}</div>
                                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4 }}>{item.category}</div>
                                  <div style={{ fontWeight: 900, fontSize: 15, color: inBasket ? '#7c3aed' : 'var(--brand)' }}>{GHS(item.price)}</div>
                                </div>
                                <div style={{ padding: '0 8px 10px', display: 'flex', gap: 4 }}>
                                  {inBasket ? (
                                    <>
                                      <button type="button" onClick={() => setBasketQty(item.id, Math.max(1, inBasket.qty - 1))}
                                        style={{ flex: 1, padding: '4px 0', border: '1px solid #7c3aed', borderRadius: 6, background: '#fff', color: '#7c3aed', fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>−</button>
                                      <span style={{ flex: 1, textAlign: 'center', fontWeight: 800, fontSize: 13, lineHeight: '28px', color: '#7c3aed' }}>{inBasket.qty}</span>
                                      <button type="button" onClick={() => setBasketQty(item.id, inBasket.qty + 1)}
                                        style={{ flex: 1, padding: '4px 0', border: '1px solid #7c3aed', borderRadius: 6, background: '#7c3aed', color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>+</button>
                                      <button type="button" onClick={() => removeFromBasket(item.id)}
                                        style={{ padding: '4px 7px', border: '1px solid var(--red)', borderRadius: 6, background: '#fff', color: 'var(--red)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                        <X size={11} />
                                      </button>
                                    </>
                                  ) : (
                                    <button type="button" onClick={() => addToBasket(item)}
                                      style={{ flex: 1, padding: '6px 0', border: 'none', borderRadius: 6, background: '#7c3aed', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                                      + Add
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Cart footer */}
                  {basket.length > 0 && (
                    <div style={{ padding: '14px 24px', borderTop: '2px solid #7c3aed', background: '#faf5ff', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 13, color: '#5b21b6' }}>
                        <strong>{basket.length}</strong> item{basket.length !== 1 ? 's' : ''} · <strong>{GHS(basketTotal)}</strong> total
                      </div>
                      <button type="button" className="btn btn-primary" onClick={() => setShopOpen(false)}
                        style={{ background: '#7c3aed', border: 'none' }}>
                        ✓ Done — Use This Cart
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 5 — Loan Details */}
            {form.productId && (
              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Step {isHP ? '5' : '4'} — Loan Details</div>
                    <div className="card-subtitle">Configure the loan terms</div>
                  </div>
                </div>

                {isHP ? (
                  <>
                    {/* Manual total override */}
                    <div className="form-group" style={{ marginBottom: 16, padding: 14, background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <label className="form-label" style={{ marginBottom: 6 }}>
                        Loan Total Amount
                        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>
                          {manualTotal !== '' ? '(manual override)' : `(from cart: ${GHS(basketTotal)})`}
                        </span>
                      </label>
                      <input
                        type="number"
                        className="form-control"
                        placeholder={basketTotal > 0 ? `Cart total: ${basketTotal}` : 'Enter total loan amount…'}
                        min="0"
                        step="0.01"
                        value={manualTotal}
                        onChange={e => setManualTotal(e.target.value)}
                        style={{ fontSize: 20, fontWeight: 700, textAlign: 'center' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                        <div className="form-hint">
                          Leave blank to use cart total · Enter a custom amount to override
                        </div>
                        {manualTotal !== '' && (
                          <button type="button" className="btn btn-ghost btn-sm"
                            onClick={() => setManualTotal('')}
                            style={{ fontSize: 11, color: 'var(--text-3)', padding: '2px 8px' }}>
                            Reset to cart total
                          </button>
                        )}
                      </div>
                      {manualTotal !== '' && basketTotal > 0 && (
                        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--brand)', fontWeight: 600 }}>
                          Using manual total: {GHS(parseFloat(manualTotal) || 0)} (cart was {GHS(basketTotal)})
                        </div>
                      )}
                    </div>

                    <div className="form-row" style={{ marginBottom: 16 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Down Payment</label>
                        <input
                          type="number"
                          className="form-control"
                          placeholder="0.00"
                          min="0"
                          max={effectiveTotal || undefined}
                          value={form.downPayment}
                          onChange={e => set('downPayment', e.target.value)}
                        />
                        {effectiveTotal > 0 && (
                          <div className="form-hint">Max: {GHS(effectiveTotal)}</div>
                        )}
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Payment Frequency</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {FREQ_OPTIONS.map(opt => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => set('paymentFrequency', opt.value)}
                              style={{
                                flex: 1,
                                padding: '8px 4px',
                                borderRadius: 'var(--radius)',
                                border: `1px solid ${form.paymentFrequency === opt.value ? 'var(--brand)' : 'var(--border)'}`,
                                background: form.paymentFrequency === opt.value ? 'var(--brand)' : 'var(--surface)',
                                color: form.paymentFrequency === opt.value ? '#fff' : 'var(--text-2)',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all .15s',
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="form-group">
                    <label className="form-label">Loan Amount <span className="required">*</span></label>
                    {effectiveTotal > 0 && (
                      <div style={{ marginBottom: 8, padding: '8px 12px', background: 'var(--brand-light)', borderRadius: 8, fontSize: 13, color: 'var(--brand)', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Cart total: {GHS(effectiveTotal)}</span>
                        <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                          onClick={() => set('amount', String(effectiveTotal))}>
                          Use cart total
                        </button>
                      </div>
                    )}
                    <input
                      type="number"
                      className="form-control"
                      placeholder={effectiveTotal > 0 ? `Cart total: ${effectiveTotal} — or enter custom amount` : 'Enter amount'}
                      min="1"
                      value={form.amount}
                      onChange={e => set('amount', e.target.value)}
                    />
                    {selectedProduct?.minBalance > 0 && (
                      <div className="form-hint">Min: {GHS(selectedProduct.minBalance)}{selectedProduct.maxBalance ? ` · Max: ${GHS(selectedProduct.maxBalance)}` : ''}</div>
                    )}
                  </div>
                )}

                <div className="form-row">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Tenure (months) <span className="required">*</span></label>
                    <input
                      type="number"
                      className="form-control"
                      placeholder="e.g. 12"
                      min="1"
                      max={maxTenure}
                      value={form.tenure}
                      onChange={e => set('tenure', e.target.value)}
                    />
                    <div className="form-hint">Max: {maxTenure} months</div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Interest Rate (% p.a.)</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="number"
                        className="form-control"
                        value={editingRate ? form.interestRate : rate}
                        disabled={!editingRate}
                        min="0"
                        step="0.1"
                        onChange={e => { set('interestRate', e.target.value); setRateEdited(true); }}
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-icon btn-sm"
                        title={editingRate ? 'Lock rate' : 'Edit rate'}
                        onClick={() => {
                          if (!editingRate) set('interestRate', rate);
                          setEditingRate(v => !v);
                          if (editingRate) setRateEdited(true);
                        }}
                      >
                        {editingRate ? <X size={14} /> : <Edit2 size={14} />}
                      </button>
                    </div>
                    {!editingRate && selectedProduct && (
                      <div className="form-hint">From product: {selectedProduct.interestRate}%</div>
                    )}
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: 16, marginBottom: 0 }}>
                  <label className="form-label">Purpose / Notes</label>
                  <textarea
                    className="form-control"
                    placeholder="Describe the purpose of this loan…"
                    rows={3}
                    value={form.purpose}
                    onChange={e => set('purpose', e.target.value)}
                  />
                </div>

                {/* Calculation Method */}
                <div style={{ marginTop: 16, padding: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>
                    Interest Calculation Method
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {[
                      { value: 'amortization', label: 'Amortization', desc: 'Reducing balance — interest decreases each month' },
                      { value: 'flat', label: 'Flat Rate', desc: 'Fixed interest on original principal throughout' },
                    ].map(opt => (
                      <div key={opt.value}
                        onClick={() => set('calcMethod', opt.value)}
                        style={{ flex: 1, padding: '10px 12px', border: `2px solid ${form.calcMethod === opt.value ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 'var(--radius)', cursor: 'pointer', background: form.calcMethod === opt.value ? 'var(--brand-light)' : 'var(--surface)', transition: 'all .15s' }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: form.calcMethod === opt.value ? 'var(--brand)' : 'var(--text)' }}>{opt.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{opt.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Auth / Disburse control */}
            {form.productId && !isHP && (
              <div style={{
                padding: 14, borderRadius: 10, marginBottom: 4,
                border: `2px solid ${willAuth ? 'var(--yellow)' : 'var(--green)'}`,
                background: willAuth ? 'var(--yellow-bg)' : 'var(--green-bg)',
              }}>
                {isTeller ? (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 18 }}>⏳</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#92400e' }}>Requires Approval</div>
                      <div style={{ fontSize: 12, color: '#92400e', opacity: .8, marginTop: 2 }}>
                        As a teller, loan applications must be approved by a manager before disbursement.
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: form.requireAuth ? 0 : 4 }}>
                      <span style={{ fontSize: 18 }}>{form.requireAuth ? '⏳' : '✅'}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: form.requireAuth ? '#92400e' : '#065f46' }}>
                          {form.requireAuth ? 'Will require approval' : 'Will disburse immediately'}
                        </div>
                        <div style={{ fontSize: 12, color: form.requireAuth ? '#92400e' : '#065f46', opacity: .8, marginTop: 2 }}>
                          {form.requireAuth
                            ? 'Loan will be created as pending and must be approved in the Loans page.'
                            : 'Loan will be created and marked active right away.'}
                        </div>
                      </div>
                    </div>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', marginTop: 10 }}>
                      <input type="checkbox" checked={form.requireAuth}
                        onChange={e => setForm(p => ({ ...p, requireAuth: e.target.checked }))}
                        style={{ width: 15, height: 15, accentColor: 'var(--brand)' }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Send for approval instead</span>
                    </label>
                  </>
                )}
              </div>
            )}

            {/* Submit */}
            {form.productId && (
              <button
                type="submit"
                className="btn btn-primary btn-lg"
                disabled={submitting}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {submitting
                  ? 'Processing…'
                  : isHP
                    ? '🛍️ Create HP Agreement & Loan'
                    : willAuth
                      ? '⏳ Submit for Approval'
                      : '✓ Disburse Loan Now'}
              </button>
            )}
          </div>
          {/* ── END LEFT COLUMN ─────────────────────────────────────────── */}

          {/* ── RIGHT COLUMN — Sticky Summary ───────────────────────────── */}
          <div style={{ position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Loan Summary */}
            <div className="card">
              <div className="card-header" style={{ marginBottom: 16 }}>
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TrendingUp size={16} color="var(--brand)" /> Loan Summary
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Customer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-3)' }}>Customer</span>
                  <span style={{ fontWeight: 600 }}>{selectedCustomer?.name || '—'}</span>
                </div>

                {/* Product */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-3)' }}>Product</span>
                  <span style={{ fontWeight: 600 }}>{selectedProduct?.name || '—'}</span>
                </div>

                {/* HP basket summary */}
                {isHP && basket.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Cart Items</div>
                    {basket.map(b => (
                      <div key={b.item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: 'var(--text-2)' }}>{b.item.image || '📦'} {b.item.name}{b.qty > 1 ? ` x${b.qty}` : ''}</span>
                        <span style={{ fontWeight: 600 }}>{GHS(b.item.price * b.qty)}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, paddingTop: 6, borderTop: '1px solid var(--border)', marginTop: 4 }}>
                      <span>Cart Total</span>
                      <span style={{ color: '#7c3aed' }}>{GHS(basketTotal)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-3)' }}>Down Payment</span>
                      <span style={{ fontWeight: 600 }}>{GHS(downPayment)}</span>
                    </div>
                  </>
                )}

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 2 }} />

                {/* Principal */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-3)' }}>Principal</span>
                  <span style={{ fontWeight: 700, color: 'var(--brand)' }}>{loanPrincipal > 0 ? GHS(loanPrincipal) : '—'}</span>
                </div>

                {/* Rate */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-3)' }}>Interest Rate</span>
                  <span style={{ fontWeight: 600 }}>{rate}% p.a.</span>
                </div>

                {/* Tenure */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-3)' }}>Tenure</span>
                  <span style={{ fontWeight: 600 }}>{tenure > 0 ? `${tenure} months` : <span style={{ color: 'var(--yellow)', fontSize: 12 }}>Enter tenure to calculate ↓</span>}</span>
                </div>

                {/* Monthly payment — prominent */}
                {monthly > 0 && (
                  <div style={{ background: 'var(--brand-light)', borderRadius: 'var(--radius)', padding: '12px 14px', marginTop: 4 }}>
                    <div style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>Monthly Payment</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--brand)' }}>{GHS(monthly)}</div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Daily Equiv.</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>{GHS(loanCalc.daily)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Weekly Equiv.</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>{GHS(loanCalc.weekly)}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Method badge */}
                {form.calcMethod && (
                  <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>
                    Method: <strong style={{ color: 'var(--text-2)' }}>{form.calcMethod === 'flat' ? 'Flat Rate' : 'Amortization (Reducing Balance)'}</strong>
                  </div>
                )}

                {/* Total interest */}
                {tenure > 0 && totalInterest > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-3)' }}>Total Interest</span>
                    <span style={{ fontWeight: 600, color: 'var(--red)' }}>{GHS(totalInterest)}</span>
                  </div>
                )}

                {/* Total repayment */}
                {tenure > 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 2 }}>
                    <span style={{ fontWeight: 700 }}>Total Repayment</span>
                    <span style={{ fontWeight: 800, color: 'var(--green)', fontSize: 15 }}>{GHS(totalRepay)}</span>
                  </div>
                ) : (
                  <div style={{ padding: '10px 12px', background: 'var(--yellow-bg)', borderRadius: 8, fontSize: 12, color: '#92400e', textAlign: 'center' }}>
                    Enter tenure (months) to see full calculation
                  </div>
                )}

                {/* Interest vs principal progress bar */}
                {loanPrincipal > 0 && totalRepay > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>
                      <span>Principal {Math.round((loanPrincipal / totalRepay) * 100)}%</span>
                      <span>Interest {Math.round((totalInterest / totalRepay) * 100)}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(loanPrincipal / totalRepay) * 100}%`, background: 'var(--brand)', borderRadius: 3 }} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Affordability Check */}
            {selectedCustomer?.monthlyIncome > 0 && monthly > 0 && (
              <div className="card">
                <div className="card-header" style={{ marginBottom: 12 }}>
                  <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CreditCard size={16} color="var(--text-2)" /> Affordability Check
                  </div>
                </div>
                {(() => {
                  const income = selectedCustomer.monthlyIncome;
                  const ratio  = (monthly / income) * 100;
                  const over   = ratio > 40;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: 'var(--text-3)' }}>Monthly Income</span>
                        <span style={{ fontWeight: 600 }}>{GHS(income)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: 'var(--text-3)' }}>Debt Ratio</span>
                        <span style={{ fontWeight: 700, color: over ? 'var(--red)' : 'var(--green)' }}>{ratio.toFixed(1)}%</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(ratio, 100)}%`, background: over ? 'var(--red)' : 'var(--green)', borderRadius: 3, transition: 'width .3s' }} />
                      </div>
                      {over ? (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, background: 'var(--red-bg)', color: '#991b1b', borderRadius: 'var(--radius)', padding: '8px 10px', fontSize: 12 }}>
                          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                          Debt ratio exceeds 40%. This may affect approval.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--green-bg)', color: '#065f46', borderRadius: 'var(--radius)', padding: '8px 10px', fontSize: 12 }}>
                          <CheckCircle size={14} />
                          Debt ratio is within acceptable range.
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

          </div>
          {/* ── END RIGHT COLUMN ────────────────────────────────────────── */}

        </div>
      </form>
    </div>
  );
}
