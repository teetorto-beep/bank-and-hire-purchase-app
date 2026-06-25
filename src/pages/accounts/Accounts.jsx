import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import Badge from '../../components/ui/Badge';
import { Search, Plus, Eye, Lock, Unlock, Download, Upload } from 'lucide-react';
import Papa from 'papaparse';
import { accountTypeLabel } from '../../core/normalize';

const GHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;
const field = (obj, snake, camel) => obj?.[snake] ?? obj?.[camel];

export default function Accounts() {
  const { accounts, loans, customers, updateAccount } = useApp();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadingCSV, setUploadingCSV] = useState(false);

  // Supabase join returns customer data as `customers` (table name)
  const enriched = useMemo(() =>
    accounts.map(a => ({
      ...a,
      _customer: a.customers || a.customer || null,
      _accountNumber: field(a, 'account_number', 'accountNumber'),
      _customerId: field(a, 'customer_id', 'customerId'),
      _interestRate: field(a, 'interest_rate', 'interestRate'),
      _openedAt: field(a, 'opened_at', 'openedAt'),
    })),
    [accounts]
  );

  const filtered = useMemo(() =>
    enriched.filter(a => {
      const matchQ = !q ||
        (a._accountNumber || '').includes(q) ||
        (a._customer?.name || '').toLowerCase().includes(q.toLowerCase()) ||
        (a._customer?.phone || '').includes(q);
      const matchType = typeFilter === 'all' || a.type === typeFilter;
      return matchQ && matchType;
    }), [enriched, q, typeFilter]);

  const toggleFreeze = (a) =>
    updateAccount(a.id, { status: a.status === 'frozen' ? 'active' : 'frozen' });

  // ── Download accounts as CSV ──────────────────────────────────────────────
  const downloadCSV = () => {
    const rows = filtered.map((a, i) => ({
      '#': i + 1,
      'Account Number': a._accountNumber || '',
      'Customer Name': a._customer?.name || '',
      'Customer Phone': a._customer?.phone || '',
      'Type': a.type || '',
      'Balance': a.balance ?? 0,
      'Interest Rate': a._interestRate ?? 0,
      'Status': a.status || '',
      'Opened At': a._openedAt ? new Date(a._openedAt).toLocaleDateString() : '',
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `accounts-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  // ── Upload accounts from CSV (update status/interest rate only — safe) ────
  const handleUploadCSV = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setUploadingCSV(true); setUploadResult(null);
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (res) => {
        let updated = 0, skipped = 0;
        for (const row of res.data) {
          const acctNum = (row['Account Number'] || row['account_number'] || '').trim();
          if (!acctNum) { skipped++; continue; }
          const acct = accounts.find(a => (a.account_number || a.accountNumber) === acctNum);
          if (!acct) { skipped++; continue; }
          const patch = {};
          if (row['Status'] && ['active','frozen','dormant','closed'].includes(row['Status'].toLowerCase()))
            patch.status = row['Status'].toLowerCase();
          if (row['Interest Rate'] && !isNaN(parseFloat(row['Interest Rate'])))
            patch.interest_rate = parseFloat(row['Interest Rate']);
          if (Object.keys(patch).length === 0) { skipped++; continue; }
          const result = await updateAccount(acct.id, patch);
          if (result?.error) skipped++; else updated++;
        }
        setUploadResult({ updated, skipped });
        setUploadingCSV(false);
        e.target.value = '';
      },
      error: () => { setUploadingCSV(false); setUploadResult({ updated: 0, skipped: 0, error: 'Failed to parse CSV.' }); },
    });
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Accounts</div>
          <div className="page-desc">{accounts.length} total accounts</div>
        </div>
        <div className="page-header-right">
          <button className="btn btn-secondary btn-sm" onClick={downloadCSV} title="Download accounts as CSV">
            <Download size={14} /> Download CSV
          </button>
          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', margin: 0 }} title="Upload CSV to update account status/interest rate">
            <Upload size={14} /> {uploadingCSV ? 'Importing…' : 'Upload CSV'}
            <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleUploadCSV} disabled={uploadingCSV} />
          </label>
          <button className="btn btn-primary" onClick={() => navigate('/accounts/open')}>
            <Plus size={15} />Open Account
          </button>
        </div>
      </div>

      {/* Upload result */}
      {uploadResult && (
        <div className={`alert ${uploadResult.error ? 'alert-error' : 'alert-success'}`} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <span>
              {uploadResult.error
                ? uploadResult.error
                : <><strong>CSV Import:</strong> {uploadResult.updated} updated, {uploadResult.skipped} skipped.</>}
            </span>
            <button onClick={() => setUploadResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>×</button>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div className="search-box" style={{ flex: 1, minWidth: 200 }}>
            <Search size={15} />
            <input
              className="form-control"
              placeholder="Search by account number, customer name or phone…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          <select className="form-control" style={{ width: 180 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="all">All Types</option>
            <option value="savings">Savings</option>
            <option value="current">Current</option>
            <option value="hire_purchase">Hire Purchase</option>
            <option value="joint">Joint</option>
            <option value="fixed_deposit">Fixed Deposit</option>
          </select>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Account No.</th>
                <th>Customer</th>
                <th>Type</th>
                <th style={{ textAlign: 'right' }}>Balance</th>
                <th>Interest Rate</th>
                <th>Status</th>
                <th>Opened</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="table-empty">No accounts found</td></tr>
              ) : filtered.map(a => {
                const openedDate = a._openedAt ? new Date(a._openedAt) : null;
                const validDate = openedDate && !isNaN(openedDate.getTime());
                return (
                  <tr key={a.id}>
                    <td className="font-mono" style={{ fontWeight: 700 }}>
                      {a._accountNumber || '—'}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{a._customer?.name || '—'}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{a._customer?.phone || ''}</div>
                    </td>
                    <td>
                      <Badge status={a.type} label={accountTypeLabel(a, accounts)} />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                      <div style={{ color: a.balance < 0 ? 'var(--red)' : 'var(--text)' }}>{GHS(a.balance)}</div>
                      {(() => {
                        const acctLoans = loans.filter(l =>
                          (l.accountId === a.id || l.account_id === a.id) &&
                          (l.status === 'active' || l.status === 'overdue')
                        );
                        const loanOut = acctLoans.reduce((s, l) => s + Number(l.outstanding || 0), 0);
                        if (loanOut <= 0) return null;
                        return (
                          <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 2 }}>
                            −{GHS(loanOut)} loan
                          </div>
                        );
                      })()}
                    </td>
                    <td>{a._interestRate ?? 0}%</td>
                    <td><Badge status={a.status} /></td>
                    <td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      {validDate ? openedDate.toLocaleDateString() : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          title="View Customer"
                          onClick={() => navigate(`/customers/${a._customerId}`)}
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          title={a.status === 'frozen' ? 'Unfreeze' : 'Freeze'}
                          onClick={() => toggleFreeze(a)}
                          style={{ color: a.status === 'frozen' ? 'var(--green)' : 'var(--yellow)' }}
                        >
                          {a.status === 'frozen' ? <Unlock size={14} /> : <Lock size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10 }}>
          CSV upload updates: <code>Status</code> (active/frozen/dormant/closed) and <code>Interest Rate</code> by <code>Account Number</code>
        </div>
      </div>
    </div>
  );
}
