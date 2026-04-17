import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import Modal from '../../components/ui/Modal';
import { CheckCircle, XCircle, Clock, AlertCircle, RefreshCw, Filter } from 'lucide-react';
import { authDB } from '../../core/db';

const GHS = n => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

const TYPE_META = {
  // pending_approvals types
  customer:    { label: 'Customer Registration', icon: '👤', color: '#2563eb', bg: '#eff6ff' },
  account:     { label: 'Account Opening',       icon: '🏦', color: '#7c3aed', bg: '#f5f3ff' },
  collection:  { label: 'Collection Payment',    icon: '💰', color: '#059669', bg: '#ecfdf5' },
  transaction: { label: 'Transaction',           icon: '💳', color: '#0891b2', bg: '#ecfeff' },
  loan:        { label: 'Loan / HP',             icon: '📋', color: '#d97706', bg: '#fffbeb' },
  // pending_transactions types
  credit:      { label: 'Credit Transaction',    icon: '↑',  color: '#059669', bg: '#ecfdf5' },
  debit:       { label: 'Debit Transaction',     icon: '↓',  color: '#dc2626', bg: '#fef2f2' },
  transfer:    { label: 'Fund Transfer',         icon: '⇄',  color: '#2563eb', bg: '#eff6ff' },
  gl:          { label: 'GL Entry',              icon: '📒', color: '#0f766e', bg: '#f0fdfa' },
};

function getTypeMeta(item) {
  // For pending_transactions, use the type field (credit/debit)
  if (item._source === 'pending_txn') {
    return TYPE_META[item.type] || TYPE_META.credit;
  }
  return TYPE_META[item.type] || { label: item.type, icon: '📄', color: '#64748b', bg: '#f1f5f9' };
}

function getTitle(item) {
  const p = item.payload || {};
  if (item._source === 'pending_txn') {
    const amt = item.amount || p.amount || 0;
    return `${item.type === 'credit' ? 'Credit' : 'Debit'} — ${GHS(amt)}`;
  }
  if (item.type === 'customer') return p.name || 'New Customer';
  if (item.type === 'account')  return `${p.customerName || p.name || '—'} · ${(p.type || p.category || '').replace(/_/g,' ')}`;
  if (item.type === 'collection') return `${p.customerName || '—'} · ${GHS(p.amount)}`;
  if (item.type === 'transaction') return `${p.type || 'Transaction'} · ${GHS(p.amount)}`;
  if (item.type === 'loan') return `${p.customerName || '—'} · ${GHS(p.amount)}`;
  return item.type;
}

function getDetails(item) {
  const p = item.payload || {};
  if (item._source === 'pending_txn') {
    return [
      ['Account',   item.accountNumber || p.accountId || '—'],
      ['Customer',  item.customerName  || '—'],
      ['Amount',    GHS(item.amount || p.amount || 0)],
      ['Narration', item.narration || p.narration || '—'],
      ['Channel',   item.channel   || p.channel   || 'teller'],
      ['Type',      item.type || '—'],
    ];
  }
  if (item.type === 'customer') return [['Name', p.name], ['Phone', p.phone], ['Email', p.email || '—'], ['Ghana Card', p.ghana_card || p.ghanaCard || '—']];
  if (item.type === 'account')  return [['Customer', p.customerName || p.name], ['Account Type', (p.type || p.category || '').replace(/_/g,' ')], ['Interest Rate', `${p.interestRate ?? p.interest_rate ?? 0}%`], ['Initial Deposit', p.initialDeposit ? GHS(p.initialDeposit) : 'None']];
  if (item.type === 'collection') return [['Customer', p.customerName], ['Account', p.accountId || '—'], ['Amount', GHS(p.amount)], ['Payment Type', p.paymentType || 'savings'], ['Collector', p.collectorName || '—']];
  if (item.type === 'transaction') return [['Account', p.accountId || '—'], ['Type', p.type], ['Amount', GHS(p.amount)], ['Narration', p.narration || '—']];
  return Object.entries(p).slice(0, 6).map(([k, v]) => [k, String(v || '—')]);
}

export default function PendingApprovals() {
  const { pendingApprovals, pendingTxns, approveApproval, rejectApproval, approvePendingTxn, rejectPendingTxn, refresh } = useApp();
  const user = authDB.currentUser();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const [rejectModal, setRejectModal] = useState(null);
  const [reason,      setReason]      = useState('');
  const [processing,  setProcessing]  = useState(null);
  const [error,       setError]       = useState('');
  const [filter,      setFilter]      = useState('pending');
  const [typeFilter,  setTypeFilter]  = useState('all');

  // Merge both approval sources into one unified list
  const allItems = useMemo(() => {
    const fromApprovals = (pendingApprovals || []).map(a => ({ ...a, _source: 'approval' }));
    const fromPending   = (pendingTxns || []).map(t => ({
      ...t,
      _source:        'pending_txn',
      type:           t.type || 'credit',
      // normalize field names — pendingTxns uses camelCase after normPendingTxn
      submitted_at:   t.submittedAt || t.submitted_at || t.createdAt || '',
      submitter_name: t.submitterName || t.submitter_name || '—',
      submitted_by:   t.submittedBy  || t.submitted_by  || '',
      approver_name:  t.approverName || t.approver_name || '',
      rejector_name:  t.rejectorName || t.rejector_name || '',
      payload: {
        amount:    t.amount,
        narration: t.narration,
        type:      t.type,
        accountId: t.accountId,
        channel:   t.channel,
      },
    }));
    return [...fromApprovals, ...fromPending]
      .sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0));
  }, [pendingApprovals, pendingTxns]);

  const filtered = useMemo(() => {
    return allItems.filter(item => {
      if (filter !== 'all' && item.status !== filter) return false;
      if (typeFilter !== 'all') {
        if (typeFilter === 'transaction' && item._source !== 'pending_txn') return false;
        if (typeFilter !== 'transaction' && item._source === 'pending_txn') return false;
        if (typeFilter !== 'transaction' && item.type !== typeFilter) return false;
      }
      return true;
    });
  }, [allItems, filter, typeFilter]);

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
    let result;
    if (item._source === 'pending_txn') {
      result = await approvePendingTxn(item.id);
    } else {
      result = await approveApproval(item.id);
    }
    if (result?.error) setError(result.error?.message || 'Approval failed.');
    setProcessing(null);
  };

  const handleReject = async () => {
    if (!reason.trim() || !rejectModal) return;
    setProcessing(rejectModal.id);
    if (rejectModal._source === 'pending_txn') {
      await rejectPendingTxn(rejectModal.id, reason);
    } else {
      await rejectApproval(rejectModal.id, reason);
    }
    setRejectModal(null); setReason(''); setProcessing(null);
  };

  const pendingItems   = filtered.filter(i => i.status === 'pending');
  const processedItems = filtered.filter(i => i.status !== 'pending');

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Approvals</div>
          <div className="page-desc">All pending actions requiring authorisation</div>
        </div>
        <div className="page-header-right">
          <button className="btn btn-ghost btn-sm" onClick={refresh}><RefreshCw size={14} /> Refresh</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Pending',  value: counts.pending,  color: '#d97706', bg: '#fffbeb', icon: '⏳' },
          { label: 'Approved', value: counts.approved, color: '#059669', bg: '#ecfdf5', icon: '✅' },
          { label: 'Rejected', value: counts.rejected, color: '#dc2626', bg: '#fef2f2', icon: '❌' },
          { label: 'Total',    value: counts.total,    color: '#2563eb', bg: '#eff6ff', icon: '📋' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '14px 16px', borderTop: `3px solid ${s.color}`, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', borderRadius: 10, padding: 3 }}>
          {['pending', 'approved', 'rejected', 'all'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: filter === f ? 'var(--brand)' : 'transparent', color: filter === f ? '#fff' : 'var(--text-3)' }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'pending' && counts.pending > 0 && <span style={{ marginLeft: 5, background: '#dc2626', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10 }}>{counts.pending}</span>}
            </button>
          ))}
        </div>
        <select className="form-control" style={{ width: 180, fontSize: 12 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="all">All Types</option>
          <option value="transaction">Transactions (Teller)</option>
          <option value="collection">Collections</option>
          <option value="customer">Customer Registration</option>
          <option value="account">Account Opening</option>
          <option value="loan">Loan / HP</option>
        </select>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={14} /> {error}
          <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
      )}

      {!isAdmin && (
        <div className="alert alert-info" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={14} /> Only admins and managers can approve or reject submissions.
        </div>
      )}

      {/* Pending items */}
      {pendingItems.length === 0 && filter === 'pending' ? (
        <div className="card" style={{ textAlign: 'center', padding: 56 }}>
          <CheckCircle size={44} style={{ color: 'var(--green)', margin: '0 auto 14px', display: 'block' }} />
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>All clear</div>
          <div style={{ color: 'var(--text-3)', fontSize: 13 }}>No pending approvals</div>
        </div>
      ) : (
        <>
          {pendingItems.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14, marginBottom: 28 }}>
              {pendingItems.map(item => {
                const meta    = getTypeMeta(item);
                const title   = getTitle(item);
                const details = getDetails(item);
                const isMine  = (item.submitted_by || item.submittedBy) === user?.id;
                return (
                  <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: 'var(--surface)', boxShadow: 'var(--shadow-sm)' }}>
                    {/* Header */}
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: meta.bg + '60' }}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                        {meta.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: meta.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{meta.label} · by {item.submitter_name}</div>
                      </div>
                      <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, background: '#fef9c3', color: '#92400e', fontWeight: 700, flexShrink: 0 }}>PENDING</span>
                    </div>

                    {/* Details */}
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                        {details.map(([k, v]) => (
                          <div key={k} style={{ fontSize: 12 }}>
                            <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>{k}: </span>
                            <span style={{ color: 'var(--text)', fontWeight: 500 }}>{v}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 8 }}>
                        Submitted: {item.submitted_at ? new Date(item.submitted_at).toLocaleString() : '—'}
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ padding: '12px 16px' }}>
                      {isMine ? (
                        <div style={{ fontSize: 12, color: '#92400e', padding: '8px 12px', background: '#fef9c3', borderRadius: 8 }}>
                          ⏳ Awaiting another authoriser — you cannot approve your own submission
                        </div>
                      ) : isAdmin ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-success btn-sm" style={{ flex: 1 }} onClick={() => handleApprove(item)} disabled={processing === item.id}>
                            <CheckCircle size={13} /> {processing === item.id ? 'Approving…' : 'Approve'}
                          </button>
                          <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={() => { setRejectModal(item); setReason(''); }}>
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

          {/* Processed history */}
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
                      <th>Actioned By</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processedItems.map(item => {
                      const meta = getTypeMeta(item);
                      return (
                        <tr key={item.id}>
                          <td>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                              <span style={{ fontSize: 16 }}>{meta.icon}</span>
                              <span style={{ color: meta.color, fontWeight: 600 }}>{meta.label}</span>
                            </span>
                          </td>
                          <td style={{ fontSize: 12 }}>{getTitle(item)}</td>
                          <td style={{ fontSize: 12 }}>{item.submitter_name}</td>
                          <td style={{ fontSize: 12 }}>{item.approver_name || item.rejector_name || '—'}</td>
                          <td>
                            <span className={`badge ${item.status === 'approved' ? 'badge-green' : 'badge-red'}`}>
                              {item.status}
                            </span>
                          </td>
                          <td style={{ fontSize: 11, color: 'var(--text-3)' }}>
                            {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString() : '—'}
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

      {/* Reject modal */}
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
              Rejecting <strong>{getTypeMeta(rejectModal).label}</strong>: <strong>{getTitle(rejectModal)}</strong>
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
