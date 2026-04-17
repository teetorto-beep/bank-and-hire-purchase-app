import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Modal } from 'react-native';
import { supabase } from '../supabase';
import { C, GHS, fmtDate, fmtDateTime, GRADIENTS, ACCOUNT_ICONS } from '../theme';

export default function AccountsScreen({ customer, tick }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [accTxns, setAccTxns] = useState([]);
  const [loadingTxns, setLoadingTxns] = useState(false);
  const firstLoad = useRef(true);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else if (firstLoad.current) setLoading(true);
    const { data } = await supabase.from('accounts')
      .select('id,account_number,type,balance,status,interest_rate,opened_at')
      .eq('customer_id', customer.id).order('opened_at', { ascending: true });
    setAccounts(data || []);
    if (refresh) setRefreshing(false); else { setLoading(false); firstLoad.current = false; }
  }, [customer.id, tick]);

  useEffect(() => { load(); }, [load]);

  const openAccount = async acc => {
    setSelected(acc); setLoadingTxns(true);
    const { data } = await supabase.from('transactions')
      .select('id,type,amount,narration,created_at,balance_after,reference,channel')
      .eq('account_id', acc.id).order('created_at', { ascending: false }).limit(50);
    setAccTxns(data || []); setLoadingTxns(false);
  };

  const totalBal = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);

  if (loading) return <View style={S.center}><ActivityIndicator color={C.brand} size="large" /></View>;

  return (
    <>
      <ScrollView style={S.root} contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
        showsVerticalScrollIndicator={false}>
        <View style={S.pageHeader}>
          <Text style={S.pageTitle}>My Accounts</Text>
          <View style={S.totalPill}>
            <Text style={S.totalLabel}>Total Balance</Text>
            <Text style={S.totalVal}>{GHS(totalBal)}</Text>
          </View>
        </View>
        {accounts.length === 0 ? (
          <View style={S.empty}>
            <Text style={{ fontSize: 48, marginBottom: 14 }}>🏦</Text>
            <Text style={S.emptyTitle}>No Accounts</Text>
            <Text style={S.emptyHint}>Contact your branch to open an account</Text>
          </View>
        ) : accounts.map((acc, idx) => {
          const [from] = GRADIENTS[idx % GRADIENTS.length];
          const icon = ACCOUNT_ICONS[acc.type] || '🏧';
          const typeName = (acc.type || '').replace(/_/g, ' ').replace(/\b\w/g, x => x.toUpperCase());
          return (
            <TouchableOpacity key={acc.id} style={S.accCard} onPress={() => openAccount(acc)} activeOpacity={0.88}>
              <View style={[S.strip, { backgroundColor: from }]} />
              <View style={S.accBody}>
                <View style={S.accTop}>
                  <View style={[S.iconBox, { backgroundColor: from + '22' }]}>
                    <Text style={{ fontSize: 26 }}>{icon}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[S.accType, { color: from }]}>{typeName}</Text>
                    <Text style={S.accNum}>{acc.account_number}</Text>
                  </View>
                  <View style={[S.statusChip, acc.status !== 'active' && { backgroundColor: C.amberBg }]}>
                    <View style={[S.statusDot, { backgroundColor: acc.status === 'active' ? C.green : C.amber }]} />
                    <Text style={[S.statusTxt, acc.status !== 'active' && { color: C.amber }]}>{acc.status}</Text>
                  </View>
                </View>
                <View style={S.balRow}>
                  <View>
                    <Text style={S.balLabel}>Available Balance</Text>
                    <Text style={[S.balAmt, { color: from }]}>{GHS(acc.balance)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    {acc.interest_rate > 0 && <Text style={S.rate}>{acc.interest_rate}% p.a.</Text>}
                    {acc.opened_at && <Text style={S.since}>Since {new Date(acc.opened_at).toLocaleDateString('en-GH', { month: 'short', year: 'numeric' })}</Text>}
                  </View>
                </View>
                <Text style={S.tapHint}>Tap to view transactions →</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        {selected && (
          <AccDetail account={selected} txns={accTxns} loading={loadingTxns}
            onClose={() => setSelected(null)} colorIdx={accounts.findIndex(a => a.id === selected.id)} />
        )}
      </Modal>
    </>
  );
}

function AccDetail({ account, txns, loading, onClose, colorIdx }) {
  const [from] = GRADIENTS[colorIdx % GRADIENTS.length];
  const icon = ACCOUNT_ICONS[account.type] || '🏧';
  const typeName = (account.type || '').replace(/_/g, ' ').replace(/\b\w/g, x => x.toUpperCase());
  const credits = txns.filter(t => t.type === 'credit').reduce((s, t) => s + Number(t.amount), 0);
  const debits  = txns.filter(t => t.type === 'debit').reduce((s, t) => s + Number(t.amount), 0);

  // Group transactions by date
  const grouped = txns.reduce((acc, t) => {
    const d = fmtDate(t.created_at);
    if (!acc[d]) acc[d] = [];
    acc[d].push(t);
    return acc;
  }, {});

  return (
    <View style={D.root}>
      <View style={[D.header, { backgroundColor: from }]}>
        <View style={D.decor} />
        <TouchableOpacity onPress={onClose} style={D.closeBtn}>
          <Text style={D.closeTxt}>✕  Close</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 36, marginBottom: 10 }}>{icon}</Text>
        <Text style={D.headerType}>{typeName}</Text>
        <Text style={D.headerNum}>{account.account_number}</Text>
        <Text style={D.headerBal}>{GHS(account.balance)}</Text>
        <Text style={D.headerBalLabel}>Available Balance</Text>
      </View>

      <View style={D.statsRow}>
        {[['Credits', '+' + GHS(credits), C.green], ['Debits', '-' + GHS(debits), C.red], ['Transactions', String(txns.length), C.text]].map(([l, v, col], i) => (
          <React.Fragment key={l}>
            {i > 0 && <View style={D.statDiv} />}
            <View style={D.statBox}>
              <Text style={D.statLabel}>{l}</Text>
              <Text style={[D.statVal, { color: col }]}>{v}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />
        ) : txns.length === 0 ? (
          <View style={D.empty}><Text style={{ fontSize: 36, marginBottom: 10 }}>📋</Text><Text style={D.emptyTxt}>No transactions yet</Text></View>
        ) : Object.entries(grouped).map(([date, items]) => (
          <View key={date}>
            <Text style={D.dateHeader}>{date}</Text>
            {items.map(t => {
              const cr = t.type === 'credit';
              return (
                <View key={t.id} style={D.txnRow}>
                  <View style={[D.txnDot, { backgroundColor: cr ? C.greenBg : C.redBg }]}>
                    <Text style={[D.txnArrow, { color: cr ? C.green : C.red }]}>{cr ? '↑' : '↓'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={D.txnNarr} numberOfLines={1}>{t.narration || 'Transaction'}</Text>
                    <Text style={D.txnMeta}>{t.reference ? t.reference + ' · ' : ''}{t.channel || 'teller'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[D.txnAmt, { color: cr ? C.green : C.red }]}>{cr ? '+' : '-'}{GHS(t.amount)}</Text>
                    {t.balance_after != null && <Text style={D.txnBal}>Bal: {GHS(t.balance_after)}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 8, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.borderLt },
  pageTitle: { fontSize: 22, fontWeight: '900', color: C.text },
  totalPill: { backgroundColor: C.greenLt, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'flex-end', borderWidth: 1, borderColor: C.greenBg },
  totalLabel: { fontSize: 10, color: C.green, fontWeight: '700', marginBottom: 2 },
  totalVal: { fontSize: 15, fontWeight: '900', color: C.green },
  empty: { alignItems: 'center', paddingVertical: 64 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: C.text3, marginBottom: 6 },
  emptyHint: { fontSize: 13, color: C.text4 },
  accCard: { flexDirection: 'row', backgroundColor: C.white, borderRadius: 18, marginHorizontal: 16, marginTop: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.borderLt, ...C.shadow },
  strip: { width: 6 },
  accBody: { flex: 1, padding: 16 },
  accTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  iconBox: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  accType: { fontSize: 16, fontWeight: '800', marginBottom: 3 },
  accNum: { fontSize: 12, color: C.text3, fontFamily: 'monospace' },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.greenLt, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusTxt: { fontSize: 11, fontWeight: '700', color: C.green, textTransform: 'capitalize' },
  balRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 },
  balLabel: { fontSize: 11, color: C.text4, marginBottom: 4 },
  balAmt: { fontSize: 24, fontWeight: '900' },
  rate: { fontSize: 12, fontWeight: '700', color: C.text3 },
  since: { fontSize: 10, color: C.text4, marginTop: 3 },
  tapHint: { fontSize: 11, color: C.text4, textAlign: 'right' },
});

const D = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { paddingTop: 20, paddingBottom: 28, paddingHorizontal: 24, alignItems: 'center', overflow: 'hidden' },
  decor: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.07)', top: -80, right: -60 },
  closeBtn: { alignSelf: 'flex-start', marginBottom: 16, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  closeTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  headerType: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  headerNum: { color: '#fff', fontSize: 15, fontFamily: 'monospace', marginBottom: 14 },
  headerBal: { color: '#fff', fontSize: 34, fontWeight: '900', letterSpacing: -0.8 },
  headerBalLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 5 },
  statsRow: { flexDirection: 'row', backgroundColor: C.white, marginHorizontal: 16, borderRadius: 16, padding: 16, marginTop: -18, ...C.shadow, marginBottom: 8 },
  statBox: { flex: 1, alignItems: 'center' },
  statDiv: { width: 1, backgroundColor: C.borderLt },
  statLabel: { fontSize: 10, color: C.text4, marginBottom: 5, fontWeight: '600' },
  statVal: { fontSize: 13, fontWeight: '800' },
  dateHeader: { fontSize: 11, fontWeight: '700', color: C.text4, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.bg },
  txnRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.borderLt, backgroundColor: C.white },
  txnDot: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  txnArrow: { fontSize: 18, fontWeight: '800' },
  txnNarr: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 2 },
  txnMeta: { fontSize: 11, color: C.text4 },
  txnAmt: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
  txnBal: { fontSize: 11, color: C.text4 },
  empty: { alignItems: 'center', paddingTop: 48 },
  emptyTxt: { fontSize: 14, fontWeight: '700', color: C.text3 },
});
