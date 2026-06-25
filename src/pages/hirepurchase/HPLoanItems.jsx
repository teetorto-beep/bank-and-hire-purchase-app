import React, { useState, useMemo, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../core/supabase';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import { Search, Plus, X, ShoppingBag, Package, AlertTriangle, Download, FileText, CheckCircle } from 'lucide-react';
import { authDB } from '../../core/db';
import { exportCSV } from '../../core/export';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const GHS = (n) => 'GH₵ ' + Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 });
// PDF-safe version (jsPDF default fonts can't render GH₵)
const GHSC = (n) => 'GHS ' + Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 });
// No hard limit on items per loan

export default function HPLoanItems() {
  const { loans, customers, accounts, hpItems, updateLoan, updateHPItem } = useApp();
  const user = authDB.currentUser();

  const [selectedLoan, setSelectedLoan] = useState(null);
  const [loanItems, setLoanItems]       = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loanSearch, setLoanSearch]     = useState('');
  const [itemSearch, setItemSearch]     = useState('');
  const [catFilter, setCatFilter]       = useState('All');
  const [addingItem, setAddingItem]     = useState(false);
  const [completing, setCompleting]     = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [msg, setMsg]       = useState('');
  const [msgType, setMsgType] = useState('success');

  const showMsg = (text, type = 'success') => {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(''), 4000);
  };

  // Only HP loans that are active or pending
  const hpLoans = useMemo(() =>
    loans
      .filter(l => (l.type === 'hire_purchase' || l.type === 'hp') && ['active', 'pending'].includes(l.status))
      .map(l => {
        const cust = customers.find(c => c.id === (l.customerId || l.customer_id)) || l.customer || null;
        const acct = accounts.find(a => a.id === (l.accountId  || l.account_id))  || null;
        return { ...l, _customer: cust, _account: acct };
      }),
    [loans, customers, accounts]
  );

  const filteredLoans = useMemo(() => {
    if (!loanSearch.trim()) return hpLoans;
    const q = loanSearch.toLowerCase();
    return hpLoans.filter(l =>
      l._customer?.name?.toLowerCase().includes(q) ||
      (l._account?.account_number || l._account?.accountNumber || '').includes(q)
    );
  }, [hpLoans, loanSearch]);

  const loadLoanItems = useCallback(async (loan) => {
    setSelectedLoan(loan);
    setLoadingItems(true);
    const { data } = await supabase
      .from('hp_loan_items')
      .select('*, hp_items(name, image, category, stock, price)')
      .eq('loan_id', loan.id)
      .order('added_at', { ascending: true });
    setLoanItems(data || []);
    setLoadingItems(false);
  }, []);

  const itemsTotal = useMemo(
    () => loanItems.reduce((s, i) => s + Number(i.total_price ?? (i.unit_price * i.quantity) ?? 0), 0),
    [loanItems]
  );

  const categories = useMemo(() => {
    const cats = [...new Set(hpItems.map(i => i.category).filter(Boolean))];
    return ['All', ...cats];
  }, [hpItems]);

  const availableItems = useMemo(() => {
    const assigned = new Set(loanItems.map(i => i.item_id));
    let items = hpItems.filter(i => !assigned.has(i.id));
    if (catFilter !== 'All') items = items.filter(i => i.category === catFilter);
    if (itemSearch.trim()) {
      const q = itemSearch.toLowerCase();
      items = items.filter(i => i.name?.toLowerCase().includes(q) || i.category?.toLowerCase().includes(q));
    }
    return items;
  }, [hpItems, loanItems, catFilter, itemSearch]);

  const addItem = async (item) => {
    // No item limit
    setAddingItem(true);
    const { data, error } = await supabase
      .from('hp_loan_items')
      .insert({
        loan_id:    selectedLoan.id,
        item_id:    item.id,
        quantity:   1,
        unit_price: item.price,
        item_name:  item.name,
        item_image: item.image || '',
        added_by:   user?.name || 'Admin',
      })
      .select('*, hp_items(name, image, category, stock, price)')
      .single();
    if (error) showMsg(error.message, 'error');
    else { setLoanItems(p => [...p, data]); showMsg(item.name + ' added to loan.'); }
    setAddingItem(false);
  };

  const removeItem = async (id) => {
    await supabase.from('hp_loan_items').delete().eq('id', id);
    setLoanItems(p => p.filter(i => i.id !== id));
    showMsg('Item removed.');
  };

  const updateQty = async (id, qty) => {
    const q = Math.max(1, parseInt(qty) || 1);
    await supabase.from('hp_loan_items').update({ quantity: q }).eq('id', id);
    setLoanItems(p => p.map(i => i.id === id ? { ...i, quantity: q } : i));
  };

  // Complete: deduct stock for every assigned item, mark loan completed
  const completeLoan = async () => {
    setCompleting(true);
    try {
      for (const li of loanItems) {
        const item = hpItems.find(i => i.id === li.item_id);
        if (item) {
          const newStock = Math.max(0, (item.stock ?? 0) - (li.quantity ?? 1));
          await updateHPItem(item.id, { stock: newStock });
        }
      }
      await updateLoan(selectedLoan.id, { status: 'completed', outstanding: 0 });
      showMsg('Loan completed! Stock deducted for all assigned items.');
      setConfirmComplete(false);
      setSelectedLoan(p => ({ ...p, status: 'completed', outstanding: 0 }));
    } catch (e) {
      showMsg('Error: ' + e.message, 'error');
    }
    setCompleting(false);
  };

  const exportPDF = () => {
    if (!selectedLoan || loanItems.length === 0) return;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFillColor(26, 86, 219);
    doc.rect(0, 0, 297, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text('Majupat Love Enterprise - HP Loan Items Report', 10, 12);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text('Generated: ' + new Date().toLocaleString(), 287, 12, { align: 'right' });
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text('Customer: ' + (selectedLoan._customer?.name || '-') + '  |  Loan: ...' + (selectedLoan.id?.slice(-8) || '') + '  |  Status: ' + selectedLoan.status, 10, 28);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
    doc.text('Items: ' + loanItems.length + '  |  Items Total: ' + GHSC(itemsTotal) + '  |  Outstanding: ' + GHSC(selectedLoan.outstanding), 10, 34);
    autoTable(doc, {
      startY: 40,
      head: [['#', 'Item', 'Category', 'Unit Price', 'Qty', 'Total']],
      body: loanItems.map((li, i) => [
        i + 1,
        li.item_name || li.hp_items?.name || '-',
        li.hp_items?.category || '-',
        GHSC(li.unit_price),
        li.quantity,
        GHSC(li.total_price ?? (li.unit_price * li.quantity)),
      ]),
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [26, 86, 219], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    const fy = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
    doc.text('Items Total: ' + GHSC(itemsTotal), 10, fy);
    doc.save('hp-loan-items-' + (selectedLoan.id?.slice(-8) || 'loan') + '-' + new Date().toISOString().slice(0, 10) + '.pdf');
  };

  const doExportCSV = () => {
    if (!selectedLoan || loanItems.length === 0) return;
    exportCSV(
      loanItems.map((li, i) => ({
        '#':           i + 1,
        'Item':        li.item_name || li.hp_items?.name || '-',
        'Category':    li.hp_items?.category || '-',
        'Unit Price':  li.unit_price,
        'Quantity':    li.quantity,
        'Total':       li.total_price ?? (li.unit_price * li.quantity),
        'Added At':    li.added_at ? new Date(li.added_at).toLocaleString() : '-',
        'Added By':    li.added_by || '-',
      })),
      'hp-loan-items-' + (selectedLoan.id?.slice(-8) || 'loan')
    );
  };

  const isCompleted = selectedLoan?.status === 'completed';

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">HP Loan Items</div>
          <div className="page-desc">
            Assign items to hire purchase loans — stock is deducted only when you complete the loan
          </div>
        </div>
      </div>

      {msg && (
        <div className={'alert alert-' + msgType} style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          {msgType === 'success' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
          {msg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>

        {/* ── LEFT: Loan list ── */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
              HP Loans ({hpLoans.length})
            </div>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
              <input className="form-control" placeholder="Search customer or account..."
                value={loanSearch} onChange={e => setLoanSearch(e.target.value)}
                style={{ paddingLeft: 30, fontSize: 13 }} />
            </div>
          </div>
          <div style={{ maxHeight: 540, overflowY: 'auto' }}>
            {filteredLoans.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                <ShoppingBag size={32} style={{ opacity: .2, display: 'block', margin: '0 auto 8px' }} />
                No active HP loans found
              </div>
            ) : filteredLoans.map(l => {
              const isSel = selectedLoan?.id === l.id;
              return (
                <div key={l.id} onClick={() => loadLoanItems(l)}
                  style={{
                    padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                    background: isSel ? 'var(--brand-light)' : 'var(--surface)',
                    borderLeft: isSel ? '3px solid var(--brand)' : '3px solid transparent',
                    transition: 'background .1s',
                  }}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--surface-2)'; }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'var(--surface)'; }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{l._customer?.name || '-'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                    {l._account?.account_number || l._account?.accountNumber || '-'} &middot; {GHS(l.outstanding)} outstanding
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 5, alignItems: 'center' }}>
                    <Badge status={l.status} />
                    <span style={{ fontSize: 10, color: 'var(--text-3)' }}>...{l.id?.slice(-6)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT: Items panel ── */}
        {!selectedLoan ? (
          <div className="card" style={{ textAlign: 'center', padding: 64 }}>
            <ShoppingBag size={52} style={{ color: 'var(--text-3)', opacity: .2, display: 'block', margin: '0 auto 16px' }} />
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Select a loan</div>
            <div style={{ color: 'var(--text-3)', fontSize: 13 }}>
              Choose an HP loan from the left panel to assign items
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Loan summary bar */}
            <div className="card" style={{ padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{selectedLoan._customer?.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                    Account: {selectedLoan._account?.account_number || selectedLoan._account?.accountNumber || '-'} &nbsp;&middot;&nbsp;
                    Loan ID: ...{selectedLoan.id?.slice(-8)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Badge status={selectedLoan.status} />
                  {loanItems.length > 0 && (
                    <>
                      <button className="btn btn-secondary btn-sm" onClick={doExportCSV}>
                        <Download size={13} /> CSV
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={exportPDF}>
                        <FileText size={13} /> PDF
                      </button>
                    </>
                  )}
                  {!isCompleted && loanItems.length > 0 && (
                    <button className="btn btn-success btn-sm" onClick={() => setConfirmComplete(true)}>
                      <CheckCircle size={13} /> Complete &amp; Deduct Stock
                    </button>
                  )}
                </div>
              </div>

              {/* KPI row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 14 }}>
                {[
                  ['Loan Amount',    GHS(selectedLoan.amount),      'var(--brand)'],
                  ['Outstanding',    GHS(selectedLoan.outstanding),  selectedLoan.outstanding > 0 ? 'var(--red)' : 'var(--green)'],
                  ['Items Assigned', loanItems.length, 'var(--purple)'],
                  ['Items Total',    GHS(itemsTotal),                'var(--green)'],
                ].map(([k, v, c]) => (
                  <div key={k} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px', borderTop: '3px solid ' + c }}>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{k}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: c }}>{v}</div>
                  </div>
                ))}
              </div>

              {isCompleted && (
                <div className="alert alert-success" style={{ marginTop: 12 }}>
                  <CheckCircle size={14} /> Loan completed. Stock has been deducted for all assigned items.
                </div>
              )}
            </div>

            {/* Assigned items table */}
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
                Assigned Items ({loanItems.length})
              </div>
              {loadingItems ? (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-3)' }}>Loading items...</div>
              ) : loanItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, background: 'var(--surface-2)', borderRadius: 10, color: 'var(--text-3)' }}>
                  <Package size={32} style={{ opacity: .2, display: 'block', margin: '0 auto 8px' }} />
                  <div style={{ fontWeight: 600 }}>No items assigned yet</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Add items from the catalogue below</div>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}>#</th>
                        <th>Item</th>
                        <th>Category</th>
                        <th style={{ textAlign: 'right' }}>Unit Price</th>
                        <th style={{ textAlign: 'center', width: 80 }}>Qty</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                        {!isCompleted && <th style={{ width: 40 }}></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {loanItems.map((li, i) => (
                        <tr key={li.id}>
                          <td style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>{i + 1}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 20 }}>{li.item_image || li.hp_items?.image || '📦'}</span>
                              <span style={{ fontWeight: 600, fontSize: 13 }}>{li.item_name || li.hp_items?.name}</span>
                            </div>
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{li.hp_items?.category || '-'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{GHS(li.unit_price)}</td>
                          <td style={{ textAlign: 'center' }}>
                            {isCompleted ? (
                              <span style={{ fontWeight: 700 }}>{li.quantity}</span>
                            ) : (
                              <input type="number" min="1" value={li.quantity}
                                onChange={e => updateQty(li.id, e.target.value)}
                                style={{ width: 60, textAlign: 'center', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontWeight: 700 }} />
                            )}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>
                            {GHS(li.total_price ?? (li.unit_price * li.quantity))}
                          </td>
                          {!isCompleted && (
                            <td>
                              <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--red)' }}
                                onClick={() => removeItem(li.id)} title="Remove item">
                                <X size={13} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                      {/* Total row */}
                      <tr style={{ background: 'var(--surface-2)' }}>
                        <td colSpan={5} style={{ textAlign: 'right', fontWeight: 800, fontSize: 13, paddingRight: 12 }}>TOTAL</td>
                        <td style={{ textAlign: 'right', fontWeight: 900, fontSize: 15, color: 'var(--green)' }}>{GHS(itemsTotal)}</td>
                        {!isCompleted && <td></td>}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Item catalogue */}
            {!isCompleted && (
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    Add Items from Catalogue
                    
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{availableItems.length} items available</span>
                </div>

                {/* Filters */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
                    <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
                    <input className="form-control" placeholder="Search items..."
                      value={itemSearch} onChange={e => setItemSearch(e.target.value)}
                      style={{ paddingLeft: 30, fontSize: 13 }} />
                  </div>
                  {categories.map(c => (
                    <button key={c} className={'btn btn-sm ' + (catFilter === c ? 'btn-primary' : 'btn-secondary')}
                      onClick={() => setCatFilter(c)} style={{ fontSize: 12 }}>{c}</button>
                  ))}
                </div>

                {availableItems.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-3)', fontSize: 13 }}>
                    No available items — all in-stock items are already assigned or none match your filter.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                    {availableItems.map(item => (
                      <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--surface)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 26 }}>{item.image || '📦'}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3 }}>{item.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{item.category}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--brand)' }}>{GHS(item.price)}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Stock: {item.stock}</div>
                          </div>
                          <button className="btn btn-primary btn-sm"
                            onClick={() => addItem(item)}
                            disabled={addingItem}>
                            <Plus size={12} /> Add
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Confirm Complete Modal ── */}
      <Modal open={confirmComplete} onClose={() => setConfirmComplete(false)}
        title="Complete Loan & Deduct Stock"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmComplete(false)}>Cancel</button>
            <button className="btn btn-success" onClick={completeLoan} disabled={completing}>
              {completing ? 'Completing...' : 'Yes, Complete & Deduct Stock'}
            </button>
          </>
        }>
        <div>
          <div className="alert alert-warning" style={{ marginBottom: 16 }}>
            <AlertTriangle size={14} />
            This will mark the loan as <strong>completed</strong> and permanently deduct stock for all {loanItems.length} assigned item(s). This cannot be undone.
          </div>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Stock changes:</div>
          <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            {loanItems.map((li, i) => {
              const item = hpItems.find(it => it.id === li.item_id);
              const before = item?.stock ?? 0;
              const after  = Math.max(0, before - (li.quantity ?? 1));
              return (
                <div key={li.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: i < loanItems.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
                  <span>{li.item_image || '📦'} {li.item_name} &times;{li.quantity}</span>
                  <span style={{ fontFamily: 'monospace', color: after === 0 ? 'var(--red)' : 'var(--text-2)' }}>
                    {before} &rarr; {after}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}>
            <span>Items Total</span>
            <span style={{ color: 'var(--green)' }}>{GHS(itemsTotal)}</span>
          </div>
        </div>
      </Modal>
    </div>
  );
}
