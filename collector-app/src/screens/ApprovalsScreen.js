import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { supabase } from '../supabase';
import { C, GHS, fmtDateTime } from '../theme';

const STATUS = {
  pending:  { label: 'Pending',  bg: '#fef9c3', color: '#92400e', dot: '#d97706' },
  approved: { label: 'Approved', bg: '#d1fae5', color: '#065f46', dot: '#059669' },
  rejected: { label: 'Rejected', bg: '#fee2e2', color: '#991b1b', dot: '#dc2626' },
};

const TYPE_ICON = {
  collection: '💰', account: '🏦', customer: '👤',
  credit: '↑', debit: '↓', transaction: '💳',
};

function getTitle(item) {
  const p = item.payload || {};
  if (item.source === 'pending_txn') {
    return `${item.type === 'credit' ? 'Credit' : 'Debit'} — ${GHS(item.amount || 0)}`;
  }
  if (item.type === 'collection') return `${p.customerName || '—'} · ${GHS(p.amount || 0)}`;
  if (item.type === 'account')    return `${p.customerName || p.name || '—'} · ${(p.type || p.category || '').replace(/_/g, ' ')}`;
  if (item.type === 'customer')   return p.name || 'New Customer';
  return item.type || '—';
}

export default function ApprovalsScreen({ collector }) {
  const [items,      setItems]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter,     setFilter]     = useState('all'); // all | pending | approved | rejected
  const [search,     setSearch]     = useState('');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      // Load from pending_approvals (collections, account openings)
      const { data: approvals } = await supabase
        .from('pending_approvals')
        .select('*')
        .eq('submitted_by', collector.id)
        .order('submitted_at', { ascending: false });

      // Load from pending_transactions (teller-style cash transactions)
      const { data: txns } = await supabase
        .from('pending_transactions')
        .select('*')
        .eq('submitted_by', collector.id)
        .order('submitted_at', { ascending: false });

      const fromApprovals = (approvals || []).map(a => ({ ...a, source: 'approval' }));
      const fromTxns = (txns || []).map(t => ({
        ...t,
        source:         'pending_txn',
        submitted_at:   t.submitted_at || t.submittedAt || '',
        submitter_name: t.submitter_name || t.submitterName || collector.name,
        payload: { amount: t.amount, narration: t.narration, type: t.type, accountId: t.account_id },
      }));

      const merged = [...fromApprovals, ...fromTxns]
        .sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0));
      setItems(merged);
    } catch (e) {
      console.warn('ApprovalsScreen load error:', e.message);
    }
    if (refresh) setRefreshing(false); else setLoading(false);
  }, [collector.id]);

  useEffect(() => { load(); }, [load]);

  // Realtime updates
  useEffect(() => {
    const ch = supabase
      .channel(`col-approvals-${collector.id}-${Date.now()}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pending_approvals' }, p => {
        const row = p.new;
        if (!row || row.submitted_by !== collector.id) return;
        setItems(prev => prev.map(i => i.id === row.id && i.source === 'approval' ? { ...row, source: 'approval' } : i));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pending_transactions' }, p => {
        const row = p.new;
        if (!row || row.submitted_by !== collector.id) return;
        setItems(prev => prev.map(i => i.id === row.id && i.source === 'pending_txn'
          ? { ...row, source: 'pending_txn', payload: { amount: row.amount, narration: row.narration, type: row.type } }
          : i));
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [collector.id]);

  const counts = {
    all:      items.length,
    pending:  items.filter(i => i.status === 'pending').length,
    approved: items.filter(i => i.status === 'approved').length,
    rejected: items.filter(i => i.status === 'rejected').length,
  };

  const filtered = items.filter(item => {
    if (filter !== 'all' && item.status !== filter) return false;
    if (search.trim()) {
      const q   = search.toLowerCase();
      const ttl = getTitle(item).toLowerCase();
      const sub = (item.submitter_name || '').toLowerCase();
      const p   = item.payload || {};
      const narr = (item.narration || p.narration || '').toLowerCase();
      const cust = (p.customerName || '').toLowerCase();
      if (!ttl.includes(q) && !sub.includes(q) && !narr.includes(q) && !cust.includes(q)) return false;
    }
    return true;
  });

  if (loading) return (
    <View style={S.center}><ActivityIndicator color={C.brand} size="large" /></View>
  );

  return (
    <View style={S.root}>
      {/* Header */}
      <View style={S.header}>
        <Text style={S.title}>My Approvals</Text>
        <Text style={S.sub}>{counts.pending > 0 ? `${counts.pending} awaiting` : 'All up to date'}</Text>
      </View>

      {/* Stat pills */}
      <View style={S.statRow}>
        {[
          { key: 'all',      label: 'All',      color: C.blue,  bg: C.blueLt  },
          { key: 'pending',  label: 'Pending',  color: C.amber, bg: C.amberLt },
          { key: 'approved', label: 'Approved', color: C.green, bg: C.greenLt },
          { key: 'rejected', label: 'Rejected', color: C.red,   bg: C.redLt   },
        ].map(s => (
          <TouchableOpacity key={s.key} onPress={() => setFilter(s.key)}
            style={[S.statPill, filter === s.key && { backgroundColor: s.color, borderColor: s.color }]}>
            <Text style={[S.statCount, filter === s.key && { color: '#fff' }]}>{counts[s.key]}</Text>
            <Text style={[S.statLabel, filter === s.key && { color: 'rgba(255,255,255,0.85)' }]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search */}
      <View style={S.searchWrap}>
        <Text style={S.searchIcon}>🔍</Text>
        <TextInput
          style={S.searchInput}
          placeholder="Search by customer, amount, narration…"
          placeholderTextColor={C.text4}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} style={S.searchClear}>
            <Text style={{ color: C.text4, fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={i => `${i.source}-${i.id}`}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
        ListEmptyComponent={
          <View style={S.empty}>
            <Text style={{ fontSize: 44, marginBottom: 12 }}>📋</Text>
            <Text style={S.emptyTxt}>{search ? 'No results found' : 'No submissions yet'}</Text>
            <Text style={S.emptyHint}>Your submitted transactions will appear here</Text>
          </View>
        }
        renderItem={({ item }) => {
          const st  = STATUS[item.status] || STATUS.pending;
          const icon = TYPE_ICON[item.type] || '📄';
          const title = getTitle(item);
          const p = item.payload || {};
          const narr = item.narration || p.narration || '';
          const isTxn = item.source === 'pending_txn';

          return (
            <View style={[S.card, { borderLeftColor: st.dot, borderLeftWidth: 4 }]}>
              {/* Top row */}
              <View style={S.cardTop}>
                <View style={[S.iconBox, { backgroundColor: st.bg }]}>
                  <Text style={{ fontSize: 20 }}>{icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={S.cardTitle} numberOfLines={1}>{title}</Text>
                  <Text style={S.cardSub}>
                    {isTxn ? 'Cash Transaction' : (item.type || '').replace(/_/g, ' ')}
                    {' · '}{fmtDateTime(item.submitted_at)}
                  </Text>
                </View>
                <View style={[S.statusBadge, { backgroundColor: st.bg }]}>
                  <View style={[S.statusDot, { backgroundColor: st.dot }]} />
                  <Text style={[S.statusTxt, { color: st.color }]}>{st.label}</Text>
                </View>
              </View>

              {/* Details */}
              {(narr || p.customerName || p.accountId) ? (
                <View style={S.cardDetails}>
                  {p.customerName ? <Text style={S.detailTxt}>👤 {p.customerName}</Text> : null}
                  {p.accountId    ? <Text style={S.detailTxt}>🏦 {p.accountId}</Text> : null}
                  {narr           ? <Text style={S.detailTxt} numberOfLines={2}>📝 {narr}</Text> : null}
                </View>
              ) : null}

              {/* Rejection reason */}
              {item.status === 'rejected' && item.reject_reason ? (
                <View style={S.rejectBox}>
                  <Text style={S.rejectTxt}>❌ Reason: {item.reject_reason}</Text>
                </View>
              ) : null}

              {/* Approved info */}
              {item.status === 'approved' ? (
                <View style={S.approvedBox}>
                  <Text style={S.approvedTxt}>✅ Approved by {item.approver_name || 'admin'}</Text>
                </View>
              ) : null}
            </View>
          );
        }}
      />
    </View>
  );
}

const S = StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:      { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.borderLt },
  title:       { fontSize: 22, fontWeight: '900', color: C.text },
  sub:         { fontSize: 12, color: C.text3, marginTop: 3, fontWeight: '600' },
  statRow:     { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.borderLt },
  statPill:    { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border },
  statCount:   { fontSize: 18, fontWeight: '900', color: C.text },
  statLabel:   { fontSize: 10, fontWeight: '700', color: C.text3, textTransform: 'uppercase', marginTop: 2 },
  searchWrap:  { flexDirection: 'row', alignItems: 'center', margin: 12, backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, gap: 8 },
  searchIcon:  { fontSize: 16 },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 14, color: C.text },
  searchClear: { padding: 4 },
  empty:       { alignItems: 'center', paddingTop: 60 },
  emptyTxt:    { fontSize: 16, fontWeight: '700', color: C.text3, marginBottom: 6 },
  emptyHint:   { fontSize: 13, color: C.text4, textAlign: 'center' },
  card:        { backgroundColor: C.white, borderRadius: 14, marginBottom: 12, overflow: 'hidden', ...C.shadow },
  cardTop:     { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  iconBox:     { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardTitle:   { fontSize: 14, fontWeight: '800', color: C.text, marginBottom: 3 },
  cardSub:     { fontSize: 11, color: C.text4, textTransform: 'capitalize' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, flexShrink: 0 },
  statusDot:   { width: 6, height: 6, borderRadius: 3 },
  statusTxt:   { fontSize: 11, fontWeight: '800' },
  cardDetails: { paddingHorizontal: 14, paddingBottom: 12, gap: 4 },
  detailTxt:   { fontSize: 12, color: C.text2, lineHeight: 18 },
  rejectBox:   { marginHorizontal: 14, marginBottom: 12, backgroundColor: C.redLt, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: C.redBg },
  rejectTxt:   { fontSize: 12, color: C.red, fontWeight: '600' },
  approvedBox: { marginHorizontal: 14, marginBottom: 12, backgroundColor: C.greenLt, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: C.greenBg },
  approvedTxt: { fontSize: 12, color: C.green, fontWeight: '600' },
});
