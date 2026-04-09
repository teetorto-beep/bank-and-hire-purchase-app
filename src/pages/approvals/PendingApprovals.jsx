import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import Modal from '../../components/ui/Modal';
import { CheckCircle, XCircle, Clock, User, Wallet } from 'lucide-react';
import { authDB } from '../../core/db';

export default function PendingApprovals() {
  const { pendingApprovals, approveApproval, rejectApproval } = useApp();
  const user = authDB.currentUser();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const [rejectModal, setRejectModal] = useState(null);
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(null);
  const [error, setError] = useState('');

  const pending = (pendingApprovals || []).filter(p => p.status === 'pending');
  const processed = (pendingApprovals || []).filter(p => p.status !== 'pending');

  const approve = async (item) => {
    if (item.submitted_by === user?.id) { setError('You cannot approve your own submission.'); return; }
    setProcessing(item.id); setError('');
    const result = await approveApproval(item.id);
    if (result?.error) setError(result.error?.message || 'Approval failed.');
    setProcessing(null);
  };

  const doReject = async () => {
    if (!reason.trim()) return;
    setProcessing(rejectModal.id);
    await rejectApproval(rejectModal.id, reason);
    setRejectModal(null); setReason(''); setProcessing(null);
  };

  const TypeIcon = ({ type }) => type === 'customer'
    ? <User size={18} style={{ color: 'var(--brand)' }} />
    : <Wallet size={18} style={{ color: 'var(--green)' }} />;

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Pending Approvals</div>
          <div className="page-desc">Customer & account creation requests awaiting authorisation</div>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}><XCircle size={14} />{error}<button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button></div>}

      {!isAdmin && (
        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          <Clock size={14} />Only admins and managers can approve or reject submissions.
        </div>
      )}

      {pending.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 56 }}>
          <CheckCircle size={44} style={{ color: 'var(--green)', margin: '0 auto 14px', display: 'block' }} />
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>All clear</div>
          <div style={{ color: 'var(--text-3)', fontSize: 13 }}>No pending approvals</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14, marginBottom: 28 }}>
          {pending.map(item => {
            const p = item.payload || {};
            const isMine = item.submitted_by === user?.id;
            return (
              <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 18, background: 'var(--surface)', boxShadow: 'var(--shadow-sm)' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: item.type === 'customer' ? 'var(--blue-bg)' : 'var(--green-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <TypeIcon type={item.type} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, textTransform: 'capitalize' }}>{item.type} Creation</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>by {item.submitter_name}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'var(--yellow-bg)', color: '#92400e', fontWeight: 700 }}>Pending</span>
                </div>

                {/* Payload preview */}
                <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 12 }}>
                  {item.type === 'customer' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {[['Name', p.name], ['Phone', p.phone], ['Email', p.email || '—'], ['Ghana Card', p.ghanaCard || p.ghana_card || '—'], ['Occupation', p.occupation || '—'], ['Income', p.monthlyIncome ? `GH₵ ${p.monthlyIncome}` : '—']].map(([k, v]) => (
                        <div key={k}><span style={{ color: 'var(--text-3)', fontWeight: 600 }}>{k}: </span>{v}</div>
                      ))}
                    </div>
                  )}
                  {item.type === 'account' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {[
                        ['Customer', p.customerName || p.name || '—'],
                        ['Customer ID', p.customer_id || p.customerId ? '✅ Set' : '❌ Missing'],
                        ['Type', p.type || p.category || '—'],
                        ['Interest', `${p.interestRate ?? p.interest_rate ?? 0}%`],
                        ['Initial Deposit', p.initialDeposit ? `GH₵ ${p.initialDeposit}` : 'None'],
                        ['New Customer?', p.isNewCustomer ? 'Yes' : 'No'],
                      ].map(([k, v]) => (
                        <div key={k}><span style={{ color: 'var(--text-3)', fontWeight: 600 }}>{k}: </span>{v}</div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12 }}>
                  Submitted: {new Date(item.submitted_at).toLocaleString()}
                </div>

                {isMine ? (
                  <div style={{ fontSize: 12, color: '#92400e', fontStyle: 'italic', padding: '8px 12px', background: 'var(--yellow-bg)', borderRadius: 6 }}>
                    Awaiting another authoriser — you cannot approve your own submission
                  </div>
                ) : isAdmin ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-success btn-sm" style={{ flex: 1 }} onClick={() => approve(item)} disabled={processing === item.id}>
                      <CheckCircle size={13} />{processing === item.id ? 'Approving…' : 'Approve'}
                    </button>
                    <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={() => { setRejectModal(item); setReason(''); }}>
                      <XCircle size={13} />Reject
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>Awaiting admin approval</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Processed history */}
      {processed.length > 0 && (
        <div className="card">
          <div className="card-header"><div className="card-title">Processed ({processed.length})</div></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Type</th><th>Name/Details</th><th>Submitted By</th><th>Actioned By</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {processed.map(item => (
                  <tr key={item.id}>
                    <td style={{ textTransform: 'capitalize' }}>{item.type}</td>
                    <td style={{ fontSize: 12 }}>{item.payload?.name || item.payload?.type || '—'}</td>
                    <td style={{ fontSize: 12 }}>{item.submitter_name}</td>
                    <td style={{ fontSize: 12 }}>{item.approver_name || item.rejector_name || '—'}</td>
                    <td>
                      <span className={`badge ${item.status === 'approved' ? 'badge-green' : 'badge-red'}`}>{item.status}</span>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-3)' }}>{new Date(item.submitted_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={!!rejectModal} onClose={() => setRejectModal(null)} title="Reject Submission"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setRejectModal(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={doReject} disabled={!reason.trim()}>Confirm Rejection</button>
        </>}>
        {rejectModal && (
          <div>
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              Rejecting <strong>{rejectModal.type}</strong> creation for <strong>{rejectModal.payload?.name || '—'}</strong>
            </div>
            <div className="form-group">
              <label className="form-label">Reason <span className="required">*</span></label>
              <textarea className="form-control" value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="State the reason clearly…" autoFocus />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
