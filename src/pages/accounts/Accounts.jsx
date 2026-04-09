import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import Badge from '../../components/ui/Badge';
import { Search, Plus, Eye, Lock, Unlock } from 'lucide-react';

const GHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

// Helper — Supabase returns snake_case; handle both
const field = (obj, snake, camel) => obj?.[snake] ?? obj?.[camel];

export default function Accounts() {
  const { accounts, updateAccount } = useApp();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  // Supabase join returns customer data as `customers` (table name)
  const enriched = useMemo(() =>
    accounts.map(a => ({
      ...a,
      // support both joined object names
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

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Accounts</div>
          <div className="page-desc">{accounts.length} total accounts</div>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={() => navigate('/accounts/open')}>
            <Plus size={15} />Open Account
          </button>
        </div>
      </div>

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
                      <Badge status={a.type} label={a.type?.replace(/_/g, ' ')} />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: a.balance < 0 ? 'var(--red)' : 'var(--text)' }}>
                      {GHS(a.balance)}
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
      </div>
    </div>
  );
}
