import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import Badge from '../../components/ui/Badge';
import { Search, Plus, CreditCard, ArrowRightLeft, AlertTriangle, ShoppingBag } from 'lucide-react';
import { authDB } from '../../core/db';

const GHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

export default function Account360() {
  const { accounts, customers, transactions, loans, hpAgreements, hpItems, deductionRules, postTransaction } = useApp();
  const navigate = useNavigate();
  const user = authDB.currentUser();
  const [search, setSearch] = useState('');
  const [result, setResult] = useState(null);
  const [searched, setSearched] = useState(false);
  const [offsetMsg, setOffsetMsg] = useState('');
  const [offsetting, setOffsetting] = useState(null);

  const doSearch = () => {
    setSearched(true);
    const q = search.trim().toLowerCase();
    if (!q) return;

    // Search by account number
    let acc = accounts.find(a =>
      (a.accountNumber || '').toLowerCase() === q ||
      (a.accountNumber || '').toLowerCase().includes(q)
    );

    // Search by customer name, phone, or Ghana Card
    if (!acc) {
      const cust = customers.find(c =>
        (c.phone || '') === q ||
        (c.name || '').toLowerCase().includes(q) ||
        (c.ghanaCard || '').toLowerCase() === q
      );
      if (cust) acc = accounts.find(a => a.customerId === cust.id);
    }

    if (!acc) { setResult(null); return; }

    const customer = customers.find(c => c.id === acc.customerId) || acc.customer;
    const allCustAccounts = accounts.filter(a => a.customerId === acc.customerId);
    const custTxns = transactions
      .filter(t => allCustAccounts.some(a => a.id === (t.accountId || t.account_id)))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const custLoans = loans.filter(l => l.customerId === acc.customerId);
    const custAgreements = hpAgreements.filter(a => a.customerId === acc.customerId).map(a => ({
      ...a,
      item: a.item || hpItems.find(i => i.id === a.itemId),
      loan: a.loan || loans.find(l => l.id === a.loanId),
      progress: a.totalPrice > 0 ? Math.min(100, ((a.totalPaid || 0) / a.totalPrice) * 100) : 0,
    }));
    const custRules = deductionRules.filter(r =>
      allCustAccounts.some(a => a.id === (r.account_id || r.accountId))
    );
    setResult({ acc, customer, allCustAccounts, custTxns, custLoans, custAgreements, custRules });
  };

  // ── Apply account balance to offset a loan ────────────────────────────────
  const doOffset = async (account, loan) => {
    const balance = Number(account.balance || 0);
    const outstanding = Number(loan.outstanding || 0);
    if (balance <= 0) { setOffsetMsg('Account has no balance to apply.'); return; }
    if (outstanding <= 0) { setOffsetMsg('Loan is already fully paid.'); return; }

    const applyAmt = Math.min(balance, outstanding);
    const confirm = window.confirm(
      `Apply ${GHS(applyAmt)} from account ${account.accountNumber} to offset ${loan.type?.replace(/_/g,' ')} loan?\n\n` +
      `Account balance: ${GHS(balance)}\nLoan outstanding: ${GHS(outstanding)}\nAmount to apply: ${GHS(applyAmt)}`
    );
    if (!confirm) return;

    setOffsetting(loan.id);
    setOffsetMsg('');
    try {
      const { error } = await postTransaction({
        accountId: account.id,
        account_id: account.id,
        type: 'debit',
        amount: applyAmt,
        narration: `Loan offset — ${loan.type?.replace(/_/g,' ')} (from account balance)`,
        channel: 'teller',
        loan_id: loan.id,
      });
      if (error) { setOffsetMsg('Error: ' + error.message); }
      else {
        setOffsetMsg(`✅ ${GHS(applyAmt)} applied to loan. Outstanding reduced to ${GHS(Math.max(0, outstanding - applyAmt))}.`);
        doSearch(); // refresh
      }
    } catch (e) { setOffsetMsg('Error: ' + e.message); }
    setOffsetting(null);
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Account 360°</div>
          <div className="page-desc">Full customer view — search by account number, name, phone, or Ghana Card</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="search-box" style={{ flex: 1 }}>
            <Search size={15} />
            <input className="form-control" placeholder="Account number · Customer name · Phone · Ghana Card…"
              value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch()} />
          </div>
          <button className="btn btn-primary" onClick={doSearch}>Search</button>
        </div>
      </div>

      {searched && !result && (
        <div className="alert alert-warning"><Search size={14} />No account found for "{search}"</div>
      )}

      {result && (
        <div className="fade-in">
          {/* Offset message */}
          {offsetMsg && (
            <div className={`alert ${offsetMsg.startsWith('✅') ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: 16 }}>
              {offsetMsg}
              <button onClick={() => setOffsetMsg('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
          )}
          {/* Customer header */}
          <div className="card" style={{ marginBottom: 16, background: 'linear-gradient(135deg, #0f172a, #1e3a8a)', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800 }}>
                  {result.customer?.name?.[0]}
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{result.customer?.name}</div>
                  <div style={{ fontSize: 13, opacity: .8, marginTop: 2 }}>{result.customer?.phone} · {result.customer?.email}</div>
                  <div style={{ fontSize: 12, opacity: .7, marginTop: 2 }}>{result.customer?.address}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, opacity: .7, textTransform: 'uppercase', letterSpacing: '.06em' }}>KYC Status</div>
                <Badge status={result.customer?.kycStatus} />
                <div style={{ fontSize: 11, opacity: .7, marginTop: 8 }}>Ghana Card: {result.customer?.ghanaCard || '—'}</div>
                <div style={{ fontSize: 11, opacity: .7 }}>Income: {GHS(result.customer?.monthlyIncome)}/mo</div>
              </div>
            </div>
          </div>

          {/* All accounts */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Accounts ({result.allCustAccounts.length})
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {result.allCustAccounts.map(a => {
                // Net position = savings balance minus any loan outstanding on this account
                const linkedLoans = result.custLoans.filter(l =>
                  (l.accountId === a.id) && (l.status === 'active' || l.status === 'overdue')
                );
                const loanOutstanding = linkedLoans.reduce((s, l) => s + Number(l.outstanding || 0), 0);
                const netPosition = Number(a.balance) - loanOutstanding;
                const hasLoan = loanOutstanding > 0;
                return (
                <div key={a.id} style={{ padding: 16, border: `2px solid ${a.id === result.acc.id ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 10, background: a.id === result.acc.id ? 'var(--brand-light)' : 'var(--surface)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)' }}>{a.type?.replace('_', ' ')}</span>
                    <Badge status={a.status} />
                  </div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14 }}>{a.accountNumber}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8, color: a.balance < 0 ? 'var(--red)' : 'var(--text)' }}>{GHS(a.balance)}</div>
                  {hasLoan && (
                    <>
                      <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4, fontWeight: 700 }}>
                        − {GHS(loanOutstanding)} loan outstanding
                      </div>
                      <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Net Position</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: netPosition < 0 ? 'var(--red)' : 'var(--green)' }}>
                          {netPosition < 0 ? '-' : ''}{GHS(Math.abs(netPosition))}
                        </div>
                      </div>
                      {/* ── Offset button ── */}
                      {Number(a.balance) > 0 && linkedLoans.length > 0 && (
                        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6 }}>
                            Apply balance to offset loan:
                          </div>
                          {linkedLoans.map(loan => (
                            <button
                              key={loan.id}
                              className="btn btn-primary btn-sm"
                              style={{ width: '100%', marginBottom: 4, fontSize: 11 }}
                              disabled={offsetting === loan.id}
                              onClick={() => doOffset(a, loan)}
                            >
                              <ArrowRightLeft size={12} />
                              {offsetting === loan.id ? 'Applying…' : `Apply ${GHS(Math.min(Number(a.balance), Number(loan.outstanding)))} → ${loan.type?.replace(/_/g,' ')}`}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{a.interestRate}% p.a.</div>
                </div>
                );
              })}
              <div style={{ padding: 16, border: '2px dashed var(--border)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-3)' }}
                onClick={() => navigate('/accounts/open')}>
                <Plus size={16} style={{ marginRight: 6 }} />Open New Account
              </div>
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: 16 }}>
            {/* Loans */}
            <div className="card">
              <div className="card-header"><div className="card-title">Loans ({result.custLoans.length})</div></div>
              {result.custLoans.length === 0 ? <div className="table-empty">No loans</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {result.custLoans.map(l => (
                    <div key={l.id} style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{l.type?.replace('_', ' ')}</span>
                        <Badge status={l.status} />
                      </div>
                      {l.itemName && <div style={{ fontSize: 12, color: 'var(--brand)', marginBottom: 4 }}><ShoppingBag size={11} style={{ display: 'inline', marginRight: 4 }} />{l.itemName}</div>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: 'var(--text-3)' }}>Outstanding</span>
                        <strong style={{ color: l.outstanding > 0 ? 'var(--red)' : 'var(--green)' }}>{GHS(l.outstanding)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                        <span>Monthly: {GHS(l.monthlyPayment)}</span>
                        <span>Rate: {l.interestRate}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* HP Agreements */}
            <div className="card">
              <div className="card-header"><div className="card-title">HP Agreements ({result.custAgreements.length})</div></div>
              {result.custAgreements.length === 0 ? <div className="table-empty">No HP agreements</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {result.custAgreements.map(a => (
                    <div key={a.id} style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 20 }}>{a.item?.image || '📦'}</span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{a.item?.name || a.itemName}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.paymentFrequency} payments</div>
                        </div>
                        <Badge status={a.status} />
                      </div>
                      <div className="progress" style={{ marginBottom: 4 }}>
                        <div className="progress-bar" style={{ width: `${a.progress}%`, background: 'var(--brand)' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'var(--green)' }}>Paid: {GHS(a.totalPaid)}</span>
                        <span style={{ color: 'var(--red)' }}>Left: {GHS(a.remaining)}</span>
                        <strong>{a.progress.toFixed(0)}%</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Auto-deduction rules */}
          {result.custRules.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header"><div className="card-title">Auto-Deduction Rules ({result.custRules.length})</div></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Account</th><th>Label</th><th>Amount</th><th>Linked To</th><th>Status</th></tr></thead>
                  <tbody>
                    {result.custRules.map(r => (
                      <tr key={r.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{result.allCustAccounts.find(a => a.id === r.accountId)?.accountNumber}</td>
                        <td>{r.label}</td>
                        <td style={{ fontWeight: 700 }}>{GHS(r.amount)}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.loanId ? 'Loan' : r.hpAgreementId ? 'HP Agreement' : 'Manual'}</td>
                        <td><Badge status={r.active ? 'active' : 'inactive'} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Recent transactions */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">All Transactions ({result.custTxns.length})</div>
              <button className="btn btn-secondary btn-sm" onClick={() => navigate('/transactions/statement')}>Full Statement</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Date</th><th>Account</th><th>Narration</th><th>Type</th><th>Amount</th><th>Balance After</th><th>Posted By</th></tr>
                </thead>
                <tbody>
                  {result.custTxns.slice(0, 20).map(t => {
                    const acc = result.allCustAccounts.find(a => a.id === t.accountId);
                    return (
                      <tr key={t.id} style={{ opacity: t.reversed ? 0.5 : 1 }}>
                        <td style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{new Date(t.createdAt).toLocaleString()}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{acc?.accountNumber}</td>
                        <td style={{ fontSize: 13 }}>{t.narration}</td>
                        <td><Badge status={t.type} /></td>
                        <td style={{ fontWeight: 700, color: t.type === 'credit' ? 'var(--green)' : 'var(--red)', whiteSpace: 'nowrap' }}>
                          {t.type === 'credit' ? '+' : '-'}{GHS(t.amount)}
                        </td>
                        <td>{GHS(t.balanceAfter)}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{t.posterName || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
