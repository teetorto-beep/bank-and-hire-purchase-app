
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Dimensions, FlatList,
} from 'react-native';
import { supabase } from '../supabase';
import { cacheData, getCached, subscribeToNetwork } from '../offline';
import { C, GHS, fmtDate, fmtTime, ACCOUNT_GRADIENTS, ACCOUNT_ICONS } from '../theme';

const { width: W } = Dimensions.get('window');
const CARD_W = W - 40;

function todayBounds() {
  const s = new Date(); s.setHours(0, 0, 0, 0);
  const e = new Date(); e.setHours(23, 59, 59, 999);
  return { start: s.toISOString(), end: e.toISOString() };
}

export default function HomeScreen({ customer, onTabChange, tick }) {
  const [accounts,   setAccounts]   = useState([]);
  const [loans,      setLoans]      = useState([]);
  const [loanPaid,   setLoanPaid]   = useState({});
  const [todayTxns,  setTodayTxns]  = useState([]);
  const [recentTxns, setRecentTxns] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCard, setActiveCard] = useState(0);
  const [isOnline,   setIsOnline]   = useState(true);
  const firstLoad = useRef(true);
  const flatRef   = useRef(null);

  useEffect(() => { const u = subscribeToNetwork(setIsOnline); return () => u(); }, []);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else if (firstLoad.current) setLoading(true);
    try {
      const cacheKey = `home_${customer.id}`;
      if (!refresh && firstLoad.current) {
        const cached = await getCached(cacheKey);
        if (cached) {
          setAccounts(cached.accounts || []); setLoans(cached.loans || []);
          setLoanPaid(cached.loanPaid || {}); setTodayTxns(cached.todayTxns || []);
          setRecentTxns(cached.recentTxns || []); setLoading(false); firstLoad.current = false;
          if (!isOnline) { setRefreshing(false); return; }
        }
      }
      const [accsRes, loansRes] = await Promise.all([
        supabase.from('accounts').select('id,account_number,type,balance,status,interest_rate,opened_at')
          .eq('customer_id', customer.id).eq('status', 'active').order('opened_at', { ascending: true }),
        supabase.from('loans').select('id,type,amount,outstanding,monthly_payment,status,next_due_date,interest_rate,tenure,payment_frequency')
          .eq('customer_id', customer.id).in('status', ['active', 'overdue']),
      ]);
      const accs = accsRes.data || [], lns = loansRes.data || [];
      setAccounts(accs); setLoans(lns);
      if (lns.length) {
        const { data: cols } = await supabase.from('collections').select('loan_id,amount').in('loan_id', lns.map(l => l.id));
        const totals = {};
        (cols || []).forEach(c => { totals[c.loan_id] = (totals[c.loan_id] || 0) + Number(c.amount); });
        setLoanPaid(totals);
      }
      if (accs.length) {
        const ids = accs.map(a => a.id);
        const { start, end } = todayBounds();
        const [todayRes, recentRes] = await Promise.all([
          supabase.from('transactions').select('id,account_id,type,amount,narration,created_at,balance_after')
            .in('account_id', ids).gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false }),
          supabase.from('transactions').select('id,account_id,type,amount,narration,created_at')
            .in('account_id', ids).lt('created_at', start).order('created_at', { ascending: false }).limit(5),
        ]);
        setTodayTxns(todayRes.data || []); setRecentTxns(recentRes.data || []);
      }
      await cacheData(`home_${customer.id}`, { accounts: accs, loans: lns, loanPaid: {}, todayTxns: [], recentTxns: [] });
    } catch (e) { console.warn(e.message); }
    if (refresh) setRefreshing(false); else { setLoading(false); firstLoad.current = false; }
  }, [customer.id, tick]);

  useEffect(() => { load(); }, [load]);

  const totalBal    = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
  const todayIn     = todayTxns.filter(t => t.type === 'credit').reduce((s, t) => s + Number(t.amount), 0);
  const todayOut    = todayTxns.filter(t => t.type === 'debit').reduce((s, t) => s + Number(t.amount), 0);
  const overdueLoans = loans.filter(l => l.status === 'overdue');
  const nextDue     = loans.filter(l => l.next_due_date).sort((a, b) => new Date(a.next_due_date) - new Date(b.next_due_date))[0];

  if (loading) return (
    <View style={S.center}>
      <ActivityIndicator color={C.brand} size="large" />
      <Text style={S.loadTxt}>Loading your dashboard…</Text>
    </View>
  );

  return (
    <ScrollView style={S.root} contentContainerStyle={{ paddingBottom: 36 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
      showsVerticalScrollIndicator={false}>

      {/* Offline banner */}
      {!isOnline && (
        <View style={S.offlineBanner}>
          <Text style={S.offlineTxt}>📡  Offline — showing cached data</Text>
        </View>
      )}

      {/* ── Hero balance ── */}
      <View style={S.hero}>
        <Text style={S.heroEyebrow}>TOTAL PORTFOLIO BALANCE</Text>
        <Text style={S.heroAmt}>{GHS(totalBal)}</Text>
        <Text style={S.heroSub}>{accounts.length} active account{accounts.length !== 1 ? 's' : ''}</Text>
        {(todayIn > 0 || todayOut > 0) && (
          <View style={S.todayRow}>
            {todayIn  > 0 && <View style={S.pill}><Text style={S.pillTxt}>▲ {GHS(todayIn)} in today</Text></View>}
            {todayOut > 0 && <View style={[S.pill, S.pillRed]}><Text style={S.pillTxt}>▼ {GHS(todayOut)} out today</Text></View>}
          </View>
        )}
      </View>

      {/* ── Quick stats ── */}
      <View style={S.statsRow}>
        {[
          { label: 'Accounts',    value: String(accounts.length),  color: C.brand },
          { label: 'Active Loans',value: String(loans.length),     color: loans.length > 0 ? C.amber : C.text4 },
          { label: 'Overdue',     value: String(overdueLoans.length), color: overdueLoans.length > 0 ? C.red : C.text4 },
          { label: 'Today In',    value: GHS(todayIn),             color: C.green, small: true },
        ].map((s, i) => (
          <View key={s.label} style={[S.statCell, i < 3 && S.statCellBorder]}>
            <Text style={[S.statVal, { color: s.color }, s.small && { fontSize: 12 }]}>{s.value}</Text>
            <Text style={S.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* ── Alerts ── */}
      {overdueLoans.length > 0 && (
        <View style={S.alertCard}>
          <View style={S.alertIconBox}><Text style={{ fontSize: 20 }}>⚠️</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={S.alertTitle}>Overdue Payment{overdueLoans.length > 1 ? 's' : ''}</Text>
            <Text style={S.alertBody}>{overdueLoans.length} loan{overdueLoans.length > 1 ? 's are' : ' is'} overdue. Contact your branch immediately.</Text>
          </View>
        </View>
      )}
      {!overdueLoans.length && nextDue && (
        <View style={S.dueCard}>
          <View style={S.dueIconBox}><Text style={{ fontSize: 20 }}>📅</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={S.dueTitle}>Next Payment Due</Text>
            <Text style={S.dueBody}>{fmtDate(nextDue.next_due_date)}  ·  {GHS(nextDue.monthly_payment)}</Text>
          </View>
        </View>
      )}

      {/* ── Account cards ── */}
      {accounts.length > 0 ? (
        <View style={{ marginTop: 8 }}>
          <SectionHeader label="My Accounts" action="See all" onAction={() => onTabChange?.('accounts')} />
          <FlatList ref={flatRef} data={accounts} horizontal pagingEnabled
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_W + 16} decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: 20 }}
            keyExtractor={i => i.id}
            onMomentumScrollEnd={e => setActiveCard(Math.round(e.nativeEvent.contentOffset.x / (CARD_W + 16)))}
            renderItem={({ item: acc, index }) => {
              const g = ACCOUNT_GRADIENTS[index % ACCOUNT_GRADIENTS.length];
              return (
                <View style={[S.accCard, { backgroundColor: g.from, width: CARD_W, marginRight: 16 }]}>
                  {/* Decorative circle */}
                  <View style={S.accCircle} />
                  <View style={S.accCardTop}>
                    <View style={S.accIconWrap}>
                      <Text style={{ fontSize: 20 }}>{ACCOUNT_ICONS[acc.type] || '🏧'}</Text>
                    </View>
                    <View style={S.accTypePill}>
                      <Text style={S.accTypeTxt}>{(acc.type || '').replace(/_/g, ' ').toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={S.accBal}>{GHS(acc.balance)}</Text>
                  <Text style={S.accBalLabel}>Available Balance</Text>
                  <View style={S.accDivider} />
                  <View style={S.accCardBottom}>
                    <View>
                      <Text style={S.accMetaLabel}>Account No.</Text>
                      <Text style={S.accMetaVal}>{acc.account_number}</Text>
                    </View>
                    {acc.opened_at && (
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={S.accMetaLabel}>Member Since</Text>
                        <Text style={S.accMetaVal}>{new Date(acc.opened_at).toLocaleDateString('en-GH', { month: 'short', year: 'numeric' })}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            }}
          />
          {accounts.length > 1 && (
            <View style={S.dots}>
              {accounts.map((_, i) => <View key={i} style={[S.dot, i === activeCard && S.dotActive]} />)}
            </View>
          )}
        </View>
      ) : (
        <View style={S.emptyCard}>
          <Text style={{ fontSize: 36, marginBottom: 10 }}>🏦</Text>
          <Text style={S.emptyTitle}>No Active Accounts</Text>
          <Text style={S.emptyHint}>Contact your branch to open an account</Text>
        </View>
      )}

      {/* ── Today's activity ── */}
      {todayTxns.length > 0 && (
        <View style={S.section}>
          <SectionHeader label="Today's Activity" badge={`${todayTxns.length} txn${todayTxns.length > 1 ? 's' : ''}`} />
          {todayTxns.map(txn => <TxnRow key={txn.id} txn={txn} showTime />)}
        </View>
      )}

      {/* ── Active loans ── */}
      {loans.length > 0 && (
        <View style={S.section}>
          <SectionHeader label="Active Loans" action="View all" onAction={() => onTabChange?.('loans')} />
          {loans.map(loan => {
            const overdue = loan.status === 'overdue';
            const monthly = Number(loan.monthly_payment || 0);
            const tenure  = Number(loan.tenure || 0);
            const orig    = Number(loan.amount || 0);
            const totalRepay = monthly > 0 && tenure > 0 ? monthly * tenure : orig;
            const out     = Number(loan.outstanding || 0);
            const pct     = totalRepay > 0 ? Math.min(100, ((totalRepay - out) / totalRepay) * 100) : 0;
            return (
              <View key={loan.id} style={[S.loanCard, overdue && S.loanCardOverdue]}>
                <View style={S.loanTop}>
                  <View style={[S.loanIconBox, { backgroundColor: overdue ? C.redLt : '#fff7ed' }]}>
                    <Text style={{ fontSize: 22 }}>{overdue ? '⚠️' : '📋'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.loanType}>{(loan.type || 'Loan').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Text>
                    {loan.next_due_date && (
                      <Text style={[S.loanDue, overdue && { color: C.red }]}>
                        {overdue ? '⚠️ Overdue · ' : 'Due: '}{fmtDate(loan.next_due_date)}
                      </Text>
                    )}
                  </View>
                  <View style={[S.loanBadge, { backgroundColor: overdue ? C.redBg : C.greenBg }]}>
                    <Text style={[S.loanBadgeTxt, { color: overdue ? C.red : C.green }]}>{overdue ? 'OVERDUE' : 'ACTIVE'}</Text>
                  </View>
                </View>
                <View style={S.progTrack}>
                  <View style={[S.progFill, { width: `${pct}%`, backgroundColor: overdue ? C.red : C.brand }]} />
                </View>
                <Text style={S.progPct}>{pct.toFixed(0)}% repaid</Text>
                <View style={S.loanGrid}>
                  {[
                    ['Principal',   GHS(orig),                                    C.text],
                    ['Outstanding', GHS(out),                                     overdue ? C.red : '#c2410c'],
                    ['Total Paid',  GHS(Math.max(0, totalRepay - out)),           C.green],
                    ['Installment', GHS(loan.monthly_payment),                    C.brand],
                  ].map(([l, v, col]) => (
                    <View key={l} style={S.loanStat}>
                      <Text style={S.loanStatLabel}>{l}</Text>
                      <Text style={[S.loanStatVal, { color: col }]}>{v}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ── Recent transactions ── */}
      <View style={S.section}>
        <SectionHeader label="Recent Transactions" action="View all" onAction={() => onTabChange?.('txns')} />
        {recentTxns.length === 0 && todayTxns.length === 0 ? (
          <View style={S.emptyCard}>
            <Text style={{ fontSize: 28, marginBottom: 8 }}>📋</Text>
            <Text style={S.emptyTitle}>No transactions yet</Text>
          </View>
        ) : recentTxns.length === 0 ? (
          <View style={[S.emptyCard, { paddingVertical: 14 }]}>
            <Text style={S.emptyHint}>No earlier transactions</Text>
          </View>
        ) : recentTxns.map(txn => <TxnRow key={txn.id} txn={txn} />)}
      </View>
    </ScrollView>
  );
}

function SectionHeader({ label, action, onAction, badge }) {
  return (
    <View style={S.secHeader}>
      <Text style={S.secLabel}>{label}</Text>
      {action && <TouchableOpacity onPress={onAction}><Text style={S.secAction}>{action} →</Text></TouchableOpacity>}
      {badge && <View style={S.secBadge}><Text style={S.secBadgeTxt}>{badge}</Text></View>}
    </View>
  );
}

function TxnRow({ txn, showTime }) {
  const isCredit = txn.type === 'credit';
  return (
    <View style={S.txnRow}>
      <View style={[S.txnIcon, { backgroundColor: isCredit ? C.greenLt : C.redLt }]}>
        <Text style={[S.txnArrow, { color: isCredit ? C.green : C.red }]}>{isCredit ? '↑' : '↓'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={S.txnNarr} numberOfLines={1}>{txn.narration || 'Transaction'}</Text>
        <Text style={S.txnDate}>{showTime ? fmtTime(txn.created_at) : fmtDate(txn.created_at)}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[S.txnAmt, { color: isCredit ? C.green : C.red }]}>{isCredit ? '+' : '-'}{GHS(txn.amount)}</Text>
        {txn.balance_after != null && <Text style={S.txnBal}>Bal: {GHS(txn.balance_after)}</Text>}
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadTxt: { color: C.text3, fontSize: 13 },

  offlineBanner: { backgroundColor: '#fef9c3', paddingVertical: 9, paddingHorizontal: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  offlineTxt: { fontSize: 12, color: '#92400e', fontWeight: '600' },

  hero: { backgroundColor: C.navyMid, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32 },
  heroEyebrow: { color: '#334155', fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 8 },
  heroAmt: { color: '#fff', fontSize: 38, fontWeight: '900', letterSpacing: -1.5, marginBottom: 4 },
  heroSub: { color: '#475569', fontSize: 12, marginBottom: 14 },
  todayRow: { flexDirection: 'row', gap: 8 },
  pill: { backgroundColor: 'rgba(16,185,129,0.2)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' },
  pillRed: { backgroundColor: 'rgba(239,68,68,0.2)', borderColor: 'rgba(239,68,68,0.3)' },
  pillTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },

  statsRow: { flexDirection: 'row', backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.borderLt },
  statCell: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  statCellBorder: { borderRightWidth: 1, borderRightColor: C.borderLt },
  statVal: { fontSize: 17, fontWeight: '900', marginBottom: 3 },
  statLabel: { fontSize: 9, color: C.text4, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  alertCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.redLt, borderLeftWidth: 4, borderLeftColor: C.red, marginHorizontal: 16, marginTop: 16, borderRadius: 14, padding: 14, ...C.shadowSm },
  alertIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.redBg, alignItems: 'center', justifyContent: 'center' },
  alertTitle: { fontSize: 14, fontWeight: '800', color: C.redDk, marginBottom: 3 },
  alertBody: { fontSize: 12, color: '#7f1d1d', lineHeight: 17 },

  dueCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.amberLt, borderLeftWidth: 4, borderLeftColor: C.amber, marginHorizontal: 16, marginTop: 16, borderRadius: 14, padding: 14, ...C.shadowSm },
  dueIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.amberBg, alignItems: 'center', justifyContent: 'center' },
  dueTitle: { fontSize: 14, fontWeight: '800', color: '#92400e', marginBottom: 3 },
  dueBody: { fontSize: 12, color: '#78350f' },

  section: { marginTop: 24 },
  secHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 20 },
  secLabel: { fontSize: 13, fontWeight: '800', color: C.text2, letterSpacing: 0.2 },
  secAction: { fontSize: 12, color: C.brand, fontWeight: '700' },
  secBadge: { backgroundColor: C.brandLt, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  secBadgeTxt: { fontSize: 11, color: C.brand, fontWeight: '700' },

  accCard: { borderRadius: 22, padding: 22, overflow: 'hidden', ...C.shadowLg },
  accCircle: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.06)', top: -60, right: -40 },
  accCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  accIconWrap: { width: 44, height: 44, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  accTypePill: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  accTypeTxt: { color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  accBal: { color: '#fff', fontSize: 30, fontWeight: '900', letterSpacing: -0.8, marginBottom: 3 },
  accBalLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginBottom: 16 },
  accDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginBottom: 14 },
  accCardBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  accMetaLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 10, marginBottom: 3 },
  accMetaVal: { color: '#fff', fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 14, marginBottom: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.border },
  dotActive: { width: 20, backgroundColor: C.brand, borderRadius: 3 },

  emptyCard: { marginHorizontal: 20, backgroundColor: C.card, borderRadius: 16, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: C.borderLt },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.text3, marginBottom: 5 },
  emptyHint: { fontSize: 12, color: C.text4, textAlign: 'center' },

  loanCard: { marginHorizontal: 20, backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1.5, borderColor: '#fed7aa', ...C.shadowSm },
  loanCardOverdue: { borderColor: '#fecaca' },
  loanTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  loanIconBox: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  loanType: { fontSize: 15, fontWeight: '800', color: C.text, marginBottom: 2 },
  loanDue: { fontSize: 12, color: '#92400e' },
  loanBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  loanBadgeTxt: { fontSize: 10, fontWeight: '800' },
  progTrack: { height: 6, backgroundColor: C.borderLt, borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  progFill: { height: 6, borderRadius: 3 },
  progPct: { fontSize: 10, color: C.text4, textAlign: 'right', marginBottom: 12 },
  loanGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  loanStat: { flex: 1, minWidth: '45%', backgroundColor: C.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: C.borderLt },
  loanStatLabel: { fontSize: 10, color: C.text4, fontWeight: '600', marginBottom: 3 },
  loanStatVal: { fontSize: 13, fontWeight: '800' },

  txnRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 8, marginHorizontal: 20, borderWidth: 1, borderColor: C.borderLt, ...C.shadowSm },
  txnIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  txnArrow: { fontSize: 18, fontWeight: '800' },
  txnNarr: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 2 },
  txnDate: { fontSize: 11, color: C.text4 },
  txnAmt: { fontSize: 14, fontWeight: '800' },
  txnBal: { fontSize: 10, color: C.text4, marginTop: 2 },
});
