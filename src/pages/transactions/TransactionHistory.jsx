import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { Search, RotateCcw, Download, FileText, Eye } from 'lucide-react';
import { authDB } from '../../core/db';
import { exportCSV, exportReportPDF } from '../../core/export';

const GHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

export default function TransactionHistory() {
  const { transactions, reverseTransaction } = useApp();
  const user = authDB.currentUser();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [reverseModal, setReverseModal] = useState(null);
  const [detailModal, setDetailModal] = useState(null);
  const [reason, setReason] = useState('');
  const [reversing, setReversing] = useState(false);

  const enriched = useMemo(() =>
    transactions.map(t => ({
      ...t,
      // Already normalised by AppContext — just ensure display fields exist
      accountNumber: t.accountNumber || t.accounts?.account_number || '—',
      customerName: t.customerName || t.accounts?.customers?.name || '—',
      _date: t.createdAt,
    })).sort((a, b) => new Date(b._date || 0) - new Date(a._date || 0)),
    [transactions]
  );

  // Tellers only see their own transactions
  const roleFiltered = useMemo(() =>
    isAdmin ? enriched : enriched.filter(t => t.createdBy === user?.id),
    [enriched, isAdmin, user]
  );

  const filtered = useMemo(() =>
    roleFiltered.filter(t => {
      const matchQ = !q ||
        t.narration?.toLowerCase().includes(q.toLowerCase()) ||
        t.reference?.includes(q) ||
        t.accountNumber?.includes(q) ||
        t.customerName?.toLowerCase().includes(q.toLowerCase()) ||
        t.posterName?.toLowerCase().includes(q.toLowerCase());
      const matchType = typeFilter === 'all' || t.type === typeFilter;
      const d = new Date(t.createdAt);
      const matchFrom = !dateFrom || d >= new Date(dateFrom);
      const matchTo = !dateTo || d <= new Date(dateTo + 'T23:59:59');
      return matchQ && matchType && matchFrom && matchTo;
    }), [roleFiltered, q, typeFilter, dateFrom, dateTo]);

  const totalCredit = filtered.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
  const totalDebit = filtered.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);

  const doReverse = () => {
    if (!reason.trim()) return;
    setReversing(true);
    setTimeout(() => {
      reverseTransaction(reverseModal.id, reason, user?.id);
      setReverseModal(null); setReason(''); setReversing(false);
    }, 400);
  };

  const handleExportCSV = () => {
    exportCSV(filtered.map(t => ({
      Date: new Date(t.createdAt).toLocaleString(),
      Reference: t.reference,
      Account: t.accountNumber,
      Customer: t.customerName,
      Narration: t.narration,
      Type: t.type,
      Amount: t.amount,
      'Balance After': t.balanceAfter,
      'Posted By': t.posterName || '—',
      Channel: t.channel || 'teller',
      Status: t.reversed ? 'Reversed' : 'Completed',
    })), 'transaction-history');
  };

  const handleExportPDF = () => {
    exportReportPDF({
      title: 'Transaction History Report',
      subtitle: `${filtered.length} transactions · ${dateFrom || 'All'} to ${dateTo || 'Today'}`,
      columns: ['Date', 'Reference', 'Account', 'Customer', 'Narration', 'Type', 'Amount', 'Balance After', 'Posted By'],
      rows: filtered.map(t => [
        new Date(t.createdAt).toLocaleString(),
        t.reference, t.accountNumber || '—', t.customerName || '—',
        t.narration, t.type.toUpperCase(), GHS(t.amount), GHS(t.balanceAfter), t.posterName || '—',
      ]),
      summary: [['Total Credits', GHS(totalCredit)], ['Total Debits', GHS(totalDebit)], ['Net', GHS(totalCredit - totalDebit)]],
    });
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Transaction History</div>
          <div className="page-desc">
            {isAdmin ? `All transactions — ${filtered.length} shown` : `Your transactions — ${filtered.length} shown`}
          </div>
        </div>
        <div className="page-header-right">
          <button className="btn btn-secondary btn-sm" onClick={handleExportCSV}><Download size={13} />CSV</button>
          <button className="btn btn-primary btn-sm" onClick={handleExportPDF}><FileText size={13} />PDF</button>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Credits', value: GHS(totalCredit), color: 'var(--green)' },
          { label: 'Total Debits', value: GHS(totalDebit), color: 'var(--red)' },
          { label: 'Net Movement', value: GHS(totalCredit - totalDebit), color: totalCredit >= totalDebit ? 'var(--green)' : 'var(--red)' },
          { label: 'Transactions', value: filtered.length, color: 'var(--brand)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <div className="search-box" style={{ flex: 1, minWidth: 220 }}>
            <Search size={15} />
            <input className="form-control" placeholder="Search narration, reference, account, customer, posted by…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <select className="form-control" style={{ width: 130 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="all">All Types</option>
            <option value="credit">Credits</option>
            <option value="debit">Debits</option>
          </select>
          <input className="form-control" type="date" style={{ width: 150 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date" />
          <input className="form-control" type="date" style={{ width: 150 }} value={dateTo} onChange={e => setDateTo(e.target.value)} title="To date" />
          {(q || typeFilter !== 'all' || dateFrom || dateTo) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setQ(''); setTypeFilter('all'); setDateFrom(''); setDateTo(''); }}>Clear</button>
          )}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Reference</th>
                <th>Account</th>
                <th>Customer</th>
                <th>Narration</th>
                <th>Type</th>
                <th style={{ textAlign: 'right' }}>Debit</th>
                <th style={{ textAlign: 'right' }}>Credit</th>
                <th style={{ textAlign: 'right' }}>Balance After</th>
                <th>Posted By</th>
                <th>Channel</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={12} className="table-empty">No transactions found</td></tr>
              ) : filtered.map(t => (
                <tr key={t.id} style={{ opacity: t.reversed ? 0.5 : 1 }}>
                  <td style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                    {t._date ? new Date(t._date).toLocaleString() : '—'}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>{t.reference}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{t.accountNumber || '—'}</td>
                  <td style={{ fontSize: 13, fontWeight: 500 }}>{t.customerName || '—'}</td>
                  <td style={{ fontSize: 12, maxWidth: 200 }}>
                    {t.narration}
                    {t.reversed && <span style={{ fontSize: 10, color: 'var(--red)', marginLeft: 6, background: 'var(--red-bg)', padding: '1px 5px', borderRadius: 3 }}>REVERSED</span>}
                  </td>
                  <td><Badge status={t.type} /></td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--red)', whiteSpace: 'nowrap' }}>
                    {t.type === 'debit' ? GHS(t.amount) : ''}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green)', whiteSpace: 'nowrap' }}>
                    {t.type === 'credit' ? GHS(t.amount) : ''}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>{GHS(t.balanceAfter)}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                    <div>{t.posterName || '—'}</div>
                    {t.approverName && <div style={{ fontSize: 10, color: 'var(--green)' }}>✓ {t.approverName}</div>}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'capitalize' }}>{t.channel || 'teller'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button className="btn btn-ghost btn-sm btn-icon" title="View details" onClick={() => setDetailModal(t)}>
                        <Eye size={13} />
                      </button>
                      {isAdmin && !t.reversed && !t.reversalOf && (
                        <button className="btn btn-ghost btn-sm btn-icon" title="Reverse" onClick={() => setReverseModal(t)} style={{ color: 'var(--yellow)' }}>
                          <RotateCcw size={13} />
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

      {/* Detail Modal */}
      <Modal open={!!detailModal} onClose={() => setDetailModal(null)} title="Transaction Detail">
        {detailModal && (
          <div>
            <div style={{ textAlign: 'center', padding: '16px 0 20px', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: detailModal.type === 'credit' ? 'var(--green)' : 'var(--red)' }}>
                {detailModal.type === 'credit' ? '+' : '-'}{GHS(detailModal.amount)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                {detailModal.type} · {detailModal.reversed ? 'REVERSED' : 'COMPLETED'}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {[
                ['Reference', detailModal.reference],
                ['Date & Time', new Date(detailModal.createdAt).toLocaleString()],
                ['Account', detailModal.accountNumber || '—'],
                ['Customer', detailModal.customerName || '—'],
                ['Narration', detailModal.narration],
                ['Balance After', GHS(detailModal.balanceAfter)],
                ['Posted By', detailModal.posterName || '—'],
                ['Channel', detailModal.channel || 'teller'],
                ...(detailModal.approverName ? [['Approved By', detailModal.approverName]] : []),
                ...(detailModal.reversalOf ? [['Reversal Of', detailModal.reversalOf.slice(-10)]] : []),
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>{k}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, fontFamily: k === 'Reference' ? 'monospace' : 'inherit' }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Reverse Modal */}
      <Modal open={!!reverseModal} onClose={() => setReverseModal(null)} title="Reverse Transaction"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setReverseModal(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={doReverse} disabled={reversing || !reason.trim()}>
            <RotateCcw size={13} />{reversing ? 'Reversing…' : 'Confirm Reversal'}
          </button>
        </>}>
        {reverseModal && (
          <div>
            <div className="alert alert-warning" style={{ marginBottom: 16 }}>
              This posts a counter-entry. The original transaction will be marked as reversed.
            </div>
            <div style={{ padding: 14, background: 'var(--surface-2)', borderRadius: 8, marginBottom: 16 }}>
              {[
                ['Reference', reverseModal.reference],
                ['Type', reverseModal.type.toUpperCase()],
                ['Amount', GHS(reverseModal.amount)],
                ['Narration', reverseModal.narration],
                ['Posted By', reverseModal.posterName || '—'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-3)', fontSize: 12 }}>{k}</span>
                  <span style={{ fontWeight: 600, fontSize: 12, fontFamily: k === 'Reference' ? 'monospace' : 'inherit' }}>{v}</span>
                </div>
              ))}
            </div>
            <div className="form-group">
              <label className="form-label">Reason for Reversal <span className="required">*</span></label>
              <textarea className="form-control" value={reason} onChange={e => setReason(e.target.value)}
                placeholder="State the reason clearly — this is recorded in the audit log…" rows={3} autoFocus />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}


