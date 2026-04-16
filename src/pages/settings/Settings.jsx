import React, { useState, useEffect } from 'react';
import { authDB } from '../../core/db';
import { supabase } from '../../core/supabase';
import Modal from '../../components/ui/Modal';
import {
  Shield, Trash2, AlertTriangle, CheckCircle, Save, Info,
  Database, Settings as SettingsIcon, ChevronRight, ToggleLeft,
  ToggleRight, DollarSign, Users, Lock, Server, Activity,
  RefreshCw, Package, FileText, Layers,
} from 'lucide-react';
import { loadApprovalRules, saveApprovalRules, clearRulesCache, DEFAULT_RULES } from '../../core/approvalRules';

const TABLES = [
  { key: 'transactions',         label: 'Transactions',          desc: 'All posted transactions',        danger: true,  icon: '💳' },
  { key: 'hp_payments',          label: 'HP Payments',           desc: 'Hire purchase payment records',  danger: true,  icon: '🛍️' },
  { key: 'hp_agreements',        label: 'HP Agreements',         desc: 'All HP agreements',              danger: true,  icon: '📄' },
  { key: 'collections',          label: 'Collections',           desc: 'Field collection records',       danger: false, icon: '💰' },
  { key: 'loans',                label: 'Loans',                 desc: 'All loan records',               danger: true,  icon: '🏦' },
  { key: 'accounts',             label: 'Accounts',              desc: 'All customer accounts',          danger: true,  icon: '🏧' },
  { key: 'customers',            label: 'Customers',             desc: 'All customer records',           danger: true,  icon: '👥' },
  { key: 'pending_transactions', label: 'Pending Transactions',  desc: 'Approval queue',                 danger: false, icon: '⏳' },
  { key: 'audit_log',            label: 'Audit Log',             desc: 'System audit trail',             danger: false, icon: '📋' },
];

const ALL_ROLES = ['teller', 'manager', 'collector', 'viewer'];

const RULE_DEFS = [
  { key: 'credit_threshold',   label: 'Credit Transaction',    desc: 'Require approval when credit exceeds threshold', hasAmount: true,  icon: '↑', color: '#10b981' },
  { key: 'debit_threshold',    label: 'Debit Transaction',     desc: 'Require approval when debit exceeds threshold',  hasAmount: true,  icon: '↓', color: '#ef4444' },
  { key: 'transfer_threshold', label: 'Fund Transfer',         desc: 'Require approval when transfer exceeds threshold', hasAmount: true, icon: '⇄', color: '#3b82f6' },
  { key: 'account_opening',    label: 'Account Opening',       desc: 'All account openings require approval',          hasAmount: false, icon: '🏦', color: '#8b5cf6' },
  { key: 'loan_creation',      label: 'Loan / HP Creation',    desc: 'New loans and HP agreements require approval',   hasAmount: false, icon: '📋', color: '#f59e0b' },
  { key: 'gl_entry',           label: 'GL Journal Entry',      desc: 'Manual GL journal entries require approval',     hasAmount: false, icon: '📒', color: '#0f766e' },
  { key: 'customer_creation',  label: 'Customer Registration', desc: 'New customer creation requires approval',        hasAmount: false, icon: '👤', color: '#1d4ed8' },
  { key: 'user_creation',      label: 'User Creation',         desc: 'Adding new system users requires approval',      hasAmount: false, icon: '🔑', color: '#be185d' },
];

const ROLE_COLORS = { teller: '#065f46', manager: '#5b21b6', collector: '#92400e', viewer: '#475569' };
const ROLE_BG     = { teller: '#d1fae5', manager: '#ede9fe', collector: '#fef3c7', viewer: '#f1f5f9' };

const GHS = n => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 0 })}`;

const TABS = [
  { key: 'system',   label: 'System Info',      icon: Info,          desc: 'App & database info' },
  { key: 'approval', label: 'Approval Rules',   icon: Shield,        desc: 'Configure approval workflows' },
  { key: 'data',     label: 'Data Management',  icon: Database,      desc: 'Clear & manage data', adminOnly: true },
];

export default function Settings() {
  const user    = authDB.currentUser();
  const isAdmin = user?.role === 'admin';

  const [tab,          setTab]          = useState('system');
  const [msg,          setMsg]          = useState('');
  const [msgType,      setMsgType]      = useState('success');
  const [confirmClear, setConfirmClear] = useState(null);
  const [clearing,     setClearing]     = useState(false);
  const [tableCounts,  setTableCounts]  = useState({});
  const [loadingCounts,setLoadingCounts]= useState(false);
  const [rules,        setRules]        = useState(DEFAULT_RULES);
  const [savingRules,  setSavingRules]  = useState(false);

  const loadCounts = async () => {
    setLoadingCounts(true);
    const counts = {};
    for (const t of TABLES) {
      const { count } = await supabase.from(t.key).select('*', { count: 'exact', head: true });
      counts[t.key] = count || 0;
    }
    setTableCounts(counts);
    setLoadingCounts(false);
  };

  useEffect(() => {
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
      else { showMsg(`${confirmClear.label} cleared.`); setTableCounts(p => ({ ...p, [confirmClear.key]: 0 })); }
    } catch (e) { showMsg(e.message, 'error'); }
    setConfirmClear(null); setClearing(false);
  };

  const updateRule = (key, field, value) => setRules(p => ({ ...p, [key]: { ...p[key], [field]: value } }));
  const toggleRole = (ruleKey, role) => {
    const current = rules[ruleKey]?.roles || [];
    updateRule(ruleKey, 'roles', current.includes(role) ? current.filter(r => r !== role) : [...current, role]);
  };

  const handleSaveRules = async () => {
    setSavingRules(true);
    const { error } = await saveApprovalRules(rules);
    clearRulesCache();
    if (error) showMsg('Failed: ' + error.message, 'error');
    else showMsg('Approval rules saved successfully.');
    setSavingRules(false);
  };

  const activeRules  = RULE_DEFS.filter(d => rules[d.key]?.enabled).length;
  const totalRows    = Object.values(tableCounts).reduce((s, v) => s + v, 0);

  const visibleTabs = TABS.filter(t => !t.adminOnly || isAdmin);

  return (
    <div className="fade-in">
      {/* ── Page Header ── */}
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Settings</div>
          <div className="page-desc">System configuration, approval rules & data management</div>
        </div>
      </div>

      {/* ── Quick stats ── */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card" style={{ borderTop: '3px solid var(--brand)' }}>
          <div className="stat-info">
            <div className="stat-label">App Version</div>
            <div className="stat-value" style={{ color: 'var(--brand)', fontSize: 22 }}>v2.0.0</div>
            <div className="stat-sub">Majupat Love Enterprise</div>
          </div>
          <div className="stat-icon" style={{ background: 'var(--blue-bg)' }}><Server size={20} style={{ color: 'var(--brand)' }} /></div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--green)' }}>
          <div className="stat-info">
            <div className="stat-label">Active Rules</div>
            <div className="stat-value" style={{ color: 'var(--green)' }}>{activeRules}</div>
            <div className="stat-sub">of {RULE_DEFS.length} approval rules</div>
          </div>
          <div className="stat-icon" style={{ background: 'var(--green-bg)' }}><Shield size={20} style={{ color: 'var(--green)' }} /></div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--purple)' }}>
          <div className="stat-info">
            <div className="stat-label">Database Tables</div>
            <div className="stat-value" style={{ color: 'var(--purple)' }}>{TABLES.length}</div>
            <div className="stat-sub">{totalRows.toLocaleString()} total rows</div>
          </div>
          <div className="stat-icon" style={{ background: 'var(--purple-bg)' }}><Database size={20} style={{ color: 'var(--purple)' }} /></div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--yellow)' }}>
          <div className="stat-info">
            <div className="stat-label">Logged In As</div>
            <div className="stat-value" style={{ color: 'var(--yellow)', fontSize: 18 }}>{user?.name?.split(' ')[0]}</div>
            <div className="stat-sub" style={{ textTransform: 'capitalize' }}>{user?.role} · {user?.email}</div>
          </div>
          <div className="stat-icon" style={{ background: 'var(--yellow-bg)' }}><Lock size={20} style={{ color: 'var(--yellow)' }} /></div>
        </div>
      </div>

      {/* ── Alert ── */}
      {msg && (
        <div className={`alert alert-${msgType === 'error' ? 'error' : 'success'}`} style={{ marginBottom: 16 }}>
          {msgType === 'error' ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}{msg}
        </div>
      )}

      {/* ── Layout: sidebar tabs + content ── */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* Sidebar nav */}
        <div style={{ width: 220, flexShrink: 0 }}>
          <div className="card" style={{ padding: 8 }}>
            {visibleTabs.map(t => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <div key={t.key} onClick={() => setTab(t.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
                    background: active ? 'var(--brand-light)' : 'transparent',
                    marginBottom: 2, transition: 'all .15s',
                  }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? 'var(--brand)' : 'var(--surface-2)', flexShrink: 0 }}>
                    <Icon size={16} style={{ color: active ? '#fff' : 'var(--text-3)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: active ? 'var(--brand)' : 'var(--text)' }}>{t.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{t.desc}</div>
                  </div>
                  {active && <ChevronRight size={14} style={{ color: 'var(--brand)', flexShrink: 0 }} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* ── SYSTEM INFO ── */}
          {tab === 'system' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* App info */}
              <div className="card">
                <div className="card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--blue-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Info size={18} style={{ color: 'var(--brand)' }} />
                    </div>
                    <div>
                      <div className="card-title">Application Info</div>
                      <div className="card-subtitle">Build & environment details</div>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    ['Application',  'Majupat Love Enterprise',          'var(--brand)'],
                    ['Developer',    'Maxbraynn Technology & Systems',    null],
                    ['Version',      'v2.0.0',                           'var(--green)'],
                    ['Environment',  'Production',                       'var(--green)'],
                    ['Build',        new Date().getFullYear() + ' Release', null],
                  ].map(([k, v, color]) => (
                    <div key={k} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '12px 14px', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{k}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: color || 'var(--text)' }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Current user */}
              <div className="card">
                <div className="card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--yellow-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Lock size={18} style={{ color: 'var(--yellow)' }} />
                    </div>
                    <div>
                      <div className="card-title">Current Session</div>
                      <div className="card-subtitle">Logged-in user details</div>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                    {user?.name?.[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{user?.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>{user?.email}</div>
                    <div style={{ marginTop: 6 }}>
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'var(--blue-bg)', color: 'var(--brand)', fontWeight: 700, textTransform: 'capitalize' }}>{user?.role}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>STATUS</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', marginTop: 2 }}>● Active</div>
                  </div>
                </div>
              </div>

              {/* Database tables */}
              <div className="card">
                <div className="card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--purple-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Database size={18} style={{ color: 'var(--purple)' }} />
                    </div>
                    <div>
                      <div className="card-title">Database Overview</div>
                      <div className="card-subtitle">{TABLES.length} tables · {totalRows.toLocaleString()} total rows</div>
                    </div>
                  </div>
                  {isAdmin && (
                    <button className="btn btn-secondary btn-sm" onClick={loadCounts} disabled={loadingCounts}>
                      <RefreshCw size={13} className={loadingCounts ? 'spin' : ''} />Refresh
                    </button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {TABLES.map(t => (
                    <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 18 }}>{t.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                          {isAdmin ? (tableCounts[t.key] ?? '…') + ' rows' : t.desc}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── APPROVAL RULES ── */}
          {tab === 'approval' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'var(--blue-bg)', borderRadius: 10, flex: 1 }}>
                  <Shield size={16} style={{ color: 'var(--brand)', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: '#1e40af' }}>
                    Admins are always exempt. Rules apply to the selected roles only.
                  </span>
                </div>
                <button className="btn btn-primary" onClick={handleSaveRules} disabled={savingRules} style={{ whiteSpace: 'nowrap' }}>
                  <Save size={14} />{savingRules ? 'Saving…' : 'Save Rules'}
                </button>
              </div>

              {/* Summary pills */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                <div style={{ padding: '5px 14px', borderRadius: 20, background: 'var(--green-bg)', fontSize: 12, fontWeight: 700, color: '#065f46' }}>
                  {activeRules} active
                </div>
                <div style={{ padding: '5px 14px', borderRadius: 20, background: 'var(--surface-2)', fontSize: 12, fontWeight: 700, color: 'var(--text-3)' }}>
                  {RULE_DEFS.length - activeRules} inactive
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {RULE_DEFS.map(def => {
                  const rule = rules[def.key] || { enabled: false, roles: [], amount: 0 };
                  return (
                    <div key={def.key} className="card" style={{
                      padding: 0, overflow: 'hidden',
                      border: `2px solid ${rule.enabled ? def.color : 'var(--border)'}`,
                      transition: 'border-color .2s',
                    }}>
                      {/* Rule header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: rule.enabled ? def.color + '10' : 'var(--surface)' }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: rule.enabled ? def.color + '20' : 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                          {def.icon}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: rule.enabled ? def.color : 'var(--text)' }}>{def.label}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{def.desc}</div>
                        </div>
                        {/* Toggle */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {rule.enabled && <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, background: def.color + '20', color: def.color, fontWeight: 700 }}>ACTIVE</span>}
                          <div onClick={() => updateRule(def.key, 'enabled', !rule.enabled)} style={{ cursor: 'pointer' }}>
                            {rule.enabled
                              ? <ToggleRight size={32} style={{ color: def.color }} />
                              : <ToggleLeft size={32} style={{ color: 'var(--border-2)' }} />}
                          </div>
                        </div>
                      </div>

                      {/* Rule config — only when enabled */}
                      {rule.enabled && (
                        <div style={{ padding: '14px 18px', borderTop: `1px solid ${def.color}30`, background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 14 }}>

                          {/* Amount threshold */}
                          {def.hasAmount && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px' }}>
                                <DollarSign size={14} style={{ color: 'var(--text-3)' }} />
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>Threshold</span>
                                <input type="number" min="0" step="100"
                                  style={{ width: 120, border: 'none', outline: 'none', fontSize: 15, fontWeight: 800, color: def.color, background: 'transparent', textAlign: 'right' }}
                                  value={rule.amount || 0}
                                  onChange={e => updateRule(def.key, 'amount', parseFloat(e.target.value) || 0)} />
                              </div>
                              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                                Amounts ≥ <strong style={{ color: def.color }}>{GHS(rule.amount || 0)}</strong> will require approval
                              </span>
                            </div>
                          )}

                          {/* Roles */}
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                              Apply to roles
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {ALL_ROLES.map(role => {
                                const on = (rule.roles || []).includes(role);
                                return (
                                  <div key={role} onClick={() => toggleRole(def.key, role)}
                                    style={{
                                      padding: '6px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                                      border: `2px solid ${on ? ROLE_COLORS[role] : 'var(--border)'}`,
                                      background: on ? ROLE_BG[role] : 'var(--surface)',
                                      color: on ? ROLE_COLORS[role] : 'var(--text-3)',
                                      transition: 'all .15s',
                                      display: 'flex', alignItems: 'center', gap: 6,
                                    }}>
                                    {on && <span style={{ fontSize: 10 }}>✓</span>}
                                    {role.charAt(0).toUpperCase() + role.slice(1)}
                                  </div>
                                );
                              })}
                            </div>
                            {(rule.roles || []).length === 0 && (
                              <div style={{ fontSize: 12, color: 'var(--yellow)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <AlertTriangle size={12} /> No roles selected — rule won't apply to anyone
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary btn-lg" onClick={handleSaveRules} disabled={savingRules}>
                  <Save size={15} />{savingRules ? 'Saving…' : 'Save All Approval Rules'}
                </button>
              </div>
            </div>
          )}

          {/* ── DATA MANAGEMENT ── */}
          {tab === 'data' && isAdmin && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Warning banner */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 20px', background: '#fef2f2', border: '2px solid #fca5a5', borderRadius: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <AlertTriangle size={20} style={{ color: 'var(--red)' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#991b1b', marginBottom: 4 }}>Danger Zone — Admin Only</div>
                  <div style={{ fontSize: 13, color: '#7f1d1d', lineHeight: 1.6 }}>
                    Deleting data is <strong>permanent and cannot be undone</strong>. Make sure you have a backup before proceeding. These actions affect live production data.
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
                  Total database rows: <strong style={{ color: 'var(--text)' }}>{totalRows.toLocaleString()}</strong>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={loadCounts} disabled={loadingCounts}>
                  <RefreshCw size={13} className={loadingCounts ? 'spin' : ''} />Refresh Counts
                </button>
              </div>

              {/* Danger tables */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', background: '#fef2f2', borderBottom: '1px solid #fca5a5', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={14} style={{ color: 'var(--red)' }} />
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#991b1b' }}>Critical Tables</span>
                  <span style={{ fontSize: 12, color: '#7f1d1d' }}>— permanent financial records</span>
                </div>
                {TABLES.filter(t => t.danger).map((t, i, arr) => (
                  <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none', background: 'var(--surface)' }}>
                    <span style={{ fontSize: 22, flexShrink: 0 }}>{t.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{t.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{t.desc}</div>
                    </div>
                    <div style={{ textAlign: 'right', marginRight: 16 }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: tableCounts[t.key] > 0 ? 'var(--text)' : 'var(--text-3)' }}>
                        {loadingCounts ? '…' : (tableCounts[t.key] ?? 0).toLocaleString()}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>rows</div>
                    </div>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setConfirmClear(t)}
                      disabled={!tableCounts[t.key] || tableCounts[t.key] === 0}
                      style={{ whiteSpace: 'nowrap' }}>
                      <Trash2 size={13} />Clear
                    </button>
                  </div>
                ))}
              </div>

              {/* Safe tables */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Database size={14} style={{ color: 'var(--text-3)' }} />
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-2)' }}>Operational Tables</span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>— logs & queues</span>
                </div>
                {TABLES.filter(t => !t.danger).map((t, i, arr) => (
                  <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none', background: 'var(--surface)' }}>
                    <span style={{ fontSize: 22, flexShrink: 0 }}>{t.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{t.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{t.desc}</div>
                    </div>
                    <div style={{ textAlign: 'right', marginRight: 16 }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: tableCounts[t.key] > 0 ? 'var(--text)' : 'var(--text-3)' }}>
                        {loadingCounts ? '…' : (tableCounts[t.key] ?? 0).toLocaleString()}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>rows</div>
                    </div>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setConfirmClear(t)}
                      disabled={!tableCounts[t.key] || tableCounts[t.key] === 0}
                      style={{ whiteSpace: 'nowrap' }}>
                      <Trash2 size={13} />Clear
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>{/* end content */}
      </div>{/* end layout */}

      {/* ── Confirm Delete Modal ── */}
      <Modal open={!!confirmClear} onClose={() => setConfirmClear(null)} title={`Clear ${confirmClear?.label}`}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setConfirmClear(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={clearTable} disabled={clearing}>
            {clearing ? 'Clearing…' : `Delete All ${tableCounts[confirmClear?.key] || 0} Rows`}
          </button>
        </>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: '#fef2f2', borderRadius: 10, border: '1px solid #fca5a5' }}>
            <span style={{ fontSize: 28 }}>{confirmClear?.icon}</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#991b1b' }}>{confirmClear?.label}</div>
              <div style={{ fontSize: 13, color: '#7f1d1d', marginTop: 2 }}>{confirmClear?.desc}</div>
            </div>
          </div>
          <div className="alert alert-error">
            <AlertTriangle size={14} />
            Permanently delete <strong>{(tableCounts[confirmClear?.key] || 0).toLocaleString()} rows</strong>? This <strong>cannot be undone</strong>.
          </div>
        </div>
      </Modal>
    </div>
  );
}
