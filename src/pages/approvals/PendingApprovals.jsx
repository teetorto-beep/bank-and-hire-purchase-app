import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import Modal from '../../components/ui/Modal';
import { CheckCircle, XCircle, Clock, AlertCircle, RefreshCw, Search } from 'lucide-react';
import { authDB } from '../../core/db';

const GHS = n => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

const TYPE_META = {
  customer:    { label: 'Customer Reg.',      icon: '👤', color: '#2563eb', bg: '#eff6ff',  border: '#bfdbfe' },
  account:     { label: 'Account Opening',    icon: '🏦', color: '#7c3aed', bg: '#f5f3ff',  border: '#ddd6fe' },
  collection:  { label: 'Collection',         icon: '💰', color: '#059669', bg: '#ecfdf5',  border: '#a7f3d0' },
  transaction: { label: 'Transaction',        icon: '💳', color: '#0891b2', bg: '#ecfeff',  border: '#a5f3fc' },
  loan:        { label: 'Loan / HP',          icon: '📋', color: '#d97706', bg: '#fffbeb',  border: '#fde68a' },
  credit:      { label: 'Credit',             icon: '↑',  color: '#059669', bg: '#ecfdf5',  border: '#a7f3d0' },
  debit:       { label: 'Debit',              icon: '↓',  color: '#dc2626', bg: '#fef2f2',  border: '#fca5a5' },
  transfer:    { label: 'Transfer',           icon: '⇄',  color: '#2563eb', bg: '#eff6ff',  border: '#bfdbfe' },
  gl:          { label: 'GL Entry',           icon: '📒', color: '#0f766e', bg: '#f0fdfa',  border: '#99f6e4' },
};

const STATUS = {
  pending:  { label: 'Pending',  bg: '#fef9c3', color: '#92400e', dot: '#d97706' },
  approved: { label: 'Approved', bg: '#d1fae5', color: '#065f46', dot: '#059669' },
  rejected: { label: 'Rejected', bg: '#fee2e2', color: '#991b1b', dot: '#dc2626' },
};

function getMeta(item) {
  if (item._source === 'pending_txn') return TYPE_META[item.type] || TYPE_META.credit;
  return TYPE_META[item.type] || { label: item.type, icon: '📄', color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' };
}

function getTitle(item) {
  const p = item.payload || {};
  if (item._source === 'pending_txn') return `${item.type === 'credit' ? 'Credit' : 'Debit'} — ${GHS(item.amount || p.amount || 0)}`;
  if (item.type === 'customer')    return p.name || 'New Customer';
  if (item.type === 'account')     return `${p.customerName || p.name || '—'} · ${(p.type || p.category || '').replace(/_/g,' ')}`;
  if (item.type === 'collection')  return `${p.customerName || '—'} · ${GHS(p.amount)}`;
  if (item.type === 'transaction') return `${p.type || 'Transaction'} · ${GHS(p.amount)}`;
  if (item.type === 'loan')        return `${p.customerName || '—'} · ${GHS(p.amount)}`;
  return item.type;
}

function getDetails(item) {
  const p = item.payload || {};
  if (item._source === 'pending_txn') return [
    ['Account',   item.accountNumber || p.accountId || '—'],
    ['Customer',  item.customerName  || '—'],
    ['Amount',    GHS(item.amount || p.amount || 0)],
    ['Narration', item.narration || p.narration || '—'],
    ['Channel',   item.channel || p.channel || 'teller'],
  ];
  if (item.type === 'customer')   return [['Name', p.name], ['Phone', p.phone], ['Email', p.email || '—'], ['Ghana Card', p.ghana_card || '—']];
  if (item.type === 'account')    return [['Customer', p.customerName || p.name], ['Type', (p.type || p.category || '').replace(/_/g,' ')], ['Rate', `${p.interestRate ?? p.interest_rate ?? 0}%`], ['Deposit', p.initialDeposit ? GHS(p.initialDeposit) : 'None']];
  if (item.type === 'collection') return [['Customer', p.customerName], ['Account', p.accountId || '—'], ['Amount', GHS(p.amount)], ['Payment', p.paymentType || 'savings'], ['Collector', p.collectorName || '—']];
  if (item.type === 'transaction') return [['Account', p.accountId || '—'], ['Type', p.type], ['Amount', GHS(p.amount)], ['Narration', p.narration || '—']];
  return Object.entries(p).slice(0, 6).map(([k, v]) => [k, String(v || '—')]);
}

export default function PendingApprovals() {
  const { pendingApprovals, pendingTxns, accounts, customers, approveApproval, rejectApproval,
          approvePendingTxn, rejectPendingTxn, silentRefresh } = useApp();
  const user    = authDB.currentUser();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const [rejectModal, setRejectModal] = useState(null);
  const [reason,      setReason]      = useState('');
  const [processing,  setProcessing]  = useState(null);
  const [error,       setError]       = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [typeFilter,   setTypeFilter]   = useState('all');
  const [search,       setSearch]       = useState('');
  const [refreshing,   setRefreshing]   = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await silentRefresh();
    setRefreshing(false);
  };

  const allItems = useMemo(() => {
    const fromApprovals = (pendingApprovals || []).map(a => ({ ...a, _source: 'approval' }));
    const fromPending   = (pendingTxns || []).map(t => {
      const acc  = (accounts  || []).find(a => a.id === (t.accountId || t.account_id));
      const cust = acc ? (customers || []).find(c => c.id === (acc.customerId || acc.customer_id)) : null;
      return {
        ...t,
        _source:        'pending_txn',
        type:           t.type || 'credit',
        submitted_at:   t.submittedAt || t.submitted_at || t.createdAt || '',
        submitter_name: t.submitterName || t.submitter_name || '—',
        submitted_by:   t.submittedBy  || t.submitted_by  || '',
        approver_name:  t.approverName || t.approver_name || '',
        rejector_name:  t.rejectorName || t.rejector_name || '',
        accountNumber:  t.accountNumber || acc?.accountNumber || acc?.account_number || t.accountId || '—',
        customerName:   t.customerName  || cust?.name || '—',
        payload: { amount: t.amount, narration: t.narration, type: t.type, accountId: t.accountId || t.account_id, channel: t.channel },
      };
    });
    return [...fromApprovals, ...fromPending]
      .sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0));
  }, [pendingApprovals, pendingTxns, accounts, customers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allItems.filter(item => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (typeFilter !== 'all') {
        if (typeFilter === 'transaction' && item._source !== 'pending_txn') return false;
        if (typeFilter !== 'transaction' && item._source === 'pending_txn') return false;
        if (typeFilter !== 'transaction' && item.type !== typeFilter) return false;
      }
      if (q) {
        const title   = getTitle(item).toLowerCase();
        const subName = (item.submitter_name || '').toLowerCase();
        const accNum  = (item.accountNumber || item.payload?.accountId || '').toLowerCase();
        const custN   = (item.customerName  || item.payload?.customerName || '').toLowerCase();
        const narr    = (item.narration || item.payload?.narration || '').toLowerCase();
        if (!title.includes(q) && !subName.includes(q) && !accNum.includes(q) && !custN.includes(q) && !narr.includes(q)) return false;
      }
      return true;
    });
  }, [allItems, statusFilter, typeFilter, search]);

  const counts = useMemo(() => ({
    pending:  allItems.filter(i => i.status === 'pending').length,
    approved: allItems.filter(i => i.status === 'approved').length,
    rejected: allItems.filter(i => i.status === 'rejected').length,
    total:    allItems.length,
  }), [allItems]);

  const handleApprove = async (item) => {
    const submittedBy = item.submitted_by || item.submittedBy || '';
    if (submittedBy === user?.id) { setError('You cannot approve your own submission.'); return; }
    setProcessing(item.id); setError('');
    const result = item._source === 'pending_txn'
      ? await approvePendingTxn(item.id)
      : await approveApproval(item.id);
    if (result?.error) setError(result.error?.message || 'Approval failed.');
    setProcessing(null);
  };

  const handleReject = async () => {
    if (!reason.trim() || !rejectModal) return;
    setProcessing(rejectModal.id);
    if (rejectModal._source === 'pending_txn') await rejectPendingTxn(rejectModal.id, reason);
    else await rejectApproval(rejectModal.id, reason);
    setRejectModal(null); setReason(''); setProcessing(null);
  };

  const pendingItems   = filtered.filter(i => i.status === 'pending');
  const processedItems = filtered.filter(i => i.status !== 'pending');

  return (
    <div className="fade-in">
      {/* ── Header ── */}
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Approvals</div>
          <div className="page-desc">All pending actions requiring authorisation</div>
        </div>
        <div className="page-header-right">
          <button className="btn btn-ghost btn-sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw size={14} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ── No-data warning ── */}
      {allItems.length === 0 && (
        <div className="alert alert-warning" style={{ marginBottom: 16 }}>
          <AlertCircle size={14} />
          <span>No data found. Run <strong>supabase/fix_approvals_complete.sql</strong> in Supabase SQL Editor, then click Refresh.</span>
        </div>
      )}

      {/* ── Stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Pending',  value: counts.pending,  color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: '⏳' },
          { label: 'Approved', value: counts.approved, color: '#059669', bg: '#ecfdf5', border: '#a7f3d0', icon: '✅' },
          { label: 'Rejected', value: counts.rejected, color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', icon: '❌' },
          { label: 'Total',    value: counts.total,    color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', icon: '📋' },
        ].map(s => (
          <div key={s.label} onClick={() => setStatusFilter(s.label.toLowerCase() === 'total' ? 'all' : s.label.toLowerCase())}
            style={{ padding: '16px 18px', borderRadius: 12, background: s.bg, border: `1.5px solid ${s.border}`,
              display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
              boxShadow: statusFilter === (s.label.toLowerCase() === 'total' ? 'all' : s.label.toLowerCase()) ? `0 0 0 2px ${s.color}` : 'none',
              transition: 'box-shadow .15s' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: s.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 3, opacity: .8 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Search + filters bar ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', pointerEvents: 'none' }} />
          <input className="form-control" placeholder="Search by name, account, narration…"
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 32, fontSize: 13 }} />
        </div>

        {/* Status pills */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', borderRadius: 10, padding: 3 }}>
          {[['pending','Pending'],['approved','Approved'],['rejected','Rejected'],['all','All']].map(([val, lbl]) => (
            <button key={val} onClick={() => setStatusFilter(val)}
              style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12,
                background: statusFilter === val ? 'var(--brand)' : 'transparent',
                color: statusFilter === val ? '#fff' : 'var(--text-3)' }}>
              {lbl}
              {val === 'pending' && counts.pending > 0 && (
                <span style={{ marginLeft: 5, background: '#dc2626', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10 }}>{counts.pending}</span>
              )}
            </button>
          ))}
        </div>

        {/* Type dropdown */}
        <select className="form-control" style={{ width: 190, fontSize: 12 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="all">All Types</option>
          <option value="transaction">Transactions (Teller)</option>
          <option value="collection">Collections</option>
          <option value="customer">Customer Registration</option>
          <option value="account">Account Opening</option>
          <option value="loan">Loan / HP</option>
        </select>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <AlertCircle size={14} /> {error}
          <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
      )}

      {!isAdmin && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          <Clock size={14} /> Only admins and managers can approve or reject submissions.
        </div>
      )}

      {/* ── Pending cards ── */}
      {statusFilter === 'pending' && pendingItems.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 56 }}>
          <CheckCircle size={44} style={{ color: 'var(--green)', margin: '0 auto 14px', display: 'block' }} />
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>All clear</div>
          <div style={{ color: 'var(--text-3)', fontSize: 13 }}>{search ? 'No results match your search' : 'No pending approvals'}</div>
        </div>
      ) : (
        <>
          {pendingItems.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14, marginBottom: 28 }}>
              {pendingItems.map(item => {
                const meta   = getMeta(item);
                const title  = getTitle(item);
                const dets   = getDetails(item);
                const isMine = (item.submitted_by || item.submittedBy) === user?.id;
                return (
                  <div key={item.id} style={{ borderRadius: 14, overflow: 'hidden', background: 'var(--surface)',
                    border: `1.5px solid ${meta.border}`, boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>

                    {/* Coloured top strip */}
                    <div style={{ height: 4, background: meta.color }} />

                    {/* Card header */}
                    <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: meta.bg, border: `1px solid ${meta.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                        {meta.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: meta.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{meta.label} · {item.submitter_name}</div>
                      </div>
                      <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20, background: '#fef9c3', color: '#92400e', fontWeight: 700, flexShrink: 0, border: '1px solid #fde68a' }}>PENDING</span>
                    </div>

                    {/* Details grid */}
                    <div style={{ padding: '0 16px 12px', borderBottom: `1px solid ${meta.border}` }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 10px' }}>
                        {dets.map(([k, v]) => (
                          <div key={k} style={{ fontSize: 12 }}>
                            <span style={{ color: 'var(--text-4)', fontWeight: 600 }}>{k}: </span>
                            <span style={{ color: 'var(--text)', fontWeight: 500 }}>{v}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 8 }}>
                        {item.submitted_at ? new Date(item.submitted_at).toLocaleString() : '—'}
                      </div>
                    </div>

                    {/* Action footer */}
                    <div style={{ padding: '10px 16px', background: 'var(--surface-2)' }}>
                      {isMine ? (
                        <div style={{ fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Clock size={12} /> Awaiting another authoriser
                        </div>
                      ) : isAdmin ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-success btn-sm" style={{ flex: 1 }}
                            onClick={() => handleApprove(item)} disabled={processing === item.id}>
                            <CheckCircle size={13} /> {processing === item.id ? 'Approving…' : 'Approve'}
                          </button>
                          <button className="btn btn-danger btn-sm" style={{ flex: 1 }}
                            onClick={() => { setRejectModal(item); setReason(''); }}>
                            <XCircle size={13} /> Reject
                          </button>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>Awaiting admin approval</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Processed history table ── */}
          {processedItems.length > 0 && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">History ({processedItems.length})</div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Details</th>
                      <th>Submitted By</th>
                      <th>Date</th>
                      <th>Actioned By</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processedItems.map(item => {
                      const meta = getMeta(item);
                      const st   = STATUS[item.status] || STATUS.pending;
                      return (
                        <tr key={item.id}>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
                              padding: '3px 8px', borderRadius: 8, background: meta.bg, color: meta.color, fontWeight: 600, border: `1px solid ${meta.border}` }}>
                              {meta.icon} {meta.label}
                            </span>
                          </td>
                          <td style={{ fontSize: 12, fontWeight: 600 }}>{getTitle(item)}</td>
                          <td style={{ fontSize: 12 }}>{item.submitter_name}</td>
                          <td style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                            {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString() : '—'}
                          </td>
                          <td style={{ fontSize: 12 }}>{item.approver_name || item.rejector_name || '—'}</td>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700,
                              padding: '3px 10px', borderRadius: 20, background: st.bg, color: st.color }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot, flexShrink: 0 }} />
                              {st.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Reject modal ── */}
      <Modal open={!!rejectModal} onClose={() => setRejectModal(null)} title="Reject Submission"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setRejectModal(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={handleReject} disabled={!reason.trim() || !!processing}>
            {processing ? 'Rejecting…' : 'Confirm Rejection'}
          </button>
        </>}>
        {rejectModal && (
          <div>
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              Rejecting <strong>{getMeta(rejectModal).label}</strong>: <strong>{getTitle(rejectModal)}</strong>
            </div>
            <div className="form-group">
              <label className="form-label">Reason <span className="required">*</span></label>
              <textarea className="form-control" value={reason} onChange={e => setReason(e.target.value)}
                rows={3} placeholder="State the reason clearly…" autoFocus />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
