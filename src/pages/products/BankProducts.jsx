import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../core/supabase';
import Modal from '../../components/ui/Modal';
import { Edit2, Trash2, X, Check, ToggleLeft, ToggleRight, TrendingUp, CreditCard, Users, Download, Upload, FileText, Search, AlertCircle } from 'lucide-react';
import { exportCSV } from '../../core/export';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Papa from 'papaparse';

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
  monthlyFee: '', tenureMonths: '', maxCustomers: '', maxItems: '', benefits: [], description: '', status: 'active',
};

export default function BankProducts() {
  const { products, addProduct, updateProduct, deleteProduct, customers, accounts } = useApp();
  const authDB = { currentUser: () => { try { return JSON.parse(sessionStorage.getItem('current_user')); } catch { return null; } } };
  const [activeGroup, setActiveGroup] = useState('all');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [benefitInput, setBenefitInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // ── Assignment state ──────────────────────────────────────────────────────
  const [assignModal,      setAssignModal]      = useState(null); // product being managed
  const [assignments,      setAssignments]      = useState([]);
  const [loadingAssign,    setLoadingAssign]    = useState(false);
  const [assignCustSearch, setAssignCustSearch] = useState('');
  const [assignAcct,       setAssignAcct]       = useState('');
  const [assignNotes,      setAssignNotes]      = useState('');
  const [savingAssign,     setSavingAssign]      = useState(false);
  const [assignError,      setAssignError]      = useState('');
  const [uploadingCSV,     setUploadingCSV]     = useState(false);
  const [assignFilter,     setAssignFilter]     = useState('');
  // ── Inline capacity editing ───────────────────────────────────────────────
  const [editingCapacity,  setEditingCapacity]  = useState(false);
  const [capacityInput,    setCapacityInput]    = useState('');
  const [savingCapacity,   setSavingCapacity]   = useState(false);

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
      tenureMonths: p.tenureMonths ?? '',
      maxCustomers: p.maxCustomers ?? p.max_customers ?? '',
      maxItems: p.maxItems ?? p.max_items ?? '',
      benefits: [...(p.benefits || [])],
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
      max_customers: form.maxCustomers ? parseInt(form.maxCustomers) : null,
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

  // ── Assignment functions ──────────────────────────────────────────────────
  const openAssignments = async (product) => {
    setAssignModal(product);
    setAssignCustSearch(''); setAssignAcct(''); setAssignNotes('');
    setAssignError(''); setAssignFilter(''); setSelectedCust(null);
    setEditingCapacity(false); setCapacityInput('');
    setLoadingAssign(true);
    const { data } = await supabase
      .from('product_assignments')
      .select('*, customers(name, phone), accounts(account_number, type, balance)')
      .eq('product_id', product.id)
      .order('assigned_at', { ascending: false });
    setAssignments(data || []);
    setLoadingAssign(false);
  };

  const filteredAssignments = useMemo(() => {
    if (!assignFilter.trim()) return assignments;
    const q = assignFilter.toLowerCase();
    return assignments.filter(a =>
      a.customers?.name?.toLowerCase().includes(q) ||
      a.customers?.phone?.includes(q) ||
      a.accounts?.account_number?.includes(q) ||
      a.notes?.toLowerCase().includes(q)
    );
  }, [assignments, assignFilter]);

  const custResults = useMemo(() => {
    if (!assignCustSearch.trim() || assignCustSearch.length < 2) return [];
    const q = assignCustSearch.toLowerCase();
    return (customers || [])
      .filter(c => c.name?.toLowerCase().includes(q) || c.phone?.includes(q))
      .slice(0, 8);
  }, [assignCustSearch, customers]);

  const [selectedCust, setSelectedCust] = useState(null);
  const custAccounts = useMemo(() =>
    selectedCust ? (accounts || []).filter(a => a.customerId === selectedCust.id && a.status === 'active') : [],
    [selectedCust, accounts]
  );

  const addAssignment = async () => {
    if (!selectedCust) { setAssignError('Select a customer.'); return; }
    const maxC = assignModal?.maxCustomers ?? assignModal?.max_customers ?? null;
    if (maxC !== null && assignments.length >= maxC) {
      setAssignError(`This product is limited to ${maxC} customer${maxC !== 1 ? 's' : ''}. Remove one to add another.`);
      return;
    }
    setSavingAssign(true); setAssignError('');
    const { error } = await supabase.from('product_assignments').insert({
      product_id:  assignModal.id,
      customer_id: selectedCust.id,
      account_id:  assignAcct || null,
      notes:       assignNotes.trim() || null,
      assigned_by: authDB?.currentUser?.()?.name || 'Admin',
    });
    if (error) {
      setAssignError(error.code === '23505' ? 'Customer already assigned to this product.' : error.message);
    } else {
      await openAssignments(assignModal);
      setSelectedCust(null); setAssignCustSearch(''); setAssignAcct(''); setAssignNotes('');
    }
    setSavingAssign(false);
  };

  const removeAssignment = async (id) => {
    await supabase.from('product_assignments').delete().eq('id', id);
    setAssignments(p => p.filter(a => a.id !== id));
  };

  const saveCapacity = async () => {
    const val = capacityInput.trim();
    const newMax = val === '' ? null : parseInt(val, 10);
    if (val !== '' && (isNaN(newMax) || newMax < 1)) return;
    setSavingCapacity(true);
    const result = await updateProduct(assignModal.id, { max_customers: newMax });
    if (!result?.error) {
      // Update local assignModal so the bar reflects immediately
      setAssignModal(p => ({ ...p, max_customers: newMax, maxCustomers: newMax }));
    }
    setSavingCapacity(false);
    setEditingCapacity(false);
  };

  const exportAssignmentsPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFillColor(26, 86, 219);
    doc.rect(0, 0, 297, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text('Majupat Love Enterprise — Product Assignment Report', 10, 12);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleString()}`, 287, 12, { align: 'right' });
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(`Product: ${assignModal?.name}`, 10, 28);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    const maxC = assignModal?.maxCustomers ?? assignModal?.max_customers;
    doc.text(`Category: ${assignModal?.category} | Capacity: ${maxC != null ? `${assignments.length}/${maxC}` : `${assignments.length} (unlimited)`} | Interest: ${assignModal?.interestRate}% p.a.`, 10, 34);
    autoTable(doc, {
      startY: 40,
      head: [['#', 'Customer Name', 'Phone', 'Account Number', 'Account Type', 'Balance', 'Assigned At', 'Notes']],
      body: assignments.map((a, i) => [
        i + 1,
        a.customers?.name || '—',
        a.customers?.phone || '—',
        a.accounts?.account_number || '—',
        a.accounts?.type?.replace(/_/g, ' ') || '—',
        a.accounts ? GHS(a.accounts.balance) : '—',
        a.assigned_at ? new Date(a.assigned_at).toLocaleString() : '—',
        a.notes || '—',
      ]),
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [26, 86, 219], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 40 }, 2: { cellWidth: 28 }, 3: { cellWidth: 32 }, 4: { cellWidth: 28 }, 5: { cellWidth: 28 }, 6: { cellWidth: 38 }, 7: { cellWidth: 50 } },
    });
    doc.save(`product-assignments-${assignModal?.name?.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const exportAssignmentsCSV = () => {
    exportCSV(assignments.map((a, i) => ({
      '#': i + 1,
      'Customer Name':   a.customers?.name || '—',
      'Phone':           a.customers?.phone || '—',
      'Account Number':  a.accounts?.account_number || '—',
      'Account Type':    a.accounts?.type || '—',
      'Balance':         a.accounts?.balance ?? '—',
      'Assigned At':     a.assigned_at ? new Date(a.assigned_at).toLocaleString() : '—',
      'Notes':           a.notes || '',
    })), `product-assignments-${assignModal?.name?.replace(/\s+/g, '-')}`);
  };

  const handleUploadCSV = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setUploadingCSV(true);
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (res) => {
        let added = 0, skipped = 0;
        for (const row of res.data) {
          const custName = (row['Customer Name'] || row['customer_name'] || row['name'] || '').trim();
          const acctNum  = (row['Account Number'] || row['account_number'] || row['account'] || '').trim();
          const notes    = (row['Notes'] || row['notes'] || '').trim();
          if (!custName && !acctNum) continue;
          // Find customer
          let custId = null, acctId = null;
          if (acctNum) {
            const { data: acct } = await supabase.from('accounts').select('id, customer_id').eq('account_number', acctNum).single();
            if (acct) { acctId = acct.id; custId = acct.customer_id; }
          }
          if (!custId && custName) {
            const { data: custs } = await supabase.from('customers').select('id').ilike('name', custName).limit(1);
            if (custs?.length) custId = custs[0].id;
          }
          if (!custId) { skipped++; continue; }
          const { error } = await supabase.from('product_assignments').insert({
            product_id: assignModal.id, customer_id: custId,
            account_id: acctId || null, notes: notes || null,
            assigned_by: 'CSV Import',
          });
          if (!error) added++; else skipped++;
        }
        await openAssignments(assignModal);
        alert(`Import complete: ${added} added, ${skipped} skipped.`);
        setUploadingCSV(false);
        e.target.value = '';
      },
      error: () => { setUploadingCSV(false); alert('Failed to parse CSV.'); },
    });
  };

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
                const maxC = p.maxCustomers ?? p.max_customers;
                return (
                  <div key={p.id} className="card"
                    onClick={() => openAssignments(p)}
                    style={{ opacity: p.status === 'inactive' ? 0.55 : 1, transition: 'opacity .2s, box-shadow .15s', position: 'relative', overflow: 'hidden', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.12)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
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
                      <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                        <button className="btn btn-ghost btn-sm btn-icon" title="Manage Assignments" onClick={() => openAssignments(p)} style={{ color: 'var(--brand)' }}>
                          <Users size={14} />
                        </button>
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
                        ['Capacity', maxC != null ? `Max ${maxC} customers` : 'Unlimited'],
                        ['Status', p.status],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' }}>{k}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, marginTop: 1, textTransform: 'capitalize' }}>{v}</div>
                        </div>
                      ))}
                    </div>

                    {/* Mini capacity bar on card */}
                    {maxC != null && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ height: 4, background: 'var(--border)', borderRadius: 2 }}>
                          <div style={{ height: '100%', borderRadius: 2, width: '0%', background: 'var(--green)', transition: 'width .3s' }} />
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>Click to manage assigned customers</div>
                      </div>
                    )}

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

                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--brand)', fontSize: 12, fontWeight: 600 }}>
                      <Users size={12} /> Click to view &amp; manage assigned customers
                    </div>
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
              <label className="form-label">Max Customers</label>
              <input className="form-control" type="number" min="1" value={form.maxCustomers} onChange={f('maxCustomers')} placeholder="Unlimited" />
              <div className="form-hint">1 = exclusive · 100 = up to 100 · blank = unlimited</div>
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
            <label className="form-label">Status</label>
            <select className="form-control" value={form.status} onChange={f('status')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
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

      {/* ── Assignment Modal ── */}
      <Modal open={!!assignModal} onClose={() => setAssignModal(null)}
        title={`👥 ${assignModal?.name} — Customer Assignments`} size="xl"
        footer={<button className="btn btn-secondary" onClick={() => setAssignModal(null)}>Close</button>}>
        {assignModal && (() => {
          const maxC = assignModal.maxCustomers ?? assignModal.max_customers ?? null;
          const used = assignments.length;
          const pct  = maxC ? Math.min(100, (used / maxC) * 100) : 0;
          const barColor = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#10b981';
          const isFull = maxC !== null && used >= maxC;
          return (
            <div>

              {/* ── Product summary strip ── */}
              <div style={{ padding: '12px 16px', background: 'var(--surface-2)', borderRadius: 10, marginBottom: 16, border: '1px solid var(--border)' }}>
                {/* Top row: name + meta */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Product</div>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{assignModal.name}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Interest</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{assignModal.interestRate}% p.a.</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Category</div>
                    <div style={{ fontWeight: 700, fontSize: 13, textTransform: 'capitalize' }}>{assignModal.category?.replace(/_/g, ' ')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Assigned</div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: barColor }}>{used}</div>
                  </div>
                </div>

                {/* Capacity control row */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.05em', minWidth: 80 }}>
                      Max Customers
                    </div>

                    {editingCapacity ? (
                      /* ── Edit mode ── */
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="number" min="1"
                          className="form-control"
                          value={capacityInput}
                          onChange={e => setCapacityInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveCapacity(); if (e.key === 'Escape') setEditingCapacity(false); }}
                          placeholder="blank = unlimited"
                          autoFocus
                          style={{ width: 140, fontSize: 13, fontWeight: 700 }}
                        />
                        <button className="btn btn-primary btn-sm" onClick={saveCapacity} disabled={savingCapacity}>
                          {savingCapacity ? 'Saving…' : <><Check size={13} /> Save</>}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditingCapacity(false)}>
                          <X size={13} /> Cancel
                        </button>
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Leave blank for unlimited</span>
                      </div>
                    ) : (
                      /* ── Display mode ── */
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: maxC == null ? 'var(--text-3)' : barColor }}>
                          {maxC != null ? `${used} / ${maxC}` : `${used} assigned (unlimited)`}
                        </span>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => { setCapacityInput(maxC != null ? String(maxC) : ''); setEditingCapacity(true); }}
                          style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 600 }}>
                          <Edit2 size={12} /> Change limit
                        </button>
                        {isFull && (
                          <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <AlertCircle size={12} /> Full — remove a customer to add more
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Progress bar */}
                  {maxC != null && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 4, width: pct + '%', background: barColor, transition: 'width .4s ease' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                        <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{pct.toFixed(0)}% full</span>
                        <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{maxC - used} slot{maxC - used !== 1 ? 's' : ''} remaining</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Add customer panel ── */}
              {assignError && <div className="alert alert-error" style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center' }}><AlertCircle size={14} />{assignError}</div>}
              <div style={{ padding: 14, background: '#eff6ff', borderRadius: 10, marginBottom: 16, border: '1px solid #bfdbfe' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1e40af', marginBottom: 10 }}>➕ Add Customer to this Product</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'flex-start' }}>
                  {/* Customer search */}
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'relative' }}>
                      <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
                      <input className="form-control" placeholder="Search by name or phone…"
                        value={assignCustSearch}
                        onChange={e => { setAssignCustSearch(e.target.value); setSelectedCust(null); }}
                        style={{ fontSize: 13, paddingLeft: 30 }} />
                    </div>
                    {custResults.length > 0 && !selectedCust && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.15)', marginTop: 4, maxHeight: 240, overflowY: 'auto' }}>
                        {custResults.map(c => {
                          const ca = (accounts || []).filter(a => a.customerId === c.id && a.status === 'active');
                          return (
                            <div key={c.id}
                              onMouseDown={() => { setSelectedCust(c); setAssignCustSearch(c.name); setAssignAcct(''); }}
                              style={{ padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                              onMouseLeave={e => e.currentTarget.style.background = ''}>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.phone}</div>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                {ca.slice(0, 2).map(a => (
                                  <span key={a.id} style={{ fontSize: 10, fontFamily: 'monospace', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4, color: 'var(--text-2)' }}>{a.accountNumber}</span>
                                ))}
                                {ca.length > 2 && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>+{ca.length - 2} more</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {/* Account selector */}
                  <select className="form-control" value={assignAcct} onChange={e => setAssignAcct(e.target.value)} style={{ fontSize: 13 }} disabled={!selectedCust}>
                    <option value="">— Link account (optional) —</option>
                    {custAccounts.map(a => (
                      <option key={a.id} value={a.id}>{a.accountNumber} · {a.type?.replace(/_/g,' ')} · {GHS(a.balance)}</option>
                    ))}
                  </select>
                  {/* Add button */}
                  <button className="btn btn-primary" onClick={addAssignment} disabled={savingAssign || !selectedCust || isFull} style={{ whiteSpace: 'nowrap' }}>
                    {savingAssign ? 'Adding…' : '+ Add'}
                  </button>
                </div>
                {/* Notes row */}
                <div style={{ marginTop: 8 }}>
                  <input className="form-control" placeholder="Notes (optional)" value={assignNotes} onChange={e => setAssignNotes(e.target.value)} style={{ fontSize: 13 }} />
                </div>
                {selectedCust && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Check size={12} /> Selected: <strong>{selectedCust.name}</strong> · {selectedCust.phone}
                    <button onClick={() => { setSelectedCust(null); setAssignCustSearch(''); setAssignAcct(''); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 0, marginLeft: 4, display: 'flex' }}>
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>

              {/* ── Toolbar: search filter + export/import ── */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
                  <input className="form-control" placeholder="Filter assigned customers…"
                    value={assignFilter} onChange={e => setAssignFilter(e.target.value)}
                    style={{ fontSize: 13, paddingLeft: 30 }} />
                </div>
                <button className="btn btn-secondary btn-sm" onClick={exportAssignmentsCSV} disabled={assignments.length === 0} title="Download CSV">
                  <Download size={13} /> Download CSV
                </button>
                <button className="btn btn-secondary btn-sm" onClick={exportAssignmentsPDF} disabled={assignments.length === 0} title="Download PDF">
                  <FileText size={13} /> Download PDF
                </button>
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', margin: 0 }} title="Upload CSV to bulk-import customers">
                  <Upload size={13} /> {uploadingCSV ? 'Importing…' : 'Upload CSV'}
                  <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleUploadCSV} disabled={uploadingCSV} />
                </label>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10 }}>
                Upload CSV columns: <code>Customer Name</code>, <code>Account Number</code>, <code>Notes</code>
              </div>

              {/* ── Assignments table ── */}
              {loadingAssign ? (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>Loading…</div>
              ) : filteredAssignments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, background: 'var(--surface-2)', borderRadius: 10, color: 'var(--text-3)' }}>
                  <Users size={36} style={{ opacity: .25, display: 'block', margin: '0 auto 10px' }} />
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{assignments.length === 0 ? 'No customers assigned yet' : 'No results match your filter'}</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    {assignments.length === 0 ? 'Search and add customers above, or upload a CSV file.' : 'Try a different search term.'}
                  </div>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}>#</th>
                        <th>Customer</th>
                        <th>Phone</th>
                        <th>Account Number</th>
                        <th>Acc. Type</th>
                        <th>Balance</th>
                        <th>Assigned At</th>
                        <th>Notes</th>
                        <th style={{ width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAssignments.map((a, i) => (
                        <tr key={a.id}>
                          <td style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>{i + 1}</td>
                          <td style={{ fontWeight: 700 }}>{a.customers?.name || '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{a.customers?.phone || '—'}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>{a.accounts?.account_number || <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                          <td style={{ fontSize: 12, textTransform: 'capitalize' }}>{a.accounts?.type?.replace(/_/g, ' ') || '—'}</td>
                          <td style={{ fontWeight: 600 }}>{a.accounts ? GHS(a.accounts.balance) : '—'}</td>
                          <td style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                            {a.assigned_at ? new Date(a.assigned_at).toLocaleString() : '—'}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-3)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.notes || '—'}</td>
                          <td>
                            <button className="btn btn-ghost btn-sm btn-icon" style={{ color: '#ef4444' }}
                              onClick={() => removeAssignment(a.id)} title="Remove from product">
                              <X size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {filteredAssignments.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8, textAlign: 'right' }}>
                  Showing {filteredAssignments.length} of {assignments.length} assigned customer{assignments.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
