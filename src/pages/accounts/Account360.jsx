import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { Search, Plus, CreditCard, ArrowRightLeft, AlertTriangle, ShoppingBag } from 'lucide-react';
import { authDB } from '../../core/db';
import { accountTypeLabel } from '../../core/normalize';

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

  // ── Offset modal state ────────────────────────────────────────────────────
  const [offsetModal, setOffsetModal] = useState(null); // { account, loan }
  const [offsetAmt, setOffsetAmt] = useState('');
  const [offsetSaving, setOffsetSaving] = useState(false);

  const openOffsetModal = (account, loan) => {
    setOffsetAmt(String(Math.min(Number(account.balance), Number(loan.outstanding))));
    setOffsetModal({ account, loan });
    setOffsetMsg('');
  };

  const doOffset = async () => {
    if (!offsetModal) return;
    const { account, loan } = offsetModal;
    const amt = parseFloat(offsetAmt) || 0;
    const balance = Number(account.balance || 0);
    const outstanding = Number(loan.outstanding || 0);
    if (amt <= 0) { setOffsetMsg('Enter a valid amount.'); return; }
    if (amt > balance) { setOffsetMsg(`Cannot exceed account balance of ${GHS(balance)}.`); return; }
    if (amt > outstanding) { setOffsetMsg(`Cannot exceed loan outstanding of ${GHS(outstanding)}.`); return; }

    setOffsetSaving(true); setOffsetMsg('');
    try {
      const { error } = await postTransaction({
        accountId: account.id,
        account_id: account.id,
        type: 'debit',
        amount: amt,
        narration: `Savings offset — ${loan.type?.replace(/_/g,' ')} loan repayment`,
        channel: 'teller',
        loan_id: loan.id,
      });
      if (error) { setOffsetMsg('Error: ' + error.message); }
      else {
        setOffsetModal(null);
        setOffsetAmt('');
        setOffsetMsg(`✅ ${GHS(amt)} applied. Loan outstanding reduced to ${GHS(Math.max(0, outstanding - amt))}.`);
        await doSearchFresh();
      }
    } catch (e) { setOffsetMsg('Error: ' + e.message); }
    setOffsetSaving(false);
  };

  const doSearch = () => {
    setSearched(true);
    doSearchFresh();
  };
  const doSearchFresh = async () => {
    const q = search.trim().toLowerCase();
    if (!q) return;
    const { supabase: sb } = await import('../../core/supabase');

    // Find account
    let accData = null;
    const { data: byNum } = await sb.from('accounts')
      .select('*, customers(*)')
      .ilike('account_number', `%${q}%`).limit(1);
    if (byNum?.length) { accData = byNum[0]; }

    if (!accData) {
      const { data: custs } = await sb.from('customers')
        .select('id').or(`phone.eq.${q},name.ilike.%${q}%,ghana_card.eq.${q}`).limit(1);
      if (custs?.length) {
        const { data: accs } = await sb.from('accounts')
          .select('*, customers(*)').eq('customer_id', custs[0].id).limit(1);
        if (accs?.length) accData = accs[0];
      }
    }
    if (!accData) { setResult(null); return; }

    const custId = accData.customer_id;
    const [accsRes, loansRes, txnsRes, hpRes] = await Promise.all([
      sb.from('accounts').select('*, customers(*)').eq('customer_id', custId),
      sb.from('loans').select('*').eq('customer_id', custId).order('created_at', { ascending: false }),
      sb.from('transactions').select('*, accounts(account_number)').in('account_id',
        (await sb.from('accounts').select('id').eq('customer_id', custId)).data?.map(a => a.id) || []
      ).order('created_at', { ascending: false }).limit(20),
      sb.from('hp_agreements').select('*').eq('customer_id', custId),
    ]);

    const allCustAccounts = (accsRes.data || []).map(a => ({
      ...a,
      id: a.id, balance: Number(a.balance || 0),
      accountNumber: a.account_number, type: a.type, status: a.status,
      interestRate: a.interest_rate, customerId: a.customer_id,
    }));
    const custLoans = (loansRes.data || []).map(l => ({
      ...l,
      id: l.id, outstanding: Number(l.outstanding || 0),
      type: l.type, status: l.status,
      monthlyPayment: Number(l.monthly_payment || 0),
      interestRate: l.interest_rate,
      accountId: l.account_id, customerId: l.customer_id,
      itemName: l.item_name,
    }));
    // Build transactions with recomputed running balance
    const rawTxns = (txnsRes.data || []).map(t => ({
      ...t, id: t.id, amount: Number(t.amount || 0),
      type: t.type, narration: t.narration,
      createdAt: t.created_at, balanceAfter: Number(t.balance_after || 0),
      posterName: t.poster_name, accountId: t.account_id,
    }));
    const isLoanT = (t) => !!(t.loan_id) || !!(t.hp_agreement_id) || (t.type === 'debit' && t.channel === 'collection');
    const accBal = Number(accData.balance || 0);
    const sortedAsc = [...rawTxns].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    let runBal = accBal;
    const balMap = {};
    for (const t of [...sortedAsc].reverse()) {
      balMap[t.id] = runBal;
      if (!isLoanT(t)) { if (t.type === 'credit') runBal -= t.amount; else runBal += t.amount; }
    }
    const custTxns = rawTxns.map(t => ({ ...t, computedBalance: isLoanT(t) ? null : balMap[t.id] }));
    const custAgreements = (hpRes.data || []).map(a => ({
      ...a,
      id: a.id, totalPaid: Number(a.total_paid || 0),
      totalPrice: Number(a.total_price || 0),
      remaining: Number(a.remaining || 0),
      status: a.status, paymentFrequency: a.payment_frequency,
      itemName: a.item_name,
      progress: a.total_price > 0 ? Math.min(100, ((a.total_paid || 0) / a.total_price) * 100) : 0,
    }));

    const customer = accData.customers || {};
    const normCust = {
      ...customer,
      name: customer.name, phone: customer.phone, email: customer.email,
      kycStatus: customer.kyc_status, ghanaCard: customer.ghana_card,
      monthlyIncome: customer.monthly_income, address: customer.address,
    };

    setResult({
      acc: allCustAccounts.find(a => a.id === accData.id) || allCustAccounts[0],
      customer: normCust,
      allCustAccounts,
      custTxns,
      custLoans,
      custAgreements,
      custRules: result?.custRules || [],
    });
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {result.allCustAccounts.map(a => {
                // All active/overdue loans for this customer (any account)
                const allActiveLoans = result.custLoans.filter(l =>
                  l.status === 'active' || l.status === 'overdue'
                );
                // Loans directly linked to THIS account
                const linkedLoans = allActiveLoans.filter(l => l.accountId === a.id);
                const loanOutstanding = linkedLoans.reduce((s, l) => s + Number(l.outstanding || 0), 0);
                const netPosition = Number(a.balance) - loanOutstanding;
                const hasLinkedLoan = linkedLoans.length > 0;
                // Can offset if account has balance AND there are any active loans customer-wide
                const canOffset = Number(a.balance) > 0 && allActiveLoans.length > 0;

                return (
                <div key={a.id} style={{ padding: 16, border: `2px solid ${a.id === result.acc.id ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 10, background: a.id === result.acc.id ? 'var(--brand-light)' : 'var(--surface)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)' }}>{accountTypeLabel(a, accounts)}</span>
                    <Badge status={a.status} />
                  </div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14 }}>{a.accountNumber}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8, color: a.balance < 0 ? 'var(--red)' : 'var(--text)' }}>{GHS(a.balance)}</div>

                  {hasLinkedLoan && (
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
                    </>
                  )}

                  {/* ── Use this account's balance to offset ANY customer loan ── */}
                  {canOffset && (
                    <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, marginBottom: 6 }}>
                        💰 Use balance to offset debt:
                      </div>
                      {allActiveLoans.map(loan => (
                        <button
                          key={loan.id}
                          className="btn btn-sm"
                          style={{
                            width: '100%', marginBottom: 4, fontSize: 11,
                            background: loan.accountId === a.id ? 'var(--brand)' : 'var(--surface-2)',
                            color: loan.accountId === a.id ? '#fff' : 'var(--text)',
                            border: `1px solid ${loan.accountId === a.id ? 'var(--brand)' : 'var(--border)'}`,
                            borderRadius: 6, padding: '5px 8px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 6,
                          }}
                          onClick={() => openOffsetModal(a, loan)}
                        >
                          <ArrowRightLeft size={11} />
                          <span style={{ flex: 1, textAlign: 'left' }}>
                            {loan.type?.replace(/_/g, ' ')} {loan.itemName ? `(${loan.itemName})` : ''}
                          </span>
                          <span style={{ fontWeight: 700, color: loan.accountId === a.id ? '#fff' : 'var(--red)' }}>
                            {GHS(loan.outstanding)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>{a.interestRate}% p.a.</div>
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
                        <td>{t.computedBalance !== null && t.computedBalance !== undefined ? GHS(t.computedBalance) : '—'}</td>
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

      {/* ── Savings Offset Modal ────────────────────────────────────────── */}
      {offsetModal && (
        <Modal
          open={!!offsetModal}
          onClose={() => { setOffsetModal(null); setOffsetAmt(''); setOffsetMsg(''); }}
          title="Use Savings to Offset Debt"
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => { setOffsetModal(null); setOffsetAmt(''); setOffsetMsg(''); }}>Cancel</button>
              <button className="btn btn-primary" onClick={doOffset} disabled={offsetSaving}>
                {offsetSaving ? 'Applying…' : 'Confirm Offset'}
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* From account */}
            <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>From Account (Savings)</div>
              <div style={{ fontFamily: 'monospace', fontWeight: 700 }}>{offsetModal.account.accountNumber}</div>
              <div style={{ fontSize: 13, marginTop: 2 }}>Available balance: <strong style={{ color: 'var(--green)' }}>{GHS(offsetModal.account.balance)}</strong></div>
            </div>
            {/* To loan */}
            <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>To Loan</div>
              <div style={{ fontWeight: 700, textTransform: 'capitalize' }}>{offsetModal.loan.type?.replace(/_/g, ' ')}</div>
              <div style={{ fontSize: 13, marginTop: 2 }}>Outstanding: <strong style={{ color: 'var(--red)' }}>{GHS(offsetModal.loan.outstanding)}</strong></div>
            </div>
            {/* Amount input */}
            <div>
              <label className="form-label">Amount to Apply (GH₵)</label>
              <input
                className="form-control"
                type="number"
                min="1"
                step="0.01"
                max={Math.min(Number(offsetModal.account.balance), Number(offsetModal.loan.outstanding))}
                value={offsetAmt}
                onChange={e => setOffsetAmt(e.target.value)}
                style={{ fontSize: 20, fontWeight: 700, textAlign: 'center' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn btn-secondary btn-sm" style={{ flex: 1 }}
                  onClick={() => setOffsetAmt(String(Number(offsetModal.loan.outstanding)))}>
                  Full Loan ({GHS(offsetModal.loan.outstanding)})
                </button>
                <button className="btn btn-secondary btn-sm" style={{ flex: 1 }}
                  onClick={() => setOffsetAmt(String(Math.min(Number(offsetModal.account.balance), Number(offsetModal.loan.outstanding))))}>
                  Max Available
                </button>
              </div>
            </div>
            {/* Preview */}
            {parseFloat(offsetAmt) > 0 && (
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 12, color: '#1e40af', fontWeight: 700, marginBottom: 6 }}>After offset:</div>
                <div style={{ fontSize: 13 }}>Savings balance: <strong>{GHS(Number(offsetModal.account.balance) - parseFloat(offsetAmt))}</strong></div>
                <div style={{ fontSize: 13, marginTop: 2 }}>Loan outstanding: <strong>{GHS(Math.max(0, Number(offsetModal.loan.outstanding) - parseFloat(offsetAmt)))}</strong></div>
              </div>
            )}
            {offsetMsg && (
              <div className="alert alert-error" style={{ marginTop: 4 }}>{offsetMsg}</div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
