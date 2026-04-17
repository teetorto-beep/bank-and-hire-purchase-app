import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import Badge from '../../components/ui/Badge';
import { ArrowLeft, Phone, Mail, MapPin, Briefcase, CreditCard, ShoppingBag, Smartphone } from 'lucide-react';

const GHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { customers, accounts, transactions, loans, hpAgreements, hpItems, hpPayments, updateCustomer } = useApp();

  const customer = customers.find(c => c.id === id);

  const [appCreds, setAppCreds] = useState({ app_username: customer?.app_username || '', app_password: customer?.app_password || '' });
  const [savingCreds, setSavingCreds] = useState(false);
  const [credsMsg, setCredsMsg] = useState('');

  if (!customer) return <div className="card" style={{ textAlign: 'center', padding: 48 }}>Customer not found. <button className="btn btn-ghost" onClick={() => navigate('/customers')}>Go back</button></div>;

  const saveCredentials = async () => {
    setSavingCreds(true); setCredsMsg('');
    const result = await updateCustomer(id, { app_username: appCreds.app_username.trim().toLowerCase(), app_password: appCreds.app_password });
    setCredsMsg(result?.error ? '❌ ' + (result.error.message || 'Failed') : '✅ Saved');
    setSavingCreds(false);
  };

  const custAccounts = accounts.filter(a => a.customerId === id);
  const custLoans = loans.filter(l => l.customerId === id);
  const custAgreements = hpAgreements.filter(a => a.customerId === id).map(a => ({
    ...a,
    item: hpItems.find(i => i.id === a.itemId),
    loan: loans.find(l => l.id === a.loanId),
    payments: hpPayments.filter(p => p.agreementId === a.id),
    progress: a.totalPrice > 0 ? Math.min(100, ((a.totalPaid || 0) / a.totalPrice) * 100) : 0,
  }));
  const custTxns = transactions
    .filter(t => custAccounts.some(a => a.id === t.accountId) || (t.customerId && t.customerId === id))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 20);

  const age = customer.dob ? Math.floor((Date.now() - new Date(customer.dob)) / (365.25 * 86400000)) : null;
  // Standalone loans (not linked to HP)
  const standaloneLoan = custLoans.filter(l => !l.hpAgreementId);

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/customers')} style={{ marginBottom: 4 }}>
            <ArrowLeft size={14} /> Back
          </button>
          <div className="page-title">{customer.name}</div>
          <div className="page-desc">Customer ID: {customer.id}</div>
        </div>
        <Badge status={customer.kycStatus} />
      </div>

      <div className="grid-2 mb-6">
        {/* Profile */}
        <div className="card">
          <div className="card-header"><div className="card-title">Profile</div></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { icon: Phone, label: 'Phone', value: customer.phone },
              { icon: Mail, label: 'Email', value: customer.email || '—' },
              { icon: MapPin, label: 'Address', value: customer.address || '—' },
              { icon: Briefcase, label: 'Occupation', value: customer.occupation ? `${customer.occupation} @ ${customer.employer || '—'}` : '—' },
              { icon: CreditCard, label: 'Ghana Card', value: customer.ghanaCard || '—' },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <Icon size={15} style={{ color: 'var(--text-3)', marginTop: 1, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{value}</div>
                </div>
              </div>
            ))}
            {age && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Age: {age} years</div>}
            {customer.monthlyIncome && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Monthly Income: {GHS(customer.monthlyIncome)}</div>}
          </div>
        </div>

        {/* Accounts */}
        <div className="card">
          <div className="card-header"><div className="card-title">Accounts ({custAccounts.length})</div></div>
          {custAccounts.length === 0 ? <div className="table-empty">No accounts</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {custAccounts.map(a => (
                <div key={a.id} style={{ padding: 14, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>{a.type?.replace('_', ' ')}</div>
                      <div style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700, marginTop: 2 }}>{a.accountNumber}</div>
                    </div>
                    <Badge status={a.status} />
                  </div>
                  <div style={{ marginTop: 10, fontSize: 20, fontWeight: 800, color: a.balance >= 0 ? 'var(--text)' : 'var(--red)' }}>{GHS(a.balance)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Interest: {a.interestRate}% p.a. · Opened {a.openedAt ? new Date(a.openedAt).toLocaleDateString() : '—'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* App Credentials */}
      <div className="card mb-6">
        <div className="card-header">
          <div className="card-title"><Smartphone size={15} style={{ marginRight: 6 }} />Customer App Login</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
            <label className="form-label">App Username</label>
            <input className="form-control" value={appCreds.app_username}
              onChange={e => setAppCreds(p => ({ ...p, app_username: e.target.value }))}
              placeholder="e.g. kwame.mensah" autoCapitalize="none" />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
            <label className="form-label">App Password</label>
            <input className="form-control" value={appCreds.app_password}
              onChange={e => setAppCreds(p => ({ ...p, app_password: e.target.value }))}
              placeholder="Set a password" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 2 }}>
            <button className="btn btn-primary btn-sm" onClick={saveCredentials} disabled={savingCreds}>
              {savingCreds ? 'Saving…' : 'Save Credentials'}
            </button>
            {credsMsg && <span style={{ fontSize: 13, color: credsMsg.startsWith('✅') ? 'var(--green)' : 'var(--red)' }}>{credsMsg}</span>}
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10 }}>
          The customer uses these credentials to sign in to the mobile app.
        </div>
      </div>

      {/* Standalone Loans */}      {standaloneLoan.length > 0 && (
        <div className="card mb-6">
          <div className="card-header"><div className="card-title">Loans ({standaloneLoan.length})</div></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Type</th><th>Amount</th><th>Outstanding</th><th>Rate</th><th>Tenure</th><th>Status</th><th>Next Due</th></tr></thead>
              <tbody>
                {standaloneLoan.map(l => (
                  <tr key={l.id}>
                    <td style={{ textTransform: 'capitalize' }}>{l.type?.replace('_', ' ')}</td>
                    <td>{GHS(l.amount)}</td>
                    <td style={{ fontWeight: 700 }}>{GHS(l.outstanding)}</td>
                    <td>{l.interestRate}%</td>
                    <td>{l.tenure} months</td>
                    <td><Badge status={l.status} /></td>
                    <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{l.nextDueDate ? new Date(l.nextDueDate).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* HP Agreements */}
      {custAgreements.length > 0 && (
        <div className="card mb-6">
          <div className="card-header">
            <div className="card-title">Hire Purchase Agreements ({custAgreements.length})</div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/hp/agreements')}><ShoppingBag size={13} />View All</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {custAgreements.map(a => (
              <div key={a.id} style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 10, background: a.status === 'completed' ? '#f0fdf4' : 'var(--surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 24 }}>{a.item?.image || '📦'}</span>
                    <div>
                      <div style={{ fontWeight: 700 }}>{a.item?.name || a.itemName}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{a.paymentFrequency} payments · {a.payments.length} made</div>
                    </div>
                  </div>
                  <Badge status={a.status} />
                </div>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-3)' }}>Paid: <strong style={{ color: 'var(--green)' }}>{GHS(a.totalPaid)}</strong></span>
                    <span style={{ color: 'var(--text-3)' }}>Remaining: <strong style={{ color: 'var(--red)' }}>{GHS(a.remaining)}</strong></span>
                    <strong>{a.progress.toFixed(0)}%</strong>
                  </div>
                  <div className="progress">
                    <div className="progress-bar" style={{ width: `${a.progress}%`, background: a.status === 'completed' ? 'var(--green)' : 'var(--brand)' }} />
                  </div>
                </div>
                {a.loan && (
                  <div style={{ fontSize: 12, color: '#1e40af', background: 'var(--blue-bg)', padding: '5px 10px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <CreditCard size={11} />
                    Linked loan · {GHS(a.loan.outstanding)} outstanding · <Badge status={a.loan.status} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      <div className="card">
        <div className="card-header"><div className="card-title">Recent Transactions</div></div>
        {custTxns.length === 0 ? <div className="table-empty">No transactions</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Narration</th><th>Type</th><th>Amount</th><th>Balance After</th><th>Reference</th></tr></thead>
              <tbody>
                {custTxns.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{new Date(t.createdAt).toLocaleString()}</td>
                    <td>{t.narration}</td>
                    <td><Badge status={t.type} /></td>
                    <td style={{ fontWeight: 700, color: t.type === 'credit' ? 'var(--green)' : 'var(--red)' }}>
                      {t.type === 'credit' ? '+' : '-'}{GHS(t.amount)}
                    </td>
                    <td>{GHS(t.balanceAfter)}</td>
                    <td style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-3)' }}>{t.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
