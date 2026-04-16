import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { authDB } from '../../core/db';
import Modal from '../../components/ui/Modal';
import { Plus, Edit2, Trash2, Upload, Download, FileText, BarChart2, Clock, RefreshCw, TrendingUp } from 'lucide-react';
import { exportHPCataloguePDF, exportCSV } from '../../core/export';
import Papa from 'papaparse';

const CATEGORIES = ['Electronics', 'Appliances', 'Mobile', 'Power', 'Furniture', 'Other'];
const EMPTY = { name: '', category: 'Electronics', price: '', stock: '', image: '', description: '', dailyPayment: '', weeklyPayment: '' };
const GHS = n => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;
const fmtDT = d => d ? new Date(d).toLocaleString('en-GH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export default function HPItems() {
  const { hpItems, addHPItem, updateHPItem, deleteHPItem } = useApp();
  const user = authDB.currentUser();
  const [modal, setModal] = useState(false);
  const [tab, setTab] = useState('catalogue');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [catFilter, setCatFilter] = useState('all');

  // Activity log — tracks add/edit/delete with timestamps in this session + persisted via localStorage
  const [activityLog, setActivityLog] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hp_activity_log') || '[]'); } catch { return []; }
  });

  const logActivity = (action, item, extra = {}) => {
    const entry = {
      id: Date.now() + Math.random(),
      action,           // 'added' | 'updated' | 'deleted' | 'imported'
      itemId: item?.id || null,
      itemName: item?.name || '—',
      category: item?.category || '—',
      price: item?.price || 0,
      stock: item?.stock ?? 0,
      by: user?.name || 'Admin',
      at: new Date().toISOString(),
      ...extra,
    };
    setActivityLog(p => {
      const next = [entry, ...p].slice(0, 200); // keep last 200
      localStorage.setItem('hp_activity_log', JSON.stringify(next));
      return next;
    });
  };

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
      logActivity(editing ? 'updated' : 'added', { ...data, id: editing?.id, name: data.name });
      setModal(false);
    } catch (err) { alert('Error: ' + err.message); }
    setSaving(false);
  };

  const handlePriceChange = (e) => {
    const price = parseFloat(e.target.value) || 0;
    setForm(p => ({
      ...p, price: e.target.value,
      dailyPayment: price > 0 ? (price / 180).toFixed(2) : '',
      weeklyPayment: price > 0 ? (price / 26).toFixed(2) : '',
    }));
  };

  const handleDelete = async (item) => {
    logActivity('deleted', item);
    await deleteHPItem(item.id);
    setConfirmDelete(null);
  };

  const filtered = catFilter === 'all' ? hpItems : hpItems.filter(i => i.category === catFilter);

  // Stock report data
  const stockReport = [...hpItems].sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0));
  const lowStock = hpItems.filter(i => (i.stock ?? 0) <= 2 && (i.stock ?? 0) > 0);
  const outOfStock = hpItems.filter(i => (i.stock ?? 0) === 0);
  const totalStockValue = hpItems.reduce((s, i) => s + (i.price ?? 0) * (i.stock ?? 0), 0);
  const totalItems = hpItems.length;
  const totalStock = hpItems.reduce((s, i) => s + (i.stock ?? 0), 0);
  const avgPrice = totalItems > 0 ? hpItems.reduce((s, i) => s + (i.price ?? 0), 0) / totalItems : 0;

  // Category breakdown
  const catBreakdown = CATEGORIES.map(cat => {
    const items = hpItems.filter(i => i.category === cat);
    return {
      cat,
      count: items.length,
      stock: items.reduce((s, i) => s + (i.stock ?? 0), 0),
      value: items.reduce((s, i) => s + (i.price ?? 0) * (i.stock ?? 0), 0),
    };
  }).filter(c => c.count > 0);

  // Activity stats
  const added   = activityLog.filter(a => a.action === 'added').length;
  const updated = activityLog.filter(a => a.action === 'updated').length;
  const deleted = activityLog.filter(a => a.action === 'deleted').length;

  const exportComprehensiveReport = () => {
    const rows = [
      // Summary section
      ['=== SUMMARY ===', '', '', '', '', '', ''],
      ['Total Items', totalItems, '', 'Total Stock', totalStock, '', ''],
      ['Stock Value', GHS(totalStockValue), '', 'Avg Price', GHS(avgPrice), '', ''],
      ['Low Stock', lowStock.length, '', 'Out of Stock', outOfStock.length, '', ''],
      ['', '', '', '', '', '', ''],
      // Inventory
      ['=== INVENTORY ===', '', '', '', '', '', ''],
      ['Item', 'Category', 'Price', 'Stock', 'Stock Value', 'Daily', 'Weekly', 'Status', 'Created', 'Last Updated'],
      ...stockReport.map(i => [
        i.name, i.category,
        GHS(i.price), i.stock ?? 0,
        GHS((i.price ?? 0) * (i.stock ?? 0)),
        GHS(i.dailyPayment), GHS(i.weeklyPayment),
        (i.stock ?? 0) === 0 ? 'Out of Stock' : (i.stock ?? 0) <= 2 ? 'Low Stock' : 'In Stock',
        fmtDT(i.created_at || i.createdAt),
        fmtDT(i.updated_at || i.updatedAt),
      ]),
      ['', '', '', '', '', '', ''],
      // Activity log
      ['=== ACTIVITY LOG ===', '', '', '', '', '', ''],
      ['Action', 'Item', 'Category', 'Price', 'Stock', 'By', 'Date & Time'],
      ...activityLog.map(a => [
        a.action.toUpperCase(), a.itemName, a.category,
        GHS(a.price), a.stock, a.by, fmtDT(a.at),
      ]),
    ];
    exportCSV(rows.map(r => ({
      Col1: r[0], Col2: r[1], Col3: r[2], Col4: r[3],
      Col5: r[4], Col6: r[5], Col7: r[6], Col8: r[7] || '', Col9: r[8] || '', Col10: r[9] || '',
    })), 'hp-items-comprehensive-report-' + new Date().toISOString().slice(0, 10));
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">HP Items Catalogue</div>
          <div className="page-desc">Physical goods offered on hire purchase — TVs, fridges, phones and more</div>
        </div>
        <div className="page-header-right">
          <button className="btn btn-secondary" onClick={() => exportCSV(hpItems.map(i => ({ Name: i.name, Category: i.category, Description: i.description, Price: i.price, Stock: i.stock, Daily: i.dailyPayment, Weekly: i.weeklyPayment, Created: fmtDT(i.created_at), Updated: fmtDT(i.updated_at) })), 'hp-catalogue')}>
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

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        {[
          { k: 'catalogue', l: 'Catalogue' },
          { k: 'stock',     l: '📊 Stock Report' },
          { k: 'report',    l: '📋 Comprehensive Report' },
          { k: 'activity',  l: `🕐 Activity Log${activityLog.length > 0 ? ` (${activityLog.length})` : ''}` },
        ].map(t => (
          <div key={t.k} className={`tab ${tab === t.k ? 'active' : ''}`} onClick={() => setTab(t.k)}>{t.l}</div>
        ))}
      </div>

      {/* ── CATALOGUE ── */}
      {tab === 'catalogue' && (
        <>
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
                  <div style={{ position: 'absolute', top: 12, right: 12 }}>
                    <span className={`badge ${item.stock > 0 ? (item.stock <= 2 ? 'badge-yellow' : 'badge-green') : 'badge-red'}`}>
                      {item.stock > 0 ? `${item.stock} in stock` : 'Out of stock'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
                      {item.image || '📦'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>{item.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{item.category}</div>
                    </div>
                  </div>
                  {item.description && <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.5 }}>{item.description}</div>}
                  <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Cash Price</span>
                      <span style={{ fontSize: 15, fontWeight: 800 }}>{GHS(item.price)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1, background: 'var(--blue-bg)', borderRadius: 6, padding: '6px 10px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: '#1e40af', fontWeight: 700, textTransform: 'uppercase' }}>Daily</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#1e40af' }}>{GHS(item.dailyPayment)}</div>
                      </div>
                      <div style={{ flex: 1, background: 'var(--purple-bg)', borderRadius: 6, padding: '6px 10px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: '#5b21b6', fontWeight: 700, textTransform: 'uppercase' }}>Weekly</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#5b21b6' }}>{GHS(item.weeklyPayment)}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {(item.created_at || item.createdAt) && <span>Added: {fmtDT(item.created_at || item.createdAt)}</span>}
                    {(item.updated_at || item.updatedAt) && <span>Updated: {fmtDT(item.updated_at || item.updatedAt)}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => openEdit(item)}><Edit2 size={13} />Edit</button>
                    <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--red)' }} onClick={() => setConfirmDelete(item)}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── STOCK REPORT ── */}
      {tab === 'stock' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(stockReport.map(i => ({
              Name: i.name, Category: i.category, Price: GHS(i.price), Stock: i.stock ?? 0,
              StockValue: GHS((i.price ?? 0) * (i.stock ?? 0)),
              Daily: GHS(i.dailyPayment), Weekly: GHS(i.weeklyPayment),
              Status: (i.stock ?? 0) === 0 ? 'Out of Stock' : (i.stock ?? 0) <= 2 ? 'Low Stock' : 'In Stock',
              DateAdded: fmtDT(i.created_at || i.createdAt),
              LastUpdated: fmtDT(i.updated_at || i.updatedAt),
            })), 'stock-report')}>
              <Download size={13} />Export CSV
            </button>
          </div>
          <div className="stat-grid" style={{ marginBottom: 20 }}>
            {[
              { label: 'Total Items',    value: totalItems,         color: 'var(--brand)',  bg: 'var(--blue-bg)' },
              { label: 'Total Stock',    value: totalStock,         color: 'var(--green)',  bg: 'var(--green-bg)' },
              { label: 'Low Stock (≤2)', value: lowStock.length,    color: 'var(--yellow)', bg: 'var(--yellow-bg)' },
              { label: 'Out of Stock',   value: outOfStock.length,  color: 'var(--red)',    bg: 'var(--red-bg)' },
              { label: 'Stock Value',    value: GHS(totalStockValue), color: 'var(--purple)', bg: 'var(--purple-bg)' },
              { label: 'Avg Price',      value: GHS(avgPrice),      color: '#0f766e',       bg: '#f0fdfa' },
            ].map(s => (
              <div key={s.label} className="stat-card" style={{ borderTop: `3px solid ${s.color}` }}>
                <div className="stat-info">
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value" style={{ color: s.color, fontSize: 20 }}>{s.value}</div>
                </div>
                <div className="stat-icon" style={{ background: s.bg }}><BarChart2 size={18} style={{ color: s.color }} /></div>
              </div>
            ))}
          </div>
          {lowStock.length > 0 && <div className="alert alert-warning" style={{ marginBottom: 12 }}>⚠️ <strong>{lowStock.length} item(s)</strong> low on stock: {lowStock.map(i => i.name).join(', ')}</div>}
          {outOfStock.length > 0 && <div className="alert alert-error" style={{ marginBottom: 12 }}>🚫 <strong>{outOfStock.length} item(s)</strong> out of stock: {outOfStock.map(i => i.name).join(', ')}</div>}
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Item</th><th>Category</th><th>Price</th><th style={{ textAlign: 'right' }}>Stock</th><th style={{ textAlign: 'right' }}>Stock Value</th><th>Daily</th><th>Weekly</th><th>Date Added</th><th>Last Updated</th><th>Status</th></tr></thead>
                <tbody>
                  {stockReport.map(i => {
                    const sv = (i.price ?? 0) * (i.stock ?? 0);
                    const sc = (i.stock ?? 0) === 0 ? 'var(--red)' : (i.stock ?? 0) <= 2 ? 'var(--yellow)' : 'var(--green)';
                    return (
                      <tr key={i.id}>
                        <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 18 }}>{i.image || '📦'}</span><div><div style={{ fontWeight: 700 }}>{i.name}</div><div style={{ fontSize: 11, color: 'var(--text-3)' }}>{i.description}</div></div></div></td>
                        <td>{i.category}</td>
                        <td style={{ fontWeight: 700 }}>{GHS(i.price)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: sc, fontSize: 15 }}>{i.stock ?? 0}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{GHS(sv)}</td>
                        <td>{GHS(i.dailyPayment)}</td>
                        <td>{GHS(i.weeklyPayment)}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDT(i.created_at || i.createdAt)}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDT(i.updated_at || i.updatedAt)}</td>
                        <td><span className={`badge ${(i.stock ?? 0) === 0 ? 'badge-red' : (i.stock ?? 0) <= 2 ? 'badge-yellow' : 'badge-green'}`}>{(i.stock ?? 0) === 0 ? 'Out of Stock' : (i.stock ?? 0) <= 2 ? 'Low Stock' : 'In Stock'}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── COMPREHENSIVE REPORT ── */}
      {tab === 'report' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Generated: {fmtDT(new Date().toISOString())}</div>
            <button className="btn btn-primary btn-sm" onClick={exportComprehensiveReport}><Download size={13} />Export Full Report (CSV)</button>
          </div>

          {/* KPI summary */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header"><div className="card-title">📊 Inventory Summary</div></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                ['Total Items in Catalogue', totalItems,          'var(--brand)'],
                ['Total Units in Stock',     totalStock,          'var(--green)'],
                ['Total Stock Value',        GHS(totalStockValue),'var(--purple)'],
                ['Average Item Price',       GHS(avgPrice),       '#0f766e'],
                ['Low Stock Items',          lowStock.length,     'var(--yellow)'],
                ['Out of Stock Items',       outOfStock.length,   'var(--red)'],
              ].map(([l, v, c]) => (
                <div key={l} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '12px 14px', borderLeft: `3px solid ${c}` }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{l}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: c }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Category breakdown */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header"><div className="card-title">📂 Category Breakdown</div></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Category</th><th style={{ textAlign: 'right' }}>Items</th><th style={{ textAlign: 'right' }}>Total Stock</th><th style={{ textAlign: 'right' }}>Stock Value</th><th>Share of Value</th></tr></thead>
                <tbody>
                  {catBreakdown.map(c => (
                    <tr key={c.cat}>
                      <td style={{ fontWeight: 700 }}>{c.cat}</td>
                      <td style={{ textAlign: 'right' }}>{c.count}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{c.stock}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>{GHS(c.value)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3 }}>
                            <div style={{ height: '100%', borderRadius: 3, background: 'var(--brand)', width: totalStockValue > 0 ? ((c.value / totalStockValue) * 100).toFixed(1) + '%' : '0%' }} />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-3)', minWidth: 36 }}>{totalStockValue > 0 ? ((c.value / totalStockValue) * 100).toFixed(1) : 0}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Full inventory with dates */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <div className="card-title">📦 Full Inventory with Dates</div>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{totalItems} items · sorted by newest first</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Item</th><th>Category</th><th>Price</th><th>Stock</th><th>Stock Value</th><th>Date Added</th><th>Last Updated</th><th>Status</th></tr></thead>
                <tbody>
                  {[...hpItems].sort((a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0)).map(i => (
                    <tr key={i.id}>
                      <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span>{i.image || '📦'}</span><span style={{ fontWeight: 700 }}>{i.name}</span></div></td>
                      <td>{i.category}</td>
                      <td style={{ fontWeight: 700 }}>{GHS(i.price)}</td>
                      <td style={{ fontWeight: 700, color: (i.stock ?? 0) === 0 ? 'var(--red)' : (i.stock ?? 0) <= 2 ? 'var(--yellow)' : 'var(--green)' }}>{i.stock ?? 0}</td>
                      <td>{GHS((i.price ?? 0) * (i.stock ?? 0))}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDT(i.created_at || i.createdAt)}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDT(i.updated_at || i.updatedAt)}</td>
                      <td><span className={`badge ${(i.stock ?? 0) === 0 ? 'badge-red' : (i.stock ?? 0) <= 2 ? 'badge-yellow' : 'badge-green'}`}>{(i.stock ?? 0) === 0 ? 'Out of Stock' : (i.stock ?? 0) <= 2 ? 'Low Stock' : 'In Stock'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Activity summary */}
          <div className="card">
            <div className="card-header"><div className="card-title">🕐 Activity Summary</div></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                ['Items Added',   added,                                                    'var(--green)',  '➕'],
                ['Items Updated', updated,                                                  'var(--brand)',  '✏️'],
                ['Items Deleted', deleted,                                                  'var(--red)',    '🗑️'],
                ['CSV Imports',   activityLog.filter(a => a.action === 'imported').length,  '#0f766e',      '📥'],
              ].map(([l, v, c, icon]) => (
                <div key={l} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '14px 16px', borderTop: `3px solid ${c}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: c }}>{v}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', marginTop: 4 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── ACTIVITY LOG ── */}
      {tab === 'activity' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{activityLog.length} events recorded</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(activityLog.map(a => ({ Action: a.action.toUpperCase(), Item: a.itemName, Category: a.category, Price: GHS(a.price), Stock: a.stock, By: a.by, DateTime: fmtDT(a.at) })), 'hp-activity-log')}>
                <Download size={13} />Export Log
              </button>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => { if (window.confirm('Clear activity log?')) { setActivityLog([]); localStorage.removeItem('hp_activity_log'); } }}>
                <Trash2 size={13} />Clear Log
              </button>
            </div>
          </div>
          {activityLog.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>
              <Clock size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: .3 }} />
              <div style={{ fontWeight: 700, marginBottom: 4 }}>No activity yet</div>
              <div style={{ fontSize: 13 }}>Adding, editing, deleting or importing items will appear here</div>
            </div>
          ) : (
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Action</th><th>Item</th><th>Category</th><th>Price</th><th>Stock</th><th>By</th><th>Date & Time</th></tr></thead>
                  <tbody>
                    {activityLog.map(a => {
                      const colors = { added: 'badge-green', updated: 'badge-blue', deleted: 'badge-red', imported: 'badge-purple' };
                      return (
                        <tr key={a.id}>
                          <td><span className={`badge ${colors[a.action] || 'badge-gray'}`}>{a.action.toUpperCase()}</span></td>
                          <td style={{ fontWeight: 700 }}>{a.itemName}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{a.category}</td>
                          <td style={{ fontWeight: 600 }}>{GHS(a.price)}</td>
                          <td>{a.stock}</td>
                          <td style={{ fontSize: 12 }}>{a.by}</td>
                          <td style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDT(a.at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
          <button className="btn btn-danger" onClick={() => handleDelete(confirmDelete)}>Remove</button>
        </>}>
        <div className="alert alert-error">Remove <strong>{confirmDelete?.name}</strong> from the catalogue? This will be logged in the activity log.</div>
      </Modal>
    </div>
  );
}
