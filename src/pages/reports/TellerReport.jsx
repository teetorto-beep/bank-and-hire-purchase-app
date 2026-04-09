import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Download, FileText, CheckCircle, XCircle, AlertCircle, User } from 'lucide-react';
import { exportReportPDF, exportCSV } from '../../core/export';

const GHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

export default function TellerReport() {
  const { transactions, accounts, customers, users } = useApp();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTeller, setSelectedTeller] = useState('all');
  const [showReversed, setShowReversed] = useState(false);

  // Get unique tellers from transactions
  const tellers = useMemo(() => {
    const tellerSet = new Set();
    transactions.forEach(t => {
      if (t.posterId) tellerSet.add(t.posterId);
    });
    return Array.from(tellerSet).map(id => {
      const user = users?.find(u => u.id === id);
      return { id, name: user?.name || user?.email || 'Unknown' };
    });
  }, [transactions, users]);

  // Filter transactions by date and teller
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const txnDate = new Date(t.createdAt).toISOString().split('T')[0];
      if (txnDate !== selectedDate) return false;
      if (selectedTeller !== 'all' && t.posterId !== selectedTeller) return false;
      if (!showReversed && t.reversed) return false;
      return true;
    });
  }, [transactions, selectedDate, selectedTeller, showReversed]);

  // Group by teller
  const tellerSummary = useMemo(() => {
    const summary = {};
    filteredTransactions.forEach(t => {
      const tellerId = t.posterId || 'unknown';
      if (!summary[tellerId]) {
        const user = users?.find(u => u.id === tellerId);
        summary[tellerId] = {
          id: tellerId,
          name: t.posterName || user?.name || user?.email || 'Unknown',
          credits: 0,
          debits: 0,
          creditCount: 0,
          debitCount: 0,
          transactions: [],
        };
      }
      summary[tellerId].transactions.push(t);
      if (t.type === 'credit') {
        summary[tellerId].credits += t.amount;
        summary[tellerId].creditCount++;
      } else {
        summary[tellerId].debits += t.amount;
        summary[tellerId].debitCount++;
      }
    });
    return Object.values(summary);
  }, [filteredTransactions, users]);

  // Overall totals
  const totals = useMemo(() => {
    return {
      credits: filteredTransactions.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0),
      debits: filteredTransactions.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0),
      creditCount: filteredTransactions.filter(t => t.type === 'credit').length,
      debitCount: filteredTransactions.filter(t => t.type === 'debit').length,
      netCash: 0,
    };
  }, [filteredTransactions]);

  totals.netCash = totals.credits - totals.debits;

  // Export functions
  const exportPDF = () => {
    exportReportPDF({
      title: 'Teller Call-Over Report',
      subtitle: `Date: ${new Date(selectedDate).toLocaleDateString()} · ${filteredTransactions.length} transactions · ${tellerSummary.length} teller(s)`,
      columns: ['Time', 'Reference', 'Account', 'Customer', 'Narration', 'Type', 'Amount', 'Teller'],
      rows: filteredTransactions.map(t => {
        const acc = accounts.find(a => a.id === t.accountId);
        const cust = customers.find(c => c.id === acc?.customerId);
        return [
          new Date(t.createdAt).toLocaleTimeString(),
          t.reference,
          acc?.accountNumber || '—',
          cust?.name || '—',
          t.narration,
          t.type.toUpperCase(),
          `GHC ${Number(t.amount || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`,
          t.posterName || '—',
        ];
      }),
      summary: [
        ['Total Credits', `GHC ${Number(totals.credits).toLocaleString('en-GH', { minimumFractionDigits: 2 })} (${totals.creditCount} txns)`],
        ['Total Debits', `GHC ${Number(totals.debits).toLocaleString('en-GH', { minimumFractionDigits: 2 })} (${totals.debitCount} txns)`],
        ['Net Cash Position', `GHC ${Number(totals.netCash).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`],
      ],
    });
  };

  const exportCSVReport = () => {
    exportCSV(
      filteredTransactions.map(t => {
        const acc = accounts.find(a => a.id === t.accountId);
        const cust = customers.find(c => c.id === acc?.customerId);
        return {
          Time: new Date(t.createdAt).toLocaleTimeString(),
          Date: new Date(t.createdAt).toLocaleDateString(),
          Reference: t.reference,
          AccountNumber: acc?.accountNumber,
          CustomerName: cust?.name,
          Narration: t.narration,
          Type: t.type,
          Amount: t.amount,
          BalanceAfter: t.balanceAfter,
          Teller: t.posterName,
          Channel: t.channel,
          Reversed: t.reversed ? 'Yes' : 'No',
        };
      }),
      `teller-report-${selectedDate}`
    );
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Teller Call-Over Report</div>
          <div className="page-desc">End-of-day reconciliation and teller transaction review</div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '0 0 auto' }}>
            <label className="form-label">Date</label>
            <input
              type="date"
              className="form-control"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
            />
          </div>
          <div style={{ flex: '0 0 auto', minWidth: 200 }}>
            <label className="form-label">Teller</label>
            <select
              className="form-control"
              value={selectedTeller}
              onChange={(e) => setSelectedTeller(e.target.value)}
            >
              <option value="all">All Tellers</option>
              {tellers.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'flex-end' }}>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={showReversed}
                onChange={(e) => setShowReversed(e.target.checked)}
              />
              <span>Show Reversed</span>
            </label>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
            Total Credits
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)' }}>
            {GHS(totals.credits)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
            {totals.creditCount} transactions
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
            Total Debits
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--red)' }}>
            {GHS(totals.debits)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
            {totals.debitCount} transactions
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
            Net Cash Position
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: totals.netCash >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {GHS(totals.netCash)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
            {totals.credits > totals.debits ? 'Cash In' : 'Cash Out'}
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
            Total Transactions
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--brand)' }}>
            {filteredTransactions.length}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
            {tellerSummary.length} teller(s)
          </div>
        </div>
      </div>

      {/* Teller Summary */}
      {tellerSummary.length > 1 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <div className="card-title">Teller Summary</div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Teller</th>
                  <th>Credits</th>
                  <th>Debits</th>
                  <th>Net</th>
                  <th>Transactions</th>
                </tr>
              </thead>
              <tbody>
                {tellerSummary.map(t => (
                  <tr key={t.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <User size={14} style={{ color: 'var(--text-3)' }} />
                        <span style={{ fontWeight: 600 }}>{t.name}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--green)', fontWeight: 700 }}>
                      {GHS(t.credits)}
                      <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4 }}>({t.creditCount})</span>
                    </td>
                    <td style={{ color: 'var(--red)', fontWeight: 700 }}>
                      {GHS(t.debits)}
                      <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4 }}>({t.debitCount})</span>
                    </td>
                    <td style={{ fontWeight: 700, color: (t.credits - t.debits) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {GHS(t.credits - t.debits)}
                    </td>
                    <td>{t.transactions.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transaction Details */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Transaction Details ({filteredTransactions.length})</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={exportCSVReport}>
              <Download size={13} />
              CSV
            </button>
            <button className="btn btn-primary btn-sm" onClick={exportPDF}>
              <FileText size={13} />
              PDF
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Reference</th>
                <th>Account</th>
                <th>Customer</th>
                <th>Narration</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Balance After</th>
                <th>Teller</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="table-empty">
                    <AlertCircle size={16} />
                    No transactions found for selected date and teller
                  </td>
                </tr>
              ) : (
                filteredTransactions.map(t => {
                  const acc = accounts.find(a => a.id === t.accountId);
                  const cust = customers.find(c => c.id === acc?.customerId);
                  return (
                    <tr key={t.id} style={{ opacity: t.reversed ? 0.5 : 1 }}>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                        {new Date(t.createdAt).toLocaleTimeString()}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{t.reference}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{acc?.accountNumber || '—'}</td>
                      <td style={{ fontSize: 12 }}>{cust?.name || '—'}</td>
                      <td style={{ fontSize: 12, maxWidth: 200 }}>{t.narration}</td>
                      <td>
                        <span className={`badge ${t.type === 'credit' ? 'badge-green' : 'badge-red'}`}>
                          {t.type}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700, color: t.type === 'credit' ? 'var(--green)' : 'var(--red)', whiteSpace: 'nowrap' }}>
                        {t.type === 'credit' ? '+' : '-'}{GHS(t.amount)}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{GHS(t.balanceAfter)}</td>
                      <td style={{ fontSize: 12 }}>{t.posterName || '—'}</td>
                      <td>
                        {t.reversed ? (
                          <span className="badge badge-gray">
                            <XCircle size={12} />
                            Reversed
                          </span>
                        ) : (
                          <span className="badge badge-green">
                            <CheckCircle size={12} />
                            Posted
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Call-Over Instructions */}
      <div className="alert alert-info" style={{ marginTop: 20 }}>
        <AlertCircle size={16} />
        <div>
          <strong>Call-Over Process:</strong> Review all transactions above with each teller. Verify cash on hand matches the net cash position. 
          Reconcile any discrepancies before end-of-day posting. Export PDF for physical records.
        </div>
      </div>
    </div>
  );
}
