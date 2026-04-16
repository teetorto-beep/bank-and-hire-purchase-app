import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal,
} from 'react-native';
import { supabase } from '../supabase';
import { C, GHS, fmtDate } from '../theme';

const r2 = n => Math.round(n * 100) / 100;

function calcLoan(loan) {
  const principal   = Number(loan.amount || 0);
  const rate        = Number(loan.interest_rate || 0);
  const tenure      = Number(loan.tenure || 0);
  const monthlyPmt  = Number(loan.monthly_payment || 0);
  const outstanding = Number(loan.outstanding || 0);
  const mr = rate / 100 / 12;
  let installment = monthlyPmt;
  if (!installment && principal > 0 && tenure > 0) {
    installment = mr > 0
      ? r2(principal * mr / (1 - Math.pow(1 + mr, -tenure)))
      : r2(principal / tenure);
  }
  const totalRepayable = tenure > 0 ? r2(installment * tenure) : principal;
  const totalInterest  = r2(Math.max(0, totalRepayable - principal));
  const totalPaid      = r2(Math.max(0, totalRepayable - outstanding));
  const rows = [];
  let bal  = outstanding;
  let date = loan.next_due_date ? new Date(loan.next_due_date) : new Date();
  for (let i = 0; i < 10; i++) {
    if (bal <= 0.005) break;
    const interest   = r2(bal * mr);
    const principal_ = r2(Math.min(installment - interest, bal));
    const payment    = r2(principal_ + interest);
    bal = r2(Math.max(0, bal - principal_));
    rows.push({ index: i + 1, date: new Date(date), principal: principal_, interest, payment, remaining: bal });
    const d = new Date(date); d.setMonth(d.getMonth() + 1); date = d;
  }
  return { installment, totalRepayable, totalInterest, totalPaid, rows };
}

const STATUS = {
  active:    { border: C.brand, bg: C.brandLt, badge: '#dbeafe', badgeTxt: '#1d4ed8', emoji: '📋' },
  overdue:   { border: C.red,   bg: C.redLt,   badge: C.redBg,   badgeTxt: C.red,    emoji: '⚠️' },
  completed: { border: C.green, bg: C.greenLt, badge: C.greenBg, badgeTxt: C.green,  emoji: '✅' },
  pending:   { border: C.border,bg: C.surface, badge: C.surface, badgeTxt: C.text4,  emoji: '⏳' },
};

const loanName = t => (t || 'Loan').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export default function LoanScreen({ customer, tick }) {
  const [loans,      setLoans]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected,   setSelected]   = useState(null);
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

  if (loading) return (
    <View style={S.center}>
      <ActivityIndicator color={C.brand} size="large" />
      <Text style={S.loadTxt}>Loading loans…</Text>
    </View>
  );

  const active = loans.filter(l => ['active', 'overdue'].includes(l.status));
  const others = loans.filter(l => !['active', 'overdue'].includes(l.status));

  return (
    <>
      <ScrollView style={S.root} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
        showsVerticalScrollIndicator={false}>
        {loans.length === 0 ? (
          <View style={S.empty}>
            <Text style={{ fontSize: 52, marginBottom: 16 }}>📋</Text>
            <Text style={S.emptyTitle}>No Loans</Text>
            <Text style={S.emptyHint}>You have no loan records on this account</Text>
          </View>
        ) : (
          <>
            {active.length > 0 && (
              <>
                <Text style={S.sectionLabel}>Active Loans</Text>
                {active.map(l => <LoanCard key={l.id} loan={l} onPress={() => setSelected(l)} />)}
              </>
            )}
            {others.length > 0 && (
              <>
                <Text style={[S.sectionLabel, { marginTop: 24 }]}>Loan History</Text>
                {others.map(l => <LoanCard key={l.id} loan={l} onPress={() => setSelected(l)} />)}
              </>
            )}
          </>
        )}
      </ScrollView>
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        {selected && <LoanDetail loan={selected} onClose={() => setSelected(null)} />}
      </Modal>
    </>
  );
}

function LoanCard({ loan, onPress }) {
  const st = STATUS[loan.status] || STATUS.pending;
  const { installment, totalRepayable, totalInterest, totalPaid } = calcLoan(loan);
  const principal   = Number(loan.amount || 0);
  const outstanding = Number(loan.outstanding || 0);
  const pct = totalRepayable > 0 ? Math.min(100, (totalPaid / totalRepayable) * 100) : 0;

  return (
    <TouchableOpacity style={[S.card, { borderColor: st.border }]} onPress={onPress} activeOpacity={0.87}>
      <View style={S.cardHead}>
        <View style={[S.cardIconBox, { backgroundColor: st.bg }]}>
          <Text style={{ fontSize: 24 }}>{st.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={S.cardType}>{loanName(loan.type)}</Text>
          {loan.next_due_date && loan.status !== 'completed' && (
            <Text style={[S.cardDue, loan.status === 'overdue' && { color: C.red }]}>
              {loan.status === 'overdue' ? '⚠️ Overdue · ' : 'Due: '}
              {fmtDate(loan.next_due_date, { day: 'numeric', month: 'short' })}
            </Text>
          )}
        </View>
        <View style={[S.statusPill, { backgroundColor: st.badge }]}>
          <Text style={[S.statusTxt, { color: st.badgeTxt }]}>{(loan.status || '').toUpperCase()}</Text>
        </View>
      </View>

      <View style={S.progTrack}>
        <View style={[S.progFill, {
          width: pct + '%',
          backgroundColor: loan.status === 'completed' ? C.green : loan.status === 'overdue' ? C.red : C.brand,
        }]} />
      </View>
      <View style={S.progRow}>
        <Text style={S.progLabel}>{GHS(totalPaid)} paid</Text>
        <Text style={S.progPct}>{pct.toFixed(0)}% complete</Text>
      </View>

      <View style={S.amtGrid}>
        {[
          ['Principal',       GHS(principal),      C.text],
          ['Interest',        GHS(totalInterest),  C.amber],
          ['Total Repayable', GHS(totalRepayable), C.brand],
          ['Outstanding',     GHS(outstanding),    loan.status === 'overdue' ? C.red : '#c2410c'],
          ['Total Paid',      GHS(totalPaid),      C.green],
          ['Installment',     GHS(installment),    C.text],
        ].map(([l, v, col]) => (
          <View key={l} style={S.amtBox}>
            <Text style={S.amtLabel}>{l}</Text>
            <Text style={[S.amtVal, { color: col }]}>{v}</Text>
          </View>
        ))}
      </View>
      <Text style={S.tapHint}>Tap for payment schedule →</Text>
    </TouchableOpacity>
  );
}

function LoanDetail({ loan, onClose }) {
  const [payments,   setPayments]   = useState([]);
  const [loadingPay, setLoadingPay] = useState(true);
  const [tab,        setTab]        = useState('schedule');
  const { installment, totalRepayable, totalInterest, totalPaid, rows } = calcLoan(loan);
  const principal   = Number(loan.amount || 0);
  const outstanding = Number(loan.outstanding || 0);
  const pct = totalRepayable > 0 ? Math.min(100, (totalPaid / totalRepayable) * 100) : 0;
  const st  = STATUS[loan.status] || STATUS.pending;
  const headerBg = loan.status === 'overdue' ? '#7f1d1d' : loan.status === 'completed' ? '#14532d' : C.navyMid;

  useEffect(() => {
    supabase.from('collections')
      .select('id,amount,created_at,notes,collector_name')
      .eq('loan_id', loan.id)
      .order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { setPayments(data || []); setLoadingPay(false); });
  }, [loan.id]);

  return (
    <View style={D.root}>
      <View style={[D.header, { backgroundColor: headerBg }]}>
        <View style={D.headerDecor} />
        <TouchableOpacity onPress={onClose} style={D.closeBtn}>
          <Text style={D.closeTxt}>✕  Close</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 36, marginBottom: 10 }}>{st.emoji}</Text>
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

      <View style={D.summaryCard}>
        {[
          ['Principal',       GHS(principal),      C.text],
          ['Interest',        GHS(totalInterest),  C.amber],
          ['Total Repayable', GHS(totalRepayable), C.brand],
          ['Total Paid',      GHS(totalPaid),      C.green],
        ].map(([l, v, c]) => (
          <View key={l} style={D.summaryBox}>
            <Text style={D.summaryLabel}>{l}</Text>
            <Text style={[D.summaryVal, { color: c }]}>{v}</Text>
          </View>
        ))}
      </View>

      <View style={D.tabs}>
        {[['schedule', 'Schedule'], ['history', 'Payments'], ['details', 'Details']].map(([k, lbl]) => (
          <TouchableOpacity key={k} style={[D.tab, tab === k && D.tabActive]} onPress={() => setTab(k)}>
            <Text style={[D.tabTxt, tab === k && D.tabTxtActive]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {tab === 'schedule' && (
          <>
            <View style={D.infoBox}>
              <Text style={D.infoTxt}>
                {GHS(installment)} / month  ·  {loan.interest_rate}% p.a.
                {loan.next_due_date ? '  ·  Next due ' + fmtDate(loan.next_due_date, { day: 'numeric', month: 'short' }) : ''}
              </Text>
            </View>
            {rows.length === 0 ? (
              <View style={D.empty}>
                <Text style={{ fontSize: 32, marginBottom: 10 }}>✅</Text>
                <Text style={D.emptyTxt}>Loan fully repaid</Text>
              </View>
            ) : rows.map((row, i) => {
              const isToday = row.date.toDateString() === new Date().toDateString();
              return (
                <View key={i} style={[D.schedRow, isToday && D.schedRowToday]}>
                  <View style={[D.schedNum, isToday && { backgroundColor: C.brand }]}>
                    <Text style={[D.schedNumTxt, isToday && { color: '#fff' }]}>{row.index}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[D.schedDate, isToday && { color: C.brand, fontWeight: '800' }]}>
                      {isToday ? 'Today' : fmtDate(row.date, { weekday: 'short', day: 'numeric', month: 'short' })}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 3 }}>
                      <Text style={D.schedPrincipal}>Principal: {GHS(row.principal)}</Text>
                      {row.interest > 0 && <Text style={D.schedInterest}>Interest: {GHS(row.interest)}</Text>}
                    </View>
                    <Text style={D.schedBal}>Balance after: {GHS(row.remaining)}</Text>
                  </View>
                  <Text style={D.schedAmt}>{GHS(row.payment)}</Text>
                </View>
              );
            })}
          </>
        )}

        {tab === 'history' && (
          <>
            <Text style={D.sectionTitle}>Payment History ({payments.length})</Text>
            {loadingPay ? (
              <ActivityIndicator color={C.brand} style={{ marginTop: 32 }} />
            ) : payments.length === 0 ? (
              <View style={D.empty}>
                <Text style={{ fontSize: 32, marginBottom: 10 }}>💳</Text>
                <Text style={D.emptyTxt}>No payments recorded yet</Text>
              </View>
            ) : payments.map(p => (
              <View key={p.id} style={D.payRow}>
                <View style={D.payIcon}><Text style={{ fontSize: 20 }}>💳</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={D.payNarr}>{p.notes || 'Loan Repayment'}</Text>
                  <Text style={D.payMeta}>
                    {p.collector_name ? 'via ' + p.collector_name + '  ·  ' : ''}
                    {fmtDate(p.created_at)}
                  </Text>
                </View>
                <Text style={D.payAmt}>+{GHS(p.amount)}</Text>
              </View>
            ))}
          </>
        )}

        {tab === 'details' && (
          <>
            <Text style={D.sectionTitle}>Loan Details</Text>
            <View style={D.detailCard}>
              {[
                ['Type',            loanName(loan.type)],
                ['Principal',       GHS(principal)],
                ['Interest Rate',   loan.interest_rate + '% p.a.'],
                ['Total Interest',  GHS(totalInterest)],
                ['Total Repayable', GHS(totalRepayable)],
                ['Tenure',          loan.tenure ? loan.tenure + ' months' : '—'],
                ['Installment',     GHS(installment)],
                ['Disbursed',       fmtDate(loan.disbursed_at)],
                ['Next Due',        fmtDate(loan.next_due_date)],
                ['Last Payment',    fmtDate(loan.last_payment_date)],
                ['Purpose',         loan.purpose || '—'],
                ['Status',          (loan.status || '').toUpperCase()],
              ].map(([l, v], i, arr) => (
                <View key={l} style={[D.detailRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={D.detailLabel}>{l}</Text>
                  <Text style={D.detailVal}>{v}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadTxt: { color: C.text3, fontSize: 13 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: C.text4, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14 },
  empty: { alignItems: 'center', paddingVertical: 64 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: C.text3, marginBottom: 8 },
  emptyHint: { fontSize: 13, color: C.text4, textAlign: 'center' },
  card: { borderRadius: 18, borderWidth: 1.5, padding: 18, marginBottom: 16, backgroundColor: C.card, ...C.shadow },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  cardIconBox: { width: 50, height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  cardType: { fontSize: 16, fontWeight: '800', color: C.text, marginBottom: 4 },
  cardDue: { fontSize: 12, color: '#92400e' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusTxt: { fontSize: 10, fontWeight: '800' },
  progTrack: { height: 7, backgroundColor: C.borderLt, borderRadius: 4, overflow: 'hidden', marginBottom: 5 },
  progFill: { height: 7, borderRadius: 4 },
  progRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  progLabel: { fontSize: 11, color: C.text4 },
  progPct: { fontSize: 11, color: C.text4 },
  amtGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  amtBox: { flex: 1, minWidth: '30%', backgroundColor: C.surface, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: C.borderLt },
  amtLabel: { fontSize: 10, color: C.text4, fontWeight: '600', marginBottom: 4 },
  amtVal: { fontSize: 13, fontWeight: '800' },
  tapHint: { fontSize: 11, color: C.text4, textAlign: 'right' },
});

const D = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { paddingTop: 20, paddingBottom: 28, paddingHorizontal: 20, alignItems: 'center', overflow: 'hidden' },
  headerDecor: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(255,255,255,0.06)', top: -90, right: -70 },
  closeBtn: { alignSelf: 'flex-start', marginBottom: 16, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  closeTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  headerType: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  headerBal: { color: '#fff', fontSize: 36, fontWeight: '900', letterSpacing: -0.8 },
  headerBalLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 5, marginBottom: 18 },
  progTrack: { width: '100%', height: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, overflow: 'hidden' },
  progFill: { height: 6, backgroundColor: '#22c55e', borderRadius: 3 },
  progLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 11 },
  summaryCard: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: C.card, marginHorizontal: 16, borderRadius: 16, marginTop: -18, marginBottom: 14, ...C.shadow },
  summaryBox: { width: '50%', padding: 14, borderBottomWidth: 1, borderRightWidth: 1, borderColor: C.borderLt },
  summaryLabel: { fontSize: 10, color: C.text4, marginBottom: 5, fontWeight: '600' },
  summaryVal: { fontSize: 14, fontWeight: '800' },
  tabs: { flexDirection: 'row', backgroundColor: C.card, marginHorizontal: 16, borderRadius: 14, padding: 4, marginBottom: 8, borderWidth: 1, borderColor: C.borderLt },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 11 },
  tabActive: { backgroundColor: C.brand },
  tabTxt: { fontSize: 13, fontWeight: '600', color: C.text3 },
  tabTxtActive: { color: '#fff', fontWeight: '700' },
  infoBox: { backgroundColor: C.brandLt, borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#bfdbfe' },
  infoTxt: { fontSize: 12, color: '#1e40af', lineHeight: 18 },
  schedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.borderLt },
  schedRowToday: { borderColor: C.brand, backgroundColor: C.brandLt },
  schedNum: { width: 36, height: 36, borderRadius: 11, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  schedNumTxt: { fontSize: 13, fontWeight: '800', color: C.text3 },
  schedDate: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 3 },
  schedPrincipal: { fontSize: 11, color: C.brand, fontWeight: '600' },
  schedInterest: { fontSize: 11, color: C.amber, fontWeight: '600' },
  schedBal: { fontSize: 11, color: C.text4, marginTop: 3 },
  schedAmt: { fontSize: 16, fontWeight: '900', color: C.text },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: C.text4, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.borderLt },
  payIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: C.greenLt, alignItems: 'center', justifyContent: 'center' },
  payNarr: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 3 },
  payMeta: { fontSize: 11, color: C.text4 },
  payAmt: { fontSize: 15, fontWeight: '800', color: C.green },
  detailCard: { backgroundColor: C.card, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.borderLt },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.borderLt },
  detailLabel: { fontSize: 13, color: C.text3 },
  detailVal: { fontSize: 13, fontWeight: '700', color: C.text, textAlign: 'right', flex: 1, marginLeft: 12 },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyTxt: { fontSize: 14, fontWeight: '700', color: C.text3 },
});
