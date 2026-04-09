import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import Modal from '../../components/ui/Modal';
import { Plus, Edit2, Trash2, X, Check, ToggleLeft, ToggleRight, TrendingUp, CreditCard } from 'lucide-react';

const GHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

// ── Product type groups ───────────────────────────────────────────────────────
const PRODUCT_GROUPS = [
  {
    key: 'savings',
    label: 'Savings & Deposit Products',
    icon: TrendingUp,
    color: '#10b981',
    bg: '#d1fae5',
    desc: 'Interest earned by customer on deposits',
    categories: [
      { value: 'savings', label: 'Savings Account' },
      { value: 'current', label: 'Current Account' },
      { value: 'fixed_deposit', label: 'Fixed Deposit' },
      { value: 'micro_savings', label: 'Micro Savings' },
      { value: 'susu', label: 'Susu / Group Savings' },
      { value: 'joint', label: 'Joint Account' },
    ],
  },
  {
    key: 'loan',
    label: 'Loan & Credit Products',
    icon: CreditCard,
    color: '#1a56db',
    bg: '#dbeafe',
    desc: 'Interest charged to customer on borrowed funds',
    categories: [
      { value: 'personal', label: 'Personal Loan' },
      { value: 'micro', label: 'Micro Loan' },
      { value: 'mortgage', label: 'Mortgage' },
      { value: 'emergency', label: 'Emergency Loan' },
      { value: 'group', label: 'Group Loan' },
      { value: 'hire_purchase', label: 'Hire Purchase Loan' },
    ],
  },
];

const ALL_CATEGORIES = PRODUCT_GROUPS.flatMap(g => g.categories);

const EMPTY = {
  name: '', category: 'savings', interestRate: '', minBalance: '', maxBalance: '',
  monthlyFee: '', tenureMonths: '', benefits: [], description: '', status: 'active',
};

export default function BankProducts() {
  const { products, addProduct, updateProduct, deleteProduct } = useApp();
  const [activeGroup, setActiveGroup] = useState('all');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [benefitInput, setBenefitInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  // Determine which group a product belongs to
  const getGroup = (category) =>
    PRODUCT_GROUPS.find(g => g.categories.some(c => c.value === category))?.key || 'savings';

  const getCatLabel = (cat) =>
    ALL_CATEGORIES.find(c => c.value === cat)?.label || cat;

  const openAdd = (defaultCategory = 'savings') => {
    setEditing(null);
    setForm({ ...EMPTY, category: defaultCategory });
    setBenefitInput(''); setError(''); setModal(true);
  };
  const openEdit = (p) => {
    setEditing(p);
    setForm({
      name: p.name, category: p.category, description: p.description || '',
      interestRate: p.interestRate ?? '', minBalance: p.minBalance ?? '',
      maxBalance: p.maxBalance ?? '', monthlyFee: p.monthlyFee ?? '',
      tenureMonths: p.tenureMonths ?? '', benefits: [...(p.benefits || [])],
      status: p.status || 'active',
    });
    setBenefitInput(''); setError(''); setModal(true);
  };

  const addBenefit = () => {
    const b = benefitInput.trim();
    if (!b) return;
    setForm(p => ({ ...p, benefits: [...(p.benefits || []), b] }));
    setBenefitInput('');
  };
  const removeBenefit = (i) => setForm(p => ({ ...p, benefits: p.benefits.filter((_, idx) => idx !== i) }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.name) { setError('Product name is required.'); return; }
    setSaving(true); setError('');
    const data = {
      ...form,
      interestRate: parseFloat(form.interestRate) || 0,
      minBalance: parseFloat(form.minBalance) || 0,
      maxBalance: form.maxBalance ? parseFloat(form.maxBalance) : null,
      monthlyFee: parseFloat(form.monthlyFee) || 0,
      tenureMonths: form.tenureMonths ? parseInt(form.tenureMonths) : null,
    };
    const result = editing ? await updateProduct(editing.id, data) : await addProduct(data);
    if (result?.error) { setError(result.error?.message || 'Failed to save.'); setSaving(false); return; }
    setModal(false); setSaving(false);
  };

  const doDelete = async () => {
    setDeleting(true);
    const result = await deleteProduct(confirmDelete.id);
    if (result?.error) { alert('Failed to delete: ' + (result.error?.message || 'Unknown error')); }
    setConfirmDelete(null); setDeleting(false);
  };

  const toggleStatus = (p) => updateProduct(p.id, { status: p.status === 'active' ? 'inactive' : 'active' });

  // Filter products by active group
  const displayedProducts = useMemo(() => {
    if (activeGroup === 'all') return products;
    return products.filter(p => getGroup(p.category) === activeGroup);
  }, [products, activeGroup]);

  // Group displayed products by category
  const grouped = useMemo(() => {
    const cats = activeGroup === 'all'
      ? ALL_CATEGORIES
      : PRODUCT_GROUPS.find(g => g.key === activeGroup)?.categories || [];
    return cats.map(cat => ({
      ...cat,
      items: displayedProducts.filter(p => p.category === cat.value),
    })).filter(g => g.items.length > 0);
  }, [displayedProducts, activeGroup]);

  const savingsCount = products.filter(p => getGroup(p.category) === 'savings').length;
  const loanCount = products.filter(p => getGroup(p.category) === 'loan').length;

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Bank Products</div>
          <div className="page-desc">Manage savings interest rates and loan interest rates</div>
        </div>
        <div className="page-header-right">
          <button className="btn btn-success btn-sm" onClick={() => openAdd('savings')}>
            <TrendingUp size={14} />New Savings Product
          </button>
          <button className="btn btn-primary" onClick={() => openAdd('personal')}>
            <CreditCard size={14} />New Loan Product
          </button>
        </div>
      </div>

      {/* Group tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <div onClick={() => setActiveGroup('all')}
          style={{ padding: '10px 20px', borderRadius: 10, cursor: 'pointer', border: `2px solid ${activeGroup === 'all' ? 'var(--brand)' : 'var(--border)'}`, background: activeGroup === 'all' ? 'var(--brand-light)' : 'var(--surface)', fontWeight: 700, fontSize: 13, color: activeGroup === 'all' ? 'var(--brand)' : 'var(--text-3)' }}>
          All Products ({products.length})
        </div>
        {PRODUCT_GROUPS.map(g => (
          <div key={g.key} onClick={() => setActiveGroup(g.key)}
            style={{ padding: '10px 20px', borderRadius: 10, cursor: 'pointer', border: `2px solid ${activeGroup === g.key ? g.color : 'var(--border)'}`, background: activeGroup === g.key ? g.bg : 'var(--surface)', fontWeight: 700, fontSize: 13, color: activeGroup === g.key ? g.color : 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <g.icon size={15} />
            {g.label.split(' ')[0]} ({g.key === 'savings' ? savingsCount : loanCount})
          </div>
        ))}
      </div>

      {/* Interest type info banner */}
      {activeGroup !== 'all' && (
        <div style={{ padding: '12px 16px', borderRadius: 10, marginBottom: 20, background: PRODUCT_GROUPS.find(g => g.key === activeGroup)?.bg, border: `1px solid ${PRODUCT_GROUPS.find(g => g.key === activeGroup)?.color}20`, display: 'flex', alignItems: 'center', gap: 10 }}>
          {React.createElement(PRODUCT_GROUPS.find(g => g.key === activeGroup)?.icon, { size: 16, style: { color: PRODUCT_GROUPS.find(g => g.key === activeGroup)?.color, flexShrink: 0 } })}
          <div>
            <span style={{ fontWeight: 700, color: PRODUCT_GROUPS.find(g => g.key === activeGroup)?.color }}>
              {activeGroup === 'savings' ? 'Savings Interest' : 'Loan Interest'}:
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-2)', marginLeft: 6 }}>
              {PRODUCT_GROUPS.find(g => g.key === activeGroup)?.desc}
            </span>
          </div>
        </div>
      )}

      {displayedProducts.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 64 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>No products yet</div>
          <div style={{ color: 'var(--text-3)', marginBottom: 24 }}>Create your first product to get started</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn btn-success" onClick={() => openAdd('savings')}><TrendingUp size={14} />Savings Product</button>
            <button className="btn btn-primary" onClick={() => openAdd('personal')}><CreditCard size={14} />Loan Product</button>
          </div>
        </div>
      ) : (
        grouped.map(group => (
          <div key={group.value} style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
              {group.label} ({group.items.length})
            </div>
            <div className="grid-auto">
              {group.items.map(p => {
                const grp = PRODUCT_GROUPS.find(g => g.key === getGroup(p.category));
                return (
                  <div key={p.id} className="card" style={{ opacity: p.status === 'inactive' ? 0.55 : 1, transition: 'opacity .2s', position: 'relative', overflow: 'hidden' }}>
                    {/* Interest type stripe */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: grp?.color || 'var(--brand)' }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, paddingTop: 6 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 15 }}>{p.name}</div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: grp?.bg, color: grp?.color }}>
                            {grp?.key === 'loan' ? '💳 Loan' : '💰 Savings'}
                          </span>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                            {getCatLabel(p.category)}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => toggleStatus(p)} title={p.status === 'active' ? 'Deactivate' : 'Activate'}>
                          {p.status === 'active' ? <ToggleRight size={18} style={{ color: 'var(--green)' }} /> : <ToggleLeft size={18} style={{ color: 'var(--text-3)' }} />}
                        </button>
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(p)}><Edit2 size={14} /></button>
                        <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--red)' }} onClick={() => setConfirmDelete(p)}><Trash2 size={14} /></button>
                      </div>
                    </div>

                    {p.description && <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>{p.description}</div>}

                    {/* Interest rate — prominent */}
                    <div style={{ padding: '10px 14px', background: grp?.bg, borderRadius: 8, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: grp?.color }}>
                        {grp?.key === 'loan' ? 'Loan Interest Rate' : 'Savings Interest Rate'}
                      </span>
                      <span style={{ fontSize: 20, fontWeight: 900, color: grp?.color }}>
                        {p.interestRate}% p.a.
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                      {[
                        ['Min Balance', p.minBalance > 0 ? GHS(p.minBalance) : 'None'],
                        ['Monthly Fee', p.monthlyFee > 0 ? GHS(p.monthlyFee) : 'Free'],
                        ['Tenure', p.tenureMonths ? `${p.tenureMonths} months` : 'Flexible'],
                        ['Status', p.status],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' }}>{k}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, marginTop: 1, textTransform: 'capitalize' }}>{v}</div>
                        </div>
                      ))}
                    </div>

                    {p.benefits?.length > 0 && (
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                        {p.benefits.slice(0, 3).map((b, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 3 }}>
                            <Check size={11} style={{ color: 'var(--green)', flexShrink: 0 }} />{b}
                          </div>
                        ))}
                        {p.benefits.length > 3 && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>+{p.benefits.length - 3} more</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Add/Edit Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Product' : 'New Bank Product'} size="lg"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Product'}</button>
        </>}>
        <form onSubmit={save}>
          {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Product Name <span className="required">*</span></label>
              <input className="form-control" value={form.name} onChange={f('name')} required placeholder="e.g. Premium Savings Plus" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Category <span className="required">*</span></label>
              <select className="form-control" value={form.category} onChange={f('category')}>
                {PRODUCT_GROUPS.map(g => (
                  <optgroup key={g.key} label={g.label}>
                    {g.categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </optgroup>
                ))}
              </select>
              <div className="form-hint">
                {getGroup(form.category) === 'loan'
                  ? '💳 Loan product — interest is charged to the customer'
                  : '💰 Savings product — interest is earned by the customer'}
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-control" value={form.description} onChange={f('description')} rows={2} placeholder="Brief description…" />
          </div>

          {/* Interest rate — most important field */}
          <div style={{ padding: 16, background: getGroup(form.category) === 'loan' ? 'var(--blue-bg)' : 'var(--green-bg)', borderRadius: 10, marginBottom: 16, border: `1px solid ${getGroup(form.category) === 'loan' ? '#bfdbfe' : '#a7f3d0'}` }}>
            <label className="form-label" style={{ color: getGroup(form.category) === 'loan' ? '#1e40af' : '#065f46' }}>
              {getGroup(form.category) === 'loan' ? '💳 Loan Interest Rate (% p.a.)' : '💰 Savings Interest Rate (% p.a.)'}
              <span className="required">*</span>
            </label>
            <input className="form-control" type="number" step="0.01" min="0" max="100"
              value={form.interestRate} onChange={f('interestRate')} placeholder="e.g. 18"
              style={{ fontSize: 20, fontWeight: 700, textAlign: 'center' }} />
            <div style={{ fontSize: 12, marginTop: 6, color: getGroup(form.category) === 'loan' ? '#1e40af' : '#065f46' }}>
              {getGroup(form.category) === 'loan'
                ? 'This rate will be used to calculate monthly payments and total repayment for all loans under this product.'
                : 'This rate will be credited to customer accounts periodically.'}
            </div>
          </div>

          <div className="form-row-3">
            <div className="form-group">
              <label className="form-label">Monthly Fee (GH₵)</label>
              <input className="form-control" type="number" step="0.01" min="0" value={form.monthlyFee} onChange={f('monthlyFee')} placeholder="0" />
            </div>
            <div className="form-group">
              <label className="form-label">Tenure (months)</label>
              <input className="form-control" type="number" min="1" value={form.tenureMonths} onChange={f('tenureMonths')} placeholder="Flexible" />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={form.status} onChange={f('status')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Minimum Balance (GH₵)</label>
              <input className="form-control" type="number" step="0.01" min="0" value={form.minBalance} onChange={f('minBalance')} placeholder="0" />
            </div>
            <div className="form-group">
              <label className="form-label">Maximum Balance (GH₵)</label>
              <input className="form-control" type="number" step="0.01" min="0" value={form.maxBalance} onChange={f('maxBalance')} placeholder="Unlimited" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Product Benefits</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input className="form-control" value={benefitInput} onChange={e => setBenefitInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBenefit(); } }}
                placeholder="Type a benefit and press Enter…" />
              <button type="button" className="btn btn-secondary" onClick={addBenefit}>Add</button>
            </div>
            {form.benefits?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {form.benefits.map((b, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'var(--green-bg)', borderRadius: 20, fontSize: 12, color: '#065f46' }}>
                    <Check size={11} /><span>{b}</span>
                    <button type="button" onClick={() => removeBenefit(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065f46', padding: 0, marginLeft: 2, display: 'flex' }}>
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>
      </Modal>

      {/* Confirm Delete */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete Product"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={doDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</button>
        </>}>
        <div className="alert alert-error">
          Delete <strong>{confirmDelete?.name}</strong>? This will permanently remove it from Supabase. Existing loans/accounts using this product will not be affected.
        </div>
      </Modal>
    </div>
  );
}
