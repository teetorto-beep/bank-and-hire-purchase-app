import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import { Plus, Edit2, Trash2, Upload, Download, FileText } from 'lucide-react';
import { exportHPCataloguePDF, exportCSV } from '../../core/export';
import Papa from 'papaparse';

const CATEGORIES = ['Electronics', 'Appliances', 'Mobile', 'Power', 'Furniture', 'Other'];
const EMPTY = { name: '', category: 'Electronics', price: '', stock: '', image: '', description: '', dailyPayment: '', weeklyPayment: '' };

export default function HPItems() {
  const { hpItems, addHPItem, updateHPItem, deleteHPItem } = useApp();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [catFilter, setCatFilter] = useState('all');

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const openAdd = () => { setEditing(null); setForm(EMPTY); setModal(true); };
  const openEdit = (item) => { setEditing(item); setForm({ ...item }); setModal(true); };

  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const data = {
        ...form,
        price: parseFloat(form.price) || 0,
        stock: parseInt(form.stock) || 0,
        dailyPayment: parseFloat(form.dailyPayment) || 0,
        weeklyPayment: parseFloat(form.weeklyPayment) || 0,
      };
      const result = editing ? await updateHPItem(editing.id, data) : await addHPItem(data);
      if (result?.error) { alert('Error: ' + (result.error?.message || 'Failed to save')); setSaving(false); return; }
      setModal(false);
    } catch (err) { alert('Error: ' + err.message); }
    setSaving(false);
  };

  // Auto-calculate daily/weekly from price when price changes
  const handlePriceChange = (e) => {
    const price = parseFloat(e.target.value) || 0;
    setForm(p => ({
      ...p, price: e.target.value,
      dailyPayment: price > 0 ? (price / 180).toFixed(2) : '',
      weeklyPayment: price > 0 ? (price / 26).toFixed(2) : '',
    }));
  };

  const filtered = catFilter === 'all' ? hpItems : hpItems.filter(i => i.category === catFilter);

  // Stock report data
  const stockReport = [...hpItems].sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0));
  const lowStock = hpItems.filter(i => (i.stock ?? 0) <= 2 && (i.stock ?? 0) > 0);
  const outOfStock = hpItems.filter(i => (i.stock ?? 0) === 0);
  const totalStockValue = hpItems.reduce((s, i) => s + (i.price ?? 0) * (i.stock ?? 0), 0);

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">HP Items Catalogue</div>
          <div className="page-desc">Physical goods offered on hire purchase — TVs, fridges, phones and more</div>
        </div>
        <div className="page-header-right">
          <button className="btn btn-secondary" onClick={() => exportCSV(hpItems.map(i => ({ name: i.name, category: i.category, description: i.description, price: i.price, stock: i.stock, image: i.image, dailyPayment: i.dailyPayment, weeklyPayment: i.weeklyPayment })), 'hp-catalogue')}>
            <Download size={14} />CSV
          </button>
          <button className="btn btn-secondary" onClick={() => exportHPCataloguePDF(hpItems)}>
            <FileText size={14} />PDF
          </button>
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
            <Upload size={14} />Upload CSV
            <input type="file" accept=".csv" style={{ display: 'none' }} onChange={(e) => {
              const file = e.target.files[0]; if (!file) return;
              Papa.parse(file, { header: true, skipEmptyLines: true, complete: (res) => {
                res.data.forEach(row => {
                  if (row.name) addHPItem({ name: row.name, category: row.category || 'Other', description: row.description || '', price: parseFloat(row.price) || 0, stock: parseInt(row.stock) || 0, image: row.image || '📦', dailyPayment: parseFloat(row.dailyPayment) || 0, weeklyPayment: parseFloat(row.weeklyPayment) || 0 });
                });
                e.target.value = '';
              }});
            }} />
          </label>
          <button className="btn btn-primary" onClick={openAdd}><Plus size={15} />Add Item</button>
        </div>
      </div>

      {/* Category filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {['all', ...CATEGORIES].map(c => (
          <button key={c} className={`btn btn-sm ${catFilter === c ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setCatFilter(c)} style={{ textTransform: 'capitalize' }}>
            {c === 'all' ? 'All Items' : c}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 64 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🛍️</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>No items yet</div>
          <div style={{ color: 'var(--text-3)', marginBottom: 24 }}>Add items to your hire purchase catalogue</div>
          <button className="btn btn-primary" onClick={openAdd}><Plus size={15} />Add First Item</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {filtered.map(item => (
            <div key={item.id} className="card" style={{ position: 'relative' }}>
              {/* Stock badge */}
              <div style={{ position: 'absolute', top: 12, right: 12 }}>
                <span className={`badge ${item.stock > 0 ? 'badge-green' : 'badge-red'}`}>
                  {item.stock > 0 ? `${item.stock} in stock` : 'Out of stock'}
                </span>
              </div>

              {/* Icon + name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
                  {item.image || '📦'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.3 }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{item.category}</div>
                </div>
              </div>

              {item.description && (
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.5 }}>{item.description}</div>
              )}

              {/* Pricing */}
              <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Cash Price</span>
                  <span style={{ fontSize: 15, fontWeight: 800 }}>GH₵ {item.price?.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, background: 'var(--blue-bg)', borderRadius: 6, padding: '6px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#1e40af', fontWeight: 700, textTransform: 'uppercase' }}>Daily</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1e40af' }}>GH₵ {item.dailyPayment}</div>
                  </div>
                  <div style={{ flex: 1, background: 'var(--purple-bg)', borderRadius: 6, padding: '6px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#5b21b6', fontWeight: 700, textTransform: 'uppercase' }}>Weekly</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#5b21b6' }}>GH₵ {item.weeklyPayment}</div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => openEdit(item)}><Edit2 size={13} />Edit</button>
                <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--red)' }} onClick={() => setConfirmDelete(item)}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Item' : 'Add HP Item'} size="lg"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Item'}</button>
        </>}>
        <form onSubmit={save}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Item Name <span className="required">*</span></label>
              <input className="form-control" value={form.name} onChange={f('name')} required placeholder="e.g. Samsung 55 inch TV" />
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-control" value={form.category} onChange={f('category')}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <input className="form-control" value={form.description} onChange={f('description')} placeholder="Brief specs or description" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Emoji / Icon</label>
              <input className="form-control" value={form.image} onChange={f('image')} placeholder="📺" maxLength={4} />
              <div className="form-hint">Paste an emoji to represent this item</div>
            </div>
            <div className="form-group">
              <label className="form-label">Stock Quantity</label>
              <input className="form-control" type="number" min="0" value={form.stock} onChange={f('stock')} placeholder="0" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Cash Price (GH₵) <span className="required">*</span></label>
            <input className="form-control" type="number" step="0.01" min="0" value={form.price} onChange={handlePriceChange} required placeholder="3200" />
            <div className="form-hint">Daily and weekly payments will be auto-calculated (you can adjust below)</div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Daily Payment (GH₵)</label>
              <input className="form-control" type="number" step="0.01" min="0" value={form.dailyPayment} onChange={f('dailyPayment')} placeholder="15.00" />
            </div>
            <div className="form-group">
              <label className="form-label">Weekly Payment (GH₵)</label>
              <input className="form-control" type="number" step="0.01" min="0" value={form.weeklyPayment} onChange={f('weeklyPayment')} placeholder="100.00" />
            </div>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Remove Item"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={() => { deleteHPItem(confirmDelete.id); setConfirmDelete(null); }}>Remove</button>
        </>}>
        <div className="alert alert-error">Remove <strong>{confirmDelete?.name}</strong> from the catalogue?</div>
      </Modal>

      {/* ── Stock Report Section ─────────────────────────────────────────── */}
      <div style={{ marginTop: 32 }}>
        <div className="card-header" style={{ marginBottom: 16 }}>
          <div className="card-title">📊 Stock Report</div>
          <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(stockReport.map(i => ({
            Name: i.name, Category: i.category, Price: i.price, Stock: i.stock ?? 0,
            StockValue: ((i.price ?? 0) * (i.stock ?? 0)).toFixed(2),
            DailyPayment: i.dailyPayment, WeeklyPayment: i.weeklyPayment, Status: i.status,
          })), 'stock-report')}>
            <Download size={13} />Export CSV
          </button>
        </div>

        {/* Stock summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total Items', value: hpItems.length, color: 'var(--brand)' },
            { label: 'Total Stock', value: hpItems.reduce((s, i) => s + (i.stock ?? 0), 0), color: 'var(--green)' },
            { label: 'Low Stock (≤2)', value: lowStock.length, color: 'var(--yellow)' },
            { label: 'Out of Stock', value: outOfStock.length, color: 'var(--red)' },
            { label: 'Stock Value', value: `GH₵ ${totalStockValue.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`, color: 'var(--purple)' },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Low stock alert */}
        {lowStock.length > 0 && (
          <div className="alert alert-warning" style={{ marginBottom: 16 }}>
            ⚠️ <strong>{lowStock.length} item(s)</strong> are running low on stock: {lowStock.map(i => i.name).join(', ')}
          </div>
        )}
        {outOfStock.length > 0 && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            🚫 <strong>{outOfStock.length} item(s)</strong> are out of stock: {outOfStock.map(i => i.name).join(', ')}
          </div>
        )}

        {/* Stock table */}
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th><th>Category</th><th>Price</th>
                  <th style={{ textAlign: 'right' }}>Stock</th>
                  <th style={{ textAlign: 'right' }}>Stock Value</th>
                  <th>Daily Payment</th><th>Weekly Payment</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stockReport.map(i => {
                  const stockVal = (i.price ?? 0) * (i.stock ?? 0);
                  const stockColor = (i.stock ?? 0) === 0 ? 'var(--red)' : (i.stock ?? 0) <= 2 ? 'var(--yellow)' : 'var(--green)';
                  return (
                    <tr key={i.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 20 }}>{i.image || '📦'}</span>
                          <div>
                            <div style={{ fontWeight: 700 }}>{i.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{i.description}</div>
                          </div>
                        </div>
                      </td>
                      <td>{i.category}</td>
                      <td style={{ fontWeight: 700 }}>GH₵ {(i.price ?? 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: stockColor, fontSize: 16 }}>{i.stock ?? 0}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>GH₵ {stockVal.toLocaleString('en-GH', { minimumFractionDigits: 2 })}</td>
                      <td>GH₵ {(i.dailyPayment ?? 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}</td>
                      <td>GH₵ {(i.weeklyPayment ?? 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}</td>
                      <td>
                        <span className={`badge ${(i.stock ?? 0) === 0 ? 'badge-red' : (i.stock ?? 0) <= 2 ? 'badge-yellow' : 'badge-green'}`}>
                          {(i.stock ?? 0) === 0 ? 'Out of Stock' : (i.stock ?? 0) <= 2 ? 'Low Stock' : 'In Stock'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
