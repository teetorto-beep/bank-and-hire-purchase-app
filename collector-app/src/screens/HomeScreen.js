import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { supabase } from "../supabase";
import { C, GHS, fmtDateTime, PT } from "../theme";

const PERIODS = [
  { key:"today", label:"Today"  },
  { key:"week",  label:"7 Days" },
  { key:"month", label:"Month"  },
  { key:"all",   label:"All"    },
];

function getRange(key) {
  const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (key==="today") return [today.toISOString(), now.toISOString()];
  if (key==="week")  { const w=new Date(today); w.setDate(w.getDate()-7); return [w.toISOString(), now.toISOString()]; }
  if (key==="month") return [new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), now.toISOString()];
  return [null, null];
}

export default function HomeScreen({ collector }) {
  const [period, setPeriod]           = useState("today");
  const [collections, setCollections] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);

  const load = useCallback(async (refresh=false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const [from, to] = getRange(period);
      let q = supabase.from("collections").select("*, accounts(account_number)")
        .eq("collector_id", collector.id).order("created_at", { ascending:false });
      if (from) q = q.gte("created_at", from);
      if (to)   q = q.lte("created_at", to);
      const { data } = await q;
      setCollections(data || []);
    } catch(_) {}
    if (refresh) setRefreshing(false); else setLoading(false);
  }, [period, collector.id]);

  useEffect(() => { load(); }, [load]);

  const total  = collections.reduce((s,c) => s + Number(c.amount||0), 0);
  const byType = { savings:0, loan:0, hp:0 };
  collections.forEach(c => { const t=c.payment_type||"savings"; byType[t]=(byType[t]||0)+Number(c.amount||0); });
  const hour = new Date().getHours();
  const greeting = hour<12 ? "Morning" : hour<17 ? "Afternoon" : "Evening";

  return (
    <ScrollView style={S.root} contentContainerStyle={{ paddingBottom:32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
      showsVerticalScrollIndicator={false}>

      {/* Hero */}
      <View style={S.hero}>
        <View style={S.heroTop}>
          <View>
            <Text style={S.greeting}>Good {greeting}</Text>
            <Text style={S.name}>{collector.name}</Text>
          </View>
          <View style={S.avatar}><Text style={S.avatarTxt}>{(collector.name||"C")[0].toUpperCase()}</Text></View>
        </View>
        <Text style={S.totalLabel}>Total Collected</Text>
        <Text style={S.totalAmt}>{GHS(total)}</Text>
        <Text style={S.totalSub}>{collections.length} transaction{collections.length!==1?"s":""}</Text>

        <View style={S.pills}>
          {Object.entries(byType).map(([k,v]) => (
            <View key={k} style={[S.pill, { borderColor: PT[k]?.color+"33" }]}>
              <Text style={[S.pillLabel, { color:PT[k]?.color }]}>{PT[k]?.label}</Text>
              <Text style={[S.pillAmt, { color:PT[k]?.color }]}>{GHS(v)}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Period tabs */}
      <View style={S.tabsWrap}>
        {PERIODS.map(p => (
          <TouchableOpacity key={p.key} style={[S.tabBtn, period===p.key && S.tabBtnOn]}
            onPress={() => setPeriod(p.key)} activeOpacity={0.7}>
            <Text style={[S.tabTxt, period===p.key && S.tabTxtOn]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <View style={S.section}>
        <Text style={S.sectionTitle}>Transactions</Text>
        {loading ? (
          <ActivityIndicator color={C.brand} style={{ marginTop:32 }} />
        ) : collections.length === 0 ? (
          <View style={S.empty}>
            <Text style={S.emptyTxt}>No transactions</Text>
            <Text style={S.emptyHint}>Pull down to refresh</Text>
          </View>
        ) : (
          <View style={S.list}>
            {collections.map((c,i) => {
              const pt = c.payment_type||"savings";
              const ptc = PT[pt]||PT.savings;
              return (
                <View key={c.id||i} style={[S.row, i===collections.length-1 && { borderBottomWidth:0 }]}>
                  <View style={[S.dot2, { backgroundColor:ptc.bg }]}>
                    <Text style={{ color:ptc.color, fontSize:14, fontWeight:"700" }}>{pt==="savings"?"↑":"↓"}</Text>
                  </View>
                  <View style={{ flex:1 }}>
                    <Text style={S.rowName} numberOfLines={1}>{c.customer_name||"—"}</Text>
                    <Text style={S.rowMeta}>{c.accounts?.account_number||"—"} · {fmtDateTime(c.created_at)}</Text>
                  </View>
                  <View style={{ alignItems:"flex-end" }}>
                    <Text style={[S.rowAmt, { color:ptc.color }]}>{GHS(c.amount)}</Text>
                    <Text style={[S.rowTag, { color:ptc.color }]}>{ptc.label}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const S = StyleSheet.create({
  root:       { flex:1, backgroundColor:C.bg },
  hero:       { backgroundColor:C.bgDark, paddingHorizontal:20, paddingTop:16, paddingBottom:24 },
  heroTop:    { flexDirection:"row", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 },
  greeting:   { fontSize:12, color:"rgba(255,255,255,0.4)", marginBottom:2 },
  name:       { fontSize:20, fontWeight:"700", color:"#fff" },
  avatar:     { width:44, height:44, borderRadius:22, backgroundColor:C.brand, alignItems:"center", justifyContent:"center" },
  avatarTxt:  { color:"#fff", fontSize:18, fontWeight:"800" },
  totalLabel: { color:"rgba(255,255,255,0.4)", fontSize:11, textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 },
  totalAmt:   { color:"#fff", fontSize:36, fontWeight:"800", letterSpacing:-1, marginBottom:2 },
  totalSub:   { color:"rgba(255,255,255,0.3)", fontSize:12, marginBottom:16 },
  pills:      { flexDirection:"row", gap:8 },
  pill:       { flex:1, backgroundColor:"rgba(255,255,255,0.06)", borderRadius:10, padding:10, borderWidth:1 },
  pillLabel:  { fontSize:10, fontWeight:"600", textTransform:"uppercase", marginBottom:3 },
  pillAmt:    { fontSize:12, fontWeight:"700" },
  tabsWrap:   { flexDirection:"row", paddingHorizontal:16, paddingTop:16, paddingBottom:4, gap:6 },
  tabBtn:     { flex:1, paddingVertical:8, borderRadius:8, backgroundColor:C.bgCard, alignItems:"center", borderWidth:1, borderColor:C.border },
  tabBtnOn:   { backgroundColor:C.brand, borderColor:C.brand },
  tabTxt:     { fontSize:12, fontWeight:"600", color:C.text3 },
  tabTxtOn:   { color:"#fff" },
  section:    { paddingHorizontal:16, paddingTop:16 },
  sectionTitle:{ fontSize:11, fontWeight:"700", color:C.text4, textTransform:"uppercase", letterSpacing:0.8, marginBottom:10 },
  empty:      { alignItems:"center", paddingVertical:40 },
  emptyTxt:   { fontSize:14, fontWeight:"600", color:C.text3, marginBottom:4 },
  emptyHint:  { fontSize:12, color:C.text4 },
  list:       { backgroundColor:C.bgCard, borderRadius:14, borderWidth:1, borderColor:C.border, overflow:"hidden" },
  row:        { flexDirection:"row", alignItems:"center", gap:12, paddingVertical:13, paddingHorizontal:14, borderBottomWidth:1, borderBottomColor:C.borderLt },
  dot2:       { width:38, height:38, borderRadius:10, alignItems:"center", justifyContent:"center" },
  rowName:    { fontSize:14, fontWeight:"600", color:C.text, marginBottom:2 },
  rowMeta:    { fontSize:11, color:C.text4 },
  rowAmt:     { fontSize:14, fontWeight:"700", marginBottom:2 },
  rowTag:     { fontSize:10, fontWeight:"600" },
});
