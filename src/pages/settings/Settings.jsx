import React, { useState, useEffect } from 'react';
import { authDB } from '../../core/db';
import { supabase } from '../../core/supabase';
import Modal from '../../components/ui/Modal';
import {
  Shield, Trash2, AlertTriangle, CheckCircle, Save, Info,
  Database, Settings as SettingsIcon, ChevronRight, ToggleLeft,
  ToggleRight, DollarSign, Users, Lock, Server, Activity,
  RefreshCw, Package, FileText, Layers, Download, Archive, RotateCcw,
} from 'lucide-react';
import { loadApprovalRules, saveApprovalRules, clearRulesCache, DEFAULT_RULES } from '../../core/approvalRules';
import { exportFullDatabase } from '../../core/export';
import { runBackup, listBackups, restoreBackup, exportBackupCSV, exportBackupExcel, exportBackupPDF, getNextDownloadDate, getLastDownloadDate, getBackupIntervalMinutes, setBackupIntervalMinutes, getDownloadIntervalDays, setDownloadIntervalDays, startAutoBackup } from '../../core/backup';

const TABLES = [
  { key: 'transactions',         label: 'Transactions',          desc: 'All posted transactions',        danger: true,  icon: '💳' },
  { key: 'hp_payments',          label: 'HP Payments',           desc: 'Hire purchase payment records',  danger: true,  icon: '🛍️' },
  { key: 'hp_agreements',        label: 'HP Agreements',         desc: 'All HP agreements',              danger: true,  icon: '📄' },
  { key: 'loans',                label: 'Loans',                 desc: 'All loan records',               danger: true,  icon: '🏦' },
  { key: 'accounts',             label: 'Accounts',              desc: 'All customer accounts',          danger: true,  icon: '🏧' },
  { key: 'customers',            label: 'Customers',             desc: 'All customer records',           danger: true,  icon: '👥' },
  { key: 'hp_items',             label: 'HP Items',              desc: 'Hire purchase item catalogue',   danger: true,  icon: '📦' },
  { key: 'products',             label: 'Products',              desc: 'Bank product catalogue',         danger: true,  icon: '🏷️' },
  { key: 'gl_entries',           label: 'GL Entries',            desc: 'General ledger journal entries', danger: true,  icon: '📒' },
  { key: 'gl_accounts',          label: 'GL Accounts',           desc: 'Chart of accounts',              danger: true,  icon: '📊' },
  { key: 'collections',          label: 'Collections',           desc: 'Field collection records',       danger: false, icon: '💰' },
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
  { key: 'backup',   label: 'Backups',          icon: Archive,       desc: 'Auto-backup & restore', adminOnly: true },
  { key: 'data',     label: 'Data Management',  icon: Database,      desc: 'Clear & manage data', adminOnly: true },
];

export default function Settings() {
  const user    = authDB.currentUser();
  const isAdmin = user?.role === 'admin';

  const [tab,          setTab]          = useState('system');
  const [msg,          setMsg]          = useState('');
  const [msgType,      setMsgType]      = useState('success');
  const [confirmClear,    setConfirmClear]    = useState(null);
  const [clearing,        setClearing]        = useState(false);
  const [tableCounts,     setTableCounts]     = useState({});
  const [loadingCounts,   setLoadingCounts]   = useState(false);
  const [rules,           setRules]           = useState(DEFAULT_RULES);
  const [savingRules,     setSavingRules]     = useState(false);
  // Clear-all state
  const [clearAllModal,   setClearAllModal]   = useState(false);
  const [clearAllPass,    setClearAllPass]    = useState('');
  const [clearAllStep,    setClearAllStep]    = useState(1);
  const [clearingAll,     setClearingAll]     = useState(false);
  const [clearAllError,   setClearAllError]   = useState('');
  const [showClearPass,   setShowClearPass]   = useState(false);
  // Download all state
  const [downloading,     setDownloading]     = useState(false);
  // Backup state
  const [backups,         setBackups]         = useState([]);
  const [loadingBackups,  setLoadingBackups]  = useState(false);
  const [backingUp,       setBackingUp]       = useState(false);
  const [restoring,       setRestoring]       = useState(null);
  const [restoreModal,    setRestoreModal]    = useState(null);
  const [lastBackup,      setLastBackup]      = useState(null);
  const [exportingId,     setExportingId]     = useState(null);
  const [deletingBackup,  setDeletingBackup]  = useState(null);
  const [backupMins,      setBackupMins]      = useState(() => getBackupIntervalMinutes());
  const [downloadDays,    setDownloadDays]    = useState(() => getDownloadIntervalDays());
  const [savingInterval,  setSavingInterval]  = useState(false);

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

  const loadBackupList = async () => {
    setLoadingBackups(true);
    const { data } = await listBackups();
    setBackups(data || []);
    if (data?.length) setLastBackup(data[0]);
    setLoadingBackups(false);
  };

  useEffect(() => {
    if (isAdmin) { loadCounts(); loadBackupList(); }
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
      const { error } = await supabase
        .from(confirmClear.key)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) showMsg(`Failed: ${error.message}`, 'error');
      else {
        showMsg(`${confirmClear.label} cleared.`);
        setTableCounts(p => ({ ...p, [confirmClear.key]: 0 }));
        // Re-seed GL accounts if they were cleared
        if (confirmClear.key === 'gl_accounts') {
          const glAccounts = [
            { code:'1000', name:'Cash in Hand',              type:'asset',    category:'current_asset',     description:'Physical cash in vault',      is_system:true },
            { code:'1010', name:'Main Operating Account',    type:'asset',    category:'current_asset',     description:'Primary bank account',        is_system:true },
            { code:'1020', name:'Customer Deposits Account', type:'asset',    category:'current_asset',     description:'Held customer deposits',      is_system:true },
            { code:'1030', name:'Savings Pool Account',      type:'asset',    category:'current_asset',     description:'Pooled savings funds',        is_system:true },
            { code:'1100', name:'Loan Receivables',          type:'asset',    category:'current_asset',     description:'Outstanding loans',           is_system:true },
            { code:'2000', name:'Current Accounts',          type:'liability',category:'current_liability', description:'Customer demand deposits',    is_system:true },
            { code:'2010', name:'Savings Accounts',          type:'liability',category:'current_liability', description:'Interest-bearing deposits',   is_system:true },
            { code:'3000', name:'Share Capital',             type:'equity',   category:'equity',            description:'Owner investments',           is_system:true },
            { code:'3010', name:'Retained Earnings',         type:'equity',   category:'equity',            description:'Accumulated profits',         is_system:true },
            { code:'4000', name:'Loan Interest Income',      type:'revenue',  category:'interest_income',   description:'Interest from loans',         is_system:true },
            { code:'5000', name:'Interest on Savings',       type:'expense',  category:'interest_expense',  description:'Paid to savings customers',   is_system:true },
            { code:'5100', name:'Employee Salaries',         type:'expense',  category:'operating_expense', description:'Staff compensation',          is_system:true },
            { code:'5200', name:'Loan Loss Provision',       type:'expense',  category:'provision',         description:'Expected loan defaults',      is_system:true },
          ];
          await supabase.from('gl_accounts').upsert(glAccounts, { onConflict:'code' });
          await loadCounts();
        }
      }
    } catch (e) { showMsg(e.message, 'error'); }
    setConfirmClear(null); setClearing(false);
  };

  // ── Clear ALL data with password gate ────────────────────────────────────────
  // Uses the current admin's own login password for verification

  const handleClearAllVerify = async () => {
    if (!clearAllPass.trim()) {
      setClearAllError('Please enter your password.');
      return;
    }
    // Compare directly against the stored session password
    // The user object in sessionStorage contains the password field
    const storedUser = authDB.currentUser();
    if (!storedUser) {
      setClearAllError('Session expired. Please log in again.');
      return;
    }
    if (clearAllPass.trim() !== storedUser.password) {
      setClearAllError('Incorrect password. Please try again.');
      return;
    }
    setClearAllError('');
    setClearAllStep(2);
  };

  const handleClearAllConfirm = async () => {
    setClearingAll(true);
    try {
      // Delete all rows using neq on id (matches everything)
      // Order: children before parents to avoid FK violations
      const tables = [
        'gl_entries',
        'audit_log',
        'deduction_rules',
        'collections',
        'collector_assignments',
        'hp_payments',
        'pending_approvals',
        'pending_transactions',
        'transactions',
        'notifications',
        'loans',
        'hp_agreements',
        'accounts',
        'customers',
        'collectors',
        'hp_items',
        'products',
        'gl_accounts',
      ];

      for (const tbl of tables) {
        const { error } = await supabase.from(tbl)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) console.warn(`Clear ${tbl}:`, error.message);
      }

      // Delete all users except keep none (we'll re-insert defaults)
      await supabase.from('users')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      // Delete system_settings (uses text PK)
      await supabase.from('system_settings')
        .delete()
        .neq('key', '___never___');

      // Re-insert default admin + teller
      await supabase.from('users').upsert([
        { id:'00000000-0000-0000-0000-000000000001', name:'Admin User', email:'admin@majupat.com',  password:'admin123',  role:'admin'  },
        { id:'00000000-0000-0000-0000-000000000002', name:'Teller One', email:'teller@majupat.com', password:'teller123', role:'teller' },
      ], { onConflict:'email' });

      // Re-insert system settings
      await supabase.from('system_settings').upsert({
        key: 'approval_rules',
        value: {
          credit_threshold:   { enabled:true,  amount:10000, roles:['teller','collector'] },
          debit_threshold:    { enabled:true,  amount:5000,  roles:['teller','collector'] },
          transfer_threshold: { enabled:true,  amount:5000,  roles:['teller','manager']   },
          account_opening:    { enabled:false, roles:['teller'] },
          loan_creation:      { enabled:true,  roles:['teller'] },
          gl_entry:           { enabled:true,  roles:['teller','manager'] },
          customer_creation:  { enabled:false, roles:['teller'] },
          user_creation:      { enabled:false, roles:[] },
        },
      }, { onConflict:'key' });

      // Re-insert GL chart of accounts
      const glAccounts = [
        { code:'1000', name:'Cash in Hand',              type:'asset',    category:'current_asset',     description:'Physical cash in vault',         is_system:true },
        { code:'1010', name:'Main Operating Account',    type:'asset',    category:'current_asset',     description:'Primary bank account',           is_system:true },
        { code:'1020', name:'Customer Deposits Account', type:'asset',    category:'current_asset',     description:'Held customer deposits',         is_system:true },
        { code:'1030', name:'Savings Pool Account',      type:'asset',    category:'current_asset',     description:'Pooled savings funds',           is_system:true },
        { code:'1100', name:'Loan Receivables',          type:'asset',    category:'current_asset',     description:'Outstanding loans',              is_system:true },
        { code:'1110', name:'Interest Receivable',       type:'asset',    category:'current_asset',     description:'Accrued interest from loans',    is_system:true },
        { code:'2000', name:'Current Accounts',          type:'liability',category:'current_liability', description:'Customer demand deposits',        is_system:true },
        { code:'2010', name:'Savings Accounts',          type:'liability',category:'current_liability', description:'Interest-bearing deposits',       is_system:true },
        { code:'2020', name:'Fixed Deposits',            type:'liability',category:'current_liability', description:'Time-bound deposits',            is_system:true },
        { code:'2100', name:'Interest Payable',          type:'liability',category:'current_liability', description:'Interest owed to customers',     is_system:true },
        { code:'3000', name:'Share Capital',             type:'equity',   category:'equity',            description:'Owner investments',              is_system:true },
        { code:'3010', name:'Retained Earnings',         type:'equity',   category:'equity',            description:'Accumulated profits',            is_system:true },
        { code:'4000', name:'Loan Interest Income',      type:'revenue',  category:'interest_income',   description:'Interest from loans',            is_system:true },
        { code:'4100', name:'Account Maintenance Fees',  type:'revenue',  category:'fee_income',        description:'Monthly account fees',           is_system:true },
        { code:'4110', name:'Transaction Fees',          type:'revenue',  category:'fee_income',        description:'Per-transaction charges',        is_system:true },
        { code:'5000', name:'Interest on Savings',       type:'expense',  category:'interest_expense',  description:'Paid to savings customers',      is_system:true },
        { code:'5100', name:'Employee Salaries',         type:'expense',  category:'operating_expense', description:'Staff compensation',             is_system:true },
        { code:'5110', name:'Rent Expense',              type:'expense',  category:'operating_expense', description:'Office rent',                    is_system:true },
        { code:'5200', name:'Loan Loss Provision',       type:'expense',  category:'provision',         description:'Expected loan defaults',         is_system:true },
      ];
      await supabase.from('gl_accounts').upsert(glAccounts, { onConflict:'code' });

      await loadCounts();
      showMsg('All data cleared. Database is fresh and ready.', 'success');
      setClearAllModal(false);
      setClearAllPass('');
      setClearAllStep(1);
    } catch (e) {
      showMsg('Clear failed: ' + e.message, 'error');
    }
    setClearingAll(false);
  };

  const closeClearAll = () => {
    setClearAllModal(false);
    setClearAllPass('');
    setClearAllStep(1);
    setClearAllError('');
  };

  const handleDownloadAll = async () => {
    setDownloading(true);
    try {
      await exportFullDatabase(supabase);
      showMsg('Database exported successfully as ZIP file.', 'success');
    } catch (e) {
      showMsg('Export failed: ' + e.message, 'error');
    }
    setDownloading(false);
  };

  const handleManualBackup = async () => {
    setBackingUp(true);
    const result = await runBackup(user?.name || 'admin');
    if (result.success) {
      showMsg(`Backup saved — ${result.totalRows} rows at ${result.label}`, 'success');
      await loadBackupList();
    } else {
      showMsg('Backup failed: ' + result.error, 'error');
    }
    setBackingUp(false);
  };

  const handleRestore = async () => {
    if (!restoreModal) return;
    setRestoring(restoreModal.id);
    const result = await restoreBackup(restoreModal.id);
    if (result.success) {
      showMsg(`Restored from backup: ${result.label}`, 'success');
      await loadCounts();
    } else {
      showMsg('Restore failed: ' + result.error, 'error');
    }
    setRestoreModal(null);
    setRestoring(null);
  };

  const handleExport = async (backup, format) => {
    setExportingId(backup.id + format);
    try {
      if (format === 'csv')   await exportBackupCSV(backup.id);
      if (format === 'excel') await exportBackupExcel(backup.id);
      if (format === 'pdf')   await exportBackupPDF(backup.id);
    } catch (e) { showMsg('Export failed: ' + e.message, 'error'); }
    setExportingId(null);
  };

  const handleDeleteBackup = async (backup) => {
    setDeletingBackup(backup.id);
    const { error } = await supabase.from('backups').delete().eq('id', backup.id);
    if (error) {
      showMsg('Delete failed: ' + error.message, 'error');
    } else {
      showMsg(`Backup "${backup.label}" deleted.`);
      setBackups(prev => prev.filter(b => b.id !== backup.id));
    }
    setDeletingBackup(null);
  };

  const handleSaveIntervals = () => {
    setSavingInterval(true);
    const mins = Math.max(1, parseInt(backupMins) || 30);
    const days = Math.max(1, parseInt(downloadDays) || 10);
    setBackupIntervalMinutes(mins);
    setDownloadIntervalDays(days);
    setBackupMins(mins);
    setDownloadDays(days);
    // Restart auto-backup with new interval
    startAutoBackup(user?.name || 'admin', (result) => {
      if (result?.success) console.log(`[AutoBackup] ✅ ${result.label}`);
    });
    showMsg(`Backup interval set to every ${mins} minute${mins !== 1 ? 's' : ''}. Download every ${days} day${days !== 1 ? 's' : ''}.`);
    setSavingInterval(false);
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

          {/* ── BACKUP TAB ── */}
          {tab === 'backup' && isAdmin && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

              {/* Status cards */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div style={{ padding:'16px 18px', background:'var(--surface)', borderRadius:12, border:'2px solid var(--brand)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                    <Archive size={18} style={{ color:'var(--brand)' }} />
                    <span style={{ fontWeight:700, fontSize:13, color:'var(--brand)' }}>Auto-Backup (In-App)</span>
                  </div>
                  <div style={{ fontSize:12, color:'var(--text-3)', lineHeight:1.6 }}>
                    Saves to database every <strong>{backupMins} minute{backupMins != 1 ? 's' : ''}</strong> while logged in.<br/>
                    {lastBackup && <>Last: <strong style={{ color:'var(--text)' }}>{lastBackup.label}</strong></>}
                  </div>
                </div>
                <div style={{ padding:'16px 18px', background:'var(--surface)', borderRadius:12, border:'2px solid var(--green)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                    <Download size={18} style={{ color:'var(--green)' }} />
                    <span style={{ fontWeight:700, fontSize:13, color:'var(--green)' }}>Auto-Download (Every 10 Days)</span>
                  </div>
                  <div style={{ fontSize:12, color:'var(--text-3)', lineHeight:1.6 }}>
                    Downloads ZIP to your computer automatically.<br/>
                    Last download: <strong style={{ color:'var(--text)' }}>{getLastDownloadDate()}</strong><br/>
                    Next: <strong style={{ color:'var(--text)' }}>{getNextDownloadDate()}</strong>
                  </div>
                </div>
              </div>

              {/* Interval settings */}
              <div style={{ padding:'16px 18px', background:'var(--surface)', borderRadius:12, border:'1px solid var(--border)' }}>
                <div style={{ fontWeight:700, fontSize:13, color:'var(--text)', marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
                  <Save size={15} style={{ color:'var(--brand)' }} />
                  Backup Schedule Settings
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:14 }}>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:6 }}>
                      Auto-Backup Interval (minutes)
                    </label>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <input
                        type="number" min="1" max="1440"
                        className="form-control"
                        value={backupMins}
                        onChange={e => setBackupMins(e.target.value)}
                        style={{ width:100, fontWeight:700, fontSize:15, textAlign:'center' }}
                      />
                      <span style={{ fontSize:12, color:'var(--text-3)' }}>
                        {backupMins >= 60
                          ? `= ${(backupMins / 60).toFixed(1)} hour${backupMins >= 120 ? 's' : ''}`
                          : `minute${backupMins != 1 ? 's' : ''}`}
                      </span>
                    </div>
                    <div style={{ fontSize:11, color:'var(--text-4)', marginTop:4 }}>
                      Suggested: 15, 30, 60, 120 minutes
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:6 }}>
                      Auto-Download Interval (days)
                    </label>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <input
                        type="number" min="1" max="365"
                        className="form-control"
                        value={downloadDays}
                        onChange={e => setDownloadDays(e.target.value)}
                        style={{ width:100, fontWeight:700, fontSize:15, textAlign:'center' }}
                      />
                      <span style={{ fontSize:12, color:'var(--text-3)' }}>day{downloadDays != 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ fontSize:11, color:'var(--text-4)', marginTop:4 }}>
                      Suggested: 1, 7, 10, 30 days
                    </div>
                  </div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={handleSaveIntervals} disabled={savingInterval}>
                  <Save size={13} />{savingInterval ? 'Saving…' : 'Save Schedule'}
                </button>
              </div>

              {/* Action buttons */}
              <div style={{ display:'flex', gap:10 }}>
                <button className="btn btn-primary" onClick={handleManualBackup} disabled={backingUp}>
                  <Archive size={14} />{backingUp ? 'Backing up…' : 'Backup Now'}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={loadBackupList} disabled={loadingBackups}>
                  <RefreshCw size={13} className={loadingBackups ? 'spin' : ''} />Refresh List
                </button>
              </div>

              {/* Backup list */}
              <div className="card" style={{ padding:0, overflow:'hidden' }}>
                <div style={{ padding:'12px 16px', background:'var(--surface-2)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <Archive size={14} style={{ color:'var(--brand)' }} />
                    <span style={{ fontWeight:700, fontSize:13 }}>Saved Backups</span>
                    <span style={{ fontSize:11, color:'var(--text-3)', background:'var(--surface)', padding:'2px 8px', borderRadius:10, border:'1px solid var(--border)' }}>
                      {backups.length} saved · last 48 kept
                    </span>
                  </div>
                </div>

                {loadingBackups ? (
                  <div style={{ padding:32, textAlign:'center', color:'var(--text-3)' }}>Loading backups…</div>
                ) : backups.length === 0 ? (
                  <div style={{ padding:40, textAlign:'center', color:'var(--text-3)' }}>
                    <Archive size={36} style={{ opacity:0.25, marginBottom:10, display:'block', margin:'0 auto 10px' }} />
                    <div style={{ fontWeight:600, marginBottom:4 }}>No backups yet</div>
                    <div style={{ fontSize:12 }}>Click "Backup Now" to create the first backup.</div>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width:60 }}>#</th>
                          <th>Date &amp; Time</th>
                          <th>Created By</th>
                          <th style={{ textAlign:'right' }}>Rows</th>
                          <th style={{ textAlign:'center', width:260 }}>Export</th>
                          <th style={{ width:100 }}>Restore</th>
                          <th style={{ width:70 }}>Delete</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backups.map((b, i) => (
                          <tr key={b.id} style={{ background: i === 0 ? 'var(--blue-bg)' : undefined }}>
                            <td style={{ fontSize:11, color:'var(--text-3)', fontWeight:700 }}>
                              {i === 0
                                ? <span style={{ color:'var(--brand)', fontSize:10, background:'var(--blue-bg)', padding:'2px 8px', borderRadius:10, border:'1px solid var(--brand)', fontWeight:800 }}>LATEST</span>
                                : `#${backups.length - i}`}
                            </td>
                            <td style={{ fontWeight:600, fontSize:13 }}>{b.label}</td>
                            <td style={{ fontSize:12, color:'var(--text-3)' }}>{b.created_by || '—'}</td>
                            <td style={{ textAlign:'right', fontWeight:700, fontFamily:'monospace', fontSize:13 }}>
                              {(b.size_rows || 0).toLocaleString()}
                            </td>
                            <td>
                              <div style={{ display:'flex', gap:6, justifyContent:'center' }}>
                                {/* CSV */}
                                <button
                                  className="btn btn-secondary btn-sm"
                                  title="Download as CSV (ZIP)"
                                  onClick={() => handleExport(b, 'csv')}
                                  disabled={exportingId === b.id + 'csv'}
                                  style={{ fontSize:11, padding:'4px 10px' }}>
                                  <Download size={11} />
                                  {exportingId === b.id + 'csv' ? '…' : 'CSV'}
                                </button>
                                {/* Excel */}
                                <button
                                  className="btn btn-secondary btn-sm"
                                  title="Download as Excel (.xlsx)"
                                  onClick={() => handleExport(b, 'excel')}
                                  disabled={exportingId === b.id + 'excel'}
                                  style={{ fontSize:11, padding:'4px 10px', color:'#16a34a', borderColor:'#16a34a' }}>
                                  <Download size={11} />
                                  {exportingId === b.id + 'excel' ? '…' : 'Excel'}
                                </button>
                                {/* PDF */}
                                <button
                                  className="btn btn-secondary btn-sm"
                                  title="Download summary as PDF"
                                  onClick={() => handleExport(b, 'pdf')}
                                  disabled={exportingId === b.id + 'pdf'}
                                  style={{ fontSize:11, padding:'4px 10px', color:'#dc2626', borderColor:'#dc2626' }}>
                                  <Download size={11} />
                                  {exportingId === b.id + 'pdf' ? '…' : 'PDF'}
                                </button>
                              </div>
                            </td>
                            <td>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setRestoreModal(b)}
                                disabled={!!restoring}
                                style={{ whiteSpace:'nowrap', fontSize:11 }}>
                                <RotateCcw size={11} />
                                {restoring === b.id ? 'Restoring…' : 'Restore'}
                              </button>
                            </td>
                            <td>
                              <button
                                className="btn btn-danger btn-sm btn-icon"
                                title="Delete this backup"
                                onClick={() => {
                                  if (window.confirm(`Delete backup "${b.label}"? This cannot be undone.`)) {
                                    handleDeleteBackup(b);
                                  }
                                }}
                                disabled={deletingBackup === b.id}
                                style={{ fontSize:11 }}>
                                {deletingBackup === b.id
                                  ? '…'
                                  : <Trash2 size={13} />}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
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

              {/* ── DOWNLOAD ALL DATA ── */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px', background:'var(--surface)', borderRadius:12, border:'2px solid var(--brand)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ width:44, height:44, borderRadius:12, background:'var(--blue-bg)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <Download size={20} style={{ color:'var(--brand)' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight:800, fontSize:15, color:'var(--text)', marginBottom:3 }}>Download All Data</div>
                    <div style={{ fontSize:12, color:'var(--text-3)' }}>
                      Export every table (users, customers, accounts, transactions, loans, HP, collections…) as a ZIP of CSV files.
                    </div>
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleDownloadAll}
                  disabled={downloading}
                  style={{ whiteSpace:'nowrap', marginLeft:16 }}>
                  <Download size={14} />
                  {downloading ? 'Exporting…' : 'Download ZIP'}
                </button>
              </div>

              {/* ── NUCLEAR: Clear ALL data ── */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', background: '#1a0000', borderRadius: 12, border: '2px solid #dc2626' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Trash2 size={20} style={{ color: '#fff' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#fff', marginBottom: 3 }}>Clear All Data</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                      Wipe every record from the database. Requires admin password. Cannot be undone.
                    </div>
                  </div>
                </div>
                <button
                  className="btn btn-danger"
                  onClick={() => { setClearAllModal(true); setClearAllStep(1); setClearAllPass(''); setClearAllError(''); }}
                  style={{ whiteSpace: 'nowrap', marginLeft: 16, background: '#dc2626', borderColor: '#dc2626' }}>
                  <Trash2 size={14} /> Clear All Data
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

      {/* ── Restore Backup Modal ── */}
      <Modal
        open={!!restoreModal}
        onClose={() => setRestoreModal(null)}
        title="Restore Backup"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setRestoreModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleRestore} disabled={!!restoring}>
            <RotateCcw size={14} />{restoring ? 'Restoring…' : 'Restore This Backup'}
          </button>
        </>}>
        {restoreModal && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ padding:'14px 16px', background:'var(--blue-bg)', borderRadius:10, border:'1px solid #bfdbfe' }}>
              <div style={{ fontWeight:800, fontSize:14, color:'#1e40af', marginBottom:4 }}>📦 {restoreModal.label}</div>
              <div style={{ fontSize:13, color:'#1e3a8a' }}>{(restoreModal.size_rows || 0).toLocaleString()} rows · Created by {restoreModal.created_by}</div>
            </div>
            <div className="alert alert-warning">
              <AlertTriangle size={14} />
              This will <strong>replace all current data</strong> with this backup. Current data will be lost.
            </div>
          </div>
        )}
      </Modal>

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

      {/* ── Clear ALL Data Modal ── */}
      <Modal
        open={clearAllModal}
        onClose={closeClearAll}
        title={clearAllStep === 1 ? '🔐 Admin Password Required' : '⚠️ Final Confirmation'}
        footer={
          clearAllStep === 1 ? (
            <>
              <button className="btn btn-secondary" onClick={closeClearAll}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleClearAllVerify()}>
                <Lock size={14} /> Verify Password
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={closeClearAll} disabled={clearingAll}>Cancel</button>
              <button className="btn btn-danger" onClick={handleClearAllConfirm} disabled={clearingAll}>
                <Trash2 size={14} /> {clearingAll ? 'Clearing everything…' : 'Yes, Delete All Data'}
              </button>
            </>
          )
        }>

        {clearAllStep === 1 && (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ padding:'14px 16px', background:'#fef2f2', borderRadius:10, border:'1px solid #fca5a5' }}>
              <div style={{ fontWeight:800, fontSize:14, color:'#991b1b', marginBottom:4 }}>
                This will permanently delete ALL data
              </div>
              <div style={{ fontSize:13, color:'#7f1d1d', lineHeight:1.6 }}>
                Customers, accounts, transactions, loans, HP agreements, collections, and all other records will be wiped. Only the default admin and teller accounts will remain.
              </div>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:8 }}>
                Your Admin Password
              </label>
              <div style={{ position:'relative' }}>
                <input
                  type={showClearPass ? 'text' : 'password'}
                  className="form-control"
                  placeholder="Enter your login password…"
                  value={clearAllPass}
                  onChange={e => { setClearAllPass(e.target.value); setClearAllError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleClearAllVerify()}
                  autoFocus
                  style={{ fontSize:15, paddingRight:60 }}
                />
                <button
                  type="button"
                  onClick={() => setShowClearPass(v => !v)}
                  style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:13, color:'var(--text-3)', fontWeight:600 }}>
                  {showClearPass ? 'Hide' : 'Show'}
                </button>
              </div>
              <div style={{ marginTop:6, fontSize:12, color:'var(--text-3)' }}>
                Use your admin login password — the same one you use to sign in.
              </div>
              {clearAllError && (
                <div style={{ marginTop:8, fontSize:13, color:'var(--red)', display:'flex', alignItems:'center', gap:6 }}>
                  <AlertTriangle size={13} /> {clearAllError}
                </div>
              )}
            </div>
          </div>
        )}

        {clearAllStep === 2 && (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ textAlign:'center', padding:'20px 0' }}>
              <div style={{ fontSize:48, marginBottom:12 }}>🗑️</div>
              <div style={{ fontWeight:900, fontSize:18, color:'#991b1b', marginBottom:8 }}>
                Are you absolutely sure?
              </div>
              <div style={{ fontSize:14, color:'var(--text-3)', lineHeight:1.7 }}>
                You are about to delete <strong style={{ color:'var(--red)' }}>every record</strong> in the database.<br />
                This action is <strong>irreversible</strong>.<br />
                Total rows to delete: <strong style={{ color:'var(--red)' }}>{totalRows.toLocaleString()}</strong>
              </div>
            </div>
            <div style={{ padding:'12px 16px', background:'#fef2f2', borderRadius:10, border:'1px solid #fca5a5', fontSize:13, color:'#7f1d1d', textAlign:'center', fontWeight:600 }}>
              ⚠️ The default admin and teller accounts will be restored automatically.
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
