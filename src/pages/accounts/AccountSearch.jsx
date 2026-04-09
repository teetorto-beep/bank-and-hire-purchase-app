import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import Badge from '../../components/ui/Badge';
import { Search, ArrowRight } from 'lucide-react';

const GHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

export default function AccountSearch() {
  const { accounts, customers, transactions } = useApp();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [result, setResult] = useState(null);
  const [searched, setSearched] = useState(false);

  const search = () => {
    setSearched(true);
    const acc = accounts.find(a =>
      a.accountNumber === q.trim() ||
      (customers.find(c => c.id === a.customerId)?.phone === q.trim())
    );
    if (acc) {
      const customer = customers.find(c => c.id === acc.customerId);
      const txns = transactions.filter(t => t.accountId === acc.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
      setResult({ acc, customer, txns });
    } else setResult(null);
  };

  return (
    <div className="fade-in" style={{ maxWidth: 680, margin: '0 auto' }}>
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Account Search</div>
          <div className="page-desc">Search by account number or phone number</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="search-box" style={{ flex: 1 }}>
            <Search size={15} />
            <input className="form-control" placeholder="Enter account number or phone number…"
              value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()} />
          </div>
          <button className="btn btn-primary" onClick={search}>Search</button>
        </div>
      </div>

      {searched && !result && (
        <div className="alert alert-warning"><Search size={14} />No account found for "{q}"</div>
      )}

      {result && (
        <div className="card fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Account Number</div>
              <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 800, marginTop: 2 }}>{result.acc.accountNumber}</div>
            </div>
            <Badge status={result.acc.status} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
            {[
              ['Customer', result.customer?.name || '—'],
              ['Account Type', result.acc.type?.replace('_', ' ')],
              ['Balance', GHS(result.acc.balance)],
              ['Interest Rate', `${result.acc.interestRate}% p.a.`],
              ['Phone', result.customer?.phone || '—'],
              ['KYC Status', result.customer?.kycStatus || '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>{k}</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, textTransform: 'capitalize' }}>{v}</div>
              </div>
            ))}
          </div>

          {result.txns.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Recent Transactions</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Narration</th><th>Type</th><th>Amount</th></tr></thead>
                  <tbody>
                    {result.txns.map(t => (
                      <tr key={t.id}>
                        <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{new Date(t.createdAt).toLocaleDateString()}</td>
                        <td>{t.narration}</td>
                        <td><Badge status={t.type} /></td>
                        <td style={{ fontWeight: 700, color: t.type === 'credit' ? 'var(--green)' : 'var(--red)' }}>
                          {t.type === 'credit' ? '+' : '-'}{GHS(t.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={() => navigate(`/customers/${result.acc.customerId}`)}>
              View Full Profile <ArrowRight size={13} />
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/transactions/post')}>Post Transaction</button>
          </div>
        </div>
      )}
    </div>
  );
}
