import { supabase } from './supabase';

// ─── Reference Generator ──────────────────────────────────────────────────────
const genRef = () => `TXN${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

// ─── Audit Helper ─────────────────────────────────────────────────────────────
async function audit(action, entity, entityId, userId, userName, detail) {
  try {
    await supabase.from('audit_log').insert({
      action,
      entity,
      entity_id: entityId ? String(entityId) : null,
      user_id: userId || null,
      user_name: userName || null,
      detail: detail || null,
    });
  } catch (_) {
    // audit failures are non-fatal
  }
}

// ─── camelCase → snake_case ───────────────────────────────────────────────────
const CAMEL_TO_SNAKE_MAP = {
  customerId: 'customer_id',
  accountId: 'account_id',
  itemId: 'item_id',
  loanId: 'loan_id',
  hpAgreementId: 'hp_agreement_id',
  accountNumber: 'account_number',
  interestRate: 'interest_rate',
  monthlyPayment: 'monthly_payment',
  paymentFrequency: 'payment_frequency',
  suggestedPayment: 'suggested_payment',
  totalPrice: 'total_price',
  downPayment: 'down_payment',
  totalPaid: 'total_paid',
  kycStatus: 'kyc_status',
  monthlyIncome: 'monthly_income',
  ghanaCard: 'ghana_card',
  openedBy: 'opened_by',
  createdBy: 'created_by',
  collectorId: 'collector_id',
  collectorName: 'collector_name',
  customerName: 'customer_name',
  agreementId: 'agreement_id',
  collectedBy: 'collected_by',
  nextDueDate: 'next_due_date',
  disbursedAt: 'disbursed_at',
  itemName: 'item_name',
  skipAutoDeduct: '_skip_auto_deduct',
};

function toSnake(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) continue;
    const mapped = CAMEL_TO_SNAKE_MAP[key];
    const snakeKey = mapped !== undefined ? mapped : key.replace(/([A-Z])/g, '_$1').toLowerCase();
    result[snakeKey] = val && typeof val === 'object' && !Array.isArray(val) ? toSnake(val) : val;
  }
  return result;
}

// ─── snake_case → camelCase ───────────────────────────────────────────────────
function toCamel(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(toCamel);
  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = val && typeof val === 'object' && !Array.isArray(val) ? toCamel(val) : val;
  }
  return result;
}

// ─── Strip undefined values ───────────────────────────────────────────────────
function clean(obj) {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, v === '' ? null : v])
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════
export const authDB = {
  async login(email, password) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.trim().toLowerCase())
      .eq('password', password)
      .eq('status', 'active')
      .single();
    if (error || !data) return { data: null, error: error || new Error('Invalid credentials') };
    sessionStorage.setItem('current_user', JSON.stringify(data));
    return { data, error: null };
  },

  async signup({ name, email, password, phone, role = 'teller' }) {
    const { data, error } = await supabase
      .from('users')
      .insert({ name, email: email.trim().toLowerCase(), password, phone, role })
      .select()
      .single();
    if (error || !data) return { data: null, error };
    sessionStorage.setItem('current_user', JSON.stringify(data));
    return { data, error: null };
  },

  logout() {
    sessionStorage.removeItem('current_user');
  },

  currentUser() {
    try {
      const raw = sessionStorage.getItem('current_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════════════════════════════
export const usersDB = {
  async getAll() {
    return supabase.from('users').select('*').order('created_at', { ascending: false });
  },

  async add(payload) {
    return supabase.from('users').insert(clean(toSnake(payload))).select().single();
  },

  async update(id, payload) {
    return supabase.from('users').update(clean(toSnake(payload))).eq('id', id).select().single();
  },

  async remove(id) {
    return supabase.from('users').delete().eq('id', id);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMERS
// ═══════════════════════════════════════════════════════════════════════════════
export const customersDB = {
  async getAll() {
    return supabase.from('customers').select('*').order('created_at', { ascending: false });
  },

  async getById(id) {
    return supabase.from('customers').select('*').eq('id', id).single();
  },

  async add(payload, userId, userName) {
    const row = clean(toSnake(payload));
    const { data, error } = await supabase.from('customers').insert(row).select().single();
    if (!error && data) await audit('CREATE_CUSTOMER', 'customers', data.id, userId, userName, data.name);
    return { data, error };
  },

  async update(id, payload, userId, userName) {
    const row = clean(toSnake(payload));
    const { data, error } = await supabase.from('customers').update(row).eq('id', id).select().single();
    if (!error && data) await audit('UPDATE_CUSTOMER', 'customers', id, userId, userName, JSON.stringify(row));
    return { data, error };
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNTS
// ═══════════════════════════════════════════════════════════════════════════════
export const accountsDB = {
  async getAll() {
    return supabase
      .from('accounts')
      .select('*, customers(name, phone, email, kyc_status)')
      .order('opened_at', { ascending: false });
  },

  async getByCustomer(customerId) {
    return supabase
      .from('accounts')
      .select('*, customers(name, phone, email, kyc_status)')
      .eq('customer_id', customerId)
      .order('opened_at', { ascending: false });
  },

  async getById(id) {
    return supabase
      .from('accounts')
      .select('*, customers(name, phone, email, kyc_status)')
      .eq('id', id)
      .single();
  },

  async search(q) {
    return supabase
      .from('accounts')
      .select('*, customers(name, phone, email, kyc_status)')
      .ilike('account_number', `%${q}%`);
  },

  async open(payload, userId, userName) {
    // Generate account number via RPC
    const { data: accNum, error: rpcErr } = await supabase.rpc('generate_account_number');
    if (rpcErr) return { data: null, error: rpcErr };

    const row = clean({
      customer_id: payload.customerId || payload.customer_id,
      type: payload.type,
      interest_rate: payload.interestRate ?? payload.interest_rate ?? 0,
      balance: payload.initialDeposit ?? payload.initial_deposit ?? 0,
      status: 'active',
      opened_by: userId,
      account_number: accNum,
    });

    const { data, error } = await supabase.from('accounts').insert(row).select().single();
    if (!error && data) {
      await audit('OPEN_ACCOUNT', 'accounts', data.id, userId, userName, `${data.account_number} - ${data.type}`);
      // Post initial deposit if provided
      const initDeposit = payload.initialDeposit ?? payload.initial_deposit ?? 0;
      if (initDeposit > 0) {
        await transactionsDB.post(
          {
            account_id: data.id,
            type: 'credit',
            amount: initDeposit,
            narration: 'Initial deposit',
            channel: 'teller',
            _skip_auto_deduct: true,
          },
          userId,
          userName
        );
      }
    }
    return { data, error };
  },

  async update(id, payload, userId, userName) {
    const row = clean(toSnake(payload));
    const { data, error } = await supabase.from('accounts').update(row).eq('id', id).select().single();
    if (!error && data) await audit('UPDATE_ACCOUNT', 'accounts', id, userId, userName, JSON.stringify(row));
    return { data, error };
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════════════════
export const transactionsDB = {
  async getAll(filters = {}) {
    let q = supabase
      .from('transactions')
      .select('*, accounts(account_number, customers(name))')
      .order('created_at', { ascending: false })
      .limit(500);

    if (filters.accountId) q = q.eq('account_id', filters.accountId);
    if (filters.type) q = q.eq('type', filters.type);
    if (filters.dateFrom) q = q.gte('created_at', filters.dateFrom);
    if (filters.dateTo) q = q.lte('created_at', filters.dateTo);

    return q;
  },

  async getByAccount(accountId, dateFrom, dateTo) {
    let q = supabase
      .from('transactions')
      .select('*, accounts(account_number, customers(name))')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (dateFrom) q = q.gte('created_at', dateFrom);
    if (dateTo) q = q.lte('created_at', dateTo);

    return q;
  },

  async post(payload, userId, userName, userPhone) {
    // Handle both camelCase and snake_case input
    const accountId = payload.account_id || payload.accountId;
    const type = payload.type;
    const amount = Number(payload.amount);
    const narration = payload.narration;
    const channel = payload.channel || 'teller';
    const skipAutoDeduct = payload._skip_auto_deduct || payload.skipAutoDeduct || false;

    if (!accountId) return { data: null, error: new Error('account_id is required') };
    if (!amount || amount <= 0) return { data: null, error: new Error('amount must be positive') };

    // Fetch current account
    const { data: account, error: accErr } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .single();

    if (accErr || !account) return { data: null, error: accErr || new Error('Account not found') };
    if (account.status !== 'active') return { data: null, error: new Error(`Account is ${account.status}`) };

    // Balance check for debits
    if (type === 'debit' && account.balance < amount) {
      return { data: null, error: new Error('Insufficient balance') };
    }

    const balanceAfter = type === 'credit'
      ? Number(account.balance) + amount
      : Number(account.balance) - amount;

    const txnRow = clean({
      account_id: accountId,
      type,
      amount,
      narration,
      reference: genRef(),
      balance_after: balanceAfter,
      created_by: userId || null,
      poster_name: userName || null,
      poster_phone: userPhone || null,
      channel,
      status: 'completed',
      hp_agreement_id: payload.hp_agreement_id || payload.hpAgreementId || undefined,
      loan_id: payload.loan_id || payload.loanId || undefined,
      rule_id: payload.rule_id || payload.ruleId || undefined,
    });

    const { data: txn, error: txnErr } = await supabase
      .from('transactions')
      .insert(txnRow)
      .select()
      .single();

    if (txnErr) return { data: null, error: txnErr };

    // Update account balance
    const { error: balErr } = await supabase
      .from('accounts')
      .update({ balance: balanceAfter, updated_at: new Date().toISOString() })
      .eq('id', accountId);

    if (balErr) return { data: txn, error: balErr };

    await audit(
      type === 'credit' ? 'CREDIT' : 'DEBIT',
      'transactions',
      txn.id,
      userId,
      userName,
      `${type} ${amount} on account ${account.account_number} — ${narration}`
    );

    // Auto-deductions on credit
    if (type === 'credit' && !skipAutoDeduct) {
      await transactionsDB._runAutoDeductions(accountId, balanceAfter, userId, userName);
    }

    // ── Update linked loan outstanding ────────────────────────────────────
    const loanId = payload.loan_id || payload.loanId;
    const hpId = payload.hp_agreement_id || payload.hpAgreementId;

    if (loanId && type === 'debit') {
      const { data: loan, error: loanFetchErr } = await supabase.from('loans').select('outstanding, hp_agreement_id').eq('id', loanId).single();
      if (loanFetchErr) console.error('Loan fetch error:', loanFetchErr.message);
      if (loan) {
        const newOutstanding = Math.max(0, Number(loan.outstanding) - amount);
        const { error: loanUpdErr } = await supabase.from('loans').update({
          outstanding: newOutstanding,
          status: newOutstanding <= 0 ? 'completed' : 'active',
          last_payment_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', loanId);
        if (loanUpdErr) console.error('Loan update error:', loanUpdErr.message);

        // Sync the linked HP agreement (use payload hpId or the one stored on the loan)
        const linkedHpId = hpId || loan.hp_agreement_id;
        if (linkedHpId) {
          const { data: agr } = await supabase.from('hp_agreements').select('total_paid, total_price').eq('id', linkedHpId).single();
          if (agr) {
            const newPaid = Number(agr.total_paid) + amount;
            const remaining = Math.max(0, Number(agr.total_price) - newPaid);
            await supabase.from('hp_agreements').update({
              total_paid: newPaid,
              remaining,
              status: remaining <= 0 ? 'completed' : 'active',
              last_payment_date: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('id', linkedHpId);
          }
        }
      }
    } else if (hpId && type === 'debit') {
      // HP-only path (no loan_id provided)
      const { data: agr, error: agrFetchErr } = await supabase.from('hp_agreements').select('total_paid, total_price, loan_id').eq('id', hpId).single();
      if (agrFetchErr) console.error('HP agreement fetch error:', agrFetchErr.message);
      if (agr) {
        const newPaid = Number(agr.total_paid) + amount;
        const remaining = Math.max(0, Number(agr.total_price) - newPaid);
        const { error: agrUpdErr } = await supabase.from('hp_agreements').update({
          total_paid: newPaid,
          remaining,
          status: remaining <= 0 ? 'completed' : 'active',
          last_payment_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', hpId);
        if (agrUpdErr) console.error('HP agreement update error:', agrUpdErr.message);
        // sync the linked loan
        if (agr.loan_id) {
          const { data: hpLoan } = await supabase.from('loans').select('outstanding').eq('id', agr.loan_id).single();
          if (hpLoan) {
            const newOut = Math.max(0, Number(hpLoan.outstanding) - amount);
            await supabase.from('loans').update({
              outstanding: newOut,
              status: newOut <= 0 ? 'completed' : 'active',
              last_payment_date: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('id', agr.loan_id);
          }
        }
      }
    }

    // Auto-post to GL (non-fatal)
    // Skip 'collection' channel — the collector app posts its own GL entries (COL journal)
    // to avoid double-counting cash at hand
    if (channel !== 'collection') {
      try {
        await postTransactionToGL(txn, account.type, userName);
      } catch (_) {}
    }

    // ── Push notification to customer (non-fatal) ─────────────────────────
    // Skip auto-deductions and reversals to avoid noise; only notify on
    // teller / collector / mobile channels that the customer cares about.
    if (channel !== 'auto' && account.customer_id) {
      try {
        const GHSfmt = n => `GH₵ ${Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;
        const isCredit = type === 'credit';
        const title = isCredit
          ? `💰 Credit – ${GHSfmt(amount)}`
          : `💳 Debit – ${GHSfmt(amount)}`;
        const message = `${narration || (isCredit ? 'Credit' : 'Debit')} on account ${account.account_number}. `
          + `New balance: ${GHSfmt(balanceAfter)}.`;
        await supabase.from('notifications').insert({
          user_id:   account.customer_id,
          title,
          message,
          type:      isCredit ? 'success' : 'info',
          entity:    'transaction',
          entity_id: txn.id,
          read:      false,
        });
      } catch (_) {}
    }

    return { data: txn, error: null };
  },

  async _runAutoDeductions(accountId, currentBalance, userId, userName) {
    const { data: rules } = await supabase
      .from('deduction_rules')
      .select('*')
      .eq('account_id', accountId)
      .eq('active', true);

    if (!rules || rules.length === 0) return;

    let runningBalance = Number(currentBalance);

    for (const rule of rules) {
      if (runningBalance < Number(rule.amount)) continue;

      const result = await transactionsDB.post(
        {
          account_id: accountId,
          type: 'debit',
          amount: rule.amount,
          narration: rule.narration || rule.label,
          channel: 'auto',
          loan_id: rule.loan_id || undefined,
          hp_agreement_id: rule.hp_agreement_id || undefined,
          rule_id: rule.id,
          _skip_auto_deduct: true,
        },
        userId,
        userName
      );

      if (!result.error) {
        runningBalance -= Number(rule.amount);

        // Update loan outstanding if linked
        if (rule.loan_id) {
          const { data: loan } = await supabase
            .from('loans')
            .select('outstanding')
            .eq('id', rule.loan_id)
            .single();
          if (loan) {
            const newOutstanding = Math.max(0, Number(loan.outstanding) - Number(rule.amount));
            await supabase
              .from('loans')
              .update({
                outstanding: newOutstanding,
                status: newOutstanding <= 0 ? 'completed' : 'active',
                last_payment_date: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', rule.loan_id);
          }
        }

        // Update HP agreement total_paid if linked
        if (rule.hp_agreement_id) {
          const { data: agr } = await supabase
            .from('hp_agreements')
            .select('total_paid, total_price')
            .eq('id', rule.hp_agreement_id)
            .single();
          if (agr) {
            const newPaid = Number(agr.total_paid) + Number(rule.amount);
            const remaining = Math.max(0, Number(agr.total_price) - newPaid);
            await supabase
              .from('hp_agreements')
              .update({
                total_paid: newPaid,
                remaining,
                status: remaining <= 0 ? 'completed' : 'active',
                last_payment_date: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', rule.hp_agreement_id);
          }
        }
      }
    }
  },

  async reverse(txnId, reason, userId, userName) {
    const { data: txn, error: fetchErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', txnId)
      .single();

    if (fetchErr || !txn) return { data: null, error: fetchErr || new Error('Transaction not found') };
    if (txn.reversed) return { data: null, error: new Error('Transaction already reversed') };

    // Post opposite transaction
    const reversal = await transactionsDB.post(
      {
        account_id: txn.account_id,
        type: txn.type === 'credit' ? 'debit' : 'credit',
        amount: txn.amount,
        narration: `REVERSAL: ${reason || txn.narration}`,
        channel: 'reversal',
        _skip_auto_deduct: true,
      },
      userId,
      userName
    );

    if (reversal.error) return reversal;

    // Mark original as reversed
    await supabase
      .from('transactions')
      .update({
        reversed: true,
        reversed_by: userId,
        reversed_at: new Date().toISOString(),
      })
      .eq('id', txnId);

    // Link reversal to original
    await supabase
      .from('transactions')
      .update({ reversal_of: txnId })
      .eq('id', reversal.data.id);

    await audit('REVERSE_TXN', 'transactions', txnId, userId, userName, reason);
    return reversal;
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSFERS
// ═══════════════════════════════════════════════════════════════════════════════
export const transfersDB = {
  // Account → Account
  async accountToAccount({ fromAccountId, toAccountId, amount, narration }, userId, userName) {
    if (!fromAccountId || !toAccountId) return { error: new Error('Both accounts required') };
    if (fromAccountId === toAccountId)  return { error: new Error('Cannot transfer to the same account') };
    if (!amount || amount <= 0)         return { error: new Error('Amount must be positive') };

    const ref = genRef();

    // Debit source
    const debit = await transactionsDB.post({
      account_id: fromAccountId,
      type: 'debit',
      amount,
      narration: narration || `Transfer to account`,
      channel: 'transfer',
      _skip_auto_deduct: true,
    }, userId, userName);
    if (debit.error) return { error: debit.error };

    // Credit destination
    const credit = await transactionsDB.post({
      account_id: toAccountId,
      type: 'credit',
      amount,
      narration: narration || `Transfer from account`,
      channel: 'transfer',
      _skip_auto_deduct: true,
    }, userId, userName);
    if (credit.error) return { error: credit.error };

    await audit('TRANSFER', 'accounts', fromAccountId, userId, userName,
      `Transfer ${amount} → ${toAccountId} — ${narration}`);

    return { data: { debit: debit.data, credit: credit.data }, error: null };
  },

  // Account → GL (direct GL debit/credit without a counter-account)
  async accountToGL({ accountId, glCode, type, amount, narration }, userId, userName) {
    if (!accountId || !glCode) return { error: new Error('Account and GL code required') };
    if (!amount || amount <= 0) return { error: new Error('Amount must be positive') };

    // Post the account side
    const txn = await transactionsDB.post({
      account_id: accountId,
      type,
      amount,
      narration: narration || `GL ${type} — ${glCode}`,
      channel: 'gl',
      _skip_auto_deduct: true,
    }, userId, userName);
    if (txn.error) return { error: txn.error };

    // Post directly to GL
    try {
      await postTransactionToGL(
        { ...txn.data, gl_override_code: glCode },
        'manual',
        userName
      );
    } catch (_) {}

    await audit('GL_TRANSFER', 'accounts', accountId, userId, userName,
      `GL ${type} ${amount} → ${glCode} — ${narration}`);

    return { data: txn.data, error: null };
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PENDING TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════════════════
export const pendingDB = {
  async getAll() {
    return supabase
      .from('pending_transactions')
      .select('*, accounts(account_number, customers(name))')
      .order('submitted_at', { ascending: false });
  },

  async submit(payload, userId, userName) {
    const row = clean({
      account_id: payload.account_id || payload.accountId,
      type: payload.type,
      amount: payload.amount,
      narration: payload.narration,
      channel: payload.channel || 'teller',
      submitted_by: userId,
      submitter_name: userName,
      status: 'pending',
    });
    const { data, error } = await supabase.from('pending_transactions').insert(row).select().single();
    if (!error && data) await audit('SUBMIT_PENDING', 'pending_transactions', data.id, userId, userName, `${data.type} ${data.amount}`);
    return { data, error };
  },

  async approve(pendingId, approverId, approverName) {
    const { data: pending, error: fetchErr } = await supabase
      .from('pending_transactions')
      .select('*')
      .eq('id', pendingId)
      .single();

    if (fetchErr || !pending) return { data: null, error: fetchErr || new Error('Pending transaction not found') };
    if (pending.status !== 'pending') return { data: null, error: new Error(`Already ${pending.status}`) };

    const result = await transactionsDB.post(
      {
        account_id: pending.account_id,
        type: pending.type,
        amount: pending.amount,
        narration: pending.narration,
        channel: pending.channel,
      },
      approverId,
      approverName
    );

    if (result.error) return result;

    await supabase
      .from('pending_transactions')
      .update({
        status: 'approved',
        approved_by: approverId,
        approver_name: approverName,
        approved_at: new Date().toISOString(),
      })
      .eq('id', pendingId);

    await audit('APPROVE_PENDING', 'pending_transactions', pendingId, approverId, approverName, `Approved ${pending.type} ${pending.amount}`);
    return result;
  },

  async reject(pendingId, rejectorId, rejectorName, reason) {
    const { data, error } = await supabase
      .from('pending_transactions')
      .update({
        status: 'rejected',
        rejected_by: rejectorId,
        rejector_name: rejectorName,
        rejected_at: new Date().toISOString(),
        reject_reason: reason || null,
      })
      .eq('id', pendingId)
      .select()
      .single();

    if (!error && data) await audit('REJECT_PENDING', 'pending_transactions', pendingId, rejectorId, rejectorName, reason);
    return { data, error };
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// LOANS
// ═══════════════════════════════════════════════════════════════════════════════
export const loansDB = {
  async getAll() {
    return supabase
      .from('loans')
      .select('*, customers(name, phone), accounts(account_number)')
      .order('created_at', { ascending: false });
  },

  async getByCustomer(customerId) {
    return supabase
      .from('loans')
      .select('*, customers(name, phone), accounts(account_number)')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });
  },

  async add(payload, userId) {
    const principal = Number(payload.amount);
    const rate = Number(payload.interestRate ?? payload.interest_rate ?? 0);
    const tenure = Number(payload.tenure ?? 0);
    const monthly = Number(payload.monthlyPayment ?? payload.monthly_payment ?? 0);

    // Total repayable = principal + total interest (monthly * tenure)
    // This ensures outstanding tracks the full amount owed including interest
    const totalRepayable = monthly > 0 && tenure > 0
      ? Math.round(monthly * tenure * 100) / 100
      : principal;

    const row = clean({
      customer_id: payload.customerId || payload.customer_id,
      account_id: payload.accountId || payload.account_id,
      type: payload.type,
      amount: principal,
      outstanding: totalRepayable,  // full repayable amount (principal + interest)
      interest_rate: rate,
      tenure: payload.tenure,
      monthly_payment: monthly,
      purpose: payload.purpose,
      hp_agreement_id: payload.hpAgreementId || payload.hp_agreement_id || undefined,
      item_name: payload.itemName || payload.item_name || undefined,
      status: 'pending',
      created_by: userId,
    });
    return supabase.from('loans').insert(row).select().single();
  },

  async update(id, payload) {
    const row = clean(toSnake(payload));
    const { data, error } = await supabase.from('loans').update(row).eq('id', id).select().single();
    // If loan is being activated (disbursed), post to GL
    if (!error && data && payload.status === 'active' && (payload.disbursed_at || payload.disbursedAt)) {
      try { await postLoanToGL(data, null); } catch (_) {}
    }
    return { data, error };
  },

  // ── Fix existing loans: set outstanding = total repayable (principal + interest) ──
  // Run this once to migrate existing loans that only have outstanding = principal
  async fixExistingLoanOutstanding() {
    const { data: loans, error } = await supabase
      .from('loans')
      .select('id, amount, outstanding, monthly_payment, tenure, interest_rate')
      .in('status', ['active', 'overdue', 'pending']);

    if (error || !loans) return { fixed: 0, error };

    let fixed = 0;
    for (const loan of loans) {
      const principal = Number(loan.amount || 0);
      const monthly = Number(loan.monthly_payment || 0);
      const tenure = Number(loan.tenure || 0);
      const outstanding = Number(loan.outstanding || 0);

      if (monthly <= 0 || tenure <= 0) continue;

      const totalRepayable = Math.round(monthly * tenure * 100) / 100;
      const totalInterest = Math.max(0, totalRepayable - principal);

      if (totalInterest <= 0) continue; // no interest, nothing to fix

      // If outstanding <= principal, it means interest was never added.
      // Calculate how much principal has been paid, then add remaining interest.
      // new outstanding = (principal - amountPaidSoPrincipal) + remainingInterest
      if (outstanding <= principal) {
        const principalPaid = principal - outstanding;
        // Interest paid proportionally to principal paid
        const interestPaid = totalInterest > 0
          ? Math.round((principalPaid / principal) * totalInterest * 100) / 100
          : 0;
        const newOutstanding = Math.max(0,
          Math.round((totalRepayable - principalPaid - interestPaid) * 100) / 100
        );

        if (Math.abs(newOutstanding - outstanding) > 0.01) {
          await supabase.from('loans')
            .update({ outstanding: newOutstanding, updated_at: new Date().toISOString() })
            .eq('id', loan.id);
          fixed++;
        }
      }
    }
    return { fixed, error: null };
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// BANK PRODUCTS
// ═══════════════════════════════════════════════════════════════════════════════
export const productsDB = {
  async getAll() {
    return supabase.from('products').select('*').order('created_at', { ascending: false });
  },

  async add(payload) {
    const row = clean({
      name: payload.name,
      category: payload.category,
      description: payload.description,
      interest_rate: payload.interestRate ?? payload.interest_rate,
      min_balance: payload.minBalance ?? payload.min_balance,
      max_balance: payload.maxBalance ?? payload.max_balance,
      monthly_fee: payload.monthlyFee ?? payload.monthly_fee,
      tenure_months: payload.tenureMonths ?? payload.tenure_months,
      benefits: payload.benefits,
      status: payload.status || 'active',
    });
    return supabase.from('products').insert(row).select().single();
  },

  async update(id, payload) {
    const row = clean({
      name: payload.name,
      category: payload.category,
      description: payload.description,
      interest_rate: payload.interestRate ?? payload.interest_rate,
      min_balance: payload.minBalance ?? payload.min_balance,
      max_balance: payload.maxBalance ?? payload.max_balance,
      monthly_fee: payload.monthlyFee ?? payload.monthly_fee,
      tenure_months: payload.tenureMonths ?? payload.tenure_months,
      benefits: payload.benefits,
      status: payload.status,
    });
    return supabase.from('products').update(row).eq('id', id).select().single();
  },

  async remove(id) {
    return supabase.from('products').delete().eq('id', id);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// HP ITEMS
// ═══════════════════════════════════════════════════════════════════════════════
export const hpItemsDB = {
  async getAll() {
    return supabase.from('hp_items').select('*').order('created_at', { ascending: false });
  },

  async add(payload) {
    const row = clean({
      name: payload.name,
      category: payload.category,
      description: payload.description,
      price: payload.price,
      stock: payload.stock,
      image: payload.image,
      daily_payment: payload.dailyPayment ?? payload.daily_payment,
      weekly_payment: payload.weeklyPayment ?? payload.weekly_payment,
      status: payload.status || 'available',
    });
    return supabase.from('hp_items').insert(row).select().single();
  },

  async update(id, payload) {
    const row = clean({
      name: payload.name,
      category: payload.category,
      description: payload.description,
      price: payload.price,
      stock: payload.stock,
      image: payload.image,
      daily_payment: payload.dailyPayment ?? payload.daily_payment,
      weekly_payment: payload.weeklyPayment ?? payload.weekly_payment,
      status: payload.status,
    });
    return supabase.from('hp_items').update(row).eq('id', id).select().single();
  },

  async remove(id) {
    return supabase.from('hp_items').delete().eq('id', id);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// HP AGREEMENTS
// ═══════════════════════════════════════════════════════════════════════════════
export const hpAgreementsDB = {
  async getAll() {
    return supabase
      .from('hp_agreements')
      .select('*, customers(name, phone), hp_items(name, image, category), loans(outstanding, status, interest_rate, tenure, monthly_payment)')
      .order('created_at', { ascending: false });
  },

  async getByCustomer(customerId) {
    return supabase
      .from('hp_agreements')
      .select('*, customers(name, phone), hp_items(name, image, category), loans(outstanding, status, interest_rate, tenure, monthly_payment)')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });
  },

  async createWithLoan(payload, userId, userName) {
    const itemPrice = payload.totalPrice ?? payload.total_price ?? 0;
    const downPayment = payload.downPayment ?? payload.down_payment ?? 0;
    const loanPrincipal = itemPrice - downPayment;
    const rate = payload.interestRate ?? payload.interest_rate ?? 0;
    const freq = payload.paymentFrequency || payload.payment_frequency || 'monthly';

    // Auto-calculate tenure from frequency if not provided
    const tenure = payload.tenure
      ? parseInt(payload.tenure)
      : freq === 'daily' ? 6 : freq === 'weekly' ? 12 : 24;

    // ── Calculate total repayment WITH interest ────────────────────────────
    // Using standard amortization: M = P * [r(1+r)^n] / [(1+r)^n - 1]
    const mr = rate / 100 / 12; // monthly rate
    let monthlyPayment = 0;
    let totalRepayment = loanPrincipal; // fallback: no interest

    if (loanPrincipal > 0 && rate > 0 && tenure > 0) {
      if (mr > 0) {
        monthlyPayment = (loanPrincipal * mr * Math.pow(1 + mr, tenure)) / (Math.pow(1 + mr, tenure) - 1);
      } else {
        monthlyPayment = loanPrincipal / tenure;
      }
      totalRepayment = monthlyPayment * tenure;
    } else if (loanPrincipal > 0 && tenure > 0) {
      monthlyPayment = loanPrincipal / tenure;
      totalRepayment = loanPrincipal;
    }

    monthlyPayment = Math.round(monthlyPayment * 100) / 100;
    totalRepayment = Math.round(totalRepayment * 100) / 100;
    const totalInterest = Math.round((totalRepayment - loanPrincipal) * 100) / 100;

    // Suggested payment per frequency
    let suggestedPayment = payload.suggestedPayment ?? payload.suggested_payment ?? 0;
    if (!suggestedPayment || suggestedPayment === 0) {
      if (freq === 'daily') {
        // Daily: spread total repayment over tenure months * ~30 days
        suggestedPayment = Math.round((totalRepayment / (tenure * 30)) * 100) / 100;
      } else if (freq === 'weekly') {
        suggestedPayment = Math.round((totalRepayment / (tenure * 4)) * 100) / 100;
      } else {
        suggestedPayment = monthlyPayment;
      }
    }

    // The agreement total_price = item price + interest (what customer actually owes)
    // remaining starts at totalRepayment - downPayment
    const agrTotalPrice = downPayment + totalRepayment; // full cost to customer
    const agrRemaining = totalRepayment; // what's left after down payment (interest-inclusive)

    // 1. Create the HP agreement
    const agrRow = clean({
      customer_id: payload.customerId || payload.customer_id,
      item_id: payload.itemId || payload.item_id || undefined,
      item_name: payload.itemName || payload.item_name,
      total_price: agrTotalPrice,
      down_payment: downPayment,
      total_paid: downPayment,
      remaining: agrRemaining,
      payment_frequency: freq,
      suggested_payment: suggestedPayment,
      notes: payload.notes || undefined,
      status: 'active',
    });

    const { data: agr, error: agrErr } = await supabase
      .from('hp_agreements')
      .insert(agrRow)
      .select()
      .single();

    if (agrErr) return { data: null, error: agrErr };

    // 2. Create linked loan (principal only — interest tracked via monthly payment)
    const loanRow = clean({
      customer_id: agrRow.customer_id,
      account_id: payload.accountId || payload.account_id,
      type: 'hire_purchase',
      amount: loanPrincipal,
      outstanding: loanPrincipal,
      interest_rate: rate,
      tenure,
      monthly_payment: monthlyPayment,
      purpose: `HP: ${agrRow.item_name}`,
      hp_agreement_id: agr.id,
      item_name: agrRow.item_name,
      status: 'active',
      disbursed_at: new Date().toISOString(),
      next_due_date: new Date(Date.now() + (freq === 'daily' ? 1 : freq === 'weekly' ? 7 : 30) * 86400000).toISOString(),
      created_by: userId,
    });

    const { data: loan, error: loanErr } = await supabase
      .from('loans')
      .insert(loanRow)
      .select()
      .single();

    if (loanErr) return { data: agr, error: loanErr };

    // 3. Link loan back to agreement
    await supabase.from('hp_agreements').update({ loan_id: loan.id }).eq('id', agr.id);

    // 4. Deduct stock from HP item
    if (payload.itemId || payload.item_id) {
      const itemId = payload.itemId || payload.item_id;
      const { data: item } = await supabase.from('hp_items').select('stock').eq('id', itemId).single();
      if (item && item.stock > 0) {
        await supabase.from('hp_items').update({ stock: Math.max(0, item.stock - 1), updated_at: new Date().toISOString() }).eq('id', itemId);
      }
    }

    // 4. Post down payment transaction if provided
    if (downPayment > 0 && (payload.accountId || payload.account_id)) {
      await transactionsDB.post({
        account_id: payload.accountId || payload.account_id,
        type: 'debit',
        amount: downPayment,
        narration: `HP Down Payment: ${agrRow.item_name}`,
        channel: 'teller',
        hp_agreement_id: agr.id,
        loan_id: loan.id,
        _skip_auto_deduct: true,
      }, userId, userName);
    }

    await audit('CREATE_HP_AGREEMENT', 'hp_agreements', agr.id, userId, userName,
      `${agrRow.item_name} — Principal: GH₵${loanPrincipal}, Interest: GH₵${totalInterest}, Total: GH₵${totalRepayment} @ ${rate}% p.a.`
    );
    return { data: { agreement: agr, loan, totalRepayment, totalInterest, monthlyPayment }, error: null };
  },

  async update(id, payload) {
    const row = clean(toSnake(payload));
    return supabase.from('hp_agreements').update(row).eq('id', id).select().single();
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// HP PAYMENTS
// ═══════════════════════════════════════════════════════════════════════════════
export const hpPaymentsDB = {
  async getAll() {
    return supabase
      .from('hp_payments')
      .select('*, hp_agreements(item_name, customer_id, customers(name))')
      .order('created_at', { ascending: false });
  },

  async getByAgreement(agreementId) {
    return supabase
      .from('hp_payments')
      .select('*')
      .eq('agreement_id', agreementId)
      .order('created_at', { ascending: false });
  },

  async record(payload, userId, userName) {
    const agreementId = payload.agreementId || payload.agreement_id;
    const amount = Number(payload.amount);

    const { data: agr, error: agrErr } = await supabase
      .from('hp_agreements')
      .select('*')
      .eq('id', agreementId)
      .single();

    if (agrErr || !agr) return { data: null, error: agrErr || new Error('Agreement not found') };

    const newPaid = Number(agr.total_paid) + amount;
    const remaining = Math.max(0, Number(agr.total_price) - newPaid);

    const payRow = clean({
      agreement_id: agreementId,
      amount,
      remaining,
      note: payload.note || undefined,
      collected_by: payload.collectedBy || payload.collected_by || userName,
    });

    const { data: payment, error: payErr } = await supabase
      .from('hp_payments')
      .insert(payRow)
      .select()
      .single();

    if (payErr) return { data: null, error: payErr };

    await supabase
      .from('hp_agreements')
      .update({
        total_paid: newPaid,
        remaining,
        status: remaining <= 0 ? 'completed' : 'active',
        last_payment_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', agreementId);

    if (agr.loan_id) {
      const { data: loan } = await supabase.from('loans').select('outstanding').eq('id', agr.loan_id).single();
      if (loan) {
        const newOutstanding = Math.max(0, Number(loan.outstanding) - amount);
        await supabase
          .from('loans')
          .update({
            outstanding: newOutstanding,
            status: newOutstanding <= 0 ? 'completed' : 'active',
            last_payment_date: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', agr.loan_id);
      }
    }

    await audit('HP_PAYMENT', 'hp_payments', payment.id, userId, userName, `${amount} on agreement ${agreementId}`);
    return { data: payment, error: null };
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// COLLECTORS
// ═══════════════════════════════════════════════════════════════════════════════
export const collectorsDB = {
  async getAll() {
    const { data, error } = await supabase
      .from('collectors')
      .select('*, collector_assignments(customer_id)')
      .order('created_at', { ascending: false });
    return { data, error };
  },

  async add(payload) {
    const row = clean(toSnake(payload));
    return supabase.from('collectors').insert(row).select().single();
  },

  async update(id, payload) {
    const row = clean(toSnake(payload));
    return supabase.from('collectors').update(row).eq('id', id).select().single();
  },

  async setAssignments(collectorId, customerIds) {
    // Remove existing assignments for this collector
    await supabase.from('collector_assignments').delete().eq('collector_id', collectorId);

    if (!customerIds || customerIds.length === 0) return { data: [], error: null };

    const rows = customerIds.map((cid) => ({ collector_id: collectorId, customer_id: cid }));
    return supabase.from('collector_assignments').insert(rows).select();
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// COLLECTIONS
// ═══════════════════════════════════════════════════════════════════════════════
// COLLECTIONS
// ═══════════════════════════════════════════════════════════════════════════════
export const collectionsDB = {
  async getAll() {
    return supabase
      .from('collections')
      .select('*, collectors(name), customers(name), accounts(account_number)')
      .order('created_at', { ascending: false });
  },

  async record(payload, userId, userName) {
    const accountId = payload.accountId || payload.account_id;
    const amount = Number(payload.amount);
    const collectorId = payload.collectorId || payload.collector_id;
    const paymentType = payload.payment_type || payload.paymentType || 'savings';

    // ── All collection types CREDIT the account ─────────────────────────────
    // Collector collects CASH from customer → money goes INTO the account
    // Then for loan/HP, we separately reduce the outstanding balance
    const narration = paymentType === 'savings'
      ? `Savings Deposit — ${payload.collectorName || 'Collector'}`
      : paymentType === 'loan'
        ? `Loan Repayment — ${payload.loanType || 'Loan'} (via ${payload.collectorName || 'Collector'})`
        : `HP Repayment — ${payload.itemName || 'HP Item'} (via ${payload.collectorName || 'Collector'})`;

    const txnResult = await transactionsDB.post(
      {
        account_id: accountId,
        type: 'credit',   // always credit — collector brings cash in
        amount,
        narration: payload.narration || narration,
        channel: 'collection',
        _skip_auto_deduct: true,
      },
      userId,
      userName
    );

    if (txnResult.error) return txnResult;

    // ── If loan repayment, reduce loan outstanding + post interest to GL ──────
    if (paymentType === 'loan' && (payload.loanId || payload.loan_id)) {
      const loanId = payload.loanId || payload.loan_id;
      const { data: loan } = await supabase
        .from('loans')
        .select('outstanding, status, interest_rate, amount, monthly_payment')
        .eq('id', loanId)
        .single();
      if (loan) {
        const newOutstanding = Math.max(0, Number(loan.outstanding) - amount);
        await supabase.from('loans').update({
          outstanding: newOutstanding,
          status: newOutstanding <= 0 ? 'completed' : loan.status,
          last_payment_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', loanId);

        // ── Split payment into interest + principal for GL ──────────────────
        // Monthly interest = outstanding * (annual_rate / 12 / 100)
        const monthlyRate = Number(loan.interest_rate || 0) / 100 / 12;
        const interestPortion = Math.min(
          amount,
          Math.round(Number(loan.outstanding) * monthlyRate * 100) / 100
        );
        const principalPortion = Math.max(0, amount - interestPortion);

        // Post to GL: principal reduces loan receivable, interest is income
        try {
          await postLoanRepaymentToGL(loanId, principalPortion, interestPortion, userName);
        } catch (_) {}
      }
    }

    // ── If HP repayment, reduce HP agreement + linked loan + post interest ────
    if (paymentType === 'hp' && (payload.hpAgreementId || payload.hp_agreement_id)) {
      const agrId = payload.hpAgreementId || payload.hp_agreement_id;
      const { data: agr } = await supabase.from('hp_agreements').select('*').eq('id', agrId).single();
      if (agr) {
        const newPaid = Number(agr.total_paid) + amount;
        const remaining = Math.max(0, Number(agr.total_price) - newPaid);
        await supabase.from('hp_agreements').update({
          total_paid: newPaid, remaining,
          status: remaining <= 0 ? 'completed' : 'active',
          last_payment_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', agrId);
        await supabase.from('hp_payments').insert({
          agreement_id: agrId, amount, remaining,
          note: payload.notes || 'Collection payment',
          collected_by: userName,
        });

        // ── Reduce linked loan + split interest for GL ──────────────────────
        if (agr.loan_id) {
          const { data: loan } = await supabase
            .from('loans')
            .select('outstanding, status, interest_rate, amount')
            .eq('id', agr.loan_id)
            .single();
          if (loan) {
            const newOut = Math.max(0, Number(loan.outstanding) - amount);
            await supabase.from('loans').update({
              outstanding: newOut,
              status: newOut <= 0 ? 'completed' : loan.status,
              last_payment_date: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('id', agr.loan_id);

            // Split into interest + principal for GL
            const monthlyRate = Number(loan.interest_rate || 0) / 100 / 12;
            const interestPortion = Math.min(
              amount,
              Math.round(Number(loan.outstanding) * monthlyRate * 100) / 100
            );
            const principalPortion = Math.max(0, amount - interestPortion);
            try {
              await postHPPaymentToGL(agrId, principalPortion, interestPortion, userName);
            } catch (_) {}
          }
        }
      }
    }

    // ── Insert collection record ────────────────────────────────────────────
    // Try with payment_type first; fall back without it if column doesn't exist
    const baseRow = clean({
      collector_id: collectorId || undefined,
      collector_name: payload.collectorName || payload.collector_name || undefined,
      customer_id: payload.customerId || payload.customer_id || undefined,
      customer_name: payload.customerName || payload.customer_name || undefined,
      account_id: accountId,
      amount,
      notes: payload.notes || undefined,
      status: 'completed',
    });

    let insertResult = await supabase
      .from('collections')
      .insert({ ...baseRow, payment_type: paymentType })
      .select()
      .single();

    // If payment_type column doesn't exist yet, retry without it
    if (insertResult.error && insertResult.error.message?.includes('payment_type')) {
      insertResult = await supabase
        .from('collections')
        .insert(baseRow)
        .select()
        .single();
    }

    const { data, error } = insertResult;

    // ── Update collector total_collected ────────────────────────────────────
    if (collectorId) {
      const { data: col } = await supabase.from('collectors').select('total_collected').eq('id', collectorId).single();
      if (col) {
        await supabase.from('collectors').update({
          total_collected: Number(col.total_collected || 0) + amount,
          updated_at: new Date().toISOString(),
        }).eq('id', collectorId);
      }
    }

    await audit('RECORD_COLLECTION', 'collections', data?.id, userId, userName,
      `${paymentType} GH₵${amount} by ${payload.collectorName || 'collector'}`);

    // Post to GL
    if (data) {
      try { await postCollectionToGL({ ...data, customer_name: payload.customerName, collector_name: payload.collectorName }, userName); } catch (_) {}
    }

    // Return success even if collection record insert had minor issues
    // The transaction was already posted successfully
    return { data: data || { amount, payment_type: paymentType }, error: null };
  },

  async delete(id) {
    return supabase.from('collections').delete().eq('id', id);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// DEDUCTION RULES
// ═══════════════════════════════════════════════════════════════════════════════
export const deductionRulesDB = {
  async getAll() {
    return supabase
      .from('deduction_rules')
      .select('*, accounts(account_number), loans(amount, outstanding), hp_agreements(item_name)')
      .order('created_at', { ascending: false });
  },

  async getByAccount(accountId) {
    return supabase
      .from('deduction_rules')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });
  },

  async add(payload) {
    const row = clean({
      account_id: payload.accountId || payload.account_id,
      label: payload.label,
      amount: payload.amount,
      narration: payload.narration || undefined,
      loan_id: payload.loanId || payload.loan_id || undefined,
      hp_agreement_id: payload.hpAgreementId || payload.hp_agreement_id || undefined,
      active: payload.active !== undefined ? payload.active : true,
    });
    return supabase.from('deduction_rules').insert(row).select().single();
  },

  async update(id, payload) {
    const row = clean(toSnake(payload));
    return supabase.from('deduction_rules').update(row).eq('id', id).select().single();
  },

  async remove(id) {
    return supabase.from('deduction_rules').delete().eq('id', id);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════════════════════════════════
export const auditDB = {
  async getAll(limit = 200) {
    return supabase
      .from('audit_log')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PENDING APPROVALS (customer creation, account opening)
// ═══════════════════════════════════════════════════════════════════════════════
export const approvalsDB = {
  async getAll() {
    return supabase
      .from('pending_approvals')
      .select('*')
      .order('submitted_at', { ascending: false });
  },

  async submit(type, payload, userId, userName) {
    const { data, error } = await supabase
      .from('pending_approvals')
      .insert({ type, payload, submitted_by: userId, submitter_name: userName, status: 'pending' })
      .select().single();
    if (!error) await audit('SUBMIT_APPROVAL', 'pending_approvals', data?.id, userId, userName, `${type} creation submitted`);
    return { data, error };
  },

  async approve(id, approverId, approverName) {
    const { data: item, error: fetchErr } = await supabase.from('pending_approvals').select('*').eq('id', id).single();
    if (fetchErr || !item) return { error: fetchErr || new Error('Approval not found') };
    if (item.submitted_by === approverId) return { error: new Error('Cannot approve your own submission') };

    let result = null;

    if (item.type === 'customer') {
      result = await customersDB.add(item.payload, approverId, approverName);
      if (result.error) return { error: new Error(`Customer creation failed: ${result.error.message}`) };

      // Auto-approve any linked pending account from the same submitter
      const newCustomerId = result.data.id;
      const { data: linkedAccApprovals } = await supabase
        .from('pending_approvals')
        .select('*')
        .eq('submitted_by', item.submitted_by)
        .eq('status', 'pending')
        .eq('type', 'account');

      for (const accItem of (linkedAccApprovals || [])) {
        if (!accItem.payload?.customer_id && accItem.payload?.isNewCustomer) {
          const updatedPayload = { ...accItem.payload, customer_id: newCustomerId, customerId: newCustomerId };
          await supabase.from('pending_approvals').update({ payload: updatedPayload }).eq('id', accItem.id);
          await approvalsDB.approve(accItem.id, approverId, approverName);
        }
      }

    } else if (item.type === 'account') {
      const payload = item.payload || {};
      let customerId = payload.customerId || payload.customer_id;

      // Combined new-customer + account request — create customer first
      if (!customerId && payload.isNewCustomer) {
        const custPayload = {
          name:           payload.name,
          email:          payload.email || null,
          phone:          payload.phone || payload.newCustomerPhone,
          ghana_card:     payload.ghana_card || null,
          dob:            payload.dob || null,
          address:        payload.address || null,
          occupation:     payload.occupation || null,
          employer:       payload.employer || null,
          monthly_income: payload.monthly_income || null,
        };
        const custResult = await customersDB.add(custPayload, approverId, approverName);
        if (custResult.error) return { error: new Error(`Customer creation failed: ${custResult.error.message}`) };
        customerId = custResult.data.id;
      }

      // If customer_id still missing, try to find by phone
      if (!customerId) {
        const phone = payload.newCustomerPhone || payload.phone;
        const name  = payload.customerName || payload.name;
        if (phone || name) {
          let q = supabase.from('customers').select('id').limit(1);
          if (phone) q = q.eq('phone', phone);
          else       q = q.ilike('name', name);
          const { data: found } = await q.single();
          if (found) customerId = found.id;
        }
      }

      if (!customerId) return { error: new Error('Could not resolve customer. Please open the account manually.') };

      result = await accountsDB.open(
        { ...payload, customerId, customer_id: customerId, type: payload.type || payload.category },
        approverId,
        approverName
      );
      if (result.error) return { error: new Error(`Account opening failed: ${result.error.message}`) };

      // Notify the collector
      if (result.data && item.submitted_by) {
        const acc = result.data;
        try {
          await supabase.from('notifications').insert({
            user_id:   item.submitted_by,
            title:     '✅ Account Opening Approved',
            message:   `Account ${acc.account_number} (${(payload.type || payload.category || '').replace(/_/g, ' ')}) opened for ${payload.customerName || payload.name || 'customer'}.`,
            type:      'success',
            entity:    'account',
            entity_id: String(acc.id),
            read:      false,
          });
        } catch (_) {}
      }
    }

    // Mark as approved
    await supabase.from('pending_approvals').update({
      status:        'approved',
      approved_by:   approverId,
      approver_name: approverName,
      approved_at:   new Date().toISOString(),
    }).eq('id', id);

    await audit('APPROVE', 'pending_approvals', id, approverId, approverName, `${item.type} approved`);
    return result || { data: null, error: null };
  },

  async reject(id, rejectorId, rejectorName, reason) {
    await supabase.from('pending_approvals').update({
      status: 'rejected', rejected_by: rejectorId,
      rejector_name: rejectorName, rejected_at: new Date().toISOString(),
      reject_reason: reason,
    }).eq('id', id);
    await audit('REJECT', 'pending_approvals', id, rejectorId, rejectorName, reason);
    return { error: null };
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════
export const notificationsDB = {
  async getForUser(userId, limit = 50) {
    return supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
  },

  async getUnreadCount(userId) {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);
    return count || 0;
  },

  async send(userId, title, message, type = 'info', entity = null, entityId = null) {
    return supabase.from('notifications').insert({
      user_id: userId,
      title,
      message,
      type,
      entity,
      entity_id: entityId ? String(entityId) : null,
      read: false,
    }).select().single();
  },

  async markRead(id) {
    return supabase.from('notifications').update({ read: true }).eq('id', id);
  },

  async markAllRead(userId) {
    return supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
  },

  async broadcast(title, message, type = 'info', entity = null, entityId = null) {
    // Send to all admin/manager users
    const { data: admins } = await supabase
      .from('users')
      .select('id')
      .in('role', ['admin', 'manager'])
      .eq('status', 'active');
    if (!admins?.length) return;
    const rows = admins.map(u => ({ user_id: u.id, title, message, type, entity, entity_id: entityId ? String(entityId) : null, read: false }));
    return supabase.from('notifications').insert(rows);
  },
};


// ═══════════════════════════════════════════════════════════════════════════════
// GL LEDGER
// ═══════════════════════════════════════════════════════════════════════════════
export const glDB = {
  // ── Chart of Accounts ───────────────────────────────────────────────────────
  async getAccounts() {
    return supabase.from('gl_accounts').select('*').order('code');
  },

  async addAccount(payload) {
    const row = {
      code: payload.code,
      name: payload.name,
      type: payload.type,
      category: payload.category,
      description: payload.description || null,
      parent_code: payload.parentCode || null,
      is_system: false,
      status: 'active',
    };
    return supabase.from('gl_accounts').insert(row).select().single();
  },

  async updateAccount(id, payload) {
    return supabase.from('gl_accounts').update({
      name: payload.name,
      description: payload.description,
      status: payload.status,
    }).eq('id', id).select().single();
  },

  async deleteAccount(id) {
    // Only allow deleting non-system accounts with no entries
    const { count } = await supabase
      .from('gl_entries')
      .select('id', { count: 'exact', head: true })
      .eq('gl_account_id', id);
    if (count > 0) return { error: new Error('Cannot delete account with existing entries') };
    return supabase.from('gl_accounts').delete().eq('id', id).eq('is_system', false);
  },

  // ── Journal Entries ─────────────────────────────────────────────────────────
  async getEntries(filters = {}) {
    let q = supabase
      .from('gl_entries')
      .select('*, gl_accounts(code, name, type)')
      .order('created_at', { ascending: false })
      .limit(500);
    if (filters.accountId)   q = q.eq('gl_account_id', filters.accountId);
    if (filters.journalRef)  q = q.eq('journal_ref', filters.journalRef);
    if (filters.sourceType)  q = q.eq('source_type', filters.sourceType);
    if (filters.periodYear)  q = q.eq('period_year', filters.periodYear);
    if (filters.periodMonth) q = q.eq('period_month', filters.periodMonth);
    if (filters.dateFrom)    q = q.gte('created_at', filters.dateFrom);
    if (filters.dateTo)      q = q.lte('created_at', filters.dateTo);
    return q;
  },

  // Post a balanced journal entry (debits must equal credits)
  async postJournal(lines, narration, sourceType, sourceId, txnRef, postedBy) {
    const now = new Date();
    const journalRef = `JNL${Date.now()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    // Validate balance
    const totalDebits  = lines.filter(l => l.entryType === 'debit').reduce((s, l) => s + Number(l.amount), 0);
    const totalCredits = lines.filter(l => l.entryType === 'credit').reduce((s, l) => s + Number(l.amount), 0);
    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      return { error: new Error(`Journal not balanced: debits ${totalDebits} ≠ credits ${totalCredits}`) };
    }

    // Fetch account details for each line
    const codes = [...new Set(lines.map(l => l.accountCode))];
    const { data: accounts } = await supabase
      .from('gl_accounts')
      .select('id, code, name, type, balance')
      .in('code', codes);

    if (!accounts || accounts.length === 0) {
      return { error: new Error('GL accounts not found') };
    }

    const accountMap = {};
    accounts.forEach(a => { accountMap[a.code] = a; });

    // Build rows
    const rows = lines.map(l => {
      const acc = accountMap[l.accountCode];
      if (!acc) return null;
      return {
        journal_ref: journalRef,
        gl_account_id: acc.id,
        gl_account_code: acc.code,
        gl_account_name: acc.name,
        entry_type: l.entryType,
        amount: Number(l.amount),
        narration: l.narration || narration,
        source_type: sourceType || null,
        source_id: sourceId ? String(sourceId) : null,
        transaction_ref: txnRef || null,
        posted_by: postedBy || null,
        period_month: month,
        period_year: year,
      };
    }).filter(Boolean);

    const { data, error } = await supabase.from('gl_entries').insert(rows).select();
    if (error) return { error };

    // Update running balances on gl_accounts
    for (const line of lines) {
      const acc = accountMap[line.accountCode];
      if (!acc) continue;
      // Normal balance rules:
      // Assets & Expenses: debit increases, credit decreases
      // Liabilities, Equity, Revenue: credit increases, debit decreases
      const isDebitNormal = acc.type === 'asset' || acc.type === 'expense';
      const delta = line.entryType === 'debit'
        ? (isDebitNormal ? Number(line.amount) : -Number(line.amount))
        : (isDebitNormal ? -Number(line.amount) : Number(line.amount));

      await supabase
        .from('gl_accounts')
        .update({ balance: Number(acc.balance) + delta, updated_at: now.toISOString() })
        .eq('id', acc.id);
    }

    return { data, error: null, journalRef };
  },

  // ── P&L Report ──────────────────────────────────────────────────────────────
  async getPnL(periodYear, periodMonth) {
    let q = supabase
      .from('gl_entries')
      .select('gl_account_code, gl_account_name, entry_type, amount, gl_accounts(type, category)')
      .in('gl_accounts.type', ['revenue', 'expense']);

    if (periodYear)  q = q.eq('period_year', periodYear);
    if (periodMonth) q = q.eq('period_month', periodMonth);

    return q;
  },

  // ── Balance Sheet ────────────────────────────────────────────────────────────
  async getBalanceSheet() {
    return supabase
      .from('gl_accounts')
      .select('*')
      .in('type', ['asset', 'liability', 'equity'])
      .eq('status', 'active')
      .order('code');
  },

  // ── Trial Balance ────────────────────────────────────────────────────────────
  async getTrialBalance(periodYear, periodMonth) {
    let q = supabase
      .from('gl_entries')
      .select('gl_account_id, gl_account_code, gl_account_name, entry_type, amount');
    if (periodYear)  q = q.eq('period_year', periodYear);
    if (periodMonth) q = q.eq('period_month', periodMonth);
    return q;
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// GL AUTO-POSTING — Complete Double-Entry for every financial event
// Every transaction MUST have matching Debits = Credits
// ═══════════════════════════════════════════════════════════════════════════════

// Helper: get liability account code based on account type
function liabCode(accountType) {
  if (accountType === 'current')       return '2000'; // Current Accounts
  if (accountType === 'fixed_deposit') return '2020'; // Fixed Deposits
  if (accountType === 'savings')       return '2010'; // Savings Accounts
  if (accountType === 'micro_savings') return '2010';
  if (accountType === 'susu')          return '2010';
  if (accountType === 'joint')         return '2010';
  return '2010'; // default savings
}

// ── 1. Customer DEPOSIT (credit to account) ───────────────────────────────────
// Cash comes in → Asset increases, Liability increases
// Dr 1020 Customer Deposits Account (we hold more cash)
// Cr 2010 Savings Accounts (we owe more to customer)
export async function postTransactionToGL(txn, accountType, postedBy) {
  try {
    const amount = Number(txn.amount);
    const ref    = txn.reference;
    const narr   = txn.narration || 'Transaction';
    const liab   = liabCode(accountType);
    let lines    = [];

    if (txn.type === 'credit') {
      // Customer deposits / receives money into account
      lines = [
        { accountCode: '1020', entryType: 'debit',  amount, narration: `Deposit: ${narr}` },
        { accountCode: liab,   entryType: 'credit', amount, narration: `Deposit: ${narr}` },
      ];
    } else {
      // Customer withdraws / money leaves account
      lines = [
        { accountCode: liab,   entryType: 'debit',  amount, narration: `Withdrawal: ${narr}` },
        { accountCode: '1020', entryType: 'credit', amount, narration: `Withdrawal: ${narr}` },
      ];
    }

    await glDB.postJournal(lines, narr, 'transaction', txn.id, ref, postedBy);
  } catch (e) {
    console.warn('GL transaction posting failed:', e.message);
  }
}

// ── 2. LOAN DISBURSEMENT ──────────────────────────────────────────────────────
// We give out cash → Loan Receivable increases, Cash decreases
// Dr 1100 Loan Receivables (we are owed more)
// Cr 1010 Main Operating Account (cash goes out)
export async function postLoanToGL(loan, postedBy) {
  try {
    const amount = Number(loan.amount);
    const narr   = `Loan disbursement — ${loan.purpose || loan.type || 'loan'}`;
    const lines  = [
      { accountCode: '1100', entryType: 'debit',  amount, narration: narr },
      { accountCode: '1010', entryType: 'credit', amount, narration: narr },
    ];
    await glDB.postJournal(lines, narr, 'loan_disbursement', loan.id, null, postedBy);
  } catch (e) {
    console.warn('GL loan disbursement posting failed:', e.message);
  }
}

// ── 3. LOAN REPAYMENT (principal + interest) ──────────────────────────────────
// Cash comes in → split into principal recovery and interest income
// Principal: Dr 1020 Cash / Cr 1100 Loan Receivables (loan reduces)
// Interest:  Dr 1020 Cash / Cr 4000 Loan Interest Income (income earned)
export async function postLoanRepaymentToGL(loanId, principal, interest, postedBy) {
  try {
    if (principal > 0) {
      await glDB.postJournal([
        { accountCode: '1020', entryType: 'debit',  amount: principal, narration: 'Loan principal repayment' },
        { accountCode: '1100', entryType: 'credit', amount: principal, narration: 'Loan principal repayment' },
      ], 'Loan principal repayment', 'loan_repayment', loanId, null, postedBy);
    }
    if (interest > 0) {
      await glDB.postJournal([
        { accountCode: '1020', entryType: 'debit',  amount: interest, narration: 'Loan interest income' },
        { accountCode: '4000', entryType: 'credit', amount: interest, narration: 'Loan interest income' },
      ], 'Loan interest income', 'loan_interest', loanId, null, postedBy);
    }
  } catch (e) {
    console.warn('GL loan repayment posting failed:', e.message);
  }
}

// ── 4. HP PAYMENT (principal + interest) ─────────────────────────────────────
// Same as loan repayment but for hire purchase
// Principal: Dr 1020 Cash / Cr 1100 Loan Receivables
// Interest:  Dr 1020 Cash / Cr 4000 Loan Interest Income
export async function postHPPaymentToGL(agreementId, principal, interest, postedBy) {
  try {
    if (principal > 0) {
      await glDB.postJournal([
        { accountCode: '1020', entryType: 'debit',  amount: principal, narration: 'HP principal repayment' },
        { accountCode: '1100', entryType: 'credit', amount: principal, narration: 'HP principal repayment' },
      ], 'HP principal repayment', 'hp_repayment', agreementId, null, postedBy);
    }
    if (interest > 0) {
      await glDB.postJournal([
        { accountCode: '1020', entryType: 'debit',  amount: interest, narration: 'HP interest income' },
        { accountCode: '4000', entryType: 'credit', amount: interest, narration: 'HP interest income' },
      ], 'HP interest income', 'hp_interest', agreementId, null, postedBy);
    }
  } catch (e) {
    console.warn('GL HP payment posting failed:', e.message);
  }
}

// ── 5. COLLECTION (collector brings cash) ────────────────────────────────────
// Collector collects cash from customer and brings it in
// For SAVINGS: Dr 1000 Cash in Hand / Cr 2010 Savings Accounts (customer balance increases)
// For LOAN:    Dr 1000 Cash in Hand / Cr 1100 Loan Receivables (loan reduces) + Cr 4000 Interest
// For HP:      Dr 1000 Cash in Hand / Cr 1100 Loan Receivables (HP reduces)
export async function postCollectionToGL(collection, postedBy) {
  try {
    const amount  = Number(collection.amount);
    const pt      = collection.payment_type || 'savings';
    const custName = collection.customer_name || 'customer';
    const colName  = collection.collector_name || 'collector';
    const narr     = `Collection (${pt}) — ${custName} via ${colName}`;

    let lines = [];

    if (pt === 'savings') {
      // Cash in, savings liability increases
      lines = [
        { accountCode: '1000', entryType: 'debit',  amount, narration: narr },
        { accountCode: '2010', entryType: 'credit', amount, narration: narr },
      ];
    } else if (pt === 'loan') {
      // Cash in, loan receivable reduces
      lines = [
        { accountCode: '1000', entryType: 'debit',  amount, narration: narr },
        { accountCode: '1100', entryType: 'credit', amount, narration: narr },
      ];
    } else if (pt === 'hp') {
      // Cash in, HP receivable reduces
      lines = [
        { accountCode: '1000', entryType: 'debit',  amount, narration: narr },
        { accountCode: '1100', entryType: 'credit', amount, narration: narr },
      ];
    }

    if (lines.length > 0) {
      await glDB.postJournal(lines, narr, 'collection', collection.id, null, postedBy);
    }
  } catch (e) {
    console.warn('GL collection posting failed:', e.message);
  }
}

// ── 6. ACCOUNT OPENING (initial deposit) ─────────────────────────────────────
// Customer opens account with initial deposit
// Dr 1020 Customer Deposits Account / Cr 2010 Savings Accounts
export async function postAccountOpeningToGL(account, initialDeposit, postedBy) {
  try {
    if (!initialDeposit || initialDeposit <= 0) return;
    const amount = Number(initialDeposit);
    const narr   = `Account opening deposit — ${account.account_number}`;
    const liab   = liabCode(account.type);
    await glDB.postJournal([
      { accountCode: '1020', entryType: 'debit',  amount, narration: narr },
      { accountCode: liab,   entryType: 'credit', amount, narration: narr },
    ], narr, 'account_opening', account.id, null, postedBy);
  } catch (e) {
    console.warn('GL account opening posting failed:', e.message);
  }
}

// ── 7. EXPENSE POSTING (manual journal shortcut) ─────────────────────────────
// When posting an expense manually:
// Dr 5xxx Expense Account / Cr 1010 Main Operating Account (cash paid out)
export async function postExpenseToGL(expenseAccountCode, amount, narration, postedBy) {
  try {
    await glDB.postJournal([
      { accountCode: expenseAccountCode, entryType: 'debit',  amount, narration },
      { accountCode: '1010',             entryType: 'credit', amount, narration },
    ], narration, 'expense', null, null, postedBy);
  } catch (e) {
    console.warn('GL expense posting failed:', e.message);
  }
}

// ── 8. INTEREST ACCRUAL (savings interest owed to customers) ─────────────────
// When crediting interest to savings accounts:
// Dr 5000 Interest on Savings (expense) / Cr 2100 Interest Payable (liability)
export async function postInterestAccrualToGL(amount, narration, postedBy) {
  try {
    await glDB.postJournal([
      { accountCode: '5000', entryType: 'debit',  amount, narration: narration || 'Savings interest accrual' },
      { accountCode: '2100', entryType: 'credit', amount, narration: narration || 'Savings interest accrual' },
    ], narration || 'Savings interest accrual', 'interest_accrual', null, null, postedBy);
  } catch (e) {
    console.warn('GL interest accrual posting failed:', e.message);
  }
}

// ── Sync all existing transactions to GL ──────────────────────────────────────
export async function syncAllToGL(postedBy) {
  const results = { transactions: 0, loans: 0, collections: 0, errors: [] };
  try {
    const { data: glAccs } = await supabase.from('gl_accounts').select('code').limit(1);
    if (!glAccs || glAccs.length === 0) {
      return { error: new Error('GL accounts not found. Run the GL SQL first.') };
    }

    // Get existing GL entries to avoid duplicates
    const { data: existing } = await supabase.from('gl_entries').select('source_type, source_id, transaction_ref');
    const existingTxnRefs = new Set((existing || []).filter(e => e.transaction_ref).map(e => e.transaction_ref));
    const existingSourceIds = new Set((existing || []).filter(e => e.source_id).map(e => `${e.source_type}:${e.source_id}`));

    // 1. Sync all completed transactions
    const { data: txns } = await supabase
      .from('transactions')
      .select('*, accounts(type, account_number)')
      .eq('status', 'completed')
      .eq('reversed', false)
      .order('created_at', { ascending: true });

    for (const txn of (txns || [])) {
      if (existingTxnRefs.has(txn.reference)) continue;
      try {
        await postTransactionToGL(txn, txn.accounts?.type || 'savings', postedBy);
        results.transactions++;
      } catch (e) {
        results.errors.push(`TXN ${txn.reference}: ${e.message}`);
      }
    }

    // 2. Sync loan disbursements (active/completed loans)
    const { data: loans } = await supabase
      .from('loans')
      .select('*')
      .in('status', ['active', 'completed', 'overdue'])
      .order('created_at', { ascending: true });

    for (const loan of (loans || [])) {
      const key = `loan_disbursement:${loan.id}`;
      if (existingSourceIds.has(key)) continue;
      try {
        await postLoanToGL(loan, postedBy);
        results.loans++;
      } catch (e) {
        results.errors.push(`LOAN ${loan.id}: ${e.message}`);
      }
    }

    // 3. Sync collections
    const { data: cols } = await supabase
      .from('collections')
      .select('*')
      .order('created_at', { ascending: true });

    for (const col of (cols || [])) {
      const key = `collection:${col.id}`;
      if (existingSourceIds.has(key)) continue;
      try {
        await postCollectionToGL(col, postedBy);
        results.collections++;
      } catch (e) {
        results.errors.push(`COL ${col.id}: ${e.message}`);
      }
    }

    return { results, error: null };
  } catch (e) {
    return { error: e };
  }
}
