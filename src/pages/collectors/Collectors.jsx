import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { Plus, Edit2, UserCheck, Phone, MapPin, TrendingUp, Receipt, Search, X } from 'lucide-react';

const GHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;
const EMPTY = { name: '', phone: '', zone: '', status: 'active', username: '', password: '' };

export default function Collectors() {
  const { collectors, customers, collections, addCollector, updateCollector } = useApp();
  const navigate = useNavigate();

  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [assignModal, setAssignModal] = useState(null);
  const [assignSearch, setAssignSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const openAdd = () => { setEditing(null); setForm(EMPTY); setError(''); setModal(true); };
  const openEdit = (c) => {
    setEditing(c);
    setForm({
      name: c.name, phone: c.phone, zone: c.zone || '',
      status: c.status || 'active',
      username: c.username || '',
      password: '', // don't pre-fill password
    });
    setError('');
    setModal(true);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.name || !form.phone) { setError('Name and phone are required.'); return; }
    if (!form.username) { setError('Username is required.'); return; }
    if (!editing && !form.password) { setError('Password is required for new collectors.'); return; }
    setSaving(true); setError('');
    const payload = {
      name: form.name, phone: form.phone, zone: form.zone,
      status: form.status, username: form.username.trim().toLowerCase(),
    };
    // Only update password if provided
    if (form.password) payload.password = form.password;
    if (editing) await updateCollector(editing.id, payload);
    else await addCollector(payload);
    setModal(false); setSaving(false);
  };

  // Get assigned customer IDs for a collector (handle both snake_case and camelCase)
  const getAssigned = (col) =>
    col.assigned_customers || col.assignedCustomers || [];

  const toggleAssign = async (collectorId, customerId) => {
    const col = collectors.find(c => c.id === collectorId);
    const assigned = getAssigned(col);
    const updated = assigned.includes(customerId)
      ? assigned.filter(id => id !== customerId)
      : [...assigned, customerId];
    await updateCollector(collectorId, { assigned_customers: updated });
    // Update local assignModal reference
    setAssignModal(prev => prev ? { ...prev, assigned_customers: updated } : null);
  };

  // Per-collector stats
  const collectorStats = useMemo(() =>
    collectors.map(col => {
      const colCollections = collections.filter(c =>
        (c.collector_id || c.collectorId) === col.id
      );
      const today = new Date().toDateString();
      const todayAmt = colCollections
        .filter(c => new Date(c.created_at || c.createdAt).toDateString() === today)
        .reduce((s, c) => s + Number(c.amount || 0), 0);
      const thisMonth = new Date().getMonth();
      const monthAmt = colCollections
        .filter(c => new Date(c.created_at || c.createdAt).getMonth() === thisMonth)
        .reduce((s, c) => s + Number(c.amount || 0), 0);
      return {
        ...col,
        totalCollections: colCollections.length,
        todayAmount: todayAmt,
        monthAmount: monthAmt,
        assignedCount: getAssigned(col).length,
      };
    }),
    [collectors, collections]
  );

  // Assign modal customer search
  const assignResults = useMemo(() => {
    if (!assignSearch.trim()) return customers.slice(0, 15);
    const q = assignSearch.toLowerCase();
    return customers.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q)
    ).slice(0, 15);
  }, [customers, assignSearch]);

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Collectors</div>
          <div className="page-desc">{collectors.length} field collectors</div>
        </div>
        <div className="page-header-right">
          <button className="btn btn-secondary" onClick={() => navigate('/collections/record')}>
            <Receipt size={15} />Record Collection
          </button>
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={15} />Add Collector
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Collectors', value: collectors.length, color: 'var(--brand)' },
          { label: 'Active', value: collectors.filter(c => c.status === 'active').length, color: 'var(--green)' },
          { label: "Today's Collections", value: GHS(collectorStats.reduce((s, c) => s + c.todayAmount, 0)), color: 'var(--purple)' },
          { label: 'This Month', value: GHS(collectorStats.reduce((s, c) => s + c.monthAmount, 0)), color: 'var(--yellow)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Collector cards */}
      {collectorStats.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 56 }}>
          <UserCheck size={40} style={{ color: 'var(--text-3)', margin: '0 auto 12px', display: 'block', opacity: .3 }} />
          <div style={{ fontWeight: 700, marginBottom: 6 }}>No collectors yet</div>
          <div style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 20 }}>Add your first field collector to get started</div>
          <button className="btn btn-primary" onClick={openAdd}><Plus size={14} />Add Collector</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {collectorStats.map(col => (
            <div key={col.id} className="card" style={{ position: 'relative', overflow: 'hidden' }}>
              {/* Status stripe */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: col.status === 'active' ? 'var(--green)' : 'var(--border)' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, paddingTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg, var(--brand), #1e40af)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 800, flexShrink: 0 }}>
                    {col.name?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{col.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                      <Phone size={11} />{col.phone}
                    </div>
                    {col.username && (
                      <div style={{ fontSize: 11, color: 'var(--brand)', marginTop: 2, fontWeight: 600 }}>
                        @{col.username}
                      </div>
                    )}
                    {col.zone && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>
                        <MapPin size={11} />{col.zone}
                      </div>
                    )}
                  </div>
                </div>
                <Badge status={col.status} />
              </div>

              {/* Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                {[
                  ['Assigned Customers', col.assignedCount],
                  ['Total Collections', col.totalCollections],
                  ["Today's Amount", GHS(col.todayAmount)],
                  ['This Month', GHS(col.monthAmount)],
                  ['All Time', GHS(col.total_collected ?? col.totalCollected ?? 0)],
                ].map(([k, v]) => (
                  <div key={k} style={{ padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>{k}</div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{v}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => openEdit(col)}>
                  <Edit2 size={13} />Edit
                </button>
                <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => { setAssignModal(col); setAssignSearch(''); }}>
                  <UserCheck size={13} />Assign ({col.assignedCount})
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Collector' : 'Add Collector'}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Collector'}</button>
        </>}>
        <form onSubmit={save}>
          {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Full Name <span className="required">*</span></label>
              <input className="form-control" value={form.name} onChange={f('name')} required placeholder="Ama Boateng" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Phone <span className="required">*</span></label>
              <input className="form-control" value={form.phone} onChange={f('phone')} required placeholder="0551234567" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Username <span className="required">*</span></label>
              <input className="form-control" value={form.username} onChange={f('username')} required placeholder="e.g. ama.boateng" autoComplete="off" />
              <div className="form-hint">Used to log in on the mobile app</div>
            </div>
            <div className="form-group">
              <label className="form-label">Password {!editing && <span className="required">*</span>}</label>
              <input className="form-control" type="password" value={form.password} onChange={f('password')} placeholder={editing ? 'Leave blank to keep current' : 'Set a password'} autoComplete="new-password" />
              {editing && <div className="form-hint">Leave blank to keep existing password</div>}
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Zone / Area</label>
              <input className="form-control" value={form.zone} onChange={f('zone')} placeholder="e.g. Accra Central" />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={form.status} onChange={f('status')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </form>
      </Modal>

      {/* Assign Customers Modal */}
      <Modal open={!!assignModal} onClose={() => setAssignModal(null)}
        title={`Assign Customers — ${assignModal?.name}`} size="lg"
        footer={<button className="btn btn-primary" onClick={() => setAssignModal(null)}>Done</button>}>
        <div>
          <div style={{ marginBottom: 12 }}>
            <div className="search-box">
              <Search size={14} />
              <input className="form-control" placeholder="Search customers…"
                value={assignSearch} onChange={e => setAssignSearch(e.target.value)} autoFocus />
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>
            {getAssigned(assignModal || {}).length} customer(s) assigned
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
            {assignResults.map(c => {
              const assigned = getAssigned(assignModal || {}).includes(c.id);
              return (
                <div key={c.id}
                  onClick={() => toggleAssign(assignModal.id, c.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px',
                    border: `2px solid ${assigned ? 'var(--brand)' : 'var(--border)'}`,
                    borderRadius: 8,
                    background: assigned ? 'var(--brand-light)' : 'var(--surface)',
                    cursor: 'pointer', transition: 'all .15s',
                  }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: assigned ? 'var(--brand)' : 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: assigned ? '#fff' : 'var(--text-3)', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                      {c.name?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{c.phone}</div>
                    </div>
                  </div>
                  {assigned
                    ? <UserCheck size={16} style={{ color: 'var(--brand)', flexShrink: 0 }} />
                    : <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--border)', flexShrink: 0 }} />}
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
}
