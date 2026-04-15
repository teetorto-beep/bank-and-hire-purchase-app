import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { Search, Plus, CheckCircle, XCircle, DollarSign, ShoppingBag, Edit2, Trash2, Download, FileText } from 'lucide-react';
import { authDB } from '../../core/db';
import { supabase } from '../../core/supabase';
import { exportCSV, exportLoanReportPDF } from '../../core/export';

const GHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;
const fmtDate = (v) => { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(); };

function inPeriod(dateStr, period) {
  if (period === 'all' || !dateStr) return true;
  const d = new Date(dateStr);
  const now = new Date();
  if (period === 'today') {
    return d.toDateString() === now.toDateString();
  }
  if (period === 'week') {
    const start = new Date(now); start.setDate(now.getDate() - 7);
    return d >= start;
  }
  if (period === 'month') {
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }
  if (period === 'quarter') {
    const start = new Date(now); start.setMonth(now.getMonth() - 3);
    return d >= start;
  }
  if (period === 'year') {
    return d.getFullYear() === now.getFullYear();
  }
  return true;
}

const EMPTY_EDIT = {
  interestRate: '', tenure: '', monthlyPayment: '', outstanding: '',
  status: '', nextDueDate: '', purpose: '',
};

export default function Loans() {
  const { loans, customers, accounts, hpAgreements, updateLoan, postTransaction, recordHPPayment, refresh } = useApp();
  const navigate = useNavigate();
  const user = authDB.currentUser();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tab, setTab] = useState('list');
  const [period, setPeriod] = useState('all');

  const [approveModal, setApproveModal] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [repayModal, setRepayModal] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);

  const [repayAmount, setRepayAmount] = useState('');
  const [editForm, setEditForm] = useState(EMPTY_EDIT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const ef = (k) => (e) => setEditForm(p => ({ ...p, [k]: e.target.value }));

  // ── Enriched loans ──────────────────────────────────────────────────────────
  const enriched = useMemo(() =>
    loans.map(loan => {
      const customer = loan.customer || customers.find(c => c.id === loan.customerId) || null;
      const account = accounts.find(a => a.id === loan.accountId) || null;
      const hpAgreement = hpAgreements.find(a => a.id === loan.hpAgreementId) || null;

      const principal = Number(loan.amount || 0);
      const monthly = Number(loan.monthlyPayment || 0);
      const tenure = Number(loan.tenure || 0);
      const totalRepay = monthly > 0 && tenure > 0 ? monthly * tenure : principal;
      const totalInterest = Math.max(0, totalRepay - principal);
      // outstanding now tracks total remaining (principal + interest)
      // paid = totalRepay - outstanding
      const outstanding = Number(loan.outstanding || 0);
      const paid = Math.max(0, totalRepay - outstanding);
      const paidPct = totalRepay > 0 ? Math.min(100, (paid / totalRepay) * 100) : 0;
      const daily = monthly / 30;
      const weekly = monthly / 4.33;

      return {
        ...loan,
        customer,
        account,
        hpAgreement,
        principal,
        totalRepay,
        totalInterest,
        paid,
        paidPct,
        daily,
        weekly,
      };
    }).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
    [loans, customers, accounts, hpAgreements]
  );

  // ── Filtered loans ──────────────────────────────────────────────────────────
  const filtered = useMemo(() =>
    enriched.filter(l => {
      const name = l.customer?.name?.toLowerCase() || '';
      const accNum = (l.account?.accountNumber || l.accountNumber || '').toLowerCase();
      const matchQ = !q || name.includes(q.toLowerCase()) || accNum.includes(q.toLowerCase());
      const matchType = typeFilter === 'all' || l.type === typeFilter;
      const matchStatus = statusFilter === 'all' || l.status === statusFilter;
      return matchQ && matchType && matchStatus;
    }),
    [enriched, q, typeFilter, statusFilter]
  );

  // ── Report filtered ─────────────────────────────────────────────────────────
  const reportLoans = useMemo(() =>
    enriched.filter(l => inPeriod(l.createdAt, period)),
    [enriched, period]
  );

  const reportStats = useMemo(() => {
    const total = reportLoans.length;
    const totalPrincipal = reportLoans.reduce((s, l) => s + l.principal, 0);
    const totalRepayment = reportLoans.reduce((s, l) => s + l.totalRepay, 0);
    const totalOutstanding = reportLoans.reduce((s, l) => s + Number(l.outstanding || 0), 0);
    const totalPaid = reportLoans.reduce((s, l) => s + l.paid, 0);
    const collectionRate = totalPrincipal > 0 ? ((totalPaid / totalPrincipal) * 100).toFixed(1) : '0.0';
    return { total, totalPrincipal, totalRepayment, totalOutstanding, totalPaid, collectionRate };
  }, [reportLoans]);

  // ── Approve ─────────────────────────────────────────────────────────────────
  const doApprove = async () => {
    if (!approveModal) return;
    setSaving(true); setError('');
    const { error: err } = await updateLoan(approveModal.id, {
      status: 'active',
      disbursed_at: new Date().toISOString(),
      next_due_date: new Date(Date.now() + 30 * 86400000).toISOString(),
    });
    if (err) { setError(err.message || 'Failed to approve loan'); setSaving(false); return; }
    setApproveModal(null); setSaving(false);
  };

  // ── Reject ──────────────────────────────────────────────────────────────────
  const doReject = async () => {
    if (!rejectModal) return;
    setSaving(true); setError('');
    const { error: err } = await updateLoan(rejectModal.id, { status: 'rejected' });
    if (err) { setError(err.message || 'Failed to reject loan'); setSaving(false); return; }
    setRejectModal(null); setSaving(false);
  };

  // ── Repay ───────────────────────────────────────────────────────────────────
  const doRepay = async () => {
    const amt = parseFloat(repayAmount);
    if (!amt || amt <= 0 || !repayModal) return;
    setSaving(true); setError('');
    try {
      const loan = repayModal;

      if (loan.hpAgreementId) {
        // HP repayment path
        await recordHPPayment({
          agreementId: loan.hpAgreementId,
          amount: amt,
          note: 'Loan repayment',
          collectedBy: user?.name,
        });
      } else {
        // Regular loan repayment:
        // postTransaction with type='debit' + loanId will:
        //   1. Debit the account (reduce balance) — money leaves account to pay loan
        //   2. Reduce loan outstanding automatically
        //   3. Mark loan completed only when outstanding reaches 0 (principal + interest)
        if (loan.accountId) {
          await postTransaction({
            accountId:  loan.accountId,
            type:       'debit',
            amount:     amt,
            narration:  `Loan repayment — ${loan.purpose || loan.type}`,
            channel:    'teller',
            loanId:     loan.id,
          });
        } else {
          // No account linked — update loan directly
          const newOutstanding = Math.max(0, Number(loan.outstanding) - amt);
          await updateLoan(loan.id, {
            outstanding:       newOutstanding,
            status:            newOutstanding <= 0 ? 'completed' : loan.status,
            last_payment_date: new Date().toISOString(),
            next_due_date:     new Date(Date.now() + 30 * 86400000).toISOString(),
          });
        }
      }
      setRepayModal(null); setRepayAmount(''); setSaving(false);
    } catch (e) {
      setError(e.message || 'Repayment failed');
      setSaving(false);
    }
  };

  // ── Edit ────────────────────────────────────────────────────────────────────
  const openEdit = (loan) => {
    setEditForm({
      interestRate: String(loan.interestRate || ''),
      tenure: String(loan.tenure || ''),
      monthlyPayment: String(loan.monthlyPayment || ''),
      outstanding: String(loan.outstanding || ''),
      status: loan.status || '',
      nextDueDate: loan.nextDueDate ? loan.nextDueDate.slice(0, 10) : '',
      purpose: loan.purpose || '',
    });
    setError('');
    setEditModal(loan);
  };

  const doEdit = async () => {
    if (!editModal) return;
    setSaving(true); setError('');
    const payload = {
      interest_rate: parseFloat(editForm.interestRate) || editModal.interestRate,
      tenure: parseInt(editForm.tenure) || editModal.tenure,
      monthly_payment: parseFloat(editForm.monthlyPayment) || editModal.monthlyPayment,
      outstanding: parseFloat(editForm.outstanding) ?? editModal.outstanding,
      status: editForm.status || editModal.status,
      next_due_date: editForm.nextDueDate ? new Date(editForm.nextDueDate).toISOString() : editModal.nextDueDate,
      purpose: editForm.purpose || editModal.purpose,
    };
    const { error: err } = await updateLoan(editModal.id, payload);
    if (err) { setError(err.message || 'Update failed'); setSaving(false); return; }
    setEditModal(null); setSaving(false);
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const doDelete = async () => {
    if (!deleteModal) return;
    setSaving(true); setError('');
    try {
      if (deleteModal.hpAgreementId) {
        await supabase.from('hp_agreements').delete().eq('id', deleteModal.hpAgreementId);
      }
      await supabase.from('loans').delete().eq('id', deleteModal.id);
      await refresh();
      setDeleteModal(null); setSaving(false);
    } catch (e) {
      setError(e.message || 'Delete failed');
      setSaving(false);
    }
  };

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const rows = reportLoans.map(l => ({
      Customer: l.customer?.name || '—',
      Phone: l.customer?.phone || '—',
      Account: l.account?.accountNumber || l.accountNumber || '—',
      Type: l.type,
      Item: l.itemName || '—',
      Principal: l.principal,
      'Total Repayment': l.totalRepay,
      'Total Interest': l.totalInterest,
      Outstanding: l.outstanding,
      Paid: l.paid,
      'Paid %': l.paidPct.toFixed(1) + '%',
      'Interest Rate': l.interestRate + '%',
      'Monthly Payment': l.monthlyPayment,
      'Daily Payment': l.daily.toFixed(2),
      'Weekly Payment': l.weekly.toFixed(2),
      'Tenure (months)': l.tenure,
      Status: l.status,
      'Next Due': fmtDate(l.nextDueDate),
      'Created At': fmtDate(l.createdAt),
    }));
    exportCSV(rows, 'loans-report');
  };

  const handleExportPDF = () => {
    exportLoanReportPDF({
      loans: reportLoans,
      customers,
      accounts,
      period,
    });
  };

  // ── Loan row component ──────────────────────────────────────────────────────
  const LoanRow = ({ l }) => (
    <tr key={l.id}>
      <td>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{l.customer?.name || '—'}</div>
        <div className="font-mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{l.account?.accountNumber || l.accountNumber || '—'}</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{l.customer?.phone || ''}</div>
      </td>
      <td>
        <div style={{ textTransform: 'capitalize', fontWeight: 600, fontSize: 12 }}>{l.type?.replace('_', ' ')}</div>
        {l.itemName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
            <ShoppingBag size={10} />{l.itemName}
          </div>
        )}
      </td>
      <td className="font-mono" style={{ fontWeight: 700 }}>{GHS(l.principal)}</td>
      <td className="font-mono" style={{ fontWeight: 700, color: 'var(--green)' }}>{GHS(l.totalRepay)}</td>
      <td className="font-mono" style={{ color: '#ea580c' }}>{GHS(l.totalInterest > 0 ? l.totalInterest : 0)}</td>
      <td className="font-mono" style={{ fontWeight: 700, color: Number(l.outstanding) > 0 ? 'var(--red)' : 'var(--green)' }}>
        {GHS(l.outstanding)}
      </td>
      <td>
        <div className="font-mono" style={{ fontWeight: 600, color: 'var(--green)', marginBottom: 4 }}>{GHS(l.paid)}</div>
        <div className="progress" style={{ height: 6, marginBottom: 2 }}>
          <div className="progress-bar" style={{ width: `${Math.min(100, l.paidPct)}%`, background: l.paidPct >= 100 ? 'var(--green)' : 'var(--brand)' }} />
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{l.paidPct.toFixed(1)}%</div>
      </td>
      <td className="font-mono" style={{ fontSize: 12 }}>{l.interestRate}%</td>
      <td className="font-mono" style={{ fontSize: 12 }}>{GHS(l.monthlyPayment)}</td>
      <td className="font-mono" style={{ fontSize: 12 }}>{GHS(l.daily)}</td>
      <td className="font-mono" style={{ fontSize: 12 }}>{GHS(l.weekly)}</td>
      <td style={{ fontSize: 12 }}>{l.tenure} mo</td>
      <td><Badge status={l.status} /></td>
      <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: l.status === 'overdue' ? 'var(--red)' : 'var(--text-3)' }}>
        {fmtDate(l.nextDueDate)}
      </td>
      <td>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap' }}>
          {l.status === 'pending' && (
            <>
              <button className="btn btn-success btn-sm btn-icon" title="Approve" onClick={() => { setError(''); setApproveModal(l); }}>
                <CheckCircle size={13} />
              </button>
              <button className="btn btn-danger btn-sm btn-icon" title="Reject" onClick={() => { setError(''); setRejectModal(l); }}>
                <XCircle size={13} />
              </button>
            </>
          )}
          {(l.status === 'active' || l.status === 'overdue') && (
            <button className="btn btn-primary btn-sm btn-icon" title="Record Repayment" onClick={() => { setRepayAmount(''); setError(''); setRepayModal(l); }}>
              <DollarSign size={13} />
            </button>
          )}
          {isAdmin && (
            <>
              <button className="btn btn-ghost btn-sm btn-icon" title="Edit" onClick={() => openEdit(l)}>
                <Edit2 size={13} />
              </button>
              <button className="btn btn-danger btn-sm btn-icon" title="Delete" onClick={() => { setError(''); setDeleteModal(l); }}>
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="fade-in">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Loans</div>
          <div className="page-desc">Manage loan applications, repayments and reports</div>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={() => navigate('/loans/apply')}>
            <Plus size={15} />New Loan
          </button>
        </div>
      </div>

      {/* ── Summary Stats ─────────────────────────────────────────────────────── */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(5,1fr)', marginBottom: 20 }}>
        {[
          { label: 'Total Loans', value: loans.length, color: 'var(--brand)' },
          { label: 'Active', value: loans.filter(l => l.status === 'active').length, color: 'var(--green)' },
          { label: 'Pending', value: loans.filter(l => l.status === 'pending').length, color: '#f59e0b' },
          { label: 'Overdue', value: loans.filter(l => l.status === 'overdue').length, color: 'var(--red)' },
          { label: 'Loan Book', value: GHS(loans.filter(l => l.status === 'active').reduce((s, l) => s + Number(l.outstanding || 0), 0)), color: 'var(--purple)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div className="tabs">
        <div className={`tab ${tab === 'list' ? 'active' : ''}`} onClick={() => setTab('list')}>
          <FileText size={14} />Loan List
        </div>
        <div className={`tab ${tab === 'report' ? 'active' : ''}`} onClick={() => setTab('report')}>
          <Download size={14} />Reports
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* LIST TAB                                                              */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'list' && (
        <div className="card">
          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="search-box" style={{ flex: 1, minWidth: 220 }}>
              <Search size={15} />
              <input
                className="form-control"
                placeholder="Search customer name or account number…"
                value={q}
                onChange={e => setQ(e.target.value)}
              />
            </div>
            <select className="form-control" style={{ width: 150 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="all">All Types</option>
              <option value="personal">Personal</option>
              <option value="micro">Micro</option>
              <option value="mortgage">Mortgage</option>
              <option value="hire_purchase">Hire Purchase</option>
            </select>
            <select className="form-control" style={{ width: 140 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="overdue">Overdue</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Type / Item</th>
                  <th>Principal</th>
                  <th style={{ color: 'var(--green)' }}>Total Repayment</th>
                  <th style={{ color: '#ea580c' }}>Total Interest</th>
                  <th>Outstanding</th>
                  <th>Paid</th>
                  <th>Rate</th>
                  <th>Monthly</th>
                  <th>Daily</th>
                  <th>Weekly</th>
                  <th>Tenure</th>
                  <th>Status</th>
                  <th>Next Due</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={15} className="table-empty">No loans found</td></tr>
                ) : (
                  filtered.map(l => <LoanRow key={l.id} l={l} />)
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* REPORT TAB                                                            */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'report' && (
        <div>
          {/* Period + Export */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="tabs" style={{ marginBottom: 0, flex: 1 }}>
              {['all', 'today', 'week', 'month', 'quarter', 'year'].map(p => (
                <div key={p} className={`tab ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}
                  style={{ textTransform: 'capitalize', fontSize: 12 }}>
                  {p === 'all' ? 'All Time' : p.charAt(0).toUpperCase() + p.slice(1)}
                </div>
              ))}
            </div>
            <button className="btn btn-secondary btn-sm" onClick={handleExportCSV}>
              <Download size={13} />CSV
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleExportPDF}>
              <FileText size={13} />PDF
            </button>
          </div>

          {/* Summary Cards */}
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(5,1fr)', marginBottom: 20 }}>
            {[
              { label: 'Total Loans', value: reportStats.total, color: 'var(--brand)' },
              { label: 'Total Principal', value: GHS(reportStats.totalPrincipal), color: 'var(--text)' },
              { label: 'Total Repayment', value: GHS(reportStats.totalRepayment), color: 'var(--green)' },
              { label: 'Total Outstanding', value: GHS(reportStats.totalOutstanding), color: 'var(--red)' },
              { label: 'Collection Rate', value: reportStats.collectionRate + '%', color: 'var(--purple)' },
            ].map(s => (
              <div key={s.label} className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Report Table */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Loan Detail Report</div>
                <div className="card-subtitle">{reportLoans.length} loans in selected period</div>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Type / Item</th>
                    <th>Principal</th>
                    <th style={{ color: 'var(--green)' }}>Total Repayment</th>
                    <th style={{ color: '#ea580c' }}>Total Interest</th>
                    <th>Outstanding</th>
                    <th>Paid</th>
                    <th>Rate</th>
                    <th>Monthly</th>
                    <th>Daily</th>
                    <th>Weekly</th>
                    <th>Tenure</th>
                    <th>Status</th>
                    <th>Next Due</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {reportLoans.length === 0 ? (
                    <tr><td colSpan={15} className="table-empty">No loans in this period</td></tr>
                  ) : reportLoans.map(l => (
                    <tr key={l.id}>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{l.customer?.name || '—'}</div>
                        <div className="font-mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{l.account?.accountNumber || l.accountNumber || '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{l.customer?.phone || ''}</div>
                      </td>
                      <td>
                        <div style={{ textTransform: 'capitalize', fontWeight: 600, fontSize: 12 }}>{l.type?.replace('_', ' ')}</div>
                        {l.itemName && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                            <ShoppingBag size={10} />{l.itemName}
                          </div>
                        )}
                      </td>
                      <td className="font-mono" style={{ fontWeight: 700 }}>{GHS(l.principal)}</td>
                      <td className="font-mono" style={{ fontWeight: 700, color: 'var(--green)' }}>{GHS(l.totalRepay)}</td>
                      <td className="font-mono" style={{ color: '#ea580c' }}>{GHS(l.totalInterest > 0 ? l.totalInterest : 0)}</td>
                      <td className="font-mono" style={{ fontWeight: 700, color: Number(l.outstanding) > 0 ? 'var(--red)' : 'var(--green)' }}>{GHS(l.outstanding)}</td>
                      <td>
                        <div className="font-mono" style={{ fontWeight: 600, color: 'var(--green)', marginBottom: 4 }}>{GHS(l.paid)}</div>
                        <div className="progress" style={{ height: 5 }}>
                          <div className="progress-bar" style={{ width: `${Math.min(100, l.paidPct)}%` }} />
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{l.paidPct.toFixed(1)}%</div>
                      </td>
                      <td className="font-mono" style={{ fontSize: 12 }}>{l.interestRate}%</td>
                      <td className="font-mono" style={{ fontSize: 12 }}>{GHS(l.monthlyPayment)}</td>
                      <td className="font-mono" style={{ fontSize: 12 }}>{GHS(l.daily)}</td>
                      <td className="font-mono" style={{ fontSize: 12 }}>{GHS(l.weekly)}</td>
                      <td style={{ fontSize: 12 }}>{l.tenure} mo</td>
                      <td><Badge status={l.status} /></td>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: l.status === 'overdue' ? 'var(--red)' : 'var(--text-3)' }}>{fmtDate(l.nextDueDate)}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDate(l.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* APPROVE MODAL                                                         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Modal
        open={!!approveModal}
        onClose={() => { setApproveModal(null); setError(''); }}
        title="Approve Loan"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => { setApproveModal(null); setError(''); }}>Cancel</button>
            <button className="btn btn-success" onClick={doApprove} disabled={saving}>
              <CheckCircle size={14} />{saving ? 'Approving…' : 'Approve Loan'}
            </button>
          </>
        }
      >
        {approveModal && (
          <div>
            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
            <div className="alert alert-info" style={{ marginBottom: 16 }}>
              Approving this loan will mark it as <strong>Active</strong> and set the disbursement date to today.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                ['Customer', approveModal.customer?.name || '—'],
                ['Type', approveModal.type?.replace('_', ' ')],
                ['Principal', GHS(approveModal.principal)],
                ['Interest Rate', approveModal.interestRate + '%'],
                ['Monthly Payment', GHS(approveModal.monthlyPayment)],
                ['Tenure', approveModal.tenure + ' months'],
                ['Total Repayment', GHS(approveModal.totalRepay)],
                ['Total Interest', GHS(approveModal.totalInterest > 0 ? approveModal.totalInterest : 0)],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>{k}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2, textTransform: 'capitalize' }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* REJECT MODAL                                                          */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Modal
        open={!!rejectModal}
        onClose={() => { setRejectModal(null); setError(''); }}
        title="Reject Loan"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => { setRejectModal(null); setError(''); }}>Cancel</button>
            <button className="btn btn-danger" onClick={doReject} disabled={saving}>
              <XCircle size={14} />{saving ? 'Rejecting…' : 'Reject Loan'}
            </button>
          </>
        }
      >
        {rejectModal && (
          <div>
            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
            <div className="alert alert-warning" style={{ marginBottom: 16 }}>
              This will permanently reject the loan application for <strong>{rejectModal.customer?.name}</strong>.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                ['Customer', rejectModal.customer?.name || '—'],
                ['Principal', GHS(rejectModal.principal)],
                ['Type', rejectModal.type?.replace('_', ' ')],
                ['Purpose', rejectModal.purpose || '—'],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>{k}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2, textTransform: 'capitalize' }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* REPAY MODAL                                                           */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Modal
        open={!!repayModal}
        onClose={() => { setRepayModal(null); setRepayAmount(''); setError(''); }}
        title="Record Repayment"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => { setRepayModal(null); setRepayAmount(''); setError(''); }}>Cancel</button>
            <button className="btn btn-success" onClick={doRepay} disabled={saving || !repayAmount}>
              <DollarSign size={14} />{saving ? 'Recording…' : 'Record Payment'}
            </button>
          </>
        }
      >
        {repayModal && (
          <div>
            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
            <div style={{ padding: 14, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{repayModal.customer?.name || '—'}</div>
              {repayModal.itemName && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>
                  <ShoppingBag size={12} />{repayModal.itemName}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Principal</div>
                  <div className="font-mono" style={{ fontSize: 14, fontWeight: 700 }}>{GHS(repayModal.principal)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Total Repayment (with interest)</div>
                  <div className="font-mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>{GHS(repayModal.totalRepay)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Monthly Payment</div>
                  <div className="font-mono" style={{ fontSize: 14, fontWeight: 700 }}>{GHS(repayModal.monthlyPayment)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Outstanding Balance</div>
                  <div className="font-mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)' }}>{GHS(repayModal.outstanding)}</div>
                </div>
              </div>
              <div style={{ marginBottom: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-3)' }}>Progress</span>
                  <strong>{repayModal.paidPct.toFixed(1)}%</strong>
                </div>
                <div className="progress">
                  <div className="progress-bar" style={{ width: `${Math.min(100, repayModal.paidPct)}%`, background: repayModal.paidPct >= 100 ? 'var(--green)' : 'var(--brand)' }} />
                </div>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Amount to Pay (GH₵) <span style={{ color: 'var(--red)' }}>*</span></label>
              <input
                className="form-control"
                type="number"
                step="0.01"
                min="0.01"
                max={repayModal.outstanding}
                value={repayAmount}
                onChange={e => setRepayAmount(e.target.value)}
                autoFocus
                placeholder="0.00"
              />
              <div className="form-hint">
                Suggested monthly: <strong>{GHS(repayModal.monthlyPayment)}</strong>
                {' · '}Daily: <strong>{GHS(repayModal.daily)}</strong>
                {' · '}Weekly: <strong>{GHS(repayModal.weekly)}</strong>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* EDIT MODAL (admin only)                                               */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Modal
        open={!!editModal}
        onClose={() => { setEditModal(null); setError(''); }}
        title="Edit Loan"
        size="lg"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => { setEditModal(null); setError(''); }}>Cancel</button>
            <button className="btn btn-primary" onClick={doEdit} disabled={saving}>
              <Edit2 size={14} />{saving ? 'Saving…' : 'Save Changes'}
            </button>
          </>
        }
      >
        {editModal && (
          <div>
            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
            <div className="alert alert-warning" style={{ marginBottom: 16 }}>
              Editing loan for <strong>{editModal.customer?.name}</strong>. Changes take effect immediately.
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Interest Rate (%)</label>
                <input className="form-control" type="number" step="0.1" min="0" max="100" value={editForm.interestRate} onChange={ef('interestRate')} />
              </div>
              <div className="form-group">
                <label className="form-label">Tenure (months)</label>
                <input className="form-control" type="number" min="1" value={editForm.tenure} onChange={ef('tenure')} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Monthly Payment (GH₵)</label>
                <input className="form-control" type="number" step="0.01" min="0" value={editForm.monthlyPayment} onChange={ef('monthlyPayment')} />
              </div>
              <div className="form-group">
                <label className="form-label">Outstanding Balance (GH₵)</label>
                <input className="form-control" type="number" step="0.01" min="0" value={editForm.outstanding} onChange={ef('outstanding')} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-control" value={editForm.status} onChange={ef('status')}>
                  <option value="pending">Pending</option>
                  <option value="active">Active</option>
                  <option value="overdue">Overdue</option>
                  <option value="completed">Completed</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Next Due Date</label>
                <input className="form-control" type="date" value={editForm.nextDueDate} onChange={ef('nextDueDate')} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Purpose / Notes</label>
              <input className="form-control" type="text" value={editForm.purpose} onChange={ef('purpose')} placeholder="Loan purpose or notes" />
            </div>
          </div>
        )}
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* DELETE MODAL (admin only)                                             */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Modal
        open={!!deleteModal}
        onClose={() => { setDeleteModal(null); setError(''); }}
        title="Delete Loan"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => { setDeleteModal(null); setError(''); }}>Cancel</button>
            <button className="btn btn-danger" onClick={doDelete} disabled={saving}>
              <Trash2 size={14} />{saving ? 'Deleting…' : 'Delete Loan'}
            </button>
          </>
        }
      >
        {deleteModal && (
          <div>
            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              <strong>This action cannot be undone.</strong> The loan record will be permanently deleted.
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                You are about to delete the loan for <strong>{deleteModal.customer?.name}</strong>:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  ['Principal', GHS(deleteModal.principal)],
                  ['Type', deleteModal.type?.replace('_', ' ')],
                  ['Status', deleteModal.status],
                  ['Outstanding', GHS(deleteModal.outstanding)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>{k}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2, textTransform: 'capitalize' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
            {deleteModal.hpAgreementId && (
              <div className="alert alert-warning">
                <strong>Cascade Warning:</strong> This loan is linked to a Hire Purchase agreement. Deleting this loan will also delete the associated HP agreement.
              </div>
            )}
          </div>
        )}
      </Modal>

    </div>
  );
}
