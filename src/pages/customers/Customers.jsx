import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { Search, Plus, Eye, Edit2, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { authDB } from '../../core/db';

const EMPTY = { name: '', email: '', phone: '', ghanaCard: '', dob: '', address: '', occupation: '', employer: '', monthlyIncome: '', app_username: '', app_password: '' };

export default function Customers() {
  const { customers, addCustomer, updateCustomer, submitApproval, pendingApprovals } = useApp();
  const navigate = useNavigate();
  const user = authDB.currentUser();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const [q, setQ] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const pendingCustomers = (pendingApprovals || []).filter(p => p.type === 'customer' && p.status === 'pending');

  const filtered = useMemo(() =>
    customers.filter(c =>
      (c.name || '').toLowerCase().includes(q.toLowerCase()) ||
      (c.phone || '').includes(q) ||
      (c.email || '').toLowerCase().includes(q.toLowerCase()) ||
      (c.ghana_card || c.ghanaCard || '').toLowerCase().includes(q.toLowerCase())
    ), [customers, q]);

  const openAdd = () => { setEditing(null); setForm(EMPTY); setError(''); setSubmitted(false); setModal(true); };
  const openEdit = (c) => { setEditing(c); setForm({ ...c }); setError(''); setSubmitted(false); setModal(true); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      if (editing) {
        // Edits go direct (admin only action)
        const result = await updateCustomer(editing.id, form);
        if (result?.error) { setError(result.error?.message || 'Failed to update.'); setSaving(false); return; }
        setModal(false);
      } else {
        if (isAdmin) {
          // Admin creates directly
          const result = await addCustomer(form);
          if (result?.error) { setError(result.error?.message || 'Failed to save.'); setSaving(false); return; }
          setModal(false);
        } else {
          // Teller/others submit for approval
          const result = await submitApproval('customer', form);
          if (result?.error) { setError(result.error?.message || 'Failed to submit.'); setSaving(false); return; }
          setSubmitted(true);
        }
      }
    } catch (err) { setError(err.message || 'Unexpected error'); }
    setSaving(false);
  };

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Customers</div>
          <div className="page-desc">{customers.length} registered customers</div>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={openAdd}><Plus size={15} />Add Customer</button>
        </div>
      </div>

      {/* Pending approvals banner */}
      {pendingCustomers.length > 0 && isAdmin && (
        <div className="alert alert-warning" style={{ marginBottom: 16, cursor: 'pointer' }} onClick={() => navigate('/approvals')}>
          <Clock size={14} />
          <strong>{pendingCustomers.length} customer creation(s)</strong> pending your approval.
          <span style={{ marginLeft: 8, textDecoration: 'underline' }}>Review →</span>
        </div>
      )}
      {pendingCustomers.length > 0 && !isAdmin && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          <Clock size={14} />
          You have <strong>{pendingCustomers.length} customer submission(s)</strong> awaiting admin approval.
        </div>
      )}

      <div className="card">
        <div style={{ marginBottom: 16 }}>
          <div className="search-box">
            <Search size={15} />
            <input className="form-control" placeholder="Search by name, phone, email, Ghana Card…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Phone</th><th>Ghana Card</th>
                <th>Occupation</th><th>KYC Status</th><th>Joined</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="table-empty">No customers found</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{c.email}</div>
                  </td>
                  <td className="font-mono">{c.phone}</td>
                  <td className="font-mono" style={{ fontSize: 12 }}>{c.ghana_card || c.ghanaCard || '—'}</td>
                  <td>{c.occupation || '—'}</td>
                  <td><Badge status={c.kyc_status || c.kycStatus} /></td>
                  <td style={{ color: 'var(--text-3)', fontSize: 12 }}>{new Date(c.created_at || c.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm btn-icon" title="View" onClick={() => navigate(`/customers/${c.id}`)}><Eye size={14} /></button>
                      <button className="btn btn-ghost btn-sm btn-icon" title="Edit" onClick={() => openEdit(c)}><Edit2 size={14} /></button>
                      {(c.kyc_status || c.kycStatus) !== 'verified' && (
                        <button className="btn btn-ghost btn-sm btn-icon" title="Verify KYC" onClick={() => updateCustomer(c.id, { kyc_status: 'verified' })} style={{ color: 'var(--green)' }}>
                          <CheckCircle size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Customer' : 'Add New Customer'} size="lg"
        footer={submitted ? (
          <button className="btn btn-primary" onClick={() => setModal(false)}>Done</button>
        ) : (
          <>
            <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : isAdmin ? 'Add Customer' : 'Submit for Approval'}
            </button>
          </>
        )}>
        {submitted ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <Clock size={40} style={{ color: 'var(--yellow)', margin: '0 auto 12px', display: 'block' }} />
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Submitted for Approval</div>
            <div style={{ color: 'var(--text-3)', fontSize: 13 }}>
              Customer <strong>{form.name}</strong> has been submitted. An admin or manager must approve before the record is created.
            </div>
          </div>
        ) : (
        <form onSubmit={save}>
          {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
          {!isAdmin && !editing && (
            <div className="alert alert-info" style={{ marginBottom: 16 }}>
              <AlertCircle size={13} />As a teller, customer creation requires admin approval.
            </div>
          )}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Full Name <span className="required">*</span></label>
              <input className="form-control" value={form.name} onChange={f('name')} required placeholder="Kwame Mensah" />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-control" type="email" value={form.email} onChange={f('email')} placeholder="kwame@email.com" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Phone <span className="required">*</span></label>
              <input className="form-control" value={form.phone} onChange={f('phone')} required placeholder="0551234567" />
            </div>
            <div className="form-group">
              <label className="form-label">Ghana Card Number</label>
              <input className="form-control" value={form.ghanaCard} onChange={f('ghanaCard')} placeholder="GHA-123456789-0" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Date of Birth</label>
              <input className="form-control" type="date" value={form.dob} onChange={f('dob')} />
            </div>
            <div className="form-group">
              <label className="form-label">Address</label>
              <input className="form-control" value={form.address} onChange={f('address')} placeholder="Accra, Greater Accra" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Occupation</label>
              <input className="form-control" value={form.occupation} onChange={f('occupation')} placeholder="Teacher" />
            </div>
            <div className="form-group">
              <label className="form-label">Employer</label>
              <input className="form-control" value={form.employer} onChange={f('employer')} placeholder="GES" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Monthly Income (GH₵)</label>
            <input className="form-control" type="number" value={form.monthlyIncome} onChange={f('monthlyIncome')} placeholder="3500" />
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
              📱 Customer App Login
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">App Username</label>
                <input className="form-control" value={form.app_username} onChange={f('app_username')} placeholder="e.g. kwame.mensah" autoCapitalize="none" />
                <div className="form-hint">Used to sign in to the customer mobile app</div>
              </div>
              <div className="form-group">
                <label className="form-label">App Password</label>
                <input className="form-control" value={form.app_password} onChange={f('app_password')} placeholder="Set a password" />
                <div className="form-hint">Customer will use this to log in</div>
              </div>
            </div>
          </div>
        </form>
        )}
      </Modal>
    </div>
  );
}
