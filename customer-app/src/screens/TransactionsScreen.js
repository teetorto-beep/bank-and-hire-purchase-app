import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { supabase } from '../supabase';
import { C, GHS, fmtDate, fmtTime } from '../theme';

const FILTERS = [{ key: 'all', label: 'All' }, { key: 'credit', label: 'Credits' }, { key: 'debit', label: 'Debits' }];

export default function TransactionsScreen({ customer, tick }) {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selAcc, setSelAcc] = useState('all');
  const firstLoad = useRef(true);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else if (firstLoad.current) setLoading(true);
    const accsRes = await supabase.from('accounts').select('id,account_number,type').eq('customer_id', customer.id);
    const accs = accsRes.data || [];
    setAccounts(accs);
    const ids = accs.map(a => a.id);
    if (!ids.length) { setTransactions([]); setFiltered([]); if (refresh) setRefreshing(false); else { setLoading(false); firstLoad.current = false; } return; }
    const { data } = await supabase.from('transactions')
      .select('id,account_id,type,amount,narration,reference,created_at,balance_after,channel')
      .in('account_id', ids).order('created_at', { ascending: false }).limit(200);
    setTransactions(data || []);
    if (refresh) setRefreshing(false); else { setLoading(false); firstLoad.current = false; }
  }, [customer.id, tick]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let r = [...transactions];
    if (selAcc !== 'all') r = r.filter(t => t.account_id === selAcc);
    if (filter !== 'all') r = r.filter(t => t.type === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(t => (t.narration || '').toLowerCase().includes(q) || (t.reference || '').toLowerCase().includes(q));
    }
    setFiltered(r);
  }, [transactions, filter, selAcc, search]);

  const getAccNum = id => { const a = accounts.find(x => x.id === id); return a ? a.account_number : '—'; };
  const totalIn  = filtered.filter(t => t.type === 'credit').reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = filtered.filter(t => t.type === 'debit').reduce((s, t) => s + Number(t.amount), 0);

  // Group by date
  const grouped = filtered.reduce((acc, t) => {
    const d = fmtDate(t.created_at);
    if (!acc[d]) acc[d] = [];
    acc[d].push(t);
    return acc;
  }, {});
  const sections = Object.entries(grouped);

  const renderSection = ([date, items]) => (
    <View key={date}>
      <Text style={S.dateHeader}>{date}</Text>
      {items.map(txn => {
        const cr = txn.type === 'credit';
        return (
          <View key={txn.id} style={S.txnCard}>
            <View style={[S.txnDot, { backgroundColor: cr ? C.greenBg : C.redBg }]}>
              <Text style={[S.txnArrow, { color: cr ? C.green : C.red }]}>{cr ? '↑' : '↓'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={S.txnNarr} numberOfLines={1}>{txn.narration || 'Transaction'}</Text>
              <Text style={S.txnMeta}>{getAccNum(txn.account_id)}{txn.channel ? ' · ' + txn.channel : ''}</Text>
              <Text style={S.txnTime}>{fmtTime(txn.created_at)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[S.txnAmt, { color: cr ? C.green : C.red }]}>{cr ? '+' : '-'}{GHS(txn.amount)}</Text>
              {txn.balance_after != null && <Text style={S.txnBal}>Bal: {GHS(txn.balance_after)}</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );

  return (
    <View style={S.root}>
      {/* Header */}
      <View style={S.header}>
        <Text style={S.pageTitle}>Transactions</Text>
        <Text style={S.countTxt}>{filtered.length} records</Text>
      </View>

      {/* Search */}
      <View style={S.searchWrap}>
        <Text style={{ fontSize: 15 }}>🔍</Text>
        <TextInput style={S.searchInput} placeholder="Search narration or reference…"
          placeholderTextColor={C.text4} value={search} onChangeText={setSearch} returnKeyType="search" />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}><Text style={{ fontSize: 13, color: C.text4, fontWeight: '700', padding: 4 }}>✕</Text></TouchableOpacity>
        )}
      </View>

      {/* Account filter */}
      {accounts.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 8 }}>
          {[{ id: 'all', account_number: 'All' }, ...accounts].map(acc => (
            <TouchableOpacity key={acc.id} style={[S.chip, selAcc === acc.id && S.chipActive]} onPress={() => setSelAcc(acc.id)}>
              <Text style={[S.chipTxt, selAcc === acc.id && S.chipTxtActive]}>{acc.account_number}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Type filter */}
      <View style={S.filterRow}>
        <View style={S.filterTabs}>
          {FILTERS.map(f => (
            <TouchableOpacity key={f.key} style={[S.filterTab, filter === f.key && S.filterTabActive]} onPress={() => setFilter(f.key)}>
              <Text style={[S.filterTxt, filter === f.key && S.filterTxtActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {filtered.length > 0 && (
          <View style={S.summaryPill}>
            <Text style={S.summaryIn}>+{GHS(totalIn)}</Text>
            <Text style={S.summarySep}> / </Text>
            <Text style={S.summaryOut}>-{GHS(totalOut)}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={S.center}><ActivityIndicator color={C.brand} size="large" /></View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={([date]) => date}
          renderItem={({ item }) => renderSection(item)}
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={S.empty}>
              <Text style={{ fontSize: 40, marginBottom: 14 }}>📋</Text>
              <Text style={S.emptyTitle}>No transactions found</Text>
              <Text style={S.emptyHint}>{search || filter !== 'all' ? 'Try adjusting your filters' : 'Your history will appear here'}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.borderLt },
  pageTitle: { fontSize: 22, fontWeight: '900', color: C.text },
  countTxt: { fontSize: 12, color: C.text4, fontWeight: '600' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, margin: 16, marginBottom: 8, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: C.border, gap: 10, ...C.shadowSm },
  searchInput: { flex: 1, fontSize: 14, color: C.text },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.white, borderWidth: 1, borderColor: C.border },
  chipActive: { backgroundColor: C.brand, borderColor: C.brand },
  chipTxt: { fontSize: 12, fontWeight: '600', color: C.text3 },
  chipTxtActive: { color: '#fff' },
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 },
  filterTabs: { flexDirection: 'row', backgroundColor: C.white, borderRadius: 12, padding: 3, borderWidth: 1, borderColor: C.border },
  filterTab: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 10 },
  filterTabActive: { backgroundColor: C.brand },
  filterTxt: { fontSize: 13, fontWeight: '600', color: C.text3 },
  filterTxtActive: { color: '#fff', fontWeight: '700' },
  summaryPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: C.borderLt },
  summaryIn: { fontSize: 12, fontWeight: '700', color: C.green },
  summarySep: { fontSize: 12, color: C.text4 },
  summaryOut: { fontSize: 12, fontWeight: '700', color: C.red },
  dateHeader: { fontSize: 11, fontWeight: '700', color: C.text4, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.bg },
  txnCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.borderLt, backgroundColor: C.white },
  txnDot: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  txnArrow: { fontSize: 18, fontWeight: '800' },
  txnNarr: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 2 },
  txnMeta: { fontSize: 11, color: C.text4, marginBottom: 1 },
  txnTime: { fontSize: 11, color: C.text4 },
  txnAmt: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
  txnBal: { fontSize: 11, color: C.text4 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.text3, marginBottom: 6 },
  emptyHint: { fontSize: 13, color: C.text4, textAlign: 'center' },
});
