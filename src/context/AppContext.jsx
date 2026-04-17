import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  authDB, usersDB, customersDB, accountsDB, transactionsDB, pendingDB,
  loansDB, productsDB, hpItemsDB, hpAgreementsDB, hpPaymentsDB,
  collectorsDB, collectionsDB, deductionRulesDB, auditDB, approvalsDB,
  transfersDB,
} from '../core/db';
import {
  normCustomer, normAccount, normTransaction, normLoan, normProduct,
  normHPItem, normHPAgreement, normHPPayment, normCollector, normCollection,
  normPendingTxn, normPendingApproval,
} from '../core/normalize';
import { supabase } from '../core/supabase';

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export function AppProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loans, setLoans] = useState([]);
  const [collectors, setCollectors] = useState([]);
  const [collections, setCollections] = useState([]);
  const [products, setProducts] = useState([]);
  const [hpItems, setHpItems] = useState([]);
  const [hpAgreements, setHpAgreements] = useState([]);
  const [hpPayments, setHpPayments] = useState([]);
  const [pendingTxns, setPendingTxns] = useState([]);
  const [deductionRules, setDeductionRules] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [users, setUsers] = useState([]);

  const silentRefresh = useCallback(async () => {
    const [
      c, a, t, l, col, cols, p, hi, ha, hp, pt, dr, al, pa, u
    ] = await Promise.all([
      customersDB.getAll(), accountsDB.getAll(), transactionsDB.getAll(),
      loansDB.getAll(), collectorsDB.getAll(), collectionsDB.getAll(),
      productsDB.getAll(), hpItemsDB.getAll(), hpAgreementsDB.getAll(),
      hpPaymentsDB.getAll(), pendingDB.getAll(), deductionRulesDB.getAll(),
      auditDB.getAll(), approvalsDB.getAll(), usersDB.getAll(),
    ]);
    // Log any query errors so they're visible in the browser console
    if (pt.error) console.error('[AppContext] pending_transactions error:', pt.error);
    if (pa?.error) console.error('[AppContext] pending_approvals error:', pa?.error);
    setCustomers((c.data || []).map(normCustomer));
    setAccounts((a.data || []).map(normAccount));
    setTransactions((t.data || []).map(normTransaction));
    setLoans((l.data || []).map(normLoan));
    setCollectors((col.data || []).map(normCollector));
    setCollections((cols.data || []).map(normCollection));
    setProducts((p.data || []).map(normProduct));
    setHpItems((hi.data || []).map(normHPItem));
    setHpAgreements((ha.data || []).map(normHPAgreement));
    setHpPayments((hp.data || []).map(normHPPayment));
    setPendingTxns((pt.data || []).map(normPendingTxn));
    setDeductionRules(dr.data || []);
    setAuditLog(al.data || []);
    setPendingApprovals((pa?.data || []).map(normPendingApproval));
    setUsers(u.data || []);
    setLastRefresh(new Date());
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await silentRefresh();
    setLoading(false);
  }, [silentRefresh]);

  // initial load
  useEffect(() => { refresh(); }, [refresh]);

  // ── Run loan outstanding migration once on startup ────────────────────
  useEffect(() => {
    const migrationKey = 'loan_outstanding_migrated_v2';
    if (!sessionStorage.getItem(migrationKey)) {
      loansDB.fixExistingLoanOutstanding().then(({ fixed }) => {
        if (fixed > 0) {
          console.log(`[Migration] Fixed outstanding for ${fixed} existing loan(s)`);
          silentRefresh();
        }
        sessionStorage.setItem(migrationKey, '1');
      }).catch(() => {});
    }
  }, []);

  // ── Auto-refresh every 2 seconds (more aggressive polling) ────────────
  useEffect(() => {
    const id = setInterval(silentRefresh, 2000); // Changed from 5000 to 2000
    return () => clearInterval(id);
  }, [silentRefresh]);

  // ── Refresh when tab becomes visible ────────────────────────────────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        silentRefresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [silentRefresh]);

  // ── Supabase Realtime — auto-update state on any DB change ────────────────
  useEffect(() => {
    // Use a single channel for all tables to avoid duplicate-channel issues
    const uid = Date.now();
    const ch = supabase.channel(`app-realtime-${uid}`);

    const sub = (table, handler) => {
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, handler);
    };

    // transactions → update list + refresh the affected account balance
    sub('transactions', async ({ eventType, new: row, old }) => {
      if (eventType === 'INSERT' && row) {
        // Re-fetch with joins so customerName, accountNumber etc. are populated
        const { data: full } = await transactionsDB.getById(row.id);
        const txn = full ? normTransaction(full) : normTransaction(row);
        setTransactions(p => {
          if (p.find(t => t.id === row.id)) return p;
          return [txn, ...p];
        });
        if (row.account_id) {
          const { data: acc } = await accountsDB.getById(row.account_id);
          if (acc) setAccounts(p => p.map(a => a.id === row.account_id ? normAccount(acc) : a));
        }
      }
      if (eventType === 'UPDATE' && row) {
        const { data: full } = await transactionsDB.getById(row.id);
        setTransactions(p => p.map(t => t.id === row.id ? (full ? normTransaction(full) : normTransaction(row)) : t));
      }
      if (eventType === 'DELETE' && old) {
        setTransactions(p => p.filter(t => t.id !== old.id));
      }
    });

    // accounts → balance updates from any source (collector app, etc.)
    sub('accounts', async ({ eventType, new: row, old }) => {
      if (eventType === 'INSERT' && row) {
        // Fetch with customer join so name/phone are available
        const { data: full } = await accountsDB.getById(row.id);
        const acc = full ? normAccount(full) : normAccount(row);
        setAccounts(p => p.find(a => a.id === row.id) ? p : [acc, ...p]);
      }
      if (eventType === 'UPDATE' && row) {
        // Re-fetch to get latest joined data
        const { data: full } = await accountsDB.getById(row.id);
        const acc = full ? normAccount(full) : normAccount(row);
        setAccounts(p => p.map(a => a.id === row.id ? acc : a));
      }
      if (eventType === 'DELETE' && old) {
        setAccounts(p => p.filter(a => a.id !== old.id));
      }
    });

    // customers
    sub('customers', async ({ eventType, new: row, old }) => {
      if (eventType === 'INSERT' && row) {
        // Fetch full record to ensure all fields are present
        const { data: full } = await customersDB.getById(row.id);
        const cust = full ? normCustomer(full) : normCustomer(row);
        setCustomers(p => p.find(c => c.id === row.id) ? p : [cust, ...p]);
      }
      if (eventType === 'UPDATE' && row) {
        const { data: full } = await customersDB.getById(row.id);
        const cust = full ? normCustomer(full) : normCustomer(row);
        setCustomers(p => p.map(c => c.id === row.id ? cust : c));
      }
      if (eventType === 'DELETE' && old) {
        setCustomers(p => p.filter(c => c.id !== old.id));
      }
    });

    // loans
    sub('loans', ({ eventType, new: row, old }) => {
      if (eventType === 'INSERT' && row) {
        setLoans(p => p.find(l => l.id === row.id) ? p : [normLoan(row), ...p]);
      }
      if (eventType === 'UPDATE' && row) {
        setLoans(p => p.map(l => l.id === row.id ? normLoan(row) : l));
      }
      if (eventType === 'DELETE' && old) {
        setLoans(p => p.filter(l => l.id !== old.id));
      }
    });

    // pending_transactions
    sub('pending_transactions', ({ eventType, new: row, old }) => {
      if (eventType === 'INSERT' && row) {
        setPendingTxns(p => p.find(t => t.id === row.id) ? p : [normPendingTxn(row), ...p]);
      }
      if (eventType === 'UPDATE' && row) {
        setPendingTxns(p => p.map(t => t.id === row.id ? normPendingTxn(row) : t));
      }
      if (eventType === 'DELETE' && old) {
        setPendingTxns(p => p.filter(t => t.id !== old.id));
      }
    });

    // collections
    sub('collections', ({ eventType, new: row, old }) => {
      if (eventType === 'INSERT' && row) {
        setCollections(p => p.find(c => c.id === row.id) ? p : [normCollection(row), ...p]);
      }
      if (eventType === 'UPDATE' && row) {
        setCollections(p => p.map(c => c.id === row.id ? normCollection(row) : c));
      }
    });

    // hp_agreements
    sub('hp_agreements', ({ eventType, new: row, old }) => {
      if (eventType === 'INSERT' && row) {
        setHpAgreements(p => p.find(a => a.id === row.id) ? p : [normHPAgreement(row), ...p]);
      }
      if (eventType === 'UPDATE' && row) {
        setHpAgreements(p => p.map(a => a.id === row.id ? normHPAgreement(row) : a));
      }
    });

    // hp_payments
    sub('hp_payments', ({ eventType, new: row }) => {
      if (eventType === 'INSERT' && row) {
        setHpPayments(p => p.find(x => x.id === row.id) ? p : [normHPPayment(row), ...p]);
      }
    });

    // pending_approvals
    sub('pending_approvals', ({ eventType, new: row, old }) => {
      if (eventType === 'INSERT' && row) {
        setPendingApprovals(p => p.find(a => a.id === row.id) ? p : [normPendingApproval(row), ...p]);
      }
      if (eventType === 'UPDATE' && row) {
        setPendingApprovals(p => p.map(a => a.id === row.id ? normPendingApproval(row) : a));
      }
    });

    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);
  // ─────────────────────────────────────────────────────────────────────────

  const user = authDB.currentUser();

  const addCustomer = async (data) => {
    const { data: c, error } = await customersDB.add(data, user?.id, user?.name);
    if (c) setCustomers(p => [normCustomer(c), ...p]);
    return { data: c ? normCustomer(c) : null, error };
  };
  const updateCustomer = async (id, data) => {
    const { data: c, error } = await customersDB.update(id, data, user?.id, user?.name);
    if (c) setCustomers(p => p.map(x => x.id === id ? normCustomer(c) : x));
    return { data: c ? normCustomer(c) : null, error };
  };

  const openAccount = async (data) => {
    const { data: a, error } = await accountsDB.open(data, user?.id, user?.name);
    if (a) setAccounts(p => [normAccount(a), ...p]);
    return { data: a ? normAccount(a) : null, error };
  };
  const updateAccount = async (id, data) => {
    const { data: a, error } = await accountsDB.update(id, data, user?.id, user?.name);
    if (a) setAccounts(p => p.map(x => x.id === id ? normAccount(a) : x));
    return { data: a ? normAccount(a) : null, error };
  };

  const transferFunds = async (data) => {
    const result = await transfersDB.accountToAccount(data, user?.id, user?.name);
    if (!result.error) await silentRefresh();
    return result;
  };

  const glTransfer = async (data) => {
    const result = await transfersDB.accountToGL(data, user?.id, user?.name);
    if (!result.error) await silentRefresh();
    return result;
  };

  const postTransaction = async (data) => {
    const { data: t, error } = await transactionsDB.post(data, user?.id, user?.name, user?.phone);
    if (t) {
      setTransactions(p => [normTransaction(t), ...p]);
      const { data: updatedAcc } = await accountsDB.getById(data.account_id || data.accountId);
      if (updatedAcc) setAccounts(p => p.map(a => a.id === (data.account_id || data.accountId) ? normAccount(updatedAcc) : a));

      // Immediately refresh loans / HP agreements if this was a product payment
      const loanId = data.loan_id || data.loanId;
      const hpId   = data.hp_agreement_id || data.hpAgreementId;
      if (loanId || hpId) {
        const [lRes, haRes] = await Promise.all([loansDB.getAll(), hpAgreementsDB.getAll()]);
        if (lRes.data)  setLoans(lRes.data.map(normLoan));
        if (haRes.data) setHpAgreements(haRes.data.map(normHPAgreement));
      }
    }
    return { data: t ? normTransaction(t) : null, error };
  };
  const reverseTransaction = async (id, reason) => {
    const { data: t, error } = await transactionsDB.reverse(id, reason, user?.id, user?.name);
    if (!error) {
      setTransactions(p => p.map(x => x.id === id ? { ...x, reversed: true } : x));
      if (t) setTransactions(p => [normTransaction(t), ...p]);
      const orig = transactions.find(x => x.id === id);
      if (orig) {
        const { data: updatedAcc } = await accountsDB.getById(orig.accountId);
        if (updatedAcc) setAccounts(p => p.map(a => a.id === orig.accountId ? normAccount(updatedAcc) : a));
      }
    }
    return { data: t ? normTransaction(t) : null, error };
  };

  const submitForApproval = async (data) => {
    const { data: p, error } = await pendingDB.submit(data, user?.id, user?.name);
    if (p) setPendingTxns(prev => [normPendingTxn(p), ...prev]);
    return { data: p ? normPendingTxn(p) : null, error };
  };
  const approvePendingTxn = async (id) => {
    const { data: t, error } = await pendingDB.approve(id, user?.id, user?.name);
    if (!error) {
      setPendingTxns(p => p.map(x => x.id === id ? { ...x, status: 'approved' } : x));
      if (t) setTransactions(prev => [normTransaction(t), ...prev]);
      await refresh();
    }
    return { data: t ? normTransaction(t) : null, error };
  };
  const rejectPendingTxn = async (id, reason) => {
    const { error } = await pendingDB.reject(id, user?.id, user?.name, reason);
    if (!error) setPendingTxns(p => p.map(x => x.id === id ? { ...x, status: 'rejected' } : x));
    return { error };
  };

  const addLoan = async (data) => {
    const { data: l, error } = await loansDB.add(data, user?.id);
    if (l) setLoans(p => [normLoan(l), ...p]);
    return { data: l ? normLoan(l) : null, error };
  };
  const updateLoan = async (id, data) => {
    const { data: l, error } = await loansDB.update(id, data);
    if (l) setLoans(p => p.map(x => x.id === id ? normLoan(l) : x));
    return { data: l ? normLoan(l) : null, error };
  };

  const addProduct = async (data) => { const { data: p, error } = await productsDB.add(data); if (p) setProducts(prev => [...prev, normProduct(p)]); return { data: p ? normProduct(p) : null, error }; };
  const updateProduct = async (id, data) => { const { data: p, error } = await productsDB.update(id, data); if (p) setProducts(prev => prev.map(x => x.id === id ? normProduct(p) : x)); return { data: p ? normProduct(p) : null, error }; };
  const deleteProduct = async (id) => { const { error } = await productsDB.remove(id); if (!error) setProducts(prev => prev.filter(x => x.id !== id)); return { error }; };

  const addHPItem = async (data) => { const { data: i, error } = await hpItemsDB.add(data); if (i) setHpItems(prev => [...prev, normHPItem(i)]); return { data: i ? normHPItem(i) : null, error }; };
  const updateHPItem = async (id, data) => { const { data: i, error } = await hpItemsDB.update(id, data); if (i) setHpItems(prev => prev.map(x => x.id === id ? normHPItem(i) : x)); return { data: i ? normHPItem(i) : null, error }; };
  const deleteHPItem = async (id) => { const { error } = await hpItemsDB.remove(id); if (!error) setHpItems(prev => prev.filter(x => x.id !== id)); return { error }; };

  const createHPAgreementWithLoan = async (data) => {
    const { data: result, error } = await hpAgreementsDB.createWithLoan(data, user?.id, user?.name);
    if (!error) await refresh();
    return { data: result, error };
  };
  const updateHPAgreement = async (id, data) => {
    const { data: a, error } = await hpAgreementsDB.update(id, data);
    if (a) setHpAgreements(prev => prev.map(x => x.id === id ? normHPAgreement(a) : x));
    return { data: a ? normHPAgreement(a) : null, error };
  };

  const recordHPPayment = async (data) => {
    const { data: p, error } = await hpPaymentsDB.record(data, user?.id, user?.name);
    if (!error) await refresh();
    return { data: p ? normHPPayment(p) : null, error };
  };

  const addCollector = async (data) => { const { data: c, error } = await collectorsDB.add(data); if (c) setCollectors(prev => [...prev, normCollector(c)]); return { data: c ? normCollector(c) : null, error }; };
  const updateCollector = async (id, data) => {
    const { assigned_customers, assignedCustomers, ...rest } = data;
    const newAssigned = assigned_customers || assignedCustomers;
    const { data: c, error } = await collectorsDB.update(id, rest);
    if (newAssigned !== undefined) await collectorsDB.setAssignments(id, newAssigned);
    if (c) setCollectors(prev => prev.map(x => x.id === id ? normCollector({ ...c, assigned_customers: newAssigned ?? x.assignedCustomers }) : x));
    return { data: c ? normCollector(c) : null, error };
  };

  const recordCollection = async (data) => {
    const { data: c, error } = await collectionsDB.record(data, user?.id, user?.name);
    if (!error) await refresh();
    return { data: c ? normCollection(c) : null, error };
  };

  const addDeductionRule = async (data) => { const { data: r, error } = await deductionRulesDB.add(data); if (r) setDeductionRules(prev => [...prev, r]); return { data: r, error }; };
  const updateDeductionRule = async (id, data) => { const { data: r, error } = await deductionRulesDB.update(id, data); if (r) setDeductionRules(prev => prev.map(x => x.id === id ? r : x)); return { data: r, error }; };
  const deleteDeductionRule = async (id) => { const { error } = await deductionRulesDB.remove(id); if (!error) setDeductionRules(prev => prev.filter(x => x.id !== id)); return { error }; };

  const submitApproval = async (type, payload) => {
    const { data, error } = await approvalsDB.submit(type, payload, user?.id, user?.name);
    if (data) setPendingApprovals(prev => [normPendingApproval(data), ...prev]);
    return { data: data ? normPendingApproval(data) : null, error };
  };
  const approveApproval = async (id) => {
    const result = await approvalsDB.approve(id, user?.id, user?.name);
    // Always do a full silent refresh so new customers/accounts appear everywhere
    await silentRefresh();
    return result;
  };
  const rejectApproval = async (id, reason) => {
    const result = await approvalsDB.reject(id, user?.id, user?.name, reason);
    setPendingApprovals(prev => prev.map(x => x.id === id ? { ...x, status: 'rejected' } : x));
    return result;
  };

  const stats = {
    totalAccounts: accounts.length,
    totalBalance: accounts.reduce((s, a) => s + (a.balance > 0 ? a.balance : 0), 0),
    totalCustomers: customers.length,
    activeLoans: loans.filter(l => l.status === 'active').length,
    pendingLoans: loans.filter(l => l.status === 'pending').length,
    overdueLoans: loans.filter(l => l.status === 'overdue').length,
    totalLoanBook: loans.filter(l => l.status === 'active').reduce((s, l) => s + l.outstanding, 0),
    todayTxns: transactions.filter(t => t.createdAt && new Date(t.createdAt).toDateString() === new Date().toDateString()).length,
    todayVolume: transactions.filter(t => t.createdAt && new Date(t.createdAt).toDateString() === new Date().toDateString()).reduce((s, t) => s + t.amount, 0),
    collectionRate: collections.length > 0 ? Math.round((collections.filter(c => c.status === 'completed').length / collections.length) * 100) : 0,
    activeHPAgreements: hpAgreements.filter(a => a.status === 'active').length,
    totalHPRevenue: hpPayments.reduce((s, p) => s + p.amount, 0),
    pendingApprovals: pendingTxns.filter(p => p.status === 'pending').length,
  };

  return (
    <AppContext.Provider value={{
      loading, lastRefresh, customers, accounts, transactions, loans, collectors, collections,
      products, hpItems, hpAgreements, hpPayments, pendingTxns, deductionRules, auditLog,
      pendingApprovals, users,
      stats, refresh,
      addCustomer, updateCustomer,
      openAccount, updateAccount,
      postTransaction, reverseTransaction,
      submitForApproval, approvePendingTxn, rejectPendingTxn,
      transferFunds, glTransfer,
      addLoan, updateLoan,
      addProduct, updateProduct, deleteProduct,
      addHPItem, updateHPItem, deleteHPItem,
      createHPAgreementWithLoan, updateHPAgreement,
      recordHPPayment,
      addCollector, updateCollector,
      recordCollection,
      addDeductionRule, updateDeductionRule, deleteDeductionRule,
      submitApproval, approveApproval, rejectApproval,
    }}>
      {children}
    </AppContext.Provider>
  );
}

