import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { supabase } from '../supabase';
import { enqueue, getIsOnline } from '../offline';

const GHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

const PAYMENT_TYPES = [
  { key: 'savings', label: 'Savings Deposit', color: '#16a34a', bg: '#f0fdf4' },
  { key: 'loan', label: 'Loan Repayment', color: '#1d4ed8', bg: '#eff6ff' },
  { key: 'hp', label: 'HP Repayment', color: '#7c3aed', bg: '#faf5ff' },
];

export default function CreditScreen({ collector }) {
  const [step, setStep] = useState(1); // 1=customer, 2=type, 3=account, 4=loan/hp, 5=amount
  const [custSearch, setCustSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [loadingCust, setLoadingCust] = useState(false);

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [paymentType, setPaymentType] = useState('savings');
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [loans, setLoans] = useState([]);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [hpAgreements, setHpAgreements] = useState([]);
  const [selectedHP, setSelectedHP] = useState(null);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);

  // Search customers
  const searchCustomers = useCallback(async (q) => {
    if (!q || q.length < 2) { setCustomers([]); return; }
    setLoadingCust(true);
    const { data } = await supabase
      .from('customers')
      .select('id, name, phone')
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(20);
    setCustomers(data || []);
    setLoadingCust(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchCustomers(custSearch), 400);
    return () => clearTimeout(t);
  }, [custSearch, searchCustomers]);

  // Load accounts when customer selected
  const selectCustomer = async (c) => {
    setSelectedCustomer(c);
    setSelectedAccount(null); setSelectedLoan(null); setSelectedHP(null);
    const { data } = await supabase
      .from('accounts')
      .select('id, account_number, type, balance')
      .eq('customer_id', c.id)
      .eq('status', 'active');
    setAccounts(data || []);
    setStep(2);
  };

  // Load loans/HP when type selected
  const selectType = async (type) => {
    setPaymentType(type);
    setSelectedLoan(null); setSelectedHP(null);
    if (type === 'loan') {
      const { data } = await supabase
        .from('loans')
        .select('id, type, outstanding, monthly_payment, status')
        .eq('customer_id', selectedCustomer.id)
        .in('status', ['active', 'overdue']);
      setLoans(data || []);
    } else if (type === 'hp') {
      const { data } = await supabase
        .from('hp_agreements')
        .select('id, item_name, remaining, suggested_payment, payment_frequency')
        .eq('customer_id', selectedCustomer.id)
        .eq('status', 'active');
      setHpAgreements(data || []);
    }
    setStep(3);
  };

  // Submit
  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { Alert.alert('Error', 'Enter a valid amount'); return; }
    if (!selectedAccount) { Alert.alert('Error', 'Select an account'); return; }
    if (paymentType === 'loan' && !selectedLoan) { Alert.alert('Error', 'Select a loan'); return; }
    if (paymentType === 'hp' && !selectedHP) { Alert.alert('Error', 'Select an HP agreement'); return; }

    setSaving(true);
    try {
      const opData = {
        collectorId:    collector.id,
        collectorName:  collector.name,
        customerId:     selectedCustomer.id,
        customerName:   selectedCustomer.name,
        accountId:      selectedAccount.id,
        amount:         amt,
        notes:          notes || null,
        paymentType,
        loanId:         paymentType === 'loan' ? selectedLoan?.id : null,
        hpAgreementId:  paymentType === 'hp'   ? selectedHP?.id   : null,
      };

      if (!getIsOnline()) {
        // ── OFFLINE: queue for later sync ──────────────────────────────────
        await enqueue({ type: 'collection', data: opData });
        setDone({
          customer:    selectedCustomer.name,
          account:     selectedAccount.account_number,
          amount:      amt,
          paymentType,
          newBalance:  Number(selectedAccount.balance) + amt,
          ref:         'QUEUED-' + Date.now(),
          date:        new Date().toLocaleString(),
          offline:     true,
        });
        setSaving(false);
        return;
      }

      // ── ONLINE: post directly ─────────────────────────────────────────
      const { data: acc } = await supabase
        .from('accounts')
        .select('balance, customer_id')
        .eq('id', selectedAccount.id)
        .single();

      const newBalance = Number(acc.balance) + amt;
      const narration = paymentType === 'savings'
        ? `Savings Deposit — ${collector.name}`
        : paymentType === 'loan'
          ? `Loan Repayment — ${(selectedLoan?.type || '').replace(/_/g,' ')} (via ${collector.name})`
          : `HP Repayment — ${selectedHP?.item_name} (via ${collector.name})`;

      const ref = `TXN${Date.now()}${Math.random().toString(36).slice(2,5).toUpperCase()}`;

      // 2. Insert transaction
      await supabase.from('transactions').insert({
        account_id:    selectedAccount.id,
        type:          'credit',
        amount:        amt,
        narration:     notes || narration,
        reference:     ref,
        balance_after: newBalance,
        channel:       'collection',
        status:        'completed',
        poster_name:   collector.name,
        created_by:    null,   // collector.id is not a users.id — avoid FK violation
      });

      // 3. Update account balance
      await supabase.from('accounts').update({
        balance: newBalance,
        updated_at: new Date().toISOString(),
      }).eq('id', selectedAccount.id);

      // 4. Reduce loan outstanding if loan repayment
      if (paymentType === 'loan' && selectedLoan) {
        const newOut = Math.max(0, Number(selectedLoan.outstanding) - amt);
        await supabase.from('loans').update({
          outstanding: newOut,
          status: newOut <= 0 ? 'completed' : selectedLoan.status,
          last_payment_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', selectedLoan.id);
      }

      // 5. Reduce HP agreement if HP repayment
      if (paymentType === 'hp' && selectedHP) {
        const { data: agr } = await supabase
          .from('hp_agreements')
          .select('total_paid, total_price, loan_id')
          .eq('id', selectedHP.id)
          .single();
        if (agr) {
          const newPaid = Number(agr.total_paid) + amt;
          const remaining = Math.max(0, Number(agr.total_price) - newPaid);
          await supabase.from('hp_agreements').update({
            total_paid: newPaid, remaining,
            status: remaining <= 0 ? 'completed' : 'active',
            last_payment_date: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', selectedHP.id);
          await supabase.from('hp_payments').insert({
            agreement_id: selectedHP.id, amount: amt, remaining,
            note: notes || 'Collection payment', collected_by: collector.name,
          });
          if (agr.loan_id) {
            const { data: loan } = await supabase.from('loans').select('outstanding, status').eq('id', agr.loan_id).single();
            if (loan) {
              const newOut = Math.max(0, Number(loan.outstanding) - amt);
              await supabase.from('loans').update({
                outstanding: newOut,
                status: newOut <= 0 ? 'completed' : loan.status,
                last_payment_date: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }).eq('id', agr.loan_id);
            }
          }
        }
      }

      // 6. Record collection
      const { data: collectionData, error: collectionError } = await supabase.from('collections').insert({
        collector_id:   collector.id,
        collector_name: collector.name,
        customer_id:    selectedCustomer.id,
        customer_name:  selectedCustomer.name,
        account_id:     selectedAccount.id,
        amount:         amt,
        notes:          notes || null,
        payment_type:   paymentType,
        loan_id:        paymentType === 'loan' ? selectedLoan?.id : null,
        hp_agreement_id: paymentType === 'hp' ? selectedHP?.id : null,
        status:         'completed',
      }).select().single();
      
      if (collectionError) {
        console.error('Collection insert error:', collectionError);
        // Don't fail - continue to post GL entry
      }

      // 6b. Post to General Ledger
      const narr = `Collection (${paymentType}) — ${selectedCustomer.name} via ${collector.name}`;
      const journalRef = `COL${Date.now()}`;
      
      try {
        // Look up GL account IDs
        const { data: glAccounts } = await supabase
          .from('gl_accounts')
          .select('id, code, name')
          .in('code', ['1000', '2010', '1100']);
        
        if (glAccounts && glAccounts.length > 0) {
          const cashAccount = glAccounts.find(a => a.code === '1000');
          let creditAccount;
          
          if (paymentType === 'savings') {
            creditAccount = glAccounts.find(a => a.code === '2010'); // Savings liability
          } else {
            creditAccount = glAccounts.find(a => a.code === '1100'); // Loan/HP receivable
          }
          
          if (cashAccount && creditAccount) {
            const now = new Date();
            const glEntries = [
              {
                journal_ref: journalRef,
                gl_account_id: cashAccount.id,
                gl_account_code: cashAccount.code,
                gl_account_name: cashAccount.name,
                entry_type: 'debit',
                amount: amt,
                narration: narr,
                source_type: 'collection',
                source_id: collectionData?.id || null,
                transaction_ref: ref,
                posted_by: collector.name,
                period_month: now.getMonth() + 1,
                period_year: now.getFullYear(),
              },
              {
                journal_ref: journalRef,
                gl_account_id: creditAccount.id,
                gl_account_code: creditAccount.code,
                gl_account_name: creditAccount.name,
                entry_type: 'credit',
                amount: amt,
                narration: narr,
                source_type: 'collection',
                source_id: collectionData?.id || null,
                transaction_ref: ref,
                posted_by: collector.name,
                period_month: now.getMonth() + 1,
                period_year: now.getFullYear(),
              },
            ];
            
            await supabase.from('gl_entries').insert(glEntries);
            
            // Update GL account balances
            const { data: cashGL } = await supabase.from('gl_accounts').select('balance').eq('id', cashAccount.id).single();
            if (cashGL) await supabase.from('gl_accounts').update({ balance: Number(cashGL.balance) + amt }).eq('id', cashAccount.id);

            const { data: creditGL } = await supabase.from('gl_accounts').select('balance').eq('id', creditAccount.id).single();
            if (creditGL) {
              const newCreditBal = paymentType === 'savings'
                ? Number(creditGL.balance) + amt
                : Number(creditGL.balance) - amt;
              await supabase.from('gl_accounts').update({ balance: newCreditBal }).eq('id', creditAccount.id);
            }
          }
        }
      } catch (glError) {
        console.error('GL posting error:', glError);
        // Don't fail the transaction if GL posting fails
      }

      // 7. Update collector total_collected
      await supabase.from('collectors').update({
        total_collected: Number(collector.total_collected || 0) + amt,
        updated_at: new Date().toISOString(),
      }).eq('id', collector.id);

      // 8. Notify the customer
      if (acc.customer_id) {
        const GHSfmt = n => `GH₵ ${Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;
        const typeLabel = paymentType === 'savings' ? 'Savings Deposit'
          : paymentType === 'loan' ? 'Loan Repayment' : 'HP Repayment';
        await supabase.from('notifications').insert({
          user_id:   acc.customer_id,
          title:     `💰 ${typeLabel} – ${GHSfmt(amt)}`,
          message:   `${notes || narration}. New balance: ${GHSfmt(newBalance)}.`,
          type:      'success',
          entity:    'transaction',
          read:      false,
        });
      }

      setDone({
        customer:    selectedCustomer.name,
        account:     selectedAccount.account_number,
        amount:      amt,
        paymentType,
        newBalance,
        ref,
        date:        new Date().toLocaleString(),
      });
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to record collection');
    }
    setSaving(false);
  };

  const reset = () => {
    setStep(1); setCustSearch(''); setCustomers([]);
    setSelectedCustomer(null); setSelectedAccount(null);
    setSelectedLoan(null); setSelectedHP(null);
    setPaymentType('savings'); setAmount(''); setNotes('');
    setDone(null);
  };

  // ── Success screen ──────────────────────────────────────────────────────────
  if (done) {
    const pt = PAYMENT_TYPES.find(t => t.key === done.paymentType);
    return (
      <ScrollView contentContainerStyle={styles.successContainer}>
        <View style={[styles.successIcon, { backgroundColor: done.offline ? '#fef9c3' : '#f0fdf4', borderRadius: 40, padding: 12 }]}>
          <Text style={{ fontSize: 40 }}>{done.offline ? '📋' : '✅'}</Text>
        </View>
        <Text style={styles.successTitle}>{done.offline ? 'Saved Offline' : 'Payment Recorded!'}</Text>
        <Text style={styles.successSub}>
          {done.offline
            ? 'No internet connection. This payment is queued and will sync automatically when you go online.'
            : 'Collection saved successfully'}
        </Text>
        <View style={[styles.typeBadge, { backgroundColor: pt?.bg }]}>
          <Text style={[styles.typeBadgeText, { color: pt?.color }]}>{pt?.label}</Text>
        </View>
        <View style={styles.receiptCard}>
          {[
            ['Customer', done.customer],
            ['Account', done.account],
            ['Amount', GHS(done.amount)],
            ['New Balance', GHS(done.newBalance)],
            ['Reference', done.ref],
            ['Date', done.date],
          ].map(([k, v]) => (
            <View key={k} style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>{k}</Text>
              <Text style={styles.receiptValue}>{v}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity style={styles.btn} onPress={reset}>
          <Text style={styles.btnText}>Record Another</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.pageTitle}>Record Collection</Text>

      {/* ── Step 1: Customer Search ── */}
      <View style={styles.stepCard}>
        <Text style={styles.stepLabel}>STEP 1 · CUSTOMER</Text>
        <TextInput
          style={styles.input}
          placeholder="Search by name or phone…"
          placeholderTextColor="#94a3b8"
          value={custSearch}
          onChangeText={setCustSearch}
        />
        {loadingCust && <ActivityIndicator color="#1a56db" style={{ marginTop: 8 }} />}
        {customers.map(c => (
          <TouchableOpacity
            key={c.id}
            style={[styles.listItem, selectedCustomer?.id === c.id && styles.listItemActive]}
            onPress={() => selectCustomer(c)}
          >
            <View style={[styles.avatar, selectedCustomer?.id === c.id && styles.avatarActive]}>
              <Text style={[styles.avatarText, selectedCustomer?.id === c.id && { color: '#fff' }]}>
                {c.name[0].toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.listItemName, selectedCustomer?.id === c.id && { color: '#1a56db' }]}>{c.name}</Text>
              <Text style={styles.listItemSub}>{c.phone}</Text>
            </View>
            {selectedCustomer?.id === c.id && <Text style={{ color: '#1a56db', fontSize: 18 }}>✓</Text>}
          </TouchableOpacity>
        ))}
        {custSearch.length >= 2 && customers.length === 0 && !loadingCust && (
          <Text style={styles.emptyText}>No customers found</Text>
        )}
      </View>

      {/* ── Step 2: Payment Type ── */}
      {selectedCustomer && (
        <View style={styles.stepCard}>
          <Text style={styles.stepLabel}>STEP 2 · PAYMENT TYPE</Text>
          <View style={styles.typeGrid}>
            {PAYMENT_TYPES.map(pt => (
              <TouchableOpacity
                key={pt.key}
                style={[styles.typeBtn, paymentType === pt.key && { borderColor: pt.color, backgroundColor: pt.bg }]}
                onPress={() => selectType(pt.key)}
              >
                <Text style={[styles.typeBtnText, paymentType === pt.key && { color: pt.color }]}>{pt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ── Step 3: Account ── */}
      {selectedCustomer && step >= 3 && (
        <View style={styles.stepCard}>
          <Text style={styles.stepLabel}>STEP 3 · ACCOUNT</Text>
          {accounts.length === 0
            ? <Text style={styles.emptyText}>No active accounts</Text>
            : accounts.map(a => (
              <TouchableOpacity
                key={a.id}
                style={[styles.listItem, selectedAccount?.id === a.id && styles.listItemActive]}
                onPress={() => { setSelectedAccount(a); setStep(paymentType === 'savings' ? 5 : 4); }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.listItemName, selectedAccount?.id === a.id && { color: '#1a56db' }]}>
                    {a.account_number}
                  </Text>
                  <Text style={styles.listItemSub}>{a.type} · {GHS(a.balance)}</Text>
                </View>
                {selectedAccount?.id === a.id && <Text style={{ color: '#1a56db', fontSize: 18 }}>✓</Text>}
              </TouchableOpacity>
            ))}
        </View>
      )}

      {/* ── Step 4a: Loan ── */}
      {selectedCustomer && step >= 4 && paymentType === 'loan' && (
        <View style={styles.stepCard}>
          <Text style={styles.stepLabel}>STEP 4 · SELECT LOAN</Text>
          {loans.length === 0
            ? <Text style={styles.emptyText}>No active loans</Text>
            : loans.map(l => (
              <TouchableOpacity
                key={l.id}
                style={[styles.listItem, selectedLoan?.id === l.id && styles.listItemActive]}
                onPress={() => { setSelectedLoan(l); setStep(5); }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.listItemName, selectedLoan?.id === l.id && { color: '#1d4ed8' }]}>
                    {(l.type || '').replace('_', ' ')}
                  </Text>
                  <Text style={styles.listItemSub}>Outstanding: {GHS(l.outstanding)} · Monthly: {GHS(l.monthly_payment)}</Text>
                </View>
                {selectedLoan?.id === l.id && <Text style={{ color: '#1d4ed8', fontSize: 18 }}>✓</Text>}
              </TouchableOpacity>
            ))}
        </View>
      )}

      {/* ── Step 4b: HP Agreement ── */}
      {selectedCustomer && step >= 4 && paymentType === 'hp' && (
        <View style={styles.stepCard}>
          <Text style={styles.stepLabel}>STEP 4 · SELECT HP AGREEMENT</Text>
          {hpAgreements.length === 0
            ? <Text style={styles.emptyText}>No active HP agreements</Text>
            : hpAgreements.map(a => (
              <TouchableOpacity
                key={a.id}
                style={[styles.listItem, selectedHP?.id === a.id && styles.listItemActive]}
                onPress={() => { setSelectedHP(a); setStep(5); }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.listItemName, selectedHP?.id === a.id && { color: '#7c3aed' }]}>
                    {a.item_name}
                  </Text>
                  <Text style={styles.listItemSub}>Remaining: {GHS(a.remaining)} · Suggested: {GHS(a.suggested_payment)}/{a.payment_frequency}</Text>
                </View>
                {selectedHP?.id === a.id && <Text style={{ color: '#7c3aed', fontSize: 18 }}>✓</Text>}
              </TouchableOpacity>
            ))}
        </View>
      )}

      {/* ── Step 5: Amount ── */}
      {selectedCustomer && step >= 5 && selectedAccount && (
        <View style={styles.stepCard}>
          <Text style={styles.stepLabel}>{paymentType !== 'savings' ? 'STEP 5' : 'STEP 4'} · AMOUNT</Text>
          <TextInput
            style={[styles.input, styles.amountInput]}
            placeholder="0.00"
            placeholderTextColor="#475569"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            autoFocus
          />
          {paymentType === 'loan' && selectedLoan && (
            <Text style={styles.hint}>Outstanding: {GHS(selectedLoan.outstanding)} · Monthly: {GHS(selectedLoan.monthly_payment)}</Text>
          )}
          {paymentType === 'hp' && selectedHP && (
            <Text style={styles.hint}>Remaining: {GHS(selectedHP.remaining)} · Suggested: {GHS(selectedHP.suggested_payment)}</Text>
          )}
          <TextInput
            style={[styles.input, { marginTop: 12 }]}
            placeholder="Notes (optional)…"
            placeholderTextColor="#94a3b8"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={2}
          />
          <TouchableOpacity
            style={[styles.btn, saving && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>
                  {paymentType === 'savings' ? 'Record Savings Deposit'
                    : paymentType === 'loan' ? 'Record Loan Repayment'
                    : 'Record HP Repayment'}
                </Text>}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  pageTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a', marginBottom: 16 },
  stepCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    marginBottom: 14, borderWidth: 1, borderColor: '#e2e8f0',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  stepLabel: { fontSize: 11, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.8, marginBottom: 12, textTransform: 'uppercase' },
  input: {
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 10, padding: 12, color: '#0f172a', fontSize: 15, marginBottom: 8,
  },
  amountInput: { fontSize: 32, fontWeight: '900', textAlign: 'center', padding: 16, color: '#0f172a' },
  listItem: {
    flexDirection: 'row', alignItems: 'center', padding: 12,
    borderRadius: 10, borderWidth: 2, borderColor: '#e2e8f0',
    marginBottom: 8, backgroundColor: '#fff',
  },
  listItemActive: { borderColor: '#1a56db', backgroundColor: '#eff6ff' },
  listItemName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  listItemSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  avatarActive: { backgroundColor: '#1a56db' },
  avatarText: { fontSize: 15, fontWeight: '800', color: '#64748b' },
  typeGrid: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  typeBtn: {
    flex: 1, minWidth: '30%', padding: 12, borderRadius: 10,
    borderWidth: 2, borderColor: '#e2e8f0', alignItems: 'center',
  },
  typeBtnText: { fontSize: 12, fontWeight: '700', color: '#64748b', textAlign: 'center' },
  btn: {
    backgroundColor: '#1a56db', borderRadius: 10,
    padding: 16, alignItems: 'center', marginTop: 8,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 12, color: '#64748b', textAlign: 'center', marginBottom: 4 },
  emptyText: { color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 12 },
  // Success
  successContainer: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#f8fafc' },
  successIcon: { marginBottom: 16 },
  successTitle: { fontSize: 24, fontWeight: '900', color: '#0f172a', marginBottom: 6 },
  successSub: { fontSize: 14, color: '#64748b', marginBottom: 16 },
  typeBadge: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, marginBottom: 20 },
  typeBadgeText: { fontSize: 13, fontWeight: '700' },
  receiptCard: {
    width: '100%', backgroundColor: '#fff', borderRadius: 12,
    padding: 20, marginBottom: 24, borderWidth: 1, borderColor: '#e2e8f0',
  },
  receiptRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  receiptLabel: { fontSize: 13, color: '#64748b' },
  receiptValue: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
});
