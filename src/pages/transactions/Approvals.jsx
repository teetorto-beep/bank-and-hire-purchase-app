import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import Modal from '../../components/ui/Modal';
import { CheckCircle, XCircle, Clock, AlertCircle, User, Calendar, Hash, FileText } from 'lucide-react';
import { authDB } from '../../core/db';

const GHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

const STATUS_STYLE = {
  pending:  { bg: '#fef3c7', color: '#92400e', border: '#fde68a', label: 'Pending' },
  approved: { bg: '#d1fae5', color: '#065f46', border: '#a7f3d0', label: 'Approved' },
  rejected: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5', label: 'Rejected' },
};

export default function Approvals() {
  const { pendingTxns, accounts, customers, approvePendingTxn, rejectPendingTxn } = useApp();
  const user = authDB.currentUser();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const [tab, setTab] = useState('pending');
  const [rejectModal, setRejectModal] = useState(null);
  const [detailModal, setDetailModal] = useState(null);
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(null);
  const [error, setError] = useState('');

  // Enrich with account + customer info
  const enriched = useMemo(() =>
    pendingTxns.map(p => {
      const acc = accounts.find(a => a.id === p.accountId);
      const cust = acc ? customers.find(c => c.id === acc.customerId) : null;
      return { ...p, account: acc, customer: cust };
    }).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)),
    [pendingTxns, accounts, customers]
  );

  // Role-based filtering:
  // - Admin/Manager: see ALL
  // - Teller: only see their own submissions
  const myQueue = useMemo(() =>
    isAdmin
      ? enriched.filter(p => p.status === 'pending')
      : enriched.filter(p => p.status === 'pending' && p.submittedBy === user?.id),
    [enriched, isAdmin, user]
  );

  const processed = useMemo(() =>
    isAdmin
      ? enriched.filter(p => p.status !== 'pending')
      : enriched.filter(p => p.status !== 'pending' && p.submittedBy === user?.id),
    [enriched, isAdmin, user]
  );

  // Pending that I can action (not my own)
  const actionable = myQueue.filter(p => p.submittedBy !== user?.id);
  const myOwn = myQueue.filter(p => p.submittedBy === user?.id);

  const approve = (p) => {
    setError('');
    setProcessing(p.id);
    setTimeout(() => {
      try {
        approvePendingTxn(p.id, user?.id);
        setDetailModal(null);
      } catch (e) { setError(e.message); }
      setProcessing(null);
    }, 400);
  };

  const openReject = (p) => { setRejectModal(p); setReason(''); setDetailModal(null); };

  const doReject = () => {
    if (!reason.trim()) return;
    setProcessing(rejectModal.id);
    setTimeout(() => {
      rejectPendingTxn(rejectModal.id, user?.id, reason);
      setRejectModal(null); setReason(''); setProcessing(null);
    }, 300);
  };

  const TxnCard = ({ p, showActions }) => {
    const s = STATUS_STYLE[p.status] || STATUS_STYLE.pending;
    return (
      <div style={{ border: `1px solid ${s.border}`, borderRadius: 10, padding: 16, background: s.bg, cursor: 'pointer', transition: 'box-shadow .15s' }}
        onClick={() => setDetailModal(p)}
        onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
        onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
        {/* Top row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: p.type === 'credit' ? 'var(--green-bg)' : 'var(--red-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {p.type === 'credit'
                ? <CheckCircle size={20} style={{ color: 'var(--green)' }} />
                : <XCircle size={20} style={{ color: 'var(--red)' }} />}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18, color: p.type === 'credit' ? 'var(--green)' : 'var(--red)' }}>
                {p.type === 'credit' ? '+' : '-'}{GHS(p.amount)}
              </div>
              <div style={{ fontSize: 12, color: s.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                {p.type} · {s.label}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: s.color, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(255,255,255,.5)', border: `1px solid ${s.border}` }}>
              {s.label}
            </div>
          </div>
        </div>

        {/* Details */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: s.color, fontWeight: 700, textTransform: 'uppercase', opacity: .7 }}>Account</div>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>{p.account?.accountNumber || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: s.color, fontWeight: 700, textTransform: 'uppercase', opacity: .7 }}>Customer</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{p.customer?.name || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: s.color, fontWeight: 700, textTransform: 'uppercase', opacity: .7 }}>Narration</div>
            <div style={{ fontSize: 12 }}>{p.narration}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: s.color, fontWeight: 700, textTransform: 'uppercase', opacity: .7 }}>Submitted By</div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>
              {p.submitterName}
              {p.submittedBy === user?.id && <span style={{ fontSize: 10, color: '#92400e', marginLeft: 4, background: '#fde68a', padding: '1px 6px', borderRadius: 10 }}>YOU</span>}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: s.color, opacity: .8 }}>
            {new Date(p.submittedAt).toLocaleString()}
          </div>
          {showActions && p.submittedBy !== user?.id && (
            <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
              <button className="btn btn-success btn-sm" onClick={() => approve(p)} disabled={processing === p.id}>
                <CheckCircle size={13} />{processing === p.id ? '…' : 'Approve'}
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => openReject(p)}>
                <XCircle size={13} />Reject
              </button>
            </div>
          )}
          {showActions && p.submittedBy === user?.id && (
            <div style={{ fontSize: 11, color: '#92400e', fontStyle: 'italic' }}>Awaiting another authoriser</div>
          )}
          {!showActions && p.status === 'approved' && (
            <div style={{ fontSize: 11, color: '#065f46', fontWeight: 600 }}>✓ Approved by {p.approverName}</div>
          )}
          {!showActions && p.status === 'rejected' && (
            <div style={{ fontSize: 11, color: '#991b1b', fontWeight: 600 }}>✗ Rejected by {p.rejectorName}</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Transaction Approvals</div>
          <div className="page-desc">
            {isAdmin
              ? `Admin view — all ${myQueue.length} pending · ${actionable.length} awaiting your action`
              : `Your submissions — ${myOwn.length} pending approval`}
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <AlertCircle size={14} />{error}
          <button style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }} onClick={() => setError('')}>✕</button>
        </div>
      )}

      {/* Role info banner */}
      <div className={`alert ${isAdmin ? 'alert-info' : 'alert-warning'}`} style={{ marginBottom: 20 }}>
        {isAdmin
          ? <><AlertCircle size={14} /><span><strong>Admin view:</strong> You can see and action all pending transactions from all users. Checker-maker rule applies — you cannot approve your own submissions.</span></>
          : <><Clock size={14} /><span><strong>Teller view:</strong> You can only see your own submitted transactions. An admin or manager must approve them.</span></>}
      </div>

      <div className="tabs">
        <div className={`tab ${tab === 'pending' ? 'active' : ''}`} onClick={() => setTab('pending')}>
          Pending {myQueue.length > 0 && <span style={{ marginLeft: 6, background: 'var(--red)', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 7px' }}>{myQueue.length}</span>}
        </div>
        <div className={`tab ${tab === 'processed' ? 'active' : ''}`} onClick={() => setTab('processed')}>
          Processed ({processed.length})
        </div>
      </div>

      {tab === 'pending' && (
        <>
          {myQueue.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 56 }}>
              <CheckCircle size={44} style={{ color: 'var(--green)', margin: '0 auto 14px', display: 'block' }} />
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>All clear</div>
              <div style={{ color: 'var(--text-3)', fontSize: 13 }}>
                {isAdmin ? 'No transactions pending approval' : 'You have no pending submissions'}
              </div>
            </div>
          ) : (
            <div>
              {/* Actionable (not mine) — shown to admin */}
              {isAdmin && actionable.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
                    Awaiting Your Action ({actionable.length})
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
                    {actionable.map(p => <TxnCard key={p.id} p={p} showActions={true} />)}
                  </div>
                </div>
              )}

              {/* My own pending — shown to everyone */}
              {myOwn.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
                    {isAdmin ? 'Your Own Submissions (Awaiting Another User)' : 'Your Pending Submissions'} ({myOwn.length})
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
                    {myOwn.map(p => <TxnCard key={p.id} p={p} showActions={false} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'processed' && (
        <div>
          {processed.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>No processed transactions yet</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
              {processed.map(p => <TxnCard key={p.id} p={p} showActions={false} />)}
            </div>
          )}
        </div>
      )}

      {/* ── Detail Modal ──────────────────────────────────────────────────── */}
      <Modal open={!!detailModal} onClose={() => setDetailModal(null)} title="Transaction Detail"
        footer={
          detailModal?.status === 'pending' && detailModal?.submittedBy !== user?.id && isAdmin ? (
            <>
              <button className="btn btn-secondary" onClick={() => setDetailModal(null)}>Close</button>
              <button className="btn btn-danger" onClick={() => openReject(detailModal)}><XCircle size={14} />Reject</button>
              <button className="btn btn-success" onClick={() => approve(detailModal)} disabled={processing === detailModal?.id}>
                <CheckCircle size={14} />{processing === detailModal?.id ? 'Approving…' : 'Approve'}
              </button>
            </>
          ) : (
            <button className="btn btn-secondary" onClick={() => setDetailModal(null)}>Close</button>
          )
        }>
        {detailModal && (
          <div>
            {/* Amount hero */}
            <div style={{ textAlign: 'center', padding: '20px 0 24px', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: detailModal.type === 'credit' ? 'var(--green)' : 'var(--red)' }}>
                {detailModal.type === 'credit' ? '+' : '-'}{GHS(detailModal.amount)}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                {detailModal.type} Transaction
              </div>
              <div style={{ marginTop: 10 }}>
                <span style={{ padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, ...(() => { const s = STATUS_STYLE[detailModal.status]; return { background: s.bg, color: s.color, border: `1px solid ${s.border}` }; })() }}>
                  {STATUS_STYLE[detailModal.status]?.label}
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {[
                [Hash, 'Reference', detailModal.id?.slice(-10)],
                [Calendar, 'Submitted', new Date(detailModal.submittedAt).toLocaleString()],
                [User, 'Account', detailModal.account?.accountNumber || '—'],
                [User, 'Customer', detailModal.customer?.name || '—'],
                [FileText, 'Narration', detailModal.narration],
                [User, 'Submitted By', detailModal.submitterName],
                ...(detailModal.status === 'approved' ? [[CheckCircle, 'Approved By', detailModal.approverName], [Calendar, 'Approved At', detailModal.approvedAt ? new Date(detailModal.approvedAt).toLocaleString() : '—']] : []),
                ...(detailModal.status === 'rejected' ? [[XCircle, 'Rejected By', detailModal.rejectorName], [FileText, 'Reject Reason', detailModal.rejectReason]] : []),
              ].map(([Icon, label, value]) => (
                <div key={label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Icon size={14} style={{ color: 'var(--text-3)', marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{String(value || '—')}</div>
                  </div>
                </div>
              ))}
            </div>

            {detailModal.status === 'pending' && detailModal.submittedBy === user?.id && (
              <div className="alert alert-warning" style={{ marginTop: 20 }}>
                <Clock size={14} />This is your own submission. Another authorised user must approve or reject it.
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Reject Modal ──────────────────────────────────────────────────── */}
      <Modal open={!!rejectModal} onClose={() => setRejectModal(null)} title="Reject Transaction"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setRejectModal(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={doReject} disabled={!reason.trim() || processing === rejectModal?.id}>
            <XCircle size={14} />{processing === rejectModal?.id ? 'Rejecting…' : 'Confirm Rejection'}
          </button>
        </>}>
        {rejectModal && (
          <div>
            <div style={{ padding: 16, background: 'var(--red-bg)', borderRadius: 8, border: '1px solid #fca5a5', marginBottom: 20 }}>
              <div style={{ fontWeight: 700, color: '#991b1b', marginBottom: 4 }}>
                {rejectModal.type === 'credit' ? '+' : '-'}{GHS(rejectModal.amount)} — {rejectModal.type.toUpperCase()}
              </div>
              <div style={{ fontSize: 13, color: '#991b1b' }}>{rejectModal.narration}</div>
              <div style={{ fontSize: 12, color: '#991b1b', marginTop: 6, opacity: .8 }}>
                Account: {rejectModal.account?.accountNumber} · {rejectModal.customer?.name}
              </div>
              <div style={{ fontSize: 12, color: '#991b1b', opacity: .8 }}>
                Submitted by: {rejectModal.submitterName} at {new Date(rejectModal.submittedAt).toLocaleString()}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Reason for Rejection <span className="required">*</span></label>
              <textarea className="form-control" value={reason} onChange={e => setReason(e.target.value)}
                rows={4} placeholder="Provide a clear reason — this will be visible to the submitter and recorded in the audit log…" autoFocus />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

