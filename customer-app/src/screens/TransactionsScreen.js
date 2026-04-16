
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { supabase } from '../supabase';
import { C, GHS, fmtDate, fmtTime } from '../theme';

const FILTERS = [
  { key: 'all',    label: 'All'     },
  { key: 'credit', label: 'Credits' },
  { key: 'debit',  label: 'Debits'  },
];

export default function TransactionsScreen({ customer, tick }) {
  const [accounts,     setAccounts]     = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [filtered,     setFiltered]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [filter,       setFilter]       = useState('all');
  const [search,       setSearch]       = useState('');
  const [selAcc,       setSelAcc]       = useState('all');
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
      .in('account_id', ids).order('created_at', { ascending: false }).limit(150);
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

  const renderItem = ({ item: txn }) => {
    const isCredit = txn.type === 'credit';
    const date = txn.created_at ? new Date(txn.created_at) : null;
    return (
      <View style={S.txnCard}>
        <View style={[S.txnIcon, { backgroundColor: isCredit ? C.greenLt : C.redLt }]}>
          <Text style={[S.txnArrow, { color: isCredit ? C.green : C.red }]}>{isCredit ? '↑' : '↓'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={S.txnNarr} numberOfLines={2}>{txn.narration || 'Transaction'}</Text>
          <Text style={S.txnMeta}>{getAccNum(txn.account_id)}{txn.reference ? '  ·  ' + txn.reference : ''}</Text>
          {date && <Text style={S.txnDate}>{fmtDate(txn.created_at)}  ·  {fmtTime(txn.created_at)}</Text>}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[S.txnAmt, { color: isCredit ? C.green : C.red }]}>{isCredit ? '+' : '-'}{GHS(txn.amount)}</Text>
          {txn.balance_after != null && <Text style={S.txnBal}>Bal: {GHS(txn.balance_after)}</Text>}
          {txn.channel && <View style={S.channelBadge}><Text style={S.channelTxt}>{txn.channel}</Text></View>}
        </View>
      </View>
    );
  };

  return (
    <View style={S.root}>
      {/* Search */}
      <View style={S.searchWrap}>
        <Text style={{ fontSize: 16 }}>🔍</Text>
        <TextInput style={S.searchInput} placeholder="Search narration or reference…"
          placeholderTextColor={C.text4} value={search} onChangeText={setSearch} returnKeyType="search" />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} style={{ padding: 4 }}>
            <Text style={{ fontSize: 13, color: C.text4, fontWeight: '700' }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Account filter */}
      {accounts.length > 1 && (
        <View style={S.chipRow}>
          <TouchableOpacity style={[S.chip, selAcc === 'all' && S.chipActive]} onPress={() => setSelAcc('all')}>
            <Text style={[S.chipTxt, selAcc === 'all' && S.chipTxtActive]}>All</Text>
          </TouchableOpacity>
          {accounts.map(acc => (
            <TouchableOpacity key={acc.id} style={[S.chip, selAcc === acc.id && S.chipActive]} onPress={() => setSelAcc(acc.id)}>
              <Text style={[S.chipTxt, selAcc === acc.id && S.chipTxtActive]} numberOfLines={1}>{acc.account_number}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Type filter + count */}
      <View style={S.filterBar}>
        <View style={S.filterTabs}>
          {FILTERS.map(f => (
            <TouchableOpacity key={f.key} style={[S.filterTab, filter === f.key && S.filterTabActive]} onPress={() => setFilter(f.key)}>
              <Text style={[S.filterTxt, filter === f.key && S.filterTxtActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={S.countTxt}>{filtered.length} records</Text>
      </View>

      {/* Summary */}
      {filtered.length > 0 && (
        <View style={S.summaryRow}>
          <View style={S.summaryItem}>
            <Text style={S.summaryLabel}>Total In</Text>
            <Text style={[S.summaryVal, { color: C.green }]}>+{GHS(totalIn)}</Text>
          </View>
          <View style={S.summaryDiv} />
          <View style={S.summaryItem}>
            <Text style={S.summaryLabel}>Total Out</Text>
            <Text style={[S.summaryVal, { color: C.red }]}>-{GHS(totalOut)}</Text>
          </View>
          <View style={S.summaryDiv} />
          <View style={S.summaryItem}>
            <Text style={S.summaryLabel}>Net</Text>
            <Text style={[S.summaryVal, { color: totalIn - totalOut >= 0 ? C.green : C.red }]}>
              {totalIn - totalOut >= 0 ? '+' : ''}{GHS(totalIn - totalOut)}
            </Text>
          </View>
        </View>
      )}

      {loading ? (
        <View style={S.center}>
          <ActivityIndicator color={C.brand} size="large" />
          <Text style={S.loadTxt}>Loading transactions…</Text>
        </View>
      ) : (
        <FlatList data={filtered} keyExtractor={i => i.id} renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={S.empty}>
              <Text style={{ fontSize: 40, marginBottom: 14 }}>📋</Text>
              <Text style={S.emptyTitle}>No transactions found</Text>
              <Text style={S.emptyHint}>{search || filter !== 'all' ? 'Try adjusting your filters' : 'Your transaction history will appear here'}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  loadTxt: { color: C.text3, fontSize: 13 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, margin: 16, marginBottom: 10, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: C.border, gap: 10, ...C.shadowSm },
  searchInput: { flex: 1, fontSize: 14, color: C.text },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8, marginBottom: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  chipActive: { backgroundColor: C.brand, borderColor: C.brand },
  chipTxt: { fontSize: 12, fontWeight: '600', color: C.text3 },
  chipTxtActive: { color: '#fff' },
  filterBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 10 },
  filterTabs: { flexDirection: 'row', backgroundColor: C.card, borderRadius: 12, padding: 3, borderWidth: 1, borderColor: C.border },
  filterTab: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 10 },
  filterTabActive: { backgroundColor: C.brand },
  filterTxt: { fontSize: 13, fontWeight: '600', color: C.text3 },
  filterTxtActive: { color: '#fff', fontWeight: '700' },
  countTxt: { fontSize: 12, color: C.text4, fontWeight: '600' },
  summaryRow: { flexDirection: 'row', backgroundColor: C.card, marginHorizontal: 16, borderRadius: 14, padding: 14, marginBottom: 6, borderWidth: 1, borderColor: C.borderLt, ...C.shadowSm },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDiv: { width: 1, backgroundColor: C.borderLt },
  summaryLabel: { fontSize: 10, color: C.text4, marginBottom: 4, fontWeight: '600', textTransform: 'uppercase' },
  summaryVal: { fontSize: 13, fontWeight: '800' },
  txnCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.borderLt, ...C.shadowSm },
  txnIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  txnArrow: { fontSize: 18, fontWeight: '800' },
  txnNarr: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 3, lineHeight: 18 },
  txnMeta: { fontSize: 11, color: C.text4, marginBottom: 2 },
  txnDate: { fontSize: 11, color: C.text4 },
  txnAmt: { fontSize: 15, fontWeight: '800', marginBottom: 3 },
  txnBal: { fontSize: 11, color: C.text4 },
  channelBadge: { marginTop: 4, backgroundColor: C.surface, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: C.border },
  channelTxt: { fontSize: 10, color: C.text3, fontWeight: '600', textTransform: 'capitalize' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.text3, marginBottom: 6 },
  emptyHint: { fontSize: 13, color: C.text4, textAlign: 'center' },
});
