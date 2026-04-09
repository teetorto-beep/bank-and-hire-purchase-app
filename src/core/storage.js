// ─── Unified Storage Layer ────────────────────────────────────────────────────
const K = {
  USERS: 'bank_users',
  CUSTOMERS: 'bank_customers',
  ACCOUNTS: 'bank_accounts',
  TRANSACTIONS: 'bank_transactions',
  LOANS: 'bank_loans',
  COLLECTORS: 'bank_collectors',
  COLLECTIONS: 'bank_collections',
  CURRENT_USER: 'bank_current_user',
  PRODUCTS: 'bank_products',
  HP_ITEMS: 'bank_hp_items',
  HP_AGREEMENTS: 'bank_hp_agreements',
  HP_PAYMENTS: 'bank_hp_payments',
  PENDING_TXN: 'bank_pending_txn',   // authoriser queue
  AUDIT_LOG: 'bank_audit_log',       // full audit trail
  DEDUCTION_RULES: 'bank_deduction_rules', // auto-deduction config
};

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const now = () => new Date().toISOString();
const get = (key) => JSON.parse(localStorage.getItem(key) || '[]');
const set = (key, val) => localStorage.setItem(key, JSON.stringify(val));

const genAccountNumber = () => {
  const prefix = '1000';
  const rand = Math.floor(Math.random() * 9000000 + 1000000);
  return `${prefix}${rand}`;
};

export const db = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  init() {
    if (!localStorage.getItem(K.USERS)) {
      set(K.USERS, [
        { id: 'u1', name: 'Admin User', email: 'admin@bank.com', password: 'admin123', role: 'admin', createdAt: now() },
        { id: 'u2', name: 'Teller One', email: 'teller@bank.com', password: 'teller123', role: 'teller', createdAt: now() },
      ]);
    }
    if (!localStorage.getItem(K.CUSTOMERS)) {
      const customers = [
        { id: 'c1', name: 'Kwame Mensah', email: 'kwame@email.com', phone: '0551234567', ghanaCard: 'GHA-123456789-0', dob: '1990-05-15', address: 'Accra, Greater Accra', occupation: 'Teacher', employer: 'GES', monthlyIncome: 3500, kycStatus: 'verified', createdAt: now() },
        { id: 'c2', name: 'Abena Owusu', email: 'abena@email.com', phone: '0249876543', ghanaCard: 'GHA-987654321-0', dob: '1985-11-22', address: 'Kumasi, Ashanti', occupation: 'Nurse', employer: 'KATH', monthlyIncome: 4200, kycStatus: 'verified', createdAt: now() },
        { id: 'c3', name: 'Kofi Asante', email: 'kofi@email.com', phone: '0201122334', ghanaCard: 'GHA-112233445-0', dob: '1995-03-08', address: 'Takoradi, Western', occupation: 'Engineer', employer: 'TOR', monthlyIncome: 6000, kycStatus: 'pending', createdAt: now() },
      ];
      set(K.CUSTOMERS, customers);
      // Seed accounts
      const accounts = [
        { id: 'a1', customerId: 'c1', accountNumber: '10001234567', type: 'savings', balance: 4500.00, status: 'active', interestRate: 5.5, openedAt: now() },
        { id: 'a2', customerId: 'c1', accountNumber: '10007654321', type: 'current', balance: 12000.00, status: 'active', interestRate: 0, openedAt: now() },
        { id: 'a3', customerId: 'c2', accountNumber: '10009988776', type: 'savings', balance: 8750.50, status: 'active', interestRate: 5.5, openedAt: now() },
        { id: 'a4', customerId: 'c3', accountNumber: '10003344556', type: 'hire_purchase', balance: -2500.00, status: 'active', interestRate: 18, openedAt: now() },
      ];
      set(K.ACCOUNTS, accounts);
      // Seed transactions
      const txns = [];
      const types = ['credit', 'debit'];
      const narrations = ['Cash Deposit', 'Salary Credit', 'ATM Withdrawal', 'Transfer', 'Loan Repayment', 'Utility Payment'];
      for (let i = 0; i < 20; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        txns.push({
          id: uid(), accountId: ['a1','a2','a3','a4'][i % 4],
          type: types[i % 2], amount: Math.round((Math.random() * 2000 + 100) * 100) / 100,
          narration: narrations[i % narrations.length], reference: `REF${Date.now()}${i}`,
          balanceAfter: 4500 - i * 50, createdAt: d.toISOString(), createdBy: 'u1',
        });
      }
      set(K.TRANSACTIONS, txns);
      // Seed loans
      set(K.LOANS, [
        { id: 'l1', customerId: 'c1', accountId: 'a1', type: 'personal', amount: 10000, outstanding: 7500, interestRate: 22, tenure: 24, status: 'active', disbursedAt: now(), nextDueDate: new Date(Date.now() + 15 * 86400000).toISOString(), monthlyPayment: 520 },
        { id: 'l2', customerId: 'c2', accountId: 'a3', type: 'hire_purchase', amount: 5000, outstanding: 5000, interestRate: 18, tenure: 12, status: 'pending', disbursedAt: null, nextDueDate: null, monthlyPayment: 460 },
        { id: 'l3', customerId: 'c3', accountId: 'a4', type: 'micro', amount: 2500, outstanding: 2500, interestRate: 25, tenure: 6, status: 'overdue', disbursedAt: now(), nextDueDate: new Date(Date.now() - 5 * 86400000).toISOString(), monthlyPayment: 450 },
      ]);
      // Seed collectors
      set(K.COLLECTORS, [
        { id: 'col1', name: 'Ama Boateng', phone: '0551112233', zone: 'Accra Central', assignedCustomers: ['c1'], status: 'active', totalCollected: 15000, createdAt: now() },
        { id: 'col2', name: 'Yaw Darko', phone: '0249998877', zone: 'Kumasi', assignedCustomers: ['c2', 'c3'], status: 'active', totalCollected: 22000, createdAt: now() },
      ]);
      set(K.COLLECTIONS, []);
    }
    // Seed bank products
    if (!localStorage.getItem(K.PRODUCTS)) {
      set(K.PRODUCTS, [
        { id: 'prod1', name: 'Standard Savings', category: 'savings', interestRate: 5.5, minBalance: 50, maxBalance: null, monthlyFee: 0, tenureMonths: null, benefits: ['Free ATM withdrawals', 'Monthly interest credit', 'No minimum tenure'], status: 'active', createdAt: now() },
        { id: 'prod2', name: 'Premium Current', category: 'current', interestRate: 0, minBalance: 500, maxBalance: null, monthlyFee: 15, tenureMonths: null, benefits: ['Unlimited transactions', 'Overdraft facility', 'Free cheque book', 'Priority support'], status: 'active', createdAt: now() },
        { id: 'prod3', name: 'Fixed Deposit 12M', category: 'fixed_deposit', interestRate: 14, minBalance: 1000, maxBalance: null, monthlyFee: 0, tenureMonths: 12, benefits: ['Guaranteed returns', 'Higher interest rate', 'Rollover option'], status: 'active', createdAt: now() },
        { id: 'prod4', name: 'Hire Purchase Basic', category: 'hire_purchase', interestRate: 18, minBalance: 0, maxBalance: null, monthlyFee: 0, tenureMonths: 24, benefits: ['No collateral required', 'Flexible repayment', 'Daily payment option'], status: 'active', createdAt: now() },
      ]);
    }
    // Seed HP items (physical goods)
    if (!localStorage.getItem(K.HP_ITEMS)) {
      set(K.HP_ITEMS, [
        { id: 'item1', name: 'Samsung 55" 4K Smart TV', category: 'Electronics', price: 3200, stock: 8, image: '📺', description: '4K UHD, Smart TV, HDR10+', dailyPayment: 15, weeklyPayment: 100, status: 'available', createdAt: now() },
        { id: 'item2', name: 'LG Double Door Fridge', category: 'Appliances', price: 2800, stock: 5, image: '🧊', description: '350L, Frost Free, Energy Star', dailyPayment: 13, weeklyPayment: 88, status: 'available', createdAt: now() },
        { id: 'item3', name: 'HP Pavilion Laptop', category: 'Electronics', price: 4500, stock: 3, image: '💻', description: 'Intel i5, 8GB RAM, 512GB SSD', dailyPayment: 21, weeklyPayment: 145, status: 'available', createdAt: now() },
        { id: 'item4', name: 'Washing Machine (Auto)', category: 'Appliances', price: 2200, stock: 6, image: '🫧', description: '7kg, Front Load, Inverter Motor', dailyPayment: 10, weeklyPayment: 70, status: 'available', createdAt: now() },
        { id: 'item5', name: 'iPhone 15 Pro', category: 'Mobile', price: 5500, stock: 10, image: '📱', description: '256GB, Titanium, A17 Pro chip', dailyPayment: 26, weeklyPayment: 178, status: 'available', createdAt: now() },
        { id: 'item6', name: 'Generator (3.5KVA)', category: 'Power', price: 3800, stock: 4, image: '⚡', description: 'Sumec Firman, Key Start, AVR', dailyPayment: 18, weeklyPayment: 122, status: 'available', createdAt: now() },
      ]);
      set(K.HP_AGREEMENTS, []);
      set(K.HP_PAYMENTS, []);
    }
    if (!localStorage.getItem(K.DEDUCTION_RULES)) set(K.DEDUCTION_RULES, []);
    if (!localStorage.getItem(K.PENDING_TXN)) set(K.PENDING_TXN, []);
    if (!localStorage.getItem(K.AUDIT_LOG)) set(K.AUDIT_LOG, []);
  },

  login(email, password) {
    const users = get(K.USERS);
    const user = users.find(u => u.email === email && u.password === password);
    if (user) { localStorage.setItem(K.CURRENT_USER, JSON.stringify(user)); return user; }
    return null;
  },
  logout() { localStorage.removeItem(K.CURRENT_USER); },
  currentUser() { return JSON.parse(localStorage.getItem(K.CURRENT_USER) || 'null'); },

  // ── Customers ─────────────────────────────────────────────────────────────
  getCustomers: () => get(K.CUSTOMERS),
  getCustomer: (id) => get(K.CUSTOMERS).find(c => c.id === id),
  addCustomer(data) {
    const c = { id: uid(), ...data, kycStatus: 'pending', createdAt: now() };
    set(K.CUSTOMERS, [...get(K.CUSTOMERS), c]); return c;
  },
  updateCustomer(id, data) {
    const list = get(K.CUSTOMERS).map(c => c.id === id ? { ...c, ...data } : c);
    set(K.CUSTOMERS, list); return list.find(c => c.id === id);
  },

  // ── Accounts ──────────────────────────────────────────────────────────────
  getAccounts: () => get(K.ACCOUNTS),
  getAccount: (id) => get(K.ACCOUNTS).find(a => a.id === id),
  getAccountsByCustomer: (cid) => get(K.ACCOUNTS).filter(a => a.customerId === cid),
  openAccount(data) {
    const a = { id: uid(), accountNumber: genAccountNumber(), balance: data.initialDeposit || 0, status: 'active', openedAt: now(), ...data };
    set(K.ACCOUNTS, [...get(K.ACCOUNTS), a]); return a;
  },
  updateAccount(id, data) {
    const list = get(K.ACCOUNTS).map(a => a.id === id ? { ...a, ...data } : a);
    set(K.ACCOUNTS, list); return list.find(a => a.id === id);
  },

  // ── Transactions ──────────────────────────────────────────────────────────
  getTransactions: () => get(K.TRANSACTIONS),
  getTransactionsByAccount: (aid) => get(K.TRANSACTIONS).filter(t => t.accountId === aid),

  postTransaction(data) {
    const accounts = get(K.ACCOUNTS);
    const acc = accounts.find(a => a.id === data.accountId);
    if (!acc) throw new Error('Account not found');
    const delta = data.type === 'credit' ? data.amount : -data.amount;
    const newBalance = acc.balance + delta;
    const users = get(K.USERS);
    const poster = users.find(u => u.id === data.createdBy);
    const txn = {
      id: uid(), ...data,
      balanceAfter: newBalance,
      reference: `TXN${Date.now()}`,
      createdAt: now(),
      posterName: poster?.name || data.createdByName || 'System',
      channel: data.channel || 'teller',
      status: 'completed',
    };
    set(K.TRANSACTIONS, [...get(K.TRANSACTIONS), txn]);
    set(K.ACCOUNTS, accounts.map(a => a.id === data.accountId ? { ...a, balance: newBalance } : a));
    // Audit log
    db.addAudit({ action: `${data.type.toUpperCase()} transaction`, entity: 'transaction', entityId: txn.id, userId: data.createdBy, userName: txn.posterName, detail: `${data.type} GH₵${data.amount} on ${acc.accountNumber} — ${data.narration}` });
    // Auto-deduction: if credit, check for active deduction rules on this account
    if (data.type === 'credit' && !data._skipAutoDeduct) {
      db._runAutoDeductions(data.accountId, newBalance, data.createdBy);
    }
    return txn;
  },

  // Run auto-deductions after a credit hits an account
  _runAutoDeductions(accountId, currentBalance, userId) {
    const rules = get(K.DEDUCTION_RULES).filter(r => r.accountId === accountId && r.active);
    if (!rules.length) return;
    let balance = currentBalance;
    for (const rule of rules) {
      if (balance <= 0) break;
      const deductAmt = Math.min(rule.amount, balance);
      if (deductAmt <= 0) continue;
      db.postTransaction({
        accountId,
        type: 'debit',
        amount: deductAmt,
        narration: rule.narration || `Auto-deduction: ${rule.label}`,
        createdBy: userId || 'system',
        createdByName: 'System (Auto)',
        channel: 'auto',
        ruleId: rule.id,
        _skipAutoDeduct: true,
      });
      // Update rule: reduce outstanding if linked to loan/HP
      if (rule.loanId) {
        const loans = get(K.LOANS);
        const loan = loans.find(l => l.id === rule.loanId);
        if (loan) {
          const newOut = Math.max(0, loan.outstanding - deductAmt);
          set(K.LOANS, loans.map(l => l.id === rule.loanId ? { ...l, outstanding: newOut, status: newOut <= 0 ? 'completed' : l.status } : l));
        }
      }
      if (rule.hpAgreementId) {
        const agreements = get(K.HP_AGREEMENTS);
        const agr = agreements.find(a => a.id === rule.hpAgreementId);
        if (agr) {
          const newPaid = (agr.totalPaid || 0) + deductAmt;
          const newRemaining = Math.max(0, agr.totalPrice - newPaid);
          set(K.HP_AGREEMENTS, agreements.map(a => a.id === rule.hpAgreementId ? { ...a, totalPaid: newPaid, remaining: newRemaining, status: newRemaining <= 0 ? 'completed' : 'active', lastPaymentDate: now() } : a));
          const hpPmt = { id: uid(), agreementId: rule.hpAgreementId, amount: deductAmt, note: 'Auto-deduction', collectedBy: 'System', remaining: newRemaining, createdAt: now() };
          set(K.HP_PAYMENTS, [...get(K.HP_PAYMENTS), hpPmt]);
        }
      }
      balance -= deductAmt;
    }
  },

  reverseTransaction(txnId, reason, userId) {
    const txns = get(K.TRANSACTIONS);
    const orig = txns.find(t => t.id === txnId);
    if (!orig) throw new Error('Transaction not found');
    const users = get(K.USERS);
    const user = users.find(u => u.id === userId);
    const reversal = db.postTransaction({
      accountId: orig.accountId,
      type: orig.type === 'credit' ? 'debit' : 'credit',
      amount: orig.amount,
      narration: `REVERSAL: ${reason}`,
      reversalOf: txnId,
      createdBy: userId,
      createdByName: user?.name,
      _skipAutoDeduct: true,
    });
    set(K.TRANSACTIONS, get(K.TRANSACTIONS).map(t => t.id === txnId ? { ...t, reversed: true, reversedBy: userId, reversedAt: now() } : t));
    db.addAudit({ action: 'REVERSAL', entity: 'transaction', entityId: txnId, userId, userName: user?.name, detail: `Reversed TXN ${orig.reference} — ${reason}` });
    return reversal;
  },

  // ── Pending Transactions (Authoriser Queue) ────────────────────────────────
  getPendingTxns: () => get(K.PENDING_TXN),
  submitForApproval(data, submittedBy) {
    const users = get(K.USERS);
    const user = users.find(u => u.id === submittedBy);
    const pending = { id: uid(), ...data, submittedBy, submitterName: user?.name, submittedAt: now(), status: 'pending' };
    set(K.PENDING_TXN, [...get(K.PENDING_TXN), pending]);
    db.addAudit({ action: 'SUBMITTED_FOR_APPROVAL', entity: 'pending_txn', entityId: pending.id, userId: submittedBy, userName: user?.name, detail: `${data.type} GH₵${data.amount} — ${data.narration}` });
    return pending;
  },
  approvePendingTxn(pendingId, approverId) {
    const pending = get(K.PENDING_TXN).find(p => p.id === pendingId);
    if (!pending) throw new Error('Pending transaction not found');
    if (pending.submittedBy === approverId) throw new Error('Cannot approve your own transaction');
    const users = get(K.USERS);
    const approver = users.find(u => u.id === approverId);
    const txn = db.postTransaction({ ...pending, createdBy: approverId, createdByName: approver?.name, approvedBy: approverId, approverName: approver?.name });
    set(K.PENDING_TXN, get(K.PENDING_TXN).map(p => p.id === pendingId ? { ...p, status: 'approved', approvedBy: approverId, approverName: approver?.name, approvedAt: now() } : p));
    db.addAudit({ action: 'APPROVED', entity: 'pending_txn', entityId: pendingId, userId: approverId, userName: approver?.name, detail: `Approved ${pending.type} GH₵${pending.amount}` });
    return txn;
  },
  rejectPendingTxn(pendingId, approverId, reason) {
    const users = get(K.USERS);
    const approver = users.find(u => u.id === approverId);
    set(K.PENDING_TXN, get(K.PENDING_TXN).map(p => p.id === pendingId ? { ...p, status: 'rejected', rejectedBy: approverId, rejectorName: approver?.name, rejectedAt: now(), rejectReason: reason } : p));
    db.addAudit({ action: 'REJECTED', entity: 'pending_txn', entityId: pendingId, userId: approverId, userName: approver?.name, detail: `Rejected — ${reason}` });
  },

  // ── Deduction Rules (auto-debit on credit) ─────────────────────────────────
  getDeductionRules: () => get(K.DEDUCTION_RULES),
  getDeductionRulesByAccount: (aid) => get(K.DEDUCTION_RULES).filter(r => r.accountId === aid),
  addDeductionRule(data) {
    const rule = { id: uid(), active: true, createdAt: now(), ...data };
    set(K.DEDUCTION_RULES, [...get(K.DEDUCTION_RULES), rule]); return rule;
  },
  updateDeductionRule(id, data) {
    const list = get(K.DEDUCTION_RULES).map(r => r.id === id ? { ...r, ...data } : r);
    set(K.DEDUCTION_RULES, list); return list.find(r => r.id === id);
  },
  deleteDeductionRule(id) { set(K.DEDUCTION_RULES, get(K.DEDUCTION_RULES).filter(r => r.id !== id)); },

  // ── Audit Log ──────────────────────────────────────────────────────────────
  getAuditLog: () => get(K.AUDIT_LOG),
  addAudit(data) {
    const entry = { id: uid(), ...data, timestamp: now() };
    const log = get(K.AUDIT_LOG);
    // Keep last 2000 entries
    set(K.AUDIT_LOG, [...log.slice(-1999), entry]);
    return entry;
  },

  // ── Loans ─────────────────────────────────────────────────────────────────
  getLoans: () => get(K.LOANS),
  getLoan: (id) => get(K.LOANS).find(l => l.id === id),
  getLoansByCustomer: (cid) => get(K.LOANS).filter(l => l.customerId === cid),
  addLoan(data) {
    const l = { id: uid(), outstanding: data.amount, status: 'pending', createdAt: now(), ...data };
    set(K.LOANS, [...get(K.LOANS), l]); return l;
  },
  updateLoan(id, data) {
    const list = get(K.LOANS).map(l => l.id === id ? { ...l, ...data } : l);
    set(K.LOANS, list); return list.find(l => l.id === id);
  },

  // ── Collectors ────────────────────────────────────────────────────────────
  getCollectors: () => get(K.COLLECTORS),
  addCollector(data) {
    const c = { id: uid(), totalCollected: 0, status: 'active', assignedCustomers: [], createdAt: now(), ...data };
    set(K.COLLECTORS, [...get(K.COLLECTORS), c]); return c;
  },
  updateCollector(id, data) {
    const list = get(K.COLLECTORS).map(c => c.id === id ? { ...c, ...data } : c);
    set(K.COLLECTORS, list); return list.find(c => c.id === id);
  },

  // ── Collections ───────────────────────────────────────────────────────────
  getCollections: () => get(K.COLLECTIONS),
  recordCollection(data) {
    const col = { id: uid(), status: 'completed', createdAt: now(), ...data };
    set(K.COLLECTIONS, [...get(K.COLLECTIONS), col]);
    // Credit the account
    db.postTransaction({ accountId: data.accountId, type: 'credit', amount: data.amount, narration: `Collection by ${data.collectorName}`, createdBy: data.collectorId });
    // Update collector total
    const collectors = get(K.COLLECTORS);
    set(K.COLLECTORS, collectors.map(c => c.id === data.collectorId ? { ...c, totalCollected: (c.totalCollected || 0) + data.amount } : c));
    return col;
  },

  // ── Users ─────────────────────────────────────────────────────────────────
  getUsers: () => get(K.USERS),
  addUser(data) {
    const u = { id: uid(), createdAt: now(), status: 'active', ...data };
    set(K.USERS, [...get(K.USERS), u]); return u;
  },
  updateUser(id, data) {
    const list = get(K.USERS).map(u => u.id === id ? { ...u, ...data } : u);
    set(K.USERS, list); return list.find(u => u.id === id);
  },
  deleteUser(id) {
    set(K.USERS, get(K.USERS).filter(u => u.id !== id));
  },

  // ── Bank Products ─────────────────────────────────────────────────────────
  getProducts: () => get(K.PRODUCTS),
  addProduct(data) {
    const p = { id: uid(), createdAt: now(), status: 'active', ...data };
    set(K.PRODUCTS, [...get(K.PRODUCTS), p]); return p;
  },
  updateProduct(id, data) {
    const list = get(K.PRODUCTS).map(p => p.id === id ? { ...p, ...data } : p);
    set(K.PRODUCTS, list); return list.find(p => p.id === id);
  },
  deleteProduct(id) {
    set(K.PRODUCTS, get(K.PRODUCTS).filter(p => p.id !== id));
  },

  // ── Hire Purchase Items (physical goods: TV, fridge, etc.) ────────────────
  getHPItems: () => get(K.HP_ITEMS),
  addHPItem(data) {
    const item = { id: uid(), createdAt: now(), status: 'available', stock: 0, ...data };
    set(K.HP_ITEMS, [...get(K.HP_ITEMS), item]); return item;
  },
  updateHPItem(id, data) {
    const list = get(K.HP_ITEMS).map(i => i.id === id ? { ...i, ...data } : i);
    set(K.HP_ITEMS, list); return list.find(i => i.id === id);
  },
  deleteHPItem(id) {
    set(K.HP_ITEMS, get(K.HP_ITEMS).filter(i => i.id !== id));
  },

  // ── HP Agreements (customer assigned an item) ─────────────────────────────
  getHPAgreements: () => get(K.HP_AGREEMENTS),
  getHPAgreementsByCustomer: (cid) => get(K.HP_AGREEMENTS).filter(a => a.customerId === cid),
  addHPAgreement(data) {
    const a = { id: uid(), createdAt: now(), status: 'active', totalPaid: 0, ...data };
    set(K.HP_AGREEMENTS, [...get(K.HP_AGREEMENTS), a]); return a;
  },
  updateHPAgreement(id, data) {
    const list = get(K.HP_AGREEMENTS).map(a => a.id === id ? { ...a, ...data } : a);
    set(K.HP_AGREEMENTS, list); return list.find(a => a.id === id);
  },

  // ── HP Payments (daily/weekly payments against an agreement) ──────────────
  getHPPayments: () => get(K.HP_PAYMENTS),
  getHPPaymentsByAgreement: (aid) => get(K.HP_PAYMENTS).filter(p => p.agreementId === aid),
  recordHPPayment(data) {
    const agreements = get(K.HP_AGREEMENTS);
    const agreement = agreements.find(a => a.id === data.agreementId);
    if (!agreement) throw new Error('Agreement not found');
    const newTotalPaid = (agreement.totalPaid || 0) + data.amount;
    const remaining = agreement.totalPrice - newTotalPaid;
    const isComplete = remaining <= 0;
    const payment = { id: uid(), createdAt: now(), ...data, remaining: Math.max(0, remaining) };
    set(K.HP_PAYMENTS, [...get(K.HP_PAYMENTS), payment]);
    set(K.HP_AGREEMENTS, agreements.map(a => a.id === data.agreementId
      ? { ...a, totalPaid: newTotalPaid, remaining: Math.max(0, remaining), status: isComplete ? 'completed' : 'active', lastPaymentDate: now() }
      : a
    ));
    // ── Also reduce the linked loan outstanding ──────────────────────────────
    if (agreement.loanId) {
      const loans = get(K.LOANS);
      const loan = loans.find(l => l.id === agreement.loanId);
      if (loan) {
        const newOutstanding = Math.max(0, (loan.outstanding || 0) - data.amount);
        const loanComplete = newOutstanding <= 0;
        set(K.LOANS, loans.map(l => l.id === agreement.loanId
          ? { ...l, outstanding: newOutstanding, status: loanComplete ? 'completed' : l.status, lastPaymentDate: now() }
          : l
        ));
        // Post transaction against the linked account
        if (loan.accountId) {
          db.postTransaction({
            accountId: loan.accountId,
            type: 'debit',
            amount: data.amount,
            narration: `HP Repayment — ${agreement.itemName}`,
            hpAgreementId: agreement.id,
            createdBy: data.collectedBy || 'system',
          });
        }
      }
    }
    return payment;
  },

  // ── Create HP Agreement + auto-generate linked loan ───────────────────────
  createHPAgreementWithLoan(data, userId) {
    const { customerId, itemId, itemName, totalPrice, downPayment, paymentFrequency,
            suggestedPayment, notes, accountId, interestRate, tenure } = data;

    // 1. Create the HP agreement
    const loanAmount = totalPrice - (downPayment || 0);
    const agreementId = uid();
    const agreement = {
      id: agreementId, customerId, itemId, itemName, totalPrice,
      remaining: loanAmount, totalPaid: downPayment || 0,
      paymentFrequency, suggestedPayment, downPayment: downPayment || 0,
      notes, status: 'active', createdAt: now(),
    };

    // 2. Create the linked hire_purchase loan
    let loan = null;
    if (accountId && loanAmount > 0) {
      const rate = interestRate || 18;
      const months = tenure || (paymentFrequency === 'daily' ? 6 : paymentFrequency === 'weekly' ? 12 : 24);
      const mr = rate / 100 / 12;
      const monthly = mr > 0
        ? (loanAmount * mr * Math.pow(1 + mr, months)) / (Math.pow(1 + mr, months) - 1)
        : loanAmount / months;
      loan = {
        id: uid(), customerId, accountId,
        type: 'hire_purchase',
        hpAgreementId: agreementId,
        itemName,
        amount: loanAmount, outstanding: loanAmount,
        interestRate: rate, tenure: months,
        monthlyPayment: Math.round(monthly * 100) / 100,
        status: 'active',
        disbursedAt: now(),
        nextDueDate: new Date(Date.now() + (paymentFrequency === 'daily' ? 1 : paymentFrequency === 'weekly' ? 7 : 30) * 86400000).toISOString(),
        createdAt: now(), createdBy: userId,
      };
      set(K.LOANS, [...get(K.LOANS), loan]);
    }

    // 3. Link loan back to agreement
    agreement.loanId = loan?.id || null;
    set(K.HP_AGREEMENTS, [...get(K.HP_AGREEMENTS), agreement]);

    // 4. Record down payment as HP payment + transaction
    if (downPayment > 0) {
      const dpPayment = { id: uid(), agreementId, amount: downPayment, note: 'Down payment', collectedBy: userId, remaining: loanAmount, createdAt: now() };
      set(K.HP_PAYMENTS, [...get(K.HP_PAYMENTS), dpPayment]);
      if (accountId) {
        db.postTransaction({ accountId, type: 'debit', amount: downPayment, narration: `HP Down Payment — ${itemName}`, hpAgreementId: agreementId, createdBy: userId });
      }
    }

    return { agreement, loan };
  },
};
