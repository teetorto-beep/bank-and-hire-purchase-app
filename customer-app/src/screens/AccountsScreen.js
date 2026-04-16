
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, Dimensions,
} from 'react-native';
import { supabase } from '../supabase';
import { C, GHS, fmtDate, fmtDateTime, ACCOUNT_GRADIENTS, ACCOUNT_ICONS } from '../theme';

const { width: W } = Dimensions.get('window');

export default function AccountsScreen({ customer, tick }) {
  const [accounts,    setAccounts]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [selected,    setSelected]    = useState(null);
  const [accTxns,     setAccTxns]     = useState([]);
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
      .select('id,type,amount,narration,created_at,balance_after,reference')
      .eq('account_id', acc.id).order('created_at', { ascending: false }).limit(40);
    setAccTxns(data || []); setLoadingTxns(false);
  };

  const totalBal = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);

  if (loading) return (
    <View style={S.center}>
      <ActivityIndicator color={C.brand} size="large" />
      <Text style={S.loadTxt}>Loading accounts…</Text>
    </View>
  );

  return (
    <>
      <ScrollView style={S.root} contentContainerStyle={{ paddingBottom: 36 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
        showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={S.hero}>
          <Text style={S.heroEyebrow}>TOTAL BALANCE</Text>
          <Text style={S.heroAmt}>{GHS(totalBal)}</Text>
          <Text style={S.heroSub}>{accounts.length} account{accounts.length !== 1 ? 's' : ''}</Text>
        </View>

        <View style={{ padding: 20 }}>
          <Text style={S.sectionTitle}>All Accounts</Text>

          {accounts.length === 0 ? (
            <View style={S.empty}>
              <Text style={{ fontSize: 44, marginBottom: 14 }}>🏦</Text>
              <Text style={S.emptyTitle}>No Accounts Found</Text>
              <Text style={S.emptyHint}>Contact your branch to open an account</Text>
            </View>
          ) : accounts.map((acc, idx) => {
            const g = ACCOUNT_GRADIENTS[idx % ACCOUNT_GRADIENTS.length];
            const icon = ACCOUNT_ICONS[acc.type] || '🏧';
            const typeName = (acc.type || 'Account').replace(/_/g, ' ').replace(/\b\w/g, x => x.toUpperCase());
            return (
              <TouchableOpacity key={acc.id} style={S.accCard} onPress={() => openAccount(acc)} activeOpacity={0.88}>
                {/* Color bar */}
                <View style={[S.accBar, { backgroundColor: g.from }]} />
                <View style={S.accBody}>
                  <View style={S.accTop}>
                    <View style={[S.accIconBox, { backgroundColor: g.from + '18' }]}>
                      <Text style={{ fontSize: 24 }}>{icon}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <Text style={[S.accType, { color: g.from }]}>{typeName}</Text>
                      <Text style={S.accNum}>{acc.account_number}</Text>
                    </View>
                    <View style={[S.statusPill, acc.status !== 'active' && S.statusPillWarn]}>
                      <View style={[S.statusDot, { backgroundColor: acc.status === 'active' ? C.green : C.amber }]} />
                      <Text style={[S.statusTxt, acc.status !== 'active' && { color: '#92400e' }]}>{acc.status}</Text>
                    </View>
                  </View>
                  <View style={S.accDivider} />
                  <View style={S.accBottom}>
                    <View>
                      <Text style={S.accBalLabel}>Available Balance</Text>
                      <Text style={[S.accBal, { color: g.from }]}>{GHS(acc.balance)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      {acc.interest_rate > 0 && <Text style={S.accRate}>{acc.interest_rate}% p.a.</Text>}
                      {acc.opened_at && <Text style={S.accOpened}>Since {new Date(acc.opened_at).toLocaleDateString('en-GH', { month: 'short', year: 'numeric' })}</Text>}
                    </View>
                  </View>
                  <View style={S.tapRow}>
                    <Text style={S.tapHint}>Tap to view transactions</Text>
                    <Text style={[S.tapArrow, { color: g.from }]}>→</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        {selected && (
          <AccountDetail
            account={selected}
            transactions={accTxns}
            loading={loadingTxns}
            onClose={() => setSelected(null)}
            colorIndex={accounts.findIndex(a => a.id === selected.id)}
          />
        )}
      </Modal>
    </>
  );
}

function AccountDetail({ account, transactions, loading, onClose, colorIndex }) {
  const g = ACCOUNT_GRADIENTS[colorIndex % ACCOUNT_GRADIENTS.length];
  const icon = ACCOUNT_ICONS[account.type] || '🏧';
  const typeName = (account.type || 'Account').replace(/_/g, ' ').replace(/\b\w/g, x => x.toUpperCase());
  const credits = transactions.filter(t => t.type === 'credit').reduce((s, t) => s + Number(t.amount), 0);
  const debits  = transactions.filter(t => t.type === 'debit').reduce((s, t) => s + Number(t.amount), 0);

  return (
    <View style={D.root}>
      {/* Header */}
      <View style={[D.header, { backgroundColor: g.from }]}>
        <View style={D.headerDecor} />
        <TouchableOpacity onPress={onClose} style={D.closeBtn}>
          <Text style={D.closeTxt}>✕  Close</Text>
        </TouchableOpacity>
        <View style={D.headerIconBox}>
          <Text style={{ fontSize: 30 }}>{icon}</Text>
        </View>
        <Text style={D.headerType}>{typeName}</Text>
        <Text style={D.headerNum}>{account.account_number}</Text>
        <Text style={D.headerBal}>{GHS(account.balance)}</Text>
        <Text style={D.headerBalLabel}>Available Balance</Text>
      </View>

      {/* Stats */}
      <View style={D.statsCard}>
        {[
          ['Total Credits', '+' + GHS(credits), C.green],
          ['Total Debits',  '-' + GHS(debits),  C.red],
          ['Transactions',  String(transactions.length), C.text],
        ].map(([l, v, col], i) => (
          <React.Fragment key={l}>
            {i > 0 && <View style={D.statDiv} />}
            <View style={D.statBox}>
              <Text style={D.statLabel}>{l}</Text>
              <Text style={[D.statVal, { color: col }]}>{v}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* Info chips */}
      <View style={D.chips}>
        {account.interest_rate > 0 && (
          <View style={D.chip}><Text style={D.chipTxt}>📈 {account.interest_rate}% p.a.</Text></View>
        )}
        {account.opened_at && (
          <View style={D.chip}><Text style={D.chipTxt}>📅 Opened {fmtDate(account.opened_at)}</Text></View>
        )}
        <View style={[D.chip, { backgroundColor: account.status === 'active' ? C.greenLt : C.amberBg }]}>
          <Text style={[D.chipTxt, { color: account.status === 'active' ? C.green : C.amber }]}>
            ● {account.status}
          </Text>
        </View>
      </View>

      <Text style={D.txnTitle}>Transaction History</Text>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />
        ) : transactions.length === 0 ? (
          <View style={D.empty}>
            <Text style={{ fontSize: 36, marginBottom: 12 }}>📋</Text>
            <Text style={D.emptyTxt}>No transactions yet</Text>
          </View>
        ) : transactions.map(txn => {
          const isCredit = txn.type === 'credit';
          return (
            <View key={txn.id} style={D.txnRow}>
              <View style={[D.txnIcon, { backgroundColor: isCredit ? C.greenLt : C.redLt }]}>
                <Text style={[D.txnArrow, { color: isCredit ? C.green : C.red }]}>{isCredit ? '↑' : '↓'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={D.txnNarr} numberOfLines={1}>{txn.narration || 'Transaction'}</Text>
                <Text style={D.txnDate}>{fmtDateTime(txn.created_at)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[D.txnAmt, { color: isCredit ? C.green : C.red }]}>{isCredit ? '+' : '-'}{GHS(txn.amount)}</Text>
                {txn.balance_after != null && <Text style={D.txnBal}>Bal: {GHS(txn.balance_after)}</Text>}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadTxt: { color: C.text3, fontSize: 13 },
  hero: { backgroundColor: C.navyMid, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32 },
  heroEyebrow: { color: '#334155', fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 8 },
  heroAmt: { color: '#fff', fontSize: 36, fontWeight: '900', letterSpacing: -1, marginBottom: 4 },
  heroSub: { color: '#475569', fontSize: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: C.text3, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 16 },
  accCard: { backgroundColor: C.card, borderRadius: 18, marginBottom: 14, flexDirection: 'row', overflow: 'hidden', borderWidth: 1, borderColor: C.borderLt, ...C.shadow },
  accBar: { width: 5 },
  accBody: { flex: 1, padding: 16 },
  accTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  accIconBox: { width: 52, height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  accType: { fontSize: 16, fontWeight: '800', marginBottom: 3 },
  accNum: { fontSize: 12, color: C.text3, fontFamily: 'monospace' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.greenLt, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusPillWarn: { backgroundColor: C.amberLt },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusTxt: { fontSize: 11, fontWeight: '700', color: C.green, textTransform: 'capitalize' },
  accDivider: { height: 1, backgroundColor: C.borderLt, marginBottom: 14 },
  accBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 },
  accBalLabel: { fontSize: 11, color: C.text4, marginBottom: 4 },
  accBal: { fontSize: 22, fontWeight: '900' },
  accRate: { fontSize: 12, fontWeight: '700', color: C.text3 },
  accOpened: { fontSize: 10, color: C.text4, marginTop: 3 },
  tapRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  tapHint: { fontSize: 11, color: C.text4 },
  tapArrow: { fontSize: 14, fontWeight: '800' },
  empty: { alignItems: 'center', paddingVertical: 56, backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.borderLt },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.text3, marginBottom: 6 },
  emptyHint: { fontSize: 13, color: C.text4 },
});

const D = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { paddingTop: 20, paddingBottom: 32, paddingHorizontal: 24, alignItems: 'center', overflow: 'hidden' },
  headerDecor: { position: 'absolute', width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(255,255,255,0.07)', top: -80, right: -60 },
  closeBtn: { alignSelf: 'flex-start', marginBottom: 16, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  closeTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  headerIconBox: { width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  headerType: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  headerNum: { color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: 'monospace', marginBottom: 14 },
  headerBal: { color: '#fff', fontSize: 34, fontWeight: '900', letterSpacing: -0.8 },
  headerBalLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 5 },
  statsCard: { flexDirection: 'row', backgroundColor: C.card, marginHorizontal: 16, borderRadius: 16, padding: 16, marginTop: -18, ...C.shadow, marginBottom: 14 },
  statBox: { flex: 1, alignItems: 'center' },
  statDiv: { width: 1, backgroundColor: C.borderLt },
  statLabel: { fontSize: 10, color: C.text4, marginBottom: 5, fontWeight: '600' },
  statVal: { fontSize: 14, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginBottom: 18 },
  chip: { backgroundColor: C.surface, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: C.border },
  chipTxt: { fontSize: 12, color: C.text3, fontWeight: '600' },
  txnTitle: { fontSize: 11, fontWeight: '800', color: C.text4, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 16, marginBottom: 12 },
  txnRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.borderLt },
  txnIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  txnArrow: { fontSize: 18, fontWeight: '800' },
  txnNarr: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 3 },
  txnDate: { fontSize: 11, color: C.text4 },
  txnAmt: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  txnBal: { fontSize: 11, color: C.text4 },
  empty: { alignItems: 'center', paddingTop: 48 },
  emptyTxt: { fontSize: 14, fontWeight: '700', color: C.text3 },
});
