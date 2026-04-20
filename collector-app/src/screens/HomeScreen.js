import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { supabase } from '../supabase';
import { C, GHS, fmtDate, fmtTime, PT } from '../theme';

const PERIODS = [
  { key:'today', label:'Today'  },
  { key:'week',  label:'7 Days' },
  { key:'month', label:'Month'  },
  { key:'all',   label:'All'    },
];

function getRange(key) {
  const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (key === 'today') return [today.toISOString(), now.toISOString()];
  if (key === 'week')  { const w = new Date(today); w.setDate(w.getDate()-7); return [w.toISOString(), now.toISOString()]; }
  if (key === 'month') return [new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), now.toISOString()];
  return [null, null];
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen({ collector, badge, onBadgeClear }) {
  const [period,      setPeriod]      = useState('today');
  const [collections, setCollections] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const [from, to] = getRange(period);
      let q = supabase.from('collections')
        .select('*, accounts(account_number)')
        .eq('collector_id', collector.id)
        .order('created_at', { ascending:false });
      if (from) q = q.gte('created_at', from);
      if (to)   q = q.lte('created_at', to);
      const { data } = await q;
      setCollections(data || []);
    } catch (_) {}
    if (refresh) setRefreshing(false); else setLoading(false);
  }, [period, collector.id]);

  useEffect(() => { load(); }, [load]);

  const total  = collections.reduce((s, c) => s + Number(c.amount || 0), 0);
  const byType = { savings:0, loan:0, hp:0 };
  collections.forEach(c => { const t = c.payment_type || 'savings'; byType[t] = (byType[t]||0) + Number(c.amount||0); });
  const firstName = collector.name?.split(' ')[0] || 'Collector';

  if (loading) return (
    <View style={S.center}>
      <ActivityIndicator color={C.brand} size="large" />
      <Text style={S.loadTxt}>Loading…</Text>
    </View>
  );

  return (
    <ScrollView style={S.root} contentContainerStyle={{ paddingBottom:32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
      showsVerticalScrollIndicator={false}>

      {/* ── Hero balance card ── */}
      <View style={S.heroCard}>
        <View style={S.heroDecor1} />
        <View style={S.heroDecor2} />
        <View style={S.heroTop}>
          <View>
            <Text style={S.heroGreet}>{greeting()},</Text>
            <Text style={S.heroName}>{firstName} 👋</Text>
          </View>
          <View style={S.avatar}>
            <Text style={S.avatarTxt}>{(collector.name||'C')[0].toUpperCase()}</Text>
          </View>
        </View>
        <Text style={S.heroLabel}>Total Collected</Text>
        <Text style={S.heroAmt}>{GHS(total)}</Text>
        <Text style={S.heroSub}>{collections.length} collection{collections.length !== 1 ? 's' : ''}{collector.zone ? ' · ' + collector.zone : ''}</Text>

        {/* Breakdown */}
        <View style={S.heroStats}>
          {Object.entries(byType).map(([k, v], i) => (
            <React.Fragment key={k}>
              {i > 0 && <View style={S.heroStatDiv} />}
              <View style={S.heroStat}>
                <Text style={S.heroStatLabel}>{PT[k]?.label}</Text>
                <Text style={[S.heroStatVal, { color: PT[k]?.color === '#16a34a' ? '#86efac' : PT[k]?.color === '#2563eb' ? '#93c5fd' : '#c4b5fd' }]}>{GHS(v)}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>

      {/* ── Quick actions ── */}
      <View style={S.quickRow}>
        {[
          { icon:'💳', label:'Collect',  key:'credit'  },
          { icon:'📋', label:'Accounts', key:'account' },
          { icon:'📊', label:'Reports',  key:'report'  },
          { icon:'🔔', label:'Alerts',   key:'notif',  badge: badge > 0 },
        ].map(q => (
          <TouchableOpacity key={q.key} style={S.quickBtn} activeOpacity={0.8}>
            <View style={S.quickIcon}>
              <Text style={{ fontSize:22 }}>{q.icon}</Text>
              {q.badge && <View style={S.quickBadge}><Text style={S.quickBadgeTxt}>{badge > 9 ? '9+' : badge}</Text></View>}
            </View>
            <Text style={S.quickLabel}>{q.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Period filter ── */}
      <View style={S.periodWrap}>
        <View style={S.periodRow}>
          {PERIODS.map(p => (
            <TouchableOpacity key={p.key} style={[S.periodBtn, period === p.key && S.periodBtnOn]}
              onPress={() => setPeriod(p.key)} activeOpacity={0.8}>
              <Text style={[S.periodTxt, period === p.key && S.periodTxtOn]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Recent collections ── */}
      <View style={S.section}>
        <View style={S.secRow}>
          <Text style={S.secTitle}>Collections</Text>
          <Text style={S.secCount}>{collections.length}</Text>
        </View>

        {collections.length === 0 ? (
          <View style={S.emptyBox}>
            <Text style={{ fontSize:32, marginBottom:8 }}>📋</Text>
            <Text style={S.emptyTxt}>No collections this period</Text>
            <Text style={S.emptyHint}>Pull down to refresh</Text>
          </View>
        ) : collections.map((c, i) => {
          const pt  = c.payment_type || 'savings';
          const ptc = PT[pt] || PT.savings;
          return (
            <View key={c.id || i} style={[S.txnRow, i === collections.length - 1 && { borderBottomWidth:0 }]}>
              <View style={[S.txnDot, { backgroundColor:ptc.bg }]}>
                <Text style={[S.txnArrow, { color:ptc.color }]}>{pt === 'savings' ? '↑' : '↓'}</Text>
              </View>
              <View style={{ flex:1 }}>
                <Text style={S.txnName} numberOfLines={1}>{c.customer_name || '—'}</Text>
                <Text style={S.txnMeta}>{c.accounts?.account_number || '—'} · {fmtDate(c.created_at)} {fmtTime(c.created_at)}</Text>
              </View>
              <View style={{ alignItems:'flex-end' }}>
                <Text style={[S.txnAmt, { color:ptc.color }]}>{GHS(c.amount)}</Text>
                <View style={[S.txnTag, { backgroundColor:ptc.bg }]}>
                  <Text style={[S.txnTagTxt, { color:ptc.color }]}>{ptc.label}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const S = StyleSheet.create({
  root:         { flex:1, backgroundColor:C.bg },
  center:       { flex:1, alignItems:'center', justifyContent:'center', gap:10 },
  loadTxt:      { color:C.text3, fontSize:13 },

  heroCard:     { margin:16, borderRadius:24, backgroundColor:C.brand, padding:22, overflow:'hidden', ...C.shadowLg },
  heroDecor1:   { position:'absolute', width:200, height:200, borderRadius:100, backgroundColor:'rgba(255,255,255,0.07)', top:-80, right:-60 },
  heroDecor2:   { position:'absolute', width:120, height:120, borderRadius:60, backgroundColor:'rgba(255,255,255,0.05)', bottom:-40, left:20 },
  heroTop:      { flexDirection:'row', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 },
  heroGreet:    { color:'rgba(255,255,255,0.65)', fontSize:13, fontWeight:'500', marginBottom:2 },
  heroName:     { color:'#fff', fontSize:20, fontWeight:'800' },
  avatar:       { width:44, height:44, borderRadius:22, backgroundColor:'rgba(255,255,255,0.2)', alignItems:'center', justifyContent:'center' },
  avatarTxt:    { color:'#fff', fontSize:18, fontWeight:'800' },
  heroLabel:    { color:'rgba(255,255,255,0.65)', fontSize:12, fontWeight:'600', marginBottom:4 },
  heroAmt:      { color:'#fff', fontSize:34, fontWeight:'900', letterSpacing:-1, marginBottom:4 },
  heroSub:      { color:'rgba(255,255,255,0.55)', fontSize:12, marginBottom:20 },
  heroStats:    { flexDirection:'row', backgroundColor:'rgba(0,0,0,0.15)', borderRadius:14, padding:14 },
  heroStat:     { flex:1, alignItems:'center' },
  heroStatDiv:  { width:1, backgroundColor:'rgba(255,255,255,0.15)' },
  heroStatLabel:{ color:'rgba(255,255,255,0.55)', fontSize:10, fontWeight:'600', marginBottom:4, textTransform:'uppercase' },
  heroStatVal:  { fontSize:13, fontWeight:'800' },

  quickRow:     { flexDirection:'row', paddingHorizontal:16, gap:10, marginBottom:8 },
  quickBtn:     { flex:1, alignItems:'center', backgroundColor:C.white, borderRadius:16, paddingVertical:14, borderWidth:1, borderColor:C.borderLt, ...C.shadowSm },
  quickIcon:    { width:40, height:40, borderRadius:12, backgroundColor:C.blueLt, alignItems:'center', justifyContent:'center', marginBottom:6, position:'relative' },
  quickBadge:   { position:'absolute', top:-2, right:-2, minWidth:16, height:16, borderRadius:8, backgroundColor:C.red, alignItems:'center', justifyContent:'center', paddingHorizontal:3 },
  quickBadgeTxt:{ color:'#fff', fontSize:8, fontWeight:'900' },
  quickLabel:   { fontSize:11, fontWeight:'700', color:C.text2 },

  periodWrap:   { paddingHorizontal:16, marginBottom:4 },
  periodRow:    { flexDirection:'row', backgroundColor:C.white, borderRadius:14, padding:4, borderWidth:1, borderColor:C.borderLt },
  periodBtn:    { flex:1, paddingVertical:8, borderRadius:10, alignItems:'center' },
  periodBtnOn:  { backgroundColor:C.brand },
  periodTxt:    { fontSize:12, fontWeight:'600', color:C.text3 },
  periodTxtOn:  { color:'#fff' },

  section:      { marginTop:8 },
  secRow:       { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:20, marginBottom:8 },
  secTitle:     { fontSize:16, fontWeight:'800', color:C.text },
  secCount:     { fontSize:13, color:C.brand, fontWeight:'700' },

  emptyBox:     { alignItems:'center', paddingVertical:40, marginHorizontal:16, backgroundColor:C.white, borderRadius:16, borderWidth:1, borderColor:C.borderLt },
  emptyTxt:     { fontSize:14, color:C.text3, fontWeight:'600', marginBottom:4 },
  emptyHint:    { fontSize:12, color:C.text4 },

  txnRow:       { flexDirection:'row', alignItems:'center', gap:12, paddingVertical:13, paddingHorizontal:20, borderBottomWidth:1, borderBottomColor:C.borderLt, backgroundColor:C.white },
  txnDot:       { width:40, height:40, borderRadius:12, alignItems:'center', justifyContent:'center' },
  txnArrow:     { fontSize:18, fontWeight:'800' },
  txnName:      { fontSize:13, fontWeight:'600', color:C.text, marginBottom:2 },
  txnMeta:      { fontSize:11, color:C.text4 },
  txnAmt:       { fontSize:14, fontWeight:'800', marginBottom:3 },
  txnTag:       { paddingHorizontal:7, paddingVertical:2, borderRadius:6 },
  txnTagTxt:    { fontSize:10, fontWeight:'700' },
});
