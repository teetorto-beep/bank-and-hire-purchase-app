import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native';
import { supabase } from '../supabase';
import { cacheData, getCached, subscribeToNetwork } from '../offline';
import { C, GHS, fmtDate, fmtTime, GRADIENTS, ACCOUNT_ICONS } from '../theme';

const { width: W } = Dimensions.get('window');

function todayBounds() {
  const s = new Date(); s.setHours(0, 0, 0, 0);
  const e = new Date(); e.setHours(23, 59, 59, 999);
  return { start: s.toISOString(), end: e.toISOString() };
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen({ customer, onTabChange, tick, onNotifPress, unread }) {
  const [accounts,   setAccounts]   = useState([]);
  const [loans,      setLoans]      = useState([]);
  const [todayTxns,  setTodayTxns]  = useState([]);
  const [recentTxns, setRecentTxns] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balVisible, setBalVisible] = useState(true);
  const firstLoad = useRef(true);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else if (firstLoad.current) setLoading(true);
    try {
      const cacheKey = `home2_${customer.id}`;
      if (!refresh && firstLoad.current) {
        const cached = await getCached(cacheKey);
        if (cached) {
          setAccounts(cached.accounts || []); setLoans(cached.loans || []);
          setTodayTxns(cached.todayTxns || []); setRecentTxns(cached.recentTxns || []);
          setLoading(false); firstLoad.current = false;
        }
      }
      const [accsRes, loansRes] = await Promise.all([
        supabase.from('accounts').select('id,account_number,type,balance,status,interest_rate,opened_at')
          .eq('customer_id', customer.id).eq('status', 'active').order('opened_at', { ascending: true }),
        supabase.from('loans').select('id,type,amount,outstanding,monthly_payment,status,next_due_date,interest_rate,tenure')
          .eq('customer_id', customer.id).in('status', ['active', 'overdue']),
      ]);
      const accs = accsRes.data || [], lns = loansRes.data || [];
      setAccounts(accs); setLoans(lns);
      if (accs.length) {
        const ids = accs.map(a => a.id);
        const { start, end } = todayBounds();
        const [todayRes, recentRes] = await Promise.all([
          supabase.from('transactions').select('id,account_id,type,amount,narration,created_at,balance_after')
            .in('account_id', ids).gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false }),
          supabase.from('transactions').select('id,account_id,type,amount,narration,created_at')
            .in('account_id', ids).order('created_at', { ascending: false }).limit(8),
        ]);
        setTodayTxns(todayRes.data || []); setRecentTxns(recentRes.data || []);
      }
      await cacheData(cacheKey, { accounts: accs, loans: lns, todayTxns: [], recentTxns: [] });
    } catch (e) { console.warn(e.message); }
    if (refresh) setRefreshing(false); else { setLoading(false); firstLoad.current = false; }
  }, [customer.id, tick]);

  useEffect(() => { load(); }, [load]);

  const totalBal   = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
  const todayIn    = todayTxns.filter(t => t.type === 'credit').reduce((s, t) => s + Number(t.amount), 0);
  const todayOut   = todayTxns.filter(t => t.type === 'debit').reduce((s, t) => s + Number(t.amount), 0);
  const overdue    = loans.filter(l => l.status === 'overdue');
  const nextDue    = loans.filter(l => l.next_due_date).sort((a, b) => new Date(a.next_due_date) - new Date(b.next_due_date))[0];
  const firstName  = customer.name?.split(' ')[0] || 'there';

  if (loading) return (
    <View style={S.center}>
      <ActivityIndicator color={C.brand} size="large" />
      <Text style={S.loadTxt}>Loading…</Text>
    </View>
  );

  return (
    <ScrollView style={S.root} contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
      showsVerticalScrollIndicator={false}>

      {/* ── Header ── */}
      <View style={S.header}>
        <View>
          <Text style={S.greetTxt}>{greeting()},</Text>
          <Text style={S.nameTxt}>{firstName} 👋</Text>
        </View>
        <TouchableOpacity style={S.notifBtn} onPress={onNotifPress} activeOpacity={0.8}>
          <Text style={S.notifIcon}>🔔</Text>
          {unread > 0 && <View style={S.notifDot}><Text style={S.notifDotTxt}>{unread > 9 ? '9+' : unread}</Text></View>}
        </TouchableOpacity>
      </View>

      {/* ── Balance hero card ── */}
      <View style={S.heroCard}>
        <View style={S.heroDecor1} />
        <View style={S.heroDecor2} />
        <View style={S.heroTop}>
          <Text style={S.heroLabel}>Total Portfolio Balance</Text>
          <TouchableOpacity onPress={() => setBalVisible(v => !v)} style={S.eyeBtn}>
            <Text style={{ fontSize: 16 }}>{balVisible ? '👁️' : '🙈'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={S.heroAmt}>{balVisible ? GHS(totalBal) : 'GH₵ ••••••'}</Text>
        <Text style={S.heroSub}>{accounts.length} active account{accounts.length !== 1 ? 's' : ''}</Text>

        {/* Today stats */}
        <View style={S.heroStats}>
          <View style={S.heroStat}>
            <Text style={S.heroStatLabel}>Today In</Text>
            <Text style={[S.heroStatVal, { color: '#86efac' }]}>+{GHS(todayIn)}</Text>
          </View>
          <View style={S.heroStatDiv} />
          <View style={S.heroStat}>
            <Text style={S.heroStatLabel}>Today Out</Text>
            <Text style={[S.heroStatVal, { color: '#fca5a5' }]}>-{GHS(todayOut)}</Text>
          </View>
          <View style={S.heroStatDiv} />
          <View style={S.heroStat}>
            <Text style={S.heroStatLabel}>Transactions</Text>
            <Text style={[S.heroStatVal, { color: '#fff' }]}>{todayTxns.length}</Text>
          </View>
        </View>
      </View>

      {/* ── Quick actions ── */}
      <View style={S.quickRow}>
        {[
          { icon: '🏦', label: 'Accounts', tab: 'accounts' },
          { icon: '📋', label: 'Loans',    tab: 'loans'    },
          { icon: '📊', label: 'History',  tab: 'txns'     },
          { icon: '🔔', label: 'Alerts',   tab: 'notifs'   },
        ].map(q => (
          <TouchableOpacity key={q.tab} style={S.quickBtn} onPress={() => onTabChange?.(q.tab)} activeOpacity={0.8}>
            <View style={S.quickIcon}><Text style={{ fontSize: 22 }}>{q.icon}</Text></View>
            <Text style={S.quickLabel}>{q.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Alerts ── */}
      {overdue.length > 0 && (
        <TouchableOpacity style={S.alertBanner} onPress={() => onTabChange?.('loans')} activeOpacity={0.85}>
          <Text style={{ fontSize: 20 }}>⚠️</Text>
          <View style={{ flex: 1 }}>
            <Text style={S.alertTitle}>{overdue.length} Overdue Loan{overdue.length > 1 ? 's' : ''}</Text>
            <Text style={S.alertBody}>Tap to view and make payment arrangements</Text>
          </View>
          <Text style={{ color: C.red, fontSize: 18 }}>›</Text>
        </TouchableOpacity>
      )}
      {!overdue.length && nextDue && (
        <View style={S.dueBanner}>
          <Text style={{ fontSize: 20 }}>📅</Text>
          <View style={{ flex: 1 }}>
            <Text style={S.dueTitle}>Next Payment Due</Text>
            <Text style={S.dueBody}>{fmtDate(nextDue.next_due_date)} · {GHS(nextDue.monthly_payment)}</Text>
          </View>
        </View>
      )}

      {/* ── My Accounts ── */}
      {accounts.length > 0 && (
        <View style={S.section}>
          <View style={S.secRow}>
            <Text style={S.secTitle}>My Accounts</Text>
            <TouchableOpacity onPress={() => onTabChange?.('accounts')}><Text style={S.secLink}>See all ›</Text></TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
            {accounts.map((acc, idx) => {
              const [from, to] = GRADIENTS[idx % GRADIENTS.length];
              return (
                <TouchableOpacity key={acc.id} style={[S.accMini, { backgroundColor: from }]} onPress={() => onTabChange?.('accounts')} activeOpacity={0.88}>
                  <View style={S.accMiniDecor} />
                  <Text style={S.accMiniIcon}>{ACCOUNT_ICONS[acc.type] || '🏧'}</Text>
                  <Text style={S.accMiniType}>{(acc.type || '').replace(/_/g, ' ')}</Text>
                  <Text style={S.accMiniBal}>{balVisible ? GHS(acc.balance) : '••••'}</Text>
                  <Text style={S.accMiniNum}>{acc.account_number}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── Recent Transactions ── */}
      <View style={S.section}>
        <View style={S.secRow}>
          <Text style={S.secTitle}>Recent Transactions</Text>
          <TouchableOpacity onPress={() => onTabChange?.('txns')}><Text style={S.secLink}>View all ›</Text></TouchableOpacity>
        </View>
        {recentTxns.length === 0 ? (
          <View style={S.emptyBox}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>📋</Text>
            <Text style={S.emptyTxt}>No transactions yet</Text>
          </View>
        ) : recentTxns.map(t => <TxnRow key={t.id} txn={t} />)}
      </View>
    </ScrollView>
  );
}

function TxnRow({ txn }) {
  const cr = txn.type === 'credit';
  return (
    <View style={S.txnRow}>
      <View style={[S.txnDot, { backgroundColor: cr ? C.greenBg : C.redBg }]}>
        <Text style={[S.txnArrow, { color: cr ? C.green : C.red }]}>{cr ? '↑' : '↓'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={S.txnNarr} numberOfLines={1}>{txn.narration || 'Transaction'}</Text>
        <Text style={S.txnDate}>{fmtDate(txn.created_at)} · {fmtTime(txn.created_at)}</Text>
      </View>
      <Text style={[S.txnAmt, { color: cr ? C.green : C.red }]}>{cr ? '+' : '-'}{GHS(txn.amount)}</Text>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadTxt: { color: C.text3, fontSize: 13 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.borderLt },
  greetTxt: { fontSize: 13, color: C.text3, fontWeight: '500' },
  nameTxt: { fontSize: 20, fontWeight: '800', color: C.text },
  notifBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border, position: 'relative' },
  notifIcon: { fontSize: 20 },
  notifDot: { position: 'absolute', top: 6, right: 6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  notifDotTxt: { color: '#fff', fontSize: 8, fontWeight: '900' },

  heroCard: { margin: 16, borderRadius: 24, backgroundColor: C.brand, padding: 22, overflow: 'hidden', ...C.shadowLg },
  heroDecor1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.07)', top: -80, right: -60 },
  heroDecor2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.05)', bottom: -40, left: 20 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  heroLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },
  eyeBtn: { padding: 4 },
  heroAmt: { color: '#fff', fontSize: 34, fontWeight: '900', letterSpacing: -1, marginBottom: 4 },
  heroSub: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 20 },
  heroStats: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 14, padding: 14 },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatDiv: { width: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  heroStatLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '600', marginBottom: 4 },
  heroStatVal: { fontSize: 13, fontWeight: '800' },

  quickRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 8 },
  quickBtn: { flex: 1, alignItems: 'center', backgroundColor: C.white, borderRadius: 16, paddingVertical: 14, borderWidth: 1, borderColor: C.borderLt, ...C.shadowSm },
  quickIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.greenLt, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  quickLabel: { fontSize: 11, fontWeight: '700', color: C.text2 },

  alertBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.redLt, borderLeftWidth: 4, borderLeftColor: C.red, marginHorizontal: 16, marginBottom: 8, borderRadius: 14, padding: 14 },
  alertTitle: { fontSize: 14, fontWeight: '800', color: C.redDk, marginBottom: 2 },
  alertBody: { fontSize: 12, color: '#7f1d1d' },
  dueBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.amberLt, borderLeftWidth: 4, borderLeftColor: C.amber, marginHorizontal: 16, marginBottom: 8, borderRadius: 14, padding: 14 },
  dueTitle: { fontSize: 14, fontWeight: '800', color: '#92400e', marginBottom: 2 },
  dueBody: { fontSize: 12, color: '#78350f' },

  section: { marginTop: 8 },
  secRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 },
  secTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  secLink: { fontSize: 13, color: C.brand, fontWeight: '700' },

  accMini: { width: 160, borderRadius: 18, padding: 16, overflow: 'hidden', ...C.shadow },
  accMiniDecor: { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.08)', top: -30, right: -20 },
  accMiniIcon: { fontSize: 24, marginBottom: 10 },
  accMiniType: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  accMiniBal: { color: '#fff', fontSize: 16, fontWeight: '900', marginBottom: 6 },
  accMiniNum: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontFamily: 'monospace' },

  emptyBox: { alignItems: 'center', paddingVertical: 32, marginHorizontal: 16, backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.borderLt },
  emptyTxt: { fontSize: 14, color: C.text4, fontWeight: '600' },

  txnRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: C.borderLt, backgroundColor: C.white },
  txnDot: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  txnArrow: { fontSize: 18, fontWeight: '800' },
  txnNarr: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 2 },
  txnDate: { fontSize: 11, color: C.text4 },
  txnAmt: { fontSize: 14, fontWeight: '800' },
});
