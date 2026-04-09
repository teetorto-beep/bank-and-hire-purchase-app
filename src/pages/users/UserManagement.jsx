import React, { useState, useEffect } from 'react';
import { usersDB } from '../../core/db';
import Modal from '../../components/ui/Modal';
import { Plus, Edit2, Trash2, Shield, Eye, EyeOff, UserCheck, UserX, Settings } from 'lucide-react';

const ROLES = [
  { value: 'admin',     label: 'Admin',     desc: 'Full system access',                color: '#1e40af', bg: 'var(--blue-bg)' },
  { value: 'manager',   label: 'Manager',   desc: 'View all, approve loans',           color: '#5b21b6', bg: 'var(--purple-bg)' },
  { value: 'teller',    label: 'Teller',    desc: 'Post transactions, open accounts',  color: '#065f46', bg: 'var(--green-bg)' },
  { value: 'collector', label: 'Collector', desc: 'Record collections only',           color: '#92400e', bg: 'var(--yellow-bg)' },
  { value: 'viewer',    label: 'Viewer',    desc: 'Read-only access',                  color: '#475569', bg: '#f1f5f9' },
];

const ALL_MODULES = [
  'Dashboard', 'Customers', 'Accounts', 'Transactions', 'Loans',
  'Collections', 'Products', 'HP Items', 'Reports', 'GL & Accounting',
  'Approvals', 'Settings', 'User Management',
];

const DEFAULT_PERMISSIONS = {
  admin:     ALL_MODULES,
  manager:   ['Dashboard','Customers','Accounts','Transactions','Loans','Collections','Products','HP Items','Reports','GL & Accounting','Approvals'],
  teller:    ['Dashboard','Customers','Accounts','Transactions','Collections'],
  collector: ['Dashboard','Collections'],
  viewer:    ['Dashboard','Reports'],
};

const EMPTY = { name: '', email: '', password: '', role: 'teller', phone: '', status: 'active', permissions: null };

export default function UserManagement() {
  const [users,         setUsers]         = useState([]);
  const [modal,         setModal]         = useState(false);
  const [editing,       setEditing]       = useState(null);
  const [form,          setForm]          = useState(EMPTY);
  const [showPass,      setShowPass]      = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [detailUser,    setDetailUser]    = useState(null);
  const [permModal,     setPermModal]     = useState(null); // user being customised
  const [customPerms,   setCustomPerms]   = useState([]);
  const [error,         setError]         = useState('');

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const reload = async () => {
    const { data } = await usersDB.getAll();
    setUsers(data || []);
  };

  useEffect(() => { reload(); }, []);

  const openAdd = () => {
    setEditing(null); setForm(EMPTY); setShowPass(false); setError(''); setModal(true);
  };
  const openEdit = (u) => {
    setEditing(u); setForm({ ...u, password: '' }); setShowPass(false); setError(''); setModal(true);
  };
  const openPerms = (u) => {
    setPermModal(u);
    setCustomPerms((u.permissions && u.permissions.length > 0) ? u.permissions : DEFAULT_PERMISSIONS[u.role] || []);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email) { setError('Name and email are required.'); return; }
    if (!editing && !form.password) { setError('Password is required for new users.'); return; }
    const existing = users.find(u => u.email === form.email && u.id !== editing?.id);
    if (existing) { setError('A user with this email already exists.'); return; }
    setSaving(true); setError('');
    const data = { ...form };
    if (!data.password) delete data.password;
    // Reset custom permissions when role changes
    if (editing && data.role !== editing.role) data.permissions = null;
    if (editing) {
      await usersDB.update(editing.id, data);
    } else {
      await usersDB.add(data);
    }
    await reload();
    setModal(false); setSaving(false);
  };

  const savePerms = async () => {
    const roleDefault = DEFAULT_PERMISSIONS[permModal.role] || [];
    const isDefault = customPerms.length === roleDefault.length &&
      customPerms.every(p => roleDefault.includes(p));
    const newPerms = isDefault ? null : customPerms;
    await usersDB.update(permModal.id, { permissions: newPerms });

    // If editing the currently logged-in user, update their session so
    // the sidebar reflects the change immediately without re-login
    const session = JSON.parse(sessionStorage.getItem('current_user') || 'null');
    if (session && session.id === permModal.id) {
      const updated = { ...session, permissions: newPerms };
      sessionStorage.setItem('current_user', JSON.stringify(updated));
      // Force a page reload so Sidebar re-reads the session
      window.location.reload();
    }

    await reload();
    setPermModal(null);
  };

  const togglePerm = (mod) => {
    setCustomPerms(p => p.includes(mod) ? p.filter(m => m !== mod) : [...p, mod]);
  };

  const resetPermsToRole = () => {
    setCustomPerms(DEFAULT_PERMISSIONS[permModal.role] || []);
  };

  const toggleStatus = async (u) => {
    await usersDB.update(u.id, { status: u.status === 'active' ? 'inactive' : 'active' });
    await reload();
  };

  const doDelete = async () => {
    await usersDB.remove(confirmDelete.id);
    await reload();
    setConfirmDelete(null);
  };

  const roleInfo = (role) => ROLES.find(r => r.value === role) || ROLES[4];

  const effectivePerms = (u) => (u.permissions && u.permissions.length > 0) ? u.permissions : (DEFAULT_PERMISSIONS[u.role] || []);
  const hasCustomPerms = (u) => !!(u.permissions && u.permissions.length > 0);

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">User Management</div>
          <div className="page-desc">{users.length} system users</div>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={openAdd}><Plus size={15} />Add User</button>
        </div>
      </div>

      {/* Role legend */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {ROLES.map(r => (
          <div key={r.value} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, background: r.bg, fontSize: 12 }}>
            <Shield size={11} style={{ color: r.color }} />
            <span style={{ fontWeight: 700, color: r.color }}>{r.label}</span>
            <span style={{ color: r.color, opacity: .7 }}>— {r.desc}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>User</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {users.map(u => {
                const ri = roleInfo(u.role);
                const joined = u.created_at || u.createdAt;
                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: ri.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: ri.color, flexShrink: 0 }}>
                          {u.name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{u.name}</div>
                          {hasCustomPerms(u) && (
                            <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 700 }}>✦ Custom permissions</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: 13 }}>{u.email}</td>
                    <td style={{ fontSize: 13, color: 'var(--text-3)' }}>{u.phone || '—'}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, background: ri.bg, fontSize: 12, fontWeight: 700, color: ri.color }}>
                        <Shield size={10} />{ri.label}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${u.status === 'active' ? 'badge-green' : 'badge-gray'}`}>
                        {u.status || 'active'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      {joined ? new Date(joined).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm btn-icon" title="View permissions" onClick={() => setDetailUser(u)}><Eye size={14} /></button>
                        <button className="btn btn-ghost btn-sm btn-icon" title="Customise permissions" onClick={() => openPerms(u)} style={{ color: '#7c3aed' }}><Settings size={14} /></button>
                        <button className="btn btn-ghost btn-sm btn-icon" title="Edit" onClick={() => openEdit(u)}><Edit2 size={14} /></button>
                        <button className="btn btn-ghost btn-sm btn-icon" title={u.status === 'active' ? 'Deactivate' : 'Activate'} onClick={() => toggleStatus(u)}
                          style={{ color: u.status === 'active' ? 'var(--yellow)' : 'var(--green)' }}>
                          {u.status === 'active' ? <UserX size={14} /> : <UserCheck size={14} />}
                        </button>
                        <button className="btn btn-ghost btn-sm btn-icon" title="Delete" style={{ color: 'var(--red)' }} onClick={() => setConfirmDelete(u)}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add/Edit Modal ── */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit User' : 'Add New User'}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Add User'}</button>
        </>}>
        <form onSubmit={save}>
          {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Full Name <span className="required">*</span></label>
              <input className="form-control" value={form.name} onChange={f('name')} required placeholder="Kwame Asante" />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-control" value={form.phone} onChange={f('phone')} placeholder="0551234567" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Email Address <span className="required">*</span></label>
            <input className="form-control" type="email" value={form.email} onChange={f('email')} required placeholder="user@bank.com" />
          </div>
          <div className="form-group">
            <label className="form-label">{editing ? 'New Password' : 'Password'} {!editing && <span className="required">*</span>}</label>
            <div style={{ position: 'relative' }}>
              <input className="form-control" type={showPass ? 'text' : 'password'} value={form.password} onChange={f('password')}
                placeholder={editing ? 'Leave blank to keep current' : 'Min 6 characters'} style={{ paddingRight: 40 }} />
              <button type="button" onClick={() => setShowPass(p => !p)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Role <span className="required">*</span></label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ROLES.map(r => (
                <label key={r.value} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: `2px solid ${form.role === r.value ? r.color : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', background: form.role === r.value ? r.bg : 'var(--surface)', transition: 'all .15s' }}>
                  <input type="radio" name="role" value={r.value} checked={form.role === r.value} onChange={f('role')} style={{ display: 'none' }} />
                  <Shield size={14} style={{ color: r.color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: r.color }}>{r.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.desc}</div>
                  </div>
                  {form.role === r.value && <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.color }} />}
                </label>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-control" value={form.status} onChange={f('status')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </form>
      </Modal>

      {/* ── Custom Permissions Modal ── */}
      <Modal open={!!permModal} onClose={() => setPermModal(null)}
        title={`Customise Permissions — ${permModal?.name}`}
        footer={<>
          <button className="btn btn-secondary" onClick={resetPermsToRole}>Reset to Role Defaults</button>
          <button className="btn btn-primary" onClick={savePerms}>Save Permissions</button>
        </>}>
        {permModal && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 14px', background: roleInfo(permModal.role).bg, borderRadius: 8 }}>
              <Shield size={16} style={{ color: roleInfo(permModal.role).color }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: roleInfo(permModal.role).color }}>{roleInfo(permModal.role).label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Toggle modules on/off for this specific user</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {ALL_MODULES.map(mod => {
                const on = customPerms.includes(mod);
                return (
                  <label key={mod} onClick={() => togglePerm(mod)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                      border: `2px solid ${on ? 'var(--green)' : 'var(--border)'}`,
                      background: on ? 'var(--green-bg)' : 'var(--surface)', transition: 'all .15s' }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${on ? 'var(--green)' : 'var(--border)'}`, background: on ? 'var(--green)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {on && <span style={{ color: '#fff', fontSize: 11, fontWeight: 900 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: on ? '#065f46' : 'var(--text-3)' }}>{mod}</span>
                  </label>
                );
              })}
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-3)', padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 6 }}>
              {customPerms.length} of {ALL_MODULES.length} modules enabled
            </div>
          </div>
        )}
      </Modal>

      {/* ── Permissions View Modal ── */}
      <Modal open={!!detailUser} onClose={() => setDetailUser(null)} title={`Permissions — ${detailUser?.name}`}>
        {detailUser && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: 14, background: roleInfo(detailUser.role).bg, borderRadius: 8 }}>
              <Shield size={20} style={{ color: roleInfo(detailUser.role).color }} />
              <div>
                <div style={{ fontWeight: 700, color: roleInfo(detailUser.role).color }}>{roleInfo(detailUser.role).label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {hasCustomPerms(detailUser) ? '✦ Custom permissions applied' : 'Using role defaults'}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {ALL_MODULES.map(mod => {
                const hasAccess = effectivePerms(detailUser).includes(mod);
                return (
                  <div key={mod} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 6, background: hasAccess ? 'var(--green-bg)' : 'var(--surface-2)', border: `1px solid ${hasAccess ? '#a7f3d0' : 'var(--border)'}` }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: hasAccess ? 'var(--green)' : 'var(--border-2)', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: hasAccess ? '#065f46' : 'var(--text-3)' }}>{mod}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Modal>

      {/* ── Confirm Delete ── */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete User"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={doDelete}>Delete User</button>
        </>}>
        <div className="alert alert-error">Delete <strong>{confirmDelete?.name}</strong>? They will lose all access immediately.</div>
      </Modal>
    </div>
  );
}
