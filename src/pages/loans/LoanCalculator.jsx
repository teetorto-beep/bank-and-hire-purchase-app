import React, { useState, useMemo } from 'react';
import { Calculator } from 'lucide-react';

const GHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

function calcMonthly(p, r, n) {
  const mr = r / 100 / 12;
  if (mr === 0) return p / n;
  return (p * mr * Math.pow(1 + mr, n)) / (Math.pow(1 + mr, n) - 1);
}

export default function LoanCalculator() {
  const [form, setForm] = useState({ amount: '10000', rate: '22', tenure: '24' });
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const p = parseFloat(form.amount) || 0;
  const r = parseFloat(form.rate) || 0;
  const n = parseInt(form.tenure) || 0;
  const monthly = p && r && n ? calcMonthly(p, r, n) : 0;
  const total = monthly * n;
  const interest = total - p;

  const schedule = useMemo(() => {
    if (!p || !r || !n) return [];
    const mr = r / 100 / 12;
    let balance = p;
    return Array.from({ length: Math.min(n, 60) }, (_, i) => {
      const intPart = balance * mr;
      const prinPart = monthly - intPart;
      balance -= prinPart;
      return { month: i + 1, payment: monthly, principal: prinPart, interest: intPart, balance: Math.max(0, balance) };
    });
  }, [p, r, n, monthly]);

  return (
    <div className="fade-in" style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Loan Calculator</div>
          <div className="page-desc">Calculate repayment schedules</div>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header"><div className="card-title">Parameters</div></div>
            <div className="form-group">
              <label className="form-label">Loan Amount (GH₵)</label>
              <input className="form-control" type="number" value={form.amount} onChange={f('amount')} />
            </div>
            <div className="form-group">
              <label className="form-label">Annual Interest Rate (%)</label>
              <input className="form-control" type="number" step="0.1" value={form.rate} onChange={f('rate')} />
            </div>
            <div className="form-group">
              <label className="form-label">Tenure (months)</label>
              <input className="form-control" type="number" value={form.tenure} onChange={f('tenure')} />
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div className="card-title">Summary</div></div>
            {[
              ['Principal', GHS(p), 'var(--text)'],
              ['Monthly Payment', monthly > 0 ? GHS(monthly) : '—', 'var(--brand)'],
              ['Total Interest', interest > 0 ? GHS(interest) : '—', 'var(--red)'],
              ['Total Repayment', total > 0 ? GHS(total) : '—', 'var(--text)'],
              ['Interest / Principal', p > 0 ? `${((interest / p) * 100).toFixed(1)}%` : '—', 'var(--text-3)'],
            ].map(([k, v, c]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{k}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: c }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Amortization Schedule</div><span style={{ fontSize: 12, color: 'var(--text-3)' }}>{schedule.length > 0 && n > 60 ? 'First 60 months' : ''}</span></div>
          {schedule.length === 0 ? (
            <div className="flex-center" style={{ height: 200, color: 'var(--text-3)', flexDirection: 'column', gap: 8 }}>
              <Calculator size={32} style={{ opacity: .3 }} />
              <span style={{ fontSize: 13 }}>Enter values to see schedule</span>
            </div>
          ) : (
            <div style={{ maxHeight: 480, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)' }}>
                  <tr>
                    {['Month', 'Payment', 'Principal', 'Interest', 'Balance'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schedule.map(row => (
                    <tr key={row.month} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '7px 10px', fontSize: 12, textAlign: 'right', fontWeight: 600 }}>{row.month}</td>
                      <td style={{ padding: '7px 10px', fontSize: 12, textAlign: 'right' }}>{GHS(row.payment)}</td>
                      <td style={{ padding: '7px 10px', fontSize: 12, textAlign: 'right', color: 'var(--green)' }}>{GHS(row.principal)}</td>
                      <td style={{ padding: '7px 10px', fontSize: 12, textAlign: 'right', color: 'var(--red)' }}>{GHS(row.interest)}</td>
                      <td style={{ padding: '7px 10px', fontSize: 12, textAlign: 'right', fontWeight: 600 }}>{GHS(row.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
