import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { supabase } from '../supabase';
import { enqueue, getIsOnline } from '../offline';
import { C, GHS } from '../theme';

const PAYMENT_TYPES = [
  { key: 'savings', label: 'Savings Deposit', icon: '💰', color: C.green,  bg: C.greenLt,  border: C.greenBg  },
  { key: 'loan',    label: 'Loan Repayment',  icon: '📋', color: C.blue,   bg: C.blueLt,   border: C.blueBg   },
  { key: 'hp',      label: 'HP Repayment',    icon: '🛍️', color: C.purple, bg: '#f5f3ff',  border: '#ddd6fe'  },
];

// ── helpers ──────────────────────────────────────────────────────────────────
async function checkApprovalNeeded(paymentType, amt) {
  try {
    const { data } = await supabase
      .from('system_settings').select('value').eq('key', 'approval_rules').single();
    const rules = data?.value || {};
    const key   = paymentType === 'savings' ? 'credit_threshold' : 'debit_threshold';
    const rule  = rules[key];
    return !!(rule?.enabled && (rule.roles || []).includes('collector') && amt >= (rule.amount || 0));
  } catch (_) { return false; }
}

async function postDirectly(opData, collector) {
  const { accountId, customerId, customerName, amount, paymentType,
          loanId, hpAgreementId, notes, collectorName } = opData;

  const { data: acc } = await supabase.from('accounts')
    .select('balance, customer_id').eq('id', accountId).single();
  if (!acc) throw new Error('Account not found');

  const isSavings  = paymentType === 'savings';
  const newBalance = isSavings ? Number(acc.balance) + amount : Number(acc.balance);
  const ref        = `TXN${Date.now()}${Math.random().toString(36).slice(2,5).toUpperCase()}`;
  const narration  = notes || (isSavings
    ? `Savings Deposit — ${collectorName}`
    : paymentType === 'loan'
      ? `Loan Repayment (via ${collectorName})`
      : `HP Repayment (via ${collectorName})`);

  await supabase.from('transactions').insert({
    account_id: accountId, type: isSavings ? 'credit' : 'debit',
    amount, narration, reference: ref, balance_after: newBalance,
    channel: 'collection', status: 'completed', poster_name: collectorName,
    created_by: null,
    loan_id:          paymentType === 'loan' ? loanId : null,
    hp_agreement_id:  paymentType === 'hp'   ? hpAgreementId : null,
  });

  if (isSavings) {
    await supabase.from('accounts')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('id', accountId);
  }

  if (paymentType === 'loan' && loanId) {
    const { data: loan } = await supabase.from('loans')
      .select('outstanding, status').eq('id', loanId).single();
    if (loan) {
      const newOut = Math.max(0, Number(loan.outstanding) - amount);
      await supabase.from('loans').update({
        outstanding: newOut, status: newOut <= 0 ? 'completed' : loan.status,
        last_payment_date: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', loanId);
    }
  }

  if (paymentType === 'hp' && hpAgreementId) {
    const { data: agr } = await supabase.from('hp_agreements')
      .select('total_paid, total_price, loan_id').eq('id', hpAgreementId).single();
    if (agr) {
      const newPaid = Number(agr.total_paid) + amount;
      const remaining = Math.max(0, Number(agr.total_price) - newPaid);
      await supabase.from('hp_agreements').update({
        total_paid: newPaid, remaining,
        status: remaining <= 0 ? 'completed' : 'active',
        last_payment_date: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', hpAgreementId);
      await supabase.from('hp_payments').insert({
        agreement_id: hpAgreementId, amount: remaining,
        note: notes || 'Collection payment', collected_by: collectorName,
      });
      const linkedLoanId = agr.loan_id;
      if (linkedLoanId) {
        const { data: l } = await supabase.from('loans')
          .select('outstanding, status').eq('id', linkedLoanId).single();
        if (l) {
          const newOut = Math.max(0, Number(l.outstanding) - amount);
          await supabase.from('loans').update({
            outstanding: newOut, status: newOut <= 0 ? 'completed' : l.status,
            last_payment_date: new Date().toISOString(), updated_at: new Date().toISOString(),
          }).eq('id', linkedLoanId);
        }
      }
    }
  }

  const { data: col } = await supabase.from('collections').insert({
    collector_id: collector.id, collector_name: collectorName,
    customer_id: customerId, customer_name: customerName,
    account_id: accountId, amount, notes: notes || null,
    payment_type: paymentType,
    loan_id:          paymentType === 'loan' ? loanId : null,
    hp_agreement_id:  paymentType === 'hp'   ? hpAgreementId : null,
    status: 'completed',
  }).select().single();

  await supabase.from('collectors').update({
    total_collected: Number(collector.total_collected || 0) + amount,
    updated_at: new Date().toISOString(),
  }).eq('id', collector.id);

  return { ref, newBalance: isSavings ? newBalance : null };
}

export default function CreditScreen({ collector, onDone }) {
  const [step,             setStep]             = useState(1);
  const [custSearch,       setCustSearch]       = useState('');
  const [customers,        setCustomers]        = useState([]);
  const [loadingCust,      setLoadingCust]      = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [paymentType,      setPaymentType]      = useState('savings');
  const [accounts,         setAccounts]         = useState([]);
  const [selectedAccount,  setSelectedAccount]  = useState(null);
  const [loans,            setLoans]            = useState([]);
  const [selectedLoan,     setSelectedLoan]     = useState(null);
  const [hpAgreements,     setHpAgreements]     = useState([]);
  const [selectedHP,       setSelectedHP]       = useState(null);
  const [amount,           setAmount]           = useState('');
  const [notes,            setNotes]            = useState('');
  const [saving,           setSaving]           = useState(false);
  const [done,             setDone]             = useState(null);

  const searchCustomers = useCallback(async (q) => {
    if (!q || q.length < 2) { setCustomers([]); return; }
    setLoadingCust(true);
    try {
      const { data: accData } = await supabase.from('accounts')
        .select('customer_id').ilike('account_number', `%${q}%`).eq('status', 'active').limit(10);
      const accIds = (accData || []).map(a => a.customer_id).filter(Boolean);
      const { data: byName } = await supabase.from('customers')
        .select('id, name, phone').or(`name.ilike.%${q}%,phone.ilike.%${q}%`).limit(20);
      const nameIds = new Set((byName || []).map(c => c.id));
      let extra = [];
      const newIds = accIds.filter(id => !nameIds.has(id));
      if (newIds.length) {
        const { data: byAcc } = await supabase.from('customers')
          .select('id, name, phone').in('id', newIds);
        extra = byAcc || [];
      }
      setCustomers([...(byName || []), ...extra]);
    } catch (_) {}
    setLoadingCust(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchCustomers(custSearch), 400);
    return () => clearTimeout(t);
  }, [custSearch, searchCustomers]);

  const selectCustomer = async (c) => {
    setSelectedCustomer(c); setSelectedAccount(null);
    setSelectedLoan(null); setSelectedHP(null);
    const { data } = await supabase.from('accounts')
      .select('id, account_number, type, balance').eq('customer_id', c.id).eq('status', 'active');
    setAccounts(data || []);
    setStep(2);
  };

  const selectType = async (type) => {
    setPaymentType(type); setSelectedLoan(null); setSelectedHP(null);
    if (type === 'loan') {
      const { data } = await supabase.from('loans')
        .select('id, type, outstanding, monthly_payment, status')
        .eq('customer_id', selectedCustomer.id).in('status', ['active', 'overdue']);
      setLoans(data || []);
    } else if (type === 'hp') {
      const { data } = await supabase.from('hp_agreements')
        .select('id, item_name, remaining, suggested_payment, payment_frequency, loan_id, total_paid, total_price')
        .eq('customer_id', selectedCustomer.id).eq('status', 'active');
      setHpAgreements(data || []);
    }
    setStep(3);
  };

  const reset = () => {
    setStep(1); setCustSearch(''); setCustomers([]);
    setSelectedCustomer(null); setSelectedAccount(null);
    setSelectedLoan(null); setSelectedHP(null);
    setPaymentType('savings'); setAmount(''); setNotes(''); setDone(null);
  };

  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { Alert.alert('Error', 'Enter a valid amount'); return; }
    if (!selectedAccount)  { Alert.alert('Error', 'Select an account'); return; }
    if (paymentType === 'loan' && !selectedLoan) { Alert.alert('Error', 'Select a loan'); return; }
    if (paymentType === 'hp'   && !selectedHP)   { Alert.alert('Error', 'Select an HP agreement'); return; }

    setSaving(true);
    try {
      const opData = {
        collectorId:   collector.id,
        collectorName: collector.name,
        customerId:    selectedCustomer.id,
        customerName:  selectedCustomer.name,
        accountId:     selectedAccount.id,
        amount:        amt,
        notes:         notes || null,
        paymentType,
        loanId:        paymentType === 'loan' ? selectedLoan?.id : null,
        hpAgreementId: paymentType === 'hp'   ? selectedHP?.id   : null,
      };

      // ── OFFLINE ──────────────────────────────────────────────────────────
      if (!getIsOnline()) {
        await enqueue({ type: 'collection', data: opData });
        setDone({ status: 'offline', amount: amt, paymentType,
          customer: selectedCustomer.name, account: selectedAccount.account_number,
          ref: 'QUEUED-' + Date.now() });
        setSaving(false);
        return;
      }

      // ── Check approval threshold ──────────────────────────────────────────
      const needsApproval = await checkApprovalNeeded(paymentType, amt);

      if (needsApproval) {
        // Submit to pending_transactions (same table as teller) so it shows in web Approvals
        const narration = notes || (paymentType === 'savings'
          ? `Savings Deposit — ${collector.name}`
          : paymentType === 'loan'
            ? `Loan Repayment (via ${collector.name})`
            : `HP Repayment (via ${collector.name})`);

        const { error } = await supabase.from('pending_transactions').insert({
          account_id:     selectedAccount.id,
          type:           paymentType === 'savings' ? 'credit' : 'debit',
          amount:         amt,
          narration,
          channel:        'collection',
          submitted_by:   collector.id,
          submitter_name: collector.name,
          status:         'pending',
          submitted_at:   new Date().toISOString(),
        });
        if (error) throw new Error(error.message);

        setDone({ status: 'pending', amount: amt, paymentType,
          customer: selectedCustomer.name, account: selectedAccount.account_number,
          ref: 'PENDING-APPROVAL' });
        setSaving(false);
        return;
      }

      // ── Post directly ─────────────────────────────────────────────────────
      const { ref, newBalance } = await postDirectly(opData, collector);
      setDone({ status: 'posted', amount: amt, paymentType,
        customer: selectedCustomer.name, account: selectedAccount.account_number,
        newBalance, ref });

    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to record collection');
    }
    setSaving(false);
  };

  // ── Success screen ────────────────────────────────────────────────────────
  if (done) {
    const icons = { posted: '✅', pending: '⏳', offline: '📋' };
    const titles = { posted: 'Payment Recorded!', pending: 'Awaiting Approval', offline: 'Saved Offline' };
    const msgs = {
      posted:  'Collection saved and posted successfully.',
      pending: 'This payment exceeds the approval limit. It will post once a manager approves.',
      offline: 'No internet. This payment is queued and will sync when you go online.',
    };
    const bgColors = { posted: C.greenLt, pending: C.amberLt, offline: '#fef9c3' };
    const pt = PAYMENT_TYPES.find(t => t.key === done.paymentType);
    return (
      <ScrollView contentContainerStyle={S.successWrap}>
        <View style={[S.successIconBox, { backgroundColor: bgColors[done.status] }]}>
          <Text style={{ fontSize: 52 }}>{icons[done.status]}</Text>
        </View>
        <Text style={S.successTitle}>{titles[done.status]}</Text>
        <Text style={S.successMsg}>{msgs[done.status]}</Text>

        <View style={[S.typeBadge, { backgroundColor: pt?.bg, borderColor: pt?.border }]}>
          <Text style={{ fontSize: 16 }}>{pt?.icon}</Text>
          <Text style={[S.typeBadgeTxt, { color: pt?.color }]}>{pt?.label}</Text>
        </View>

        <View style={S.receipt}>
          {[
            ['Customer',    done.customer],
            ['Account',     done.account],
            ['Amount',      GHS(done.amount)],
            done.newBalance != null ? ['New Balance', GHS(done.newBalance)] : ['Applied To', done.paymentType === 'loan' ? 'Loan Outstanding' : 'HP Agreement'],
            ['Reference',   done.ref],
            ['Date',        new Date().toLocaleString()],
          ].map(([k, v]) => (
            <View key={k} style={S.receiptRow}>
              <Text style={S.receiptKey}>{k}</Text>
              <Text style={S.receiptVal}>{v}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={S.doneBtn} onPress={reset}>
          <Text style={S.doneBtnTxt}>Record Another</Text>
        </TouchableOpacity>
        {onDone && (
          <TouchableOpacity style={S.doneBtnGhost} onPress={onDone}>
            <Text style={S.doneBtnGhostTxt}>Back to Dashboard</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    );
  }

  // ── Step progress bar ─────────────────────────────────────────────────────
  const stepLabels = paymentType === 'savings'
    ? ['Customer', 'Type', 'Account', 'Amount']
    : ['Customer', 'Type', 'Account', paymentType === 'loan' ? 'Loan' : 'HP', 'Amount'];
  const totalSteps = stepLabels.length;

  return (
    <ScrollView style={S.root} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

      {/* Page title */}
      <Text style={S.pageTitle}>Record Collection</Text>

      {/* Step bar */}
      {selectedCustomer && (
        <View style={S.stepBar}>
          {stepLabels.map((label, i) => {
            const n = i + 1;
            const isDone   = step > n;
            const isActive = step === n;
            return (
              <React.Fragment key={label}>
                <View style={S.stepItem}>
                  <View style={[S.stepDot,
                    isDone   && { backgroundColor: C.green,  borderColor: C.green  },
                    isActive && { backgroundColor: C.brand,  borderColor: C.brand  },
                  ]}>
                    <Text style={[S.stepNum, (isDone || isActive) && { color: '#fff' }]}>
                      {isDone ? '✓' : n}
                    </Text>
                  </View>
                  <Text style={[S.stepLabel, isActive && { color: C.brand, fontWeight: '700' }]}>{label}</Text>
                </View>
                {i < totalSteps - 1 && (
                  <View style={[S.stepLine, isDone && { backgroundColor: C.green }]} />
                )}
              </React.Fragment>
            );
          })}
        </View>
      )}

      {/* ── STEP 1: Customer ── */}
      <View style={S.card}>
        <Text style={S.cardLabel}>STEP 1 · CUSTOMER</Text>
        <View style={S.searchRow}>
          <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
          <TextInput style={S.searchInput} placeholder="Name, phone or account number…"
            placeholderTextColor={C.text4} value={custSearch} onChangeText={setCustSearch} />
        </View>
        {loadingCust && <ActivityIndicator color={C.brand} style={{ marginTop: 8 }} />}
        {customers.map(c => (
          <TouchableOpacity key={c.id}
            style={[S.listItem, selectedCustomer?.id === c.id && S.listItemActive]}
            onPress={() => selectCustomer(c)}>
            <View style={[S.avatar, selectedCustomer?.id === c.id && { backgroundColor: C.brand }]}>
              <Text style={[S.avatarTxt, selectedCustomer?.id === c.id && { color: '#fff' }]}>
                {c.name[0].toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[S.listName, selectedCustomer?.id === c.id && { color: C.brand }]}>{c.name}</Text>
              <Text style={S.listSub}>{c.phone}</Text>
            </View>
            {selectedCustomer?.id === c.id && <Text style={{ color: C.brand, fontSize: 18 }}>✓</Text>}
          </TouchableOpacity>
        ))}
        {custSearch.length >= 2 && customers.length === 0 && !loadingCust && (
          <Text style={S.emptyTxt}>No customers found</Text>
        )}
        {selectedCustomer && customers.length === 0 && (
          <View style={S.selectedBox}>
            <Text style={S.selectedName}>✓ {selectedCustomer.name}</Text>
            <Text style={S.selectedSub}>{selectedCustomer.phone}</Text>
            <TouchableOpacity onPress={() => { setSelectedCustomer(null); setCustSearch(''); setStep(1); }}>
              <Text style={{ color: C.red, fontSize: 12, fontWeight: '700', marginTop: 4 }}>Change</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── STEP 2: Payment Type ── */}
      {selectedCustomer && (
        <View style={S.card}>
          <Text style={S.cardLabel}>STEP 2 · PAYMENT TYPE</Text>
          <View style={S.typeGrid}>
            {PAYMENT_TYPES.map(pt => (
              <TouchableOpacity key={pt.key}
                style={[S.typeBtn, paymentType === pt.key && { borderColor: pt.color, backgroundColor: pt.bg }]}
                onPress={() => selectType(pt.key)}>
                <Text style={{ fontSize: 24, marginBottom: 4 }}>{pt.icon}</Text>
                <Text style={[S.typeBtnTxt, paymentType === pt.key && { color: pt.color, fontWeight: '800' }]}>
                  {pt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ── STEP 3: Account ── */}
      {selectedCustomer && step >= 3 && (
        <View style={S.card}>
          <Text style={S.cardLabel}>STEP 3 · ACCOUNT</Text>
          {accounts.length === 0
            ? <Text style={S.emptyTxt}>No active accounts</Text>
            : accounts.map(a => (
              <TouchableOpacity key={a.id}
                style={[S.listItem, selectedAccount?.id === a.id && S.listItemActive]}
                onPress={() => { setSelectedAccount(a); setStep(paymentType === 'savings' ? 5 : 4); }}>
                <View style={{ flex: 1 }}>
                  <Text style={[S.listName, selectedAccount?.id === a.id && { color: C.brand }]}>
                    {a.account_number}
                  </Text>
                  <Text style={S.listSub}>{(a.type || '').replace(/_/g, ' ')} · {GHS(a.balance)}</Text>
                </View>
                {selectedAccount?.id === a.id && <Text style={{ color: C.brand, fontSize: 18 }}>✓</Text>}
              </TouchableOpacity>
            ))}
        </View>
      )}

      {/* ── STEP 4a: Loan ── */}
      {selectedCustomer && step >= 4 && paymentType === 'loan' && (
        <View style={S.card}>
          <Text style={S.cardLabel}>STEP 4 · SELECT LOAN</Text>
          {loans.length === 0
            ? <Text style={S.emptyTxt}>No active loans</Text>
            : loans.map(l => (
              <TouchableOpacity key={l.id}
                style={[S.listItem, selectedLoan?.id === l.id && S.listItemActive]}
                onPress={() => { setSelectedLoan(l); setStep(5); }}>
                <View style={{ flex: 1 }}>
                  <Text style={[S.listName, selectedLoan?.id === l.id && { color: C.blue }]}>
                    {(l.type || '').replace(/_/g, ' ')}
                  </Text>
                  <Text style={S.listSub}>
                    Outstanding: {GHS(l.outstanding)} · Monthly: {GHS(l.monthly_payment)}
                  </Text>
                </View>
                {selectedLoan?.id === l.id && <Text style={{ color: C.blue, fontSize: 18 }}>✓</Text>}
              </TouchableOpacity>
            ))}
        </View>
      )}

      {/* ── STEP 4b: HP ── */}
      {selectedCustomer && step >= 4 && paymentType === 'hp' && (
        <View style={S.card}>
          <Text style={S.cardLabel}>STEP 4 · SELECT HP AGREEMENT</Text>
          {hpAgreements.length === 0
            ? <Text style={S.emptyTxt}>No active HP agreements</Text>
            : hpAgreements.map(a => (
              <TouchableOpacity key={a.id}
                style={[S.listItem, selectedHP?.id === a.id && S.listItemActive]}
                onPress={() => { setSelectedHP(a); setStep(5); }}>
                <View style={{ flex: 1 }}>
                  <Text style={[S.listName, selectedHP?.id === a.id && { color: C.purple }]}>
                    {a.item_name}
                  </Text>
                  <Text style={S.listSub}>
                    Remaining: {GHS(a.remaining)} · Suggested: {GHS(a.suggested_payment)}/{a.payment_frequency}
                  </Text>
                </View>
                {selectedHP?.id === a.id && <Text style={{ color: C.purple, fontSize: 18 }}>✓</Text>}
              </TouchableOpacity>
            ))}
        </View>
      )}

      {/* ── STEP 5: Amount ── */}
      {selectedCustomer && step >= 5 && selectedAccount && (
        <View style={S.card}>
          <Text style={S.cardLabel}>{paymentType !== 'savings' ? 'STEP 5' : 'STEP 4'} · AMOUNT</Text>

          {/* Balance preview */}
          <View style={S.balBox}>
            <Text style={S.balLabel}>Account Balance</Text>
            <Text style={S.balAmt}>{GHS(selectedAccount.balance)}</Text>
            <Text style={S.balAcct}>{selectedAccount.account_number}</Text>
          </View>

          <TextInput style={S.amountInput} placeholder="0.00" placeholderTextColor={C.text3}
            value={amount} onChangeText={setAmount} keyboardType="decimal-pad" autoFocus />

          {/* Quick fill */}
          {paymentType === 'loan' && selectedLoan && (
            <View style={S.quickRow}>
              <Text style={S.quickLabel}>Quick fill:</Text>
              {[selectedLoan.monthly_payment, selectedLoan.outstanding]
                .filter(v => v > 0)
                .map((v, i) => (
                  <TouchableOpacity key={i} style={S.quickBtn} onPress={() => setAmount(String(v))}>
                    <Text style={S.quickBtnTxt}>{i === 0 ? 'Monthly' : 'Full'} {GHS(v)}</Text>
                  </TouchableOpacity>
                ))}
            </View>
          )}
          {paymentType === 'hp' && selectedHP && (
            <View style={S.quickRow}>
              <Text style={S.quickLabel}>Quick fill:</Text>
              {[selectedHP.suggested_payment, selectedHP.remaining]
                .filter(v => v > 0)
                .map((v, i) => (
                  <TouchableOpacity key={i} style={S.quickBtn} onPress={() => setAmount(String(v))}>
                    <Text style={S.quickBtnTxt}>{i === 0 ? 'Suggested' : 'Full'} {GHS(v)}</Text>
                  </TouchableOpacity>
                ))}
            </View>
          )}

          <TextInput style={[S.input, { marginTop: 12 }]} placeholder="Notes (optional)"
            placeholderTextColor={C.text4} value={notes} onChangeText={setNotes} multiline />

          <TouchableOpacity style={[S.submitBtn, saving && { opacity: 0.6 }]}
            onPress={handleSubmit} disabled={saving}>
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={S.submitBtnTxt}>
                  {paymentType === 'savings' ? '💰 Record Deposit' : paymentType === 'loan' ? '📋 Record Repayment' : '🛍️ Record HP Payment'}
                </Text>}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const S = StyleSheet.create({
  root:          { flex: 1, backgroundColor: C.bg },
  pageTitle:     { fontSize: 24, fontWeight: '900', color: C.text, marginBottom: 16 },

  // Step bar
  stepBar:       { flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingHorizontal: 4 },
  stepItem:      { alignItems: 'center' },
  stepDot:       { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: C.border, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  stepNum:       { fontSize: 11, fontWeight: '800', color: C.text4 },
  stepLabel:     { fontSize: 10, color: C.text4, fontWeight: '600', marginTop: 4 },
  stepLine:      { flex: 1, height: 2, backgroundColor: C.border, marginHorizontal: 4, marginBottom: 14 },

  // Cards
  card:          { backgroundColor: C.white, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border, ...C.shadowSm },
  cardLabel:     { fontSize: 11, fontWeight: '800', color: C.text4, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14 },

  // Search
  searchRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, marginBottom: 10 },
  searchInput:   { flex: 1, paddingVertical: 11, fontSize: 14, color: C.text },

  // List items
  listItem:      { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, marginBottom: 8, backgroundColor: C.white },
  listItemActive:{ borderColor: C.brand, backgroundColor: C.brandLt },
  avatar:        { width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarTxt:     { fontSize: 15, fontWeight: '800', color: C.text3 },
  listName:      { fontSize: 14, fontWeight: '700', color: C.text },
  listSub:       { fontSize: 12, color: C.text3, marginTop: 2, textTransform: 'capitalize' },
  emptyTxt:      { fontSize: 13, color: C.text4, textAlign: 'center', paddingVertical: 12 },

  selectedBox:   { backgroundColor: C.greenLt, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.greenBg },
  selectedName:  { fontSize: 14, fontWeight: '800', color: C.green },
  selectedSub:   { fontSize: 12, color: C.text3, marginTop: 2 },

  // Payment type grid
  typeGrid:      { flexDirection: 'row', gap: 10 },
  typeBtn:       { flex: 1, alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 2, borderColor: C.border, backgroundColor: C.white },
  typeBtnTxt:    { fontSize: 12, fontWeight: '700', color: C.text3, textAlign: 'center' },

  // Balance box
  balBox:        { backgroundColor: C.bg, borderRadius: 12, padding: 14, marginBottom: 14, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  balLabel:      { fontSize: 11, fontWeight: '700', color: C.text4, textTransform: 'uppercase', letterSpacing: 0.5 },
  balAmt:        { fontSize: 28, fontWeight: '900', color: C.text, marginTop: 4 },
  balAcct:       { fontSize: 12, color: C.text4, marginTop: 2, fontFamily: 'monospace' },

  // Amount input
  amountInput:   { backgroundColor: C.bg, borderWidth: 2, borderColor: C.brand, borderRadius: 14, padding: 16, fontSize: 32, fontWeight: '900', textAlign: 'center', color: C.text, marginBottom: 8 },
  input:         { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, fontSize: 14, color: C.text },

  // Quick fill
  quickRow:      { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  quickLabel:    { fontSize: 12, color: C.text4, fontWeight: '600' },
  quickBtn:      { backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: C.border },
  quickBtnTxt:   { fontSize: 12, fontWeight: '700', color: C.text2 },

  // Submit
  submitBtn:     { backgroundColor: C.brand, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  submitBtnTxt:  { color: '#fff', fontSize: 16, fontWeight: '800' },

  // Success
  successWrap:   { flexGrow: 1, alignItems: 'center', padding: 24, paddingTop: 48 },
  successIconBox:{ width: 100, height: 100, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  successTitle:  { fontSize: 24, fontWeight: '900', color: C.text, marginBottom: 8, textAlign: 'center' },
  successMsg:    { fontSize: 14, color: C.text3, textAlign: 'center', lineHeight: 20, marginBottom: 20, paddingHorizontal: 16 },
  typeBadge:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginBottom: 24 },
  typeBadgeTxt:  { fontSize: 14, fontWeight: '700' },
  receipt:       { width: '100%', backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: 24 },
  receiptRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.borderLt },
  receiptKey:    { fontSize: 12, color: C.text4, fontWeight: '600' },
  receiptVal:    { fontSize: 13, fontWeight: '700', color: C.text, maxWidth: '60%', textAlign: 'right' },
  doneBtn:       { backgroundColor: C.brand, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40, marginBottom: 12 },
  doneBtnTxt:    { color: '#fff', fontSize: 16, fontWeight: '800' },
  doneBtnGhost:  { paddingVertical: 10 },
  doneBtnGhostTxt: { color: C.text3, fontSize: 14, fontWeight: '600' },
});
