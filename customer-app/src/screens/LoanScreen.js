import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Modal } from 'react-native';
import { supabase } from '../supabase';
import { C, GHS, fmtDate } from '../theme';

const r2 = n => Math.round(n * 100) / 100;

function calcLoan(loan) {
  const principal = Number(loan.amount || 0);
  const rate = Number(loan.interest_rate || 0);
  const tenure = Number(loan.tenure || 0);
  const monthlyPmt = Number(loan.monthly_payment || 0);
  const outstanding = Number(loan.outstanding || 0);
  const mr = rate / 100 / 12;
  let installment = monthlyPmt;
  if (!installment && principal > 0 && tenure > 0)
    installment = mr > 0 ? r2(principal * mr / (1 - Math.pow(1 + mr, -tenure))) : r2(principal / tenure);
  const totalRepayable = tenure > 0 ? r2(installment * tenure) : principal;
  const totalInterest = r2(Math.max(0, totalRepayable - principal));
  const totalPaid = r2(Math.max(0, totalRepayable - outstanding));
  const rows = [];
  let bal = outstanding;
  let date = loan.next_due_date ? new Date(loan.next_due_date) : new Date();
  for (let i = 0; i < 12; i++) {
    if (bal <= 0.005) break;
    const interest = r2(bal * mr);
    const princ = r2(Math.min(installment - interest, bal));
    bal = r2(Math.max(0, bal - princ));
    rows.push({ index: i + 1, date: new Date(date), principal: princ, interest, payment: r2(princ + interest), remaining: bal });
    const d = new Date(date); d.setMonth(d.getMonth() + 1); date = d;
  }
  return { installment, totalRepayable, totalInterest, totalPaid, rows };
}

const loanName = t => (t || 'Loan').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export default function LoanScreen({ customer, tick }) {
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);
  const firstLoad = useRef(true);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else if (firstLoad.current) setLoading(true);
    const { data } = await supabase.from('loans')
      .select('id,type,amount,outstanding,monthly_payment,status,next_due_date,disbursed_at,interest_rate,tenure,purpose,last_payment_date')
      .eq('customer_id', customer.id).order('created_at', { ascending: false });
    setLoans(data || []);
    if (refresh) setRefreshing(false); else { setLoading(false); firstLoad.current = false; }
  }, [customer.id, tick]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={S.center}><ActivityIndicator color={C.brand} size="large" /></View>;

  const active = loans.filter(l => ['active', 'overdue'].includes(l.status));
  const history = loans.filter(l => !['active', 'overdue'].includes(l.status));

  return (
    <>
      <ScrollView style={S.root} contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
        showsVerticalScrollIndicator={false}>

        <View style={S.pageHeader}>
          <Text style={S.pageTitle}>My Loans</Text>
          <View style={S.countPill}>
            <Text style={S.countTxt}>{active.length} active</Text>
          </View>
        </View>

        {loans.length === 0 ? (
          <View style={S.empty}>
            <Text style={{ fontSize: 52, marginBottom: 16 }}>📋</Text>
            <Text style={S.emptyTitle}>No Loans</Text>
            <Text style={S.emptyHint}>You have no loan records</Text>
          </View>
        ) : (
          <View style={{ padding: 16 }}>
            {active.length > 0 && (
              <>
                <Text style={S.groupLabel}>Active</Text>
                {active.map(l => <LoanCard key={l.id} loan={l} onPress={() => setSelected(l)} />)}
              </>
            )}
            {history.length > 0 && (
              <>
                <Text style={[S.groupLabel, { marginTop: 20 }]}>History</Text>
                {history.map(l => <LoanCard key={l.id} loan={l} onPress={() => setSelected(l)} />)}
              </>
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        {selected && <LoanDetail loan={selected} onClose={() => setSelected(null)} />}
      </Modal>
    </>
  );
}

function LoanCard({ loan, onPress }) {
  const { installment, totalRepayable, totalPaid } = calcLoan(loan);
  const outstanding = Number(loan.outstanding || 0);
  const pct = totalRepayable > 0 ? Math.min(100, (totalPaid / totalRepayable) * 100) : 0;
  const overdue = loan.status === 'overdue';
  const completed = loan.status === 'completed';
  const barColor = completed ? C.green : overdue ? C.red : C.brand;

  return (
    <TouchableOpacity style={[S.card, overdue && { borderColor: C.red }]} onPress={onPress} activeOpacity={0.87}>
      <View style={S.cardHead}>
        <View style={[S.cardIcon, { backgroundColor: completed ? C.greenLt : overdue ? C.redLt : C.greenLt }]}>
          <Text style={{ fontSize: 22 }}>{completed ? '✅' : overdue ? '⚠️' : '📋'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={S.cardType}>{loanName(loan.type)}</Text>
          {loan.next_due_date && !completed && (
            <Text style={[S.cardDue, overdue && { color: C.red }]}>
              {overdue ? '⚠️ Overdue · ' : 'Due: '}{fmtDate(loan.next_due_date, { day: 'numeric', month: 'short' })}
            </Text>
          )}
        </View>
        <View style={[S.badge, { backgroundColor: completed ? C.greenBg : overdue ? C.redBg : C.blueBg }]}>
          <Text style={[S.badgeTxt, { color: completed ? C.green : overdue ? C.red : C.blue }]}>
            {(loan.status || '').toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={S.progTrack}>
        <View style={[S.progFill, { width: pct + '%', backgroundColor: barColor }]} />
      </View>
      <View style={S.progRow}>
        <Text style={S.progTxt}>{GHS(totalPaid)} repaid</Text>
        <Text style={S.progTxt}>{pct.toFixed(0)}%</Text>
      </View>

      <View style={S.statsGrid}>
        {[
          ['Principal', GHS(Number(loan.amount || 0)), C.text],
          ['Outstanding', GHS(outstanding), overdue ? C.red : '#c2410c'],
          ['Installment', GHS(installment), C.brand],
          ['Total Repayable', GHS(totalRepayable), C.text3],
        ].map(([l, v, col]) => (
          <View key={l} style={S.statBox}>
            <Text style={S.statLabel}>{l}</Text>
            <Text style={[S.statVal, { color: col }]}>{v}</Text>
          </View>
        ))}
      </View>
      <Text style={S.tapHint}>Tap for schedule & history →</Text>
    </TouchableOpacity>
  );
}

function LoanDetail({ loan, onClose }) {
  const [payments, setPayments] = useState([]);
  const [loadingPay, setLoadingPay] = useState(true);
  const [tab, setTab] = useState('schedule');
  const { installment, totalRepayable, totalInterest, totalPaid, rows } = calcLoan(loan);
  const principal = Number(loan.amount || 0);
  const outstanding = Number(loan.outstanding || 0);
  const pct = totalRepayable > 0 ? Math.min(100, (totalPaid / totalRepayable) * 100) : 0;
  const overdue = loan.status === 'overdue';
  const completed = loan.status === 'completed';
  const headerBg = completed ? C.greenDk : overdue ? C.redDk : C.brand;

  useEffect(() => {
    supabase.from('collections').select('id,amount,created_at,notes,collector_name')
      .eq('loan_id', loan.id).order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { setPayments(data || []); setLoadingPay(false); });
  }, [loan.id]);

  return (
    <View style={D.root}>
      <View style={[D.header, { backgroundColor: headerBg }]}>
        <View style={D.decor} />
        <TouchableOpacity onPress={onClose} style={D.closeBtn}>
          <Text style={D.closeTxt}>✕  Close</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 32, marginBottom: 8 }}>{completed ? '✅' : overdue ? '⚠️' : '📋'}</Text>
        <Text style={D.headerType}>{loanName(loan.type)}</Text>
        <Text style={D.headerBal}>{GHS(outstanding)}</Text>
        <Text style={D.headerBalLabel}>Outstanding Balance</Text>
        <View style={D.progTrack}>
          <View style={[D.progFill, { width: pct + '%' }]} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <Text style={D.progLabel}>{GHS(totalPaid)} paid</Text>
          <Text style={D.progLabel}>{pct.toFixed(0)}% complete</Text>
        </View>
      </View>

      <View style={D.summaryRow}>
        {[['Principal', GHS(principal), C.text], ['Interest', GHS(totalInterest), C.amber], ['Total', GHS(totalRepayable), C.brand], ['Paid', GHS(totalPaid), C.green]].map(([l, v, col], i) => (
          <View key={l} style={[D.sumBox, i < 3 && { borderRightWidth: 1, borderRightColor: C.borderLt }]}>
            <Text style={D.sumLabel}>{l}</Text>
            <Text style={[D.sumVal, { color: col }]}>{v}</Text>
          </View>
        ))}
      </View>

      <View style={D.tabs}>
        {[['schedule', '📅 Schedule'], ['history', '💳 Payments'], ['details', '📄 Details']].map(([k, lbl]) => (
          <TouchableOpacity key={k} style={[D.tab, tab === k && D.tabActive]} onPress={() => setTab(k)}>
            <Text style={[D.tabTxt, tab === k && D.tabTxtActive]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {tab === 'schedule' && (
          rows.length === 0 ? (
            <View style={D.empty}><Text style={{ fontSize: 32, marginBottom: 10 }}>✅</Text><Text style={D.emptyTxt}>Loan fully repaid</Text></View>
          ) : rows.map((row, i) => {
            const isNext = i === 0;
            return (
              <View key={i} style={[D.schedRow, isNext && D.schedRowNext]}>
                <View style={[D.schedNum, isNext && { backgroundColor: C.brand }]}>
                  <Text style={[D.schedNumTxt, isNext && { color: '#fff' }]}>{row.index}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[D.schedDate, isNext && { color: C.brand, fontWeight: '800' }]}>
                    {isNext ? 'Next Payment' : fmtDate(row.date, { weekday: 'short', day: 'numeric', month: 'short' })}
                  </Text>
                  <Text style={D.schedSub}>Principal: {GHS(row.principal)} · Interest: {GHS(row.interest)}</Text>
                  <Text style={D.schedBal}>Balance after: {GHS(row.remaining)}</Text>
                </View>
                <Text style={[D.schedAmt, isNext && { color: C.brand }]}>{GHS(row.payment)}</Text>
              </View>
            );
          })
        )}

        {tab === 'history' && (
          loadingPay ? <ActivityIndicator color={C.brand} style={{ marginTop: 32 }} /> :
          payments.length === 0 ? (
            <View style={D.empty}><Text style={{ fontSize: 32, marginBottom: 10 }}>💳</Text><Text style={D.emptyTxt}>No payments yet</Text></View>
          ) : payments.map(p => (
            <View key={p.id} style={D.payRow}>
              <View style={D.payIcon}><Text style={{ fontSize: 20 }}>💳</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={D.payNarr}>{p.notes || 'Loan Repayment'}</Text>
                <Text style={D.payMeta}>{p.collector_name ? 'via ' + p.collector_name + ' · ' : ''}{fmtDate(p.created_at)}</Text>
              </View>
              <Text style={D.payAmt}>+{GHS(p.amount)}</Text>
            </View>
          ))
        )}

        {tab === 'details' && (
          <View style={D.detailCard}>
            {[
              ['Type', loanName(loan.type)], ['Principal', GHS(principal)],
              ['Interest Rate', loan.interest_rate + '% p.a.'], ['Total Interest', GHS(totalInterest)],
              ['Total Repayable', GHS(totalRepayable)], ['Tenure', loan.tenure ? loan.tenure + ' months' : '—'],
              ['Installment', GHS(installment)], ['Disbursed', fmtDate(loan.disbursed_at)],
              ['Next Due', fmtDate(loan.next_due_date)], ['Last Payment', fmtDate(loan.last_payment_date)],
              ['Purpose', loan.purpose || '—'], ['Status', (loan.status || '').toUpperCase()],
            ].map(([l, v], i, arr) => (
              <View key={l} style={[D.detRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={D.detLabel}>{l}</Text>
                <Text style={D.detVal}>{v}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 8, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.borderLt },
  pageTitle: { fontSize: 22, fontWeight: '900', color: C.text },
  countPill: { backgroundColor: C.greenLt, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: C.greenBg },
  countTxt: { fontSize: 12, fontWeight: '700', color: C.green },
  empty: { alignItems: 'center', paddingVertical: 64 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: C.text3, marginBottom: 6 },
  emptyHint: { fontSize: 13, color: C.text4 },
  groupLabel: { fontSize: 11, fontWeight: '800', color: C.text4, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  card: { backgroundColor: C.white, borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1.5, borderColor: C.border, ...C.shadow },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  cardIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardType: { fontSize: 16, fontWeight: '800', color: C.text, marginBottom: 3 },
  cardDue: { fontSize: 12, color: C.amber },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  badgeTxt: { fontSize: 10, fontWeight: '800' },
  progTrack: { height: 7, backgroundColor: C.borderLt, borderRadius: 4, overflow: 'hidden', marginBottom: 5 },
  progFill: { height: 7, borderRadius: 4 },
  progRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  progTxt: { fontSize: 11, color: C.text4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  statBox: { flex: 1, minWidth: '45%', backgroundColor: C.bg, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: C.borderLt },
  statLabel: { fontSize: 10, color: C.text4, fontWeight: '600', marginBottom: 3 },
  statVal: { fontSize: 13, fontWeight: '800' },
  tapHint: { fontSize: 11, color: C.text4, textAlign: 'right' },
});

const D = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { paddingTop: 20, paddingBottom: 28, paddingHorizontal: 20, alignItems: 'center', overflow: 'hidden' },
  decor: { position: 'absolute', width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(255,255,255,0.07)', top: -80, right: -60 },
  closeBtn: { alignSelf: 'flex-start', marginBottom: 16, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  closeTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  headerType: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  headerBal: { color: '#fff', fontSize: 34, fontWeight: '900', letterSpacing: -0.8 },
  headerBalLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 5, marginBottom: 18 },
  progTrack: { width: '100%', height: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, overflow: 'hidden' },
  progFill: { height: 6, backgroundColor: '#86efac', borderRadius: 3 },
  progLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 11 },
  summaryRow: { flexDirection: 'row', backgroundColor: C.white, marginHorizontal: 16, borderRadius: 16, marginTop: -18, marginBottom: 12, ...C.shadow },
  sumBox: { flex: 1, padding: 14, alignItems: 'center' },
  sumLabel: { fontSize: 10, color: C.text4, marginBottom: 5, fontWeight: '600' },
  sumVal: { fontSize: 13, fontWeight: '800' },
  tabs: { flexDirection: 'row', backgroundColor: C.white, marginHorizontal: 16, borderRadius: 14, padding: 4, marginBottom: 8, borderWidth: 1, borderColor: C.borderLt },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 11 },
  tabActive: { backgroundColor: C.brand },
  tabTxt: { fontSize: 12, fontWeight: '600', color: C.text3 },
  tabTxtActive: { color: '#fff', fontWeight: '700' },
  schedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.white, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.borderLt },
  schedRowNext: { borderColor: C.brand, backgroundColor: C.greenLt },
  schedNum: { width: 36, height: 36, borderRadius: 11, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  schedNumTxt: { fontSize: 13, fontWeight: '800', color: C.text3 },
  schedDate: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 3 },
  schedSub: { fontSize: 11, color: C.text3, marginBottom: 2 },
  schedBal: { fontSize: 11, color: C.text4 },
  schedAmt: { fontSize: 16, fontWeight: '900', color: C.text },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.white, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.borderLt },
  payIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: C.greenLt, alignItems: 'center', justifyContent: 'center' },
  payNarr: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 3 },
  payMeta: { fontSize: 11, color: C.text4 },
  payAmt: { fontSize: 15, fontWeight: '800', color: C.green },
  detailCard: { backgroundColor: C.white, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.borderLt },
  detRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.borderLt },
  detLabel: { fontSize: 13, color: C.text3 },
  detVal: { fontSize: 13, fontWeight: '700', color: C.text, textAlign: 'right', flex: 1, marginLeft: 12 },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyTxt: { fontSize: 14, fontWeight: '700', color: C.text3 },
});
