import React, { useState, useEffect } from 'react';
import { usersDB, authDB } from '../../core/db';
import { supabase } from '../../core/supabase';
import Modal from '../../components/ui/Modal';
import { Shield, Trash2, AlertTriangle, CheckCircle, Save } from 'lucide-react';
import { loadApprovalRules, saveApprovalRules, clearRulesCache, DEFAULT_RULES } from '../../core/approvalRules';

const TABLES = [
  { key: 'transactions',        label: 'Transactions',         desc: 'All posted transactions',       danger: true  },
  { key: 'hp_payments',         label: 'HP Payments',          desc: 'Hire purchase payment records', danger: true  },
  { key: 'hp_agreements',       label: 'HP Agreements',        desc: 'All HP agreements',             danger: true  },
  { key: 'collections',         label: 'Collections',          desc: 'Field collection records',      danger: false },
  { key: 'loans',               label: 'Loans',                desc: 'All loan records',              danger: true  },
  { key: 'accounts',            label: 'Accounts',             desc: 'All customer accounts',         danger: true  },
  { key: 'customers',           label: 'Customers',            desc: 'All customer records',          danger: true  },
  { key: 'pending_transactions',label: 'Pending Transactions', desc: 'Approval queue',                danger: false },
  { key: 'audit_log',           label: 'Audit Log',            desc: 'System audit trail',            danger: false },
];

const ALL_ROLES = ['teller', 'manager', 'collector', 'viewer'];

const RULE_DEFS = [
  { key: 'credit_threshold',   label: 'Credit Transaction',   desc: 'Require approval when credit amount exceeds threshold', hasAmount: true  },
  { key: 'debit_threshold',    label: 'Debit Transaction',    desc: 'Require approval when debit amount exceeds threshold',  hasAmount: true  },
  { key: 'transfer_threshold', label: 'Fund Transfer',        desc: 'Require approval when transfer amount exceeds threshold', hasAmount: true },
  { key: 'account_opening',    label: 'Account Opening',      desc: 'All account openings require approval',                hasAmount: false },
  { key: 'loan_creation',      label: 'Loan / HP Creation',   desc: 'New loans and HP agreements require approval',         hasAmount: false },
  { key: 'gl_entry',           label: 'GL Entry',             desc: 'Manual GL journal entries require approval',           hasAmount: false },
  { key: 'customer_creation',  label: 'Customer Registration',desc: 'New customer creation requires approval',              hasAmount: false },
  { key: 'user_creation',      label: 'User Creation',        desc: 'Adding new system users requires approval',            hasAmount: false },
];

const GHS = n => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 0 })}`;

export default function Settings() {
  const user    = authDB.currentUser();
  const isAdmin = user?.role === 'admin';

  const [tab,          setTab]          = useState('system');
  const [msg,          setMsg]          = useState('');
  const [msgType,      setMsgType]      = useState('success');
  const [confirmClear, setConfirmClear] = useState(null);
  const [clearing,     setClearing]     = useState(false);
  const [tableCounts,  setTableCounts]  = useState({});
  const [rules,        setRules]        = useState(DEFAULT_RULES);
  const [savingRules,  setSavingRules]  = useState(false);

  useEffect(() => {
    const loadCounts = async () => {
      const counts = {};
      for (const t of TABLES) {
        const { count } = await supabase.from(t.key).select('*', { count: 'exact', head: true });
        counts[t.key] = count || 0;
      }
      setTableCounts(counts);
    };
    if (isAdmin) loadCounts();
    loadApprovalRules().then(setRules);
  }, [isAdmin]);

  const showMsg = (text, type = 'success') => {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(''), 4000);
  };

  const clearTable = async () => {
    if (!confirmClear) return;
    setClearing(true);
    try {
      const { error } = await supabase.from(confirmClear.key).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) showMsg(`Failed: ${error.message}`, 'error');
      else {
        showMsg(`${confirmClear.label} cleared successfully.`);
        setTableCounts(p => ({ ...p, [confirmClear.key]: 0 }));
      }
    } catch (e) { showMsg(e.message, 'error'); }
    setConfirmClear(null); setClearing(false);
  };

  const updateRule = (key, field, value) => {
    setRules(p => ({ ...p, [key]: { ...p[key], [field]: value } }));
  };

  const toggleRole = (ruleKey, role) => {
    const current = rules[ruleKey]?.roles || [];
    const next = current.includes(role) ? current.filter(r => r !== role) : [...current, role];
    updateRule(ruleKey, 'roles', next);
  };

  const handleSaveRules = async () => {
    setSavingRules(true);
    const { error } = await saveApprovalRules(rules);
    clearRulesCache();
    if (error) showMsg('Failed to save rules: ' + error.message, 'error');
    else showMsg('Approval rules saved successfully.');
    setSavingRules(false);
  };

  return (
    <div className="fade-in" style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Settings</div>
          <div className="page-desc">System configuration and approval rules</div>
        </div>
      </div>

      <div className="tabs">
        <div className={`tab ${tab === 'system'   ? 'active' : ''}`} onClick={() => setTab('system')}>System Info</div>
        <div className={`tab ${tab === 'approval' ? 'active' : ''}`} onClick={() => setTab('approval')}>Approval Rules</div>
        {isAdmin && <div className={`tab ${tab === 'data' ? 'active' : ''}`} onClick={() => setTab('data')}>Data Management</div>}
      </div>

      {msg && (
        <div className={`alert alert-${msgType === 'error' ? 'error' : 'success'}`} style={{ marginBottom: 16 }}>
          {msgType === 'error' ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}{msg}
        </div>
      )}

      {/* ── System Info ── */}
      {tab === 'system' && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header"><div className="card-title">Application Info</div></div>
            {[
              ['Application',  'Majupat Love Enterprise'],
              ['Developer',    'Maxbraynn Technology & Systems'],
              ['Version',      '2.0.0'],
              ['Database',     'Supabase (PostgreSQL)'],
              ['Logged In As', user?.name],
              ['Role',         user?.role],
              ['Email',        user?.email],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 600 }}>{k}</span>
                <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{v || '—'}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">Database Tables</div></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {TABLES.map(t => (
                <div key={t.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{t.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                    {tableCounts[t.key] ?? '…'} rows
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Approval Rules ── */}
      {tab === 'approval' && (
        <div>
          <div className="alert alert-info" style={{ marginBottom: 20 }}>
            <Shield size={14} />
            Configure which actions require approval and which roles are affected. Admins are always exempt.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            {RULE_DEFS.map(def => {
              const rule = rules[def.key] || { enabled: false, roles: [], amount: 0 };
              return (
                <div key={def.key} className="card" style={{ padding: 18, border: `2px solid ${rule.enabled ? 'var(--brand)' : 'var(--border)'}`, transition: 'border .15s' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: rule.enabled ? 16 : 0 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                          <input type="checkbox" checked={!!rule.enabled}
                            onChange={e => updateRule(def.key, 'enabled', e.target.checked)}
                            style={{ width: 16, height: 16, accentColor: 'var(--brand)' }} />
                          <span style={{ fontWeight: 700, fontSize: 14 }}>{def.label}</span>
                        </label>
                        {rule.enabled && (
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'var(--brand-light)', color: 'var(--brand)', fontWeight: 700 }}>
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4, marginLeft: 24 }}>{def.desc}</div>
                    </div>
                  </div>

                  {rule.enabled && (
                    <div style={{ marginLeft: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {/* Amount threshold */}
                      {def.hasAmount && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                            Threshold (GH₵)
                          </label>
                          <input type="number" min="0" step="100"
                            className="form-control"
                            style={{ maxWidth: 160, fontSize: 15, fontWeight: 700 }}
                            value={rule.amount || 0}
                            onChange={e => updateRule(def.key, 'amount', parseFloat(e.target.value) || 0)} />
                          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                            Amounts ≥ {GHS(rule.amount || 0)} will require approval
                          </span>
                        </div>
                      )}

                      {/* Roles */}
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                          Apply to roles
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {ALL_ROLES.map(role => {
                            const on = (rule.roles || []).includes(role);
                            return (
                              <div key={role} onClick={() => toggleRole(def.key, role)}
                                style={{ padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                                  border: `2px solid ${on ? 'var(--brand)' : 'var(--border)'}`,
                                  background: on ? 'var(--brand-light)' : 'var(--surface)',
                                  color: on ? 'var(--brand)' : 'var(--text-3)',
                                  transition: 'all .15s' }}>
                                {role.charAt(0).toUpperCase() + role.slice(1)}
                              </div>
                            );
                          })}
                        </div>
                        {(rule.roles || []).length === 0 && (
                          <div style={{ fontSize: 12, color: 'var(--yellow)', marginTop: 6 }}>
                            ⚠️ No roles selected — rule is enabled but won't apply to anyone
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button className="btn btn-primary btn-lg" onClick={handleSaveRules} disabled={savingRules}>
            <Save size={15} />{savingRules ? 'Saving…' : 'Save Approval Rules'}
          </button>
        </div>
      )}

      {/* ── Data Management ── */}
      {tab === 'data' && isAdmin && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Data Management</div>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Admin only</span>
          </div>
          <div className="alert alert-error" style={{ marginBottom: 20 }}>
            <AlertTriangle size={14} />
            <strong>Warning:</strong> Deleting data is permanent and cannot be undone.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {TABLES.map(t => (
              <div key={t.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', border: `1px solid ${t.danger ? '#fca5a5' : 'var(--border)'}`, borderRadius: 10, background: t.danger ? '#fff5f5' : 'var(--surface)' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{t.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{t.desc} · <strong>{tableCounts[t.key] ?? '…'} rows</strong></div>
                </div>
                <button className="btn btn-danger btn-sm" onClick={() => setConfirmClear(t)} disabled={tableCounts[t.key] === 0}>
                  <Trash2 size={13} />Clear All
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={!!confirmClear} onClose={() => setConfirmClear(null)} title={`Clear ${confirmClear?.label}`}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setConfirmClear(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={clearTable} disabled={clearing}>
            {clearing ? 'Clearing…' : `Yes, Delete All ${confirmClear?.label}`}
          </button>
        </>}>
        <div className="alert alert-error">
          <AlertTriangle size={14} />
          Permanently delete all <strong>{tableCounts[confirmClear?.key] || 0} rows</strong> from <strong>{confirmClear?.label}</strong>? This cannot be undone.
        </div>
      </Modal>
    </div>
  );
}
