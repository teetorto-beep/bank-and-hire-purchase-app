// ─── Data Normalisation Utility ───────────────────────────────────────────────
// Supabase returns snake_case. Old localStorage code used camelCase.
// These helpers make every entity safe to use regardless of source.

export const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
};

export const fmtDateTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

export const GHS = (n) =>
  `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Field helpers ─────────────────────────────────────────────────────────────
const s = (obj, snake, camel) => obj?.[snake] ?? obj?.[camel];

// ── Entity normalisers ────────────────────────────────────────────────────────

export const normCustomer = (c) => !c ? null : {
  ...c,
  id: c.id,
  name: c.name || '—',
  email: c.email || '',
  phone: c.phone || '',
  ghanaCard: c.ghana_card || c.ghanaCard || '',
  dob: c.dob || '',
  address: c.address || '',
  occupation: c.occupation || '',
  employer: c.employer || '',
  monthlyIncome: Number(c.monthly_income ?? c.monthlyIncome ?? 0),
  kycStatus: c.kyc_status || c.kycStatus || 'pending',
  createdAt: c.created_at || c.createdAt || '',
};

export const normAccount = (a) => !a ? null : {
  ...a,
  id: a.id,
  customerId: a.customer_id || a.customerId || '',
  accountNumber: a.account_number || a.accountNumber || '',
  type: a.type || '',
  balance: Number(a.balance ?? 0),
  status: a.status || 'active',
  interestRate: Number(a.interest_rate ?? a.interestRate ?? 0),
  openedAt: a.opened_at || a.openedAt || '',
  openedBy: a.opened_by || a.openedBy || '',
  // Supabase join
  customer: normCustomer(a.customers || a.customer || null),
};

export const normTransaction = (t) => !t ? null : {
  ...t,
  id: t.id,
  accountId: t.account_id || t.accountId || '',
  type: t.type || '',
  amount: Number(t.amount ?? 0),
  narration: t.narration || '',
  reference: t.reference || '',
  balanceAfter: Number(t.balance_after ?? t.balanceAfter ?? 0),
  channel: t.channel || 'teller',
  createdBy: t.created_by || t.createdBy || '',
  posterName: t.poster_name || t.posterName || '—',
  approvedBy: t.approved_by || t.approvedBy || '',
  approverName: t.approver_name || t.approverName || '',
  reversed: t.reversed || false,
  reversalOf: t.reversal_of || t.reversalOf || null,
  createdAt: t.created_at || t.createdAt || '',
  status: t.status || 'completed',
  // Supabase join
  accountNumber: t.accounts?.account_number || t.accountNumber || '',
  customerName: t.accounts?.customers?.name || t.customerName || '—',
};

export const normLoan = (l) => !l ? null : {
  ...l,
  id: l.id,
  customerId: l.customer_id || l.customerId || '',
  accountId: l.account_id || l.accountId || '',
  type: l.type || '',
  amount: Number(l.amount ?? 0),
  outstanding: Number(l.outstanding ?? 0),
  interestRate: Number(l.interest_rate ?? l.interestRate ?? 0),
  tenure: Number(l.tenure ?? 0),
  monthlyPayment: Number(l.monthly_payment ?? l.monthlyPayment ?? 0),
  status: l.status || 'pending',
  purpose: l.purpose || '',
  hpAgreementId: l.hp_agreement_id || l.hpAgreementId || null,
  itemName: l.item_name || l.itemName || '',
  disbursedAt: l.disbursed_at || l.disbursedAt || null,
  nextDueDate: l.next_due_date || l.nextDueDate || null,
  lastPaymentDate: l.last_payment_date || l.lastPaymentDate || null,
  createdAt: l.created_at || l.createdAt || '',
  // Supabase joins
  customer: normCustomer(l.customers || l.customer || null),
  accountNumber: l.accounts?.account_number || l.accounts?.accountNumber || '',
};

export const normProduct = (p) => !p ? null : {
  ...p,
  id: p.id,
  name: p.name || '',
  category: p.category || '',
  description: p.description || '',
  interestRate: Number(p.interest_rate ?? p.interestRate ?? 0),
  minBalance: Number(p.min_balance ?? p.minBalance ?? 0),
  maxBalance: p.max_balance ?? p.maxBalance ?? null,
  monthlyFee: Number(p.monthly_fee ?? p.monthlyFee ?? 0),
  tenureMonths: p.tenure_months ?? p.tenureMonths ?? null,
  benefits: p.benefits || [],
  status: p.status || 'active',
  createdAt: p.created_at || p.createdAt || '',
};

export const normHPItem = (i) => !i ? null : {
  ...i,
  id: i.id,
  name: i.name || '',
  category: i.category || '',
  description: i.description || '',
  price: Number(i.price ?? 0),
  stock: Number(i.stock ?? 0),
  image: i.image || '📦',
  dailyPayment: Number(i.daily_payment ?? i.dailyPayment ?? 0),
  weeklyPayment: Number(i.weekly_payment ?? i.weeklyPayment ?? 0),
  status: i.status || 'available',
  createdAt: i.created_at || i.createdAt || '',
};

export const normHPAgreement = (a) => !a ? null : {
  ...a,
  id: a.id,
  customerId: a.customer_id || a.customerId || '',
  itemId: a.item_id || a.itemId || '',
  itemName: a.item_name || a.itemName || '',
  loanId: a.loan_id || a.loanId || null,
  totalPrice: Number(a.total_price ?? a.totalPrice ?? 0),
  downPayment: Number(a.down_payment ?? a.downPayment ?? 0),
  totalPaid: Number(a.total_paid ?? a.totalPaid ?? 0),
  remaining: Number(a.remaining ?? 0),
  paymentFrequency: a.payment_frequency || a.paymentFrequency || 'monthly',
  suggestedPayment: Number(a.suggested_payment ?? a.suggestedPayment ?? 0),
  notes: a.notes || '',
  status: a.status || 'active',
  lastPaymentDate: a.last_payment_date || a.lastPaymentDate || null,
  createdAt: a.created_at || a.createdAt || '',
  // Supabase joins
  customer: normCustomer(a.customers || a.customer || null),
  item: normHPItem(a.hp_items || a.item || null),
};

export const normHPPayment = (p) => !p ? null : {
  ...p,
  id: p.id,
  agreementId: p.agreement_id || p.agreementId || '',
  amount: Number(p.amount ?? 0),
  remaining: Number(p.remaining ?? 0),
  note: p.note || '',
  collectedBy: p.collected_by || p.collectedBy || '—',
  createdAt: p.created_at || p.createdAt || '',
};

export const normCollector = (c) => !c ? null : {
  ...c,
  id: c.id,
  name: c.name || '',
  phone: c.phone || '',
  zone: c.zone || '',
  status: c.status || 'active',
  totalCollected: Number(c.total_collected ?? c.totalCollected ?? 0),
  assignedCustomers: c.assigned_customers || c.assignedCustomers ||
    (c.collector_assignments || []).map(a => a.customer_id) || [],
  createdAt: c.created_at || c.createdAt || '',
};

export const normCollection = (c) => !c ? null : {
  ...c,
  id: c.id,
  collectorId: c.collector_id || c.collectorId || '',
  collectorName: c.collector_name || c.collectorName || '—',
  customerId: c.customer_id || c.customerId || '',
  customerName: c.customer_name || c.customerName || '—',
  accountId: c.account_id || c.accountId || '',
  amount: Number(c.amount ?? 0),
  notes: c.notes || '',
  status: c.status || 'completed',
  createdAt: c.created_at || c.createdAt || '',
};

export const normPendingTxn = (p) => !p ? null : {
  ...p,
  id: p.id,
  accountId: p.account_id || p.accountId || '',
  type: p.type || '',
  amount: Number(p.amount ?? 0),
  narration: p.narration || '',
  channel: p.channel || 'teller',
  submittedBy: p.submitted_by || p.submittedBy || '',
  submitterName: p.submitter_name || p.submitterName || '—',
  submittedAt: p.submitted_at || p.submittedAt || '',
  status: p.status || 'pending',
  approvedBy: p.approved_by || p.approvedBy || '',
  approverName: p.approver_name || p.approverName || '',
  approvedAt: p.approved_at || p.approvedAt || null,
  rejectedBy: p.rejected_by || p.rejectedBy || '',
  rejectorName: p.rejector_name || p.rejectorName || '',
  rejectedAt: p.rejected_at || p.rejectedAt || null,
  rejectReason: p.reject_reason || p.rejectReason || '',
  // Supabase join
  accountNumber: p.accounts?.account_number || '',
  customerName: p.accounts?.customers?.name || '',
};

export const normPendingApproval = (p) => !p ? null : {
  ...p,
  id: p.id,
  type: p.type || '',
  payload: p.payload || {},
  submittedBy: p.submitted_by || p.submittedBy || '',
  submitterName: p.submitter_name || p.submitterName || '—',
  submittedAt: p.submitted_at || p.submittedAt || '',
  status: p.status || 'pending',
  approvedBy: p.approved_by || p.approvedBy || '',
  approverName: p.approver_name || p.approverName || '',
  approvedAt: p.approved_at || p.approvedAt || null,
  rejectedBy: p.rejected_by || p.rejectedBy || '',
  rejectorName: p.rejector_name || p.rejectorName || '',
  rejectedAt: p.rejected_at || p.rejectedAt || null,
  rejectReason: p.reject_reason || p.rejectReason || '',
};

export const normUser = (u) => !u ? null : {
  ...u,
  id: u.id,
  name: u.name || '',
  email: u.email || '',
  phone: u.phone || '',
  role: u.role || 'teller',
  status: u.status || 'active',
  createdAt: u.created_at || u.createdAt || '',
};
