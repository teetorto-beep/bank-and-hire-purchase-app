import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, TextInput, Modal,
} from "react-native";
import { supabase } from "../supabase";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { C, GHS, fmtDateTime, PT } from "../theme";

// ── Simple date-only input (YYYY-MM-DD) ──────────────────────────────────────
function DateInput({ label, value, onChange, placeholder }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ flex: 1 }}>
      <Text style={DS.dateLabel}>{label}</Text>
      <View style={[DS.dateBox, focused && DS.dateBoxFocus]}>
        <Text style={DS.dateIcon}>&#128197;</Text>
        <TextInput
          style={DS.dateInput}
          placeholder={placeholder || "YYYY-MM-DD"}
          placeholderTextColor={C.text4}
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="numeric"
          maxLength={10}
        />
      </View>
    </View>
  );
}

const QUICK = [
  { key: "today", label: "Today" },
  { key: "week",  label: "7 Days" },
  { key: "month", label: "This Month" },
  { key: "all",   label: "All Time" },
];

function applyQuick(key) {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fmt   = d => d.toISOString().slice(0, 10);
  if (key === "today") return [fmt(today), fmt(today)];
  if (key === "week")  { const w = new Date(today); w.setDate(w.getDate() - 6); return [fmt(w), fmt(today)]; }
  if (key === "month") return [fmt(new Date(now.getFullYear(), now.getMonth(), 1)), fmt(today)];
  return ["", ""];
}

function toRange(startStr, endStr) {
  if (!startStr && !endStr) return [null, null];
  const from = startStr ? new Date(startStr + "T00:00:00").toISOString() : null;
  const to   = endStr   ? new Date(endStr   + "T23:59:59").toISOString() : null;
  return [from, to];
}

export default function ReportScreen({ collector }) {
  const today = new Date().toISOString().slice(0, 10);
  const [startDate,   setStartDate]   = useState(today);
  const [endDate,     setEndDate]     = useState(today);
  const [activeQuick, setActiveQuick] = useState("today");
  const [collections, setCollections] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [exporting,   setExporting]   = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const [from, to] = toRange(startDate, endDate);
      let q = supabase.from("collections")
        .select("*, accounts(account_number, balance)")
        .eq("collector_id", collector.id)
        .order("created_at", { ascending: false });
      if (from) q = q.gte("created_at", from);
      if (to)   q = q.lte("created_at", to);
      const { data } = await q;
      setCollections(data || []);
    } catch (_) {}
    if (refresh) setRefreshing(false); else setLoading(false);
  }, [startDate, endDate, collector.id]);

  useEffect(() => { load(); }, [load]);

  const handleQuick = (key) => {
    setActiveQuick(key);
    const [s, e] = applyQuick(key);
    setStartDate(s); setEndDate(e);
  };

  const handleSearch = () => { load(); };

  const total  = collections.reduce((s, c) => s + Number(c.amount || 0), 0);
  const byType = { savings: 0, loan: 0, hp: 0 };
  collections.forEach(c => {
    const t = c.payment_type || "savings";
    byType[t] = (byType[t] || 0) + Number(c.amount || 0);
  });

  const rangeLabel = startDate && endDate
    ? (startDate === endDate ? startDate : startDate + " → " + endDate)
    : startDate || endDate || "All Time";

  const handleExport = async () => {
    if (!collections.length) { Alert.alert("No Data", "No collections to export for this period"); return; }
    setExporting(true);
    try {
      const rows = collections.map((c, i) => {
        const pt  = c.payment_type || "savings";
        const col = { savings: "#16A34A", loan: "#2563EB", hp: "#7C3AED" }[pt] || "#64748b";
        return `<tr style="background:${i % 2 === 0 ? "#f9fafb" : "#fff"}">
          <td>${i + 1}</td>
          <td>${fmtDateTime(c.created_at)}</td>
          <td><strong>${c.customer_name || "—"}</strong></td>
          <td style="font-family:monospace">${c.accounts?.account_number || "—"}</td>
          <td><span style="background:${col}20;color:${col};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">${PT[pt]?.label || pt}</span></td>
          <td style="text-align:right;font-weight:700;color:#2563EB">GH₵ ${Number(c.amount || 0).toLocaleString("en-GH", { minimumFractionDigits: 2 })}</td>
          <td style="color:#6b7280;font-size:11px">${c.notes || "—"}</td>
        </tr>`;
      }).join("");

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
        <style>
          body{font-family:Arial,sans-serif;margin:0;padding:20px;font-size:12px;color:#111827}
          .hdr{background:linear-gradient(135deg,#0D1B2A,#1E3A5F);color:#fff;padding:20px 24px;border-radius:12px;margin-bottom:20px}
          .hdr h1{margin:0 0 4px;font-size:20px;font-weight:900}.hdr p{margin:0;font-size:12px;color:rgba(255,255,255,0.6)}
          .meta{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap}
          .mc{background:#f3f4f6;border-radius:10px;padding:12px 16px;flex:1;min-width:100px;border-left:3px solid #2563EB}
          .mc .lbl{font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;margin-bottom:4px}
          .mc .val{font-size:16px;font-weight:900;color:#111827}
          table{width:100%;border-collapse:collapse}
          th{background:#0D1B2A;color:#fff;padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px}
          td{padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px}
          .footer{margin-top:24px;text-align:center;font-size:10px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:14px}
        </style></head><body>
        <div class="hdr">
          <h1>Majupat Love Enterprise</h1>
          <p>Collection Report — ${collector.name}${collector.zone ? " · " + collector.zone : ""} · ${rangeLabel}</p>
        </div>
        <div class="meta">
          <div class="mc"><div class="lbl">Period</div><div class="val">${rangeLabel}</div></div>
          <div class="mc"><div class="lbl">Total Collected</div><div class="val">GH₵ ${Number(total).toLocaleString("en-GH", { minimumFractionDigits: 2 })}</div></div>
          <div class="mc"><div class="lbl">Transactions</div><div class="val">${collections.length}</div></div>
          <div class="mc"><div class="lbl">Generated</div><div class="val" style="font-size:11px">${new Date().toLocaleString()}</div></div>
        </div>
        <table><thead><tr>
          <th>#</th><th>Date &amp; Time</th><th>Customer</th><th>Account</th>
          <th>Type</th><th style="text-align:right">Amount</th><th>Notes</th>
        </tr></thead><tbody>${rows}</tbody></table>
        <div class="footer">Maxbraynn Technology &amp; Systems · Majupat Love Enterprise</div>
        </body></html>`;

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Collections — " + collector.name, UTI: "com.adobe.pdf" });
      } else {
        Alert.alert("PDF Created", uri);
      }
    } catch (e) { Alert.alert("Export Failed", e.message); }
    setExporting(false);
  };

  return (
    <ScrollView style={S.root} contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
      showsVerticalScrollIndicator={false}>

      {/* Header */}
      <View style={S.header}>
        <View style={S.headerRow}>
          <View>
            <Text style={S.headerTitle}>Reports</Text>
            <Text style={S.headerSub}>Collection summary &amp; export</Text>
          </View>
          <TouchableOpacity style={[S.exportBtn, exporting && { opacity: 0.6 }]}
            onPress={handleExport} disabled={exporting}>
            {exporting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={S.exportTxt}>&#8595; Export PDF</Text>}
          </TouchableOpacity>
        </View>

        {/* Summary hero */}
        <View style={S.heroCard}>
          <Text style={S.heroLabel}>Total Collected</Text>
          <Text style={S.heroAmt}>{GHS(total)}</Text>
          <Text style={S.heroSub}>{collections.length} transaction{collections.length !== 1 ? "s" : ""} · {rangeLabel}</Text>
          <View style={S.breakdown}>
            {Object.entries(byType).map(([k, v], i) => (
              <React.Fragment key={k}>
                {i > 0 && <View style={S.breakDiv} />}
                <View style={S.breakItem}>
                  <Text style={S.breakLabel}>{PT[k]?.label}</Text>
                  <Text style={[S.breakVal, { color: PT[k]?.color || "#fff" }]}>{GHS(v)}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        </View>
      </View>

      {/* Filter section */}
      <View style={S.filterCard}>
        <Text style={S.filterTitle}>Filter by Date Range</Text>

        {/* Quick filters */}
        <View style={S.quickRow}>
          {QUICK.map(q => (
            <TouchableOpacity key={q.key}
              style={[S.quickBtn, activeQuick === q.key && S.quickBtnActive]}
              onPress={() => handleQuick(q.key)}>
              <Text style={[S.quickTxt, activeQuick === q.key && S.quickTxtActive]}>{q.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Date inputs */}
        <View style={S.dateRow}>
          <DateInput label="From" value={startDate} onChange={v => { setStartDate(v); setActiveQuick(null); }} placeholder="YYYY-MM-DD" />
          <View style={S.dateSep}><Text style={S.dateSepTxt}>→</Text></View>
          <DateInput label="To" value={endDate} onChange={v => { setEndDate(v); setActiveQuick(null); }} placeholder="YYYY-MM-DD" />
        </View>

        <TouchableOpacity style={S.searchBtn} onPress={handleSearch} activeOpacity={0.85}>
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={S.searchBtnTxt}>&#128269;  Search Collections</Text>}
        </TouchableOpacity>
      </View>

      {/* Transactions */}
      <View style={S.section}>
        <View style={S.sectionHeader}>
          <Text style={S.sectionTitle}>Transactions</Text>
          {collections.length > 0 && (
            <View style={S.countBadge}>
              <Text style={S.countBadgeTxt}>{collections.length}</Text>
            </View>
          )}
        </View>

        {loading ? (
          <View style={S.loadingBox}>
            <ActivityIndicator color={C.brand} size="large" />
            <Text style={S.loadingTxt}>Loading collections...</Text>
          </View>
        ) : collections.length === 0 ? (
          <View style={S.empty}>
            <View style={S.emptyIconBox}><Text style={{ fontSize: 32 }}>&#128203;</Text></View>
            <Text style={S.emptyTxt}>No collections found</Text>
            <Text style={S.emptyHint}>Try a different date range or pull to refresh</Text>
          </View>
        ) : (
          <View style={S.txnList}>
            {collections.map((c, i) => {
              const pt  = c.payment_type || "savings";
              const ptc = PT[pt] || PT.savings;
              const isLast = i === collections.length - 1;
              return (
                <View key={c.id || i} style={[S.txnRow, isLast && { borderBottomWidth: 0 }]}>
                  <View style={[S.txnIcon, { backgroundColor: ptc.bg }]}>
                    <Text style={[S.txnIconTxt, { color: ptc.color }]}>
                      {pt === "savings" ? "↑" : "↓"}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.txnName} numberOfLines={1}>{c.customer_name || "\u2014"}</Text>
                    <Text style={S.txnMeta}>
                      {c.accounts?.account_number || "\u2014"} · {fmtDateTime(c.created_at)}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[S.txnAmt, { color: ptc.color }]}>{GHS(c.amount)}</Text>
                    <View style={[S.badge, { backgroundColor: ptc.bg }]}>
                      <Text style={[S.badgeTxt, { color: ptc.color }]}>{ptc.label}</Text>
                    </View>
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

const DS = StyleSheet.create({
  dateLabel:    { fontSize:11, fontWeight:"600", color:C.text3, textTransform:"uppercase", marginBottom:6 },
  dateBox:      { flexDirection:"row", alignItems:"center", backgroundColor:C.bg, borderWidth:1, borderColor:C.border, borderRadius:10, paddingHorizontal:10, gap:6 },
  dateBoxFocus: { borderColor:C.brand },
  dateIcon:     { fontSize:14 },
  dateInput:    { flex:1, paddingVertical:11, fontSize:13, color:C.text, fontWeight:"500" },
});

const S = StyleSheet.create({
  root:          { flex:1, backgroundColor:C.bg },

  header:        { backgroundColor:C.bgDark, paddingHorizontal:20, paddingTop:18, paddingBottom:22 },
  headerRow:     { flexDirection:"row", alignItems:"flex-start", justifyContent:"space-between", marginBottom:18 },
  headerTitle:   { fontSize:20, fontWeight:"700", color:"#fff", marginBottom:2 },
  headerSub:     { fontSize:12, color:"rgba(255,255,255,0.4)" },
  exportBtn:     { backgroundColor:C.brand, paddingHorizontal:14, paddingVertical:9, borderRadius:10 },
  exportTxt:     { color:"#fff", fontSize:13, fontWeight:"700" },

  heroCard:      { backgroundColor:"rgba(255,255,255,0.06)", borderRadius:14, padding:16, borderWidth:1, borderColor:"rgba(255,255,255,0.07)" },
  heroLabel:     { color:"rgba(255,255,255,0.4)", fontSize:10, textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 },
  heroAmt:       { color:"#fff", fontSize:32, fontWeight:"800", letterSpacing:-1, marginBottom:2 },
  heroSub:       { color:"rgba(255,255,255,0.35)", fontSize:11, marginBottom:14 },
  breakdown:     { flexDirection:"row", backgroundColor:"rgba(0,0,0,0.15)", borderRadius:10, padding:10 },
  breakItem:     { flex:1, alignItems:"center" },
  breakDiv:      { width:1, backgroundColor:"rgba(255,255,255,0.08)" },
  breakLabel:    { color:"rgba(255,255,255,0.4)", fontSize:9, textTransform:"uppercase", marginBottom:3 },
  breakVal:      { fontSize:12, fontWeight:"700" },

  filterCard:    { backgroundColor:C.bgCard, marginHorizontal:16, marginTop:14, borderRadius:14, padding:16, borderWidth:1, borderColor:C.border },
  filterTitle:   { fontSize:13, fontWeight:"700", color:C.text, marginBottom:12 },

  quickRow:      { flexDirection:"row", gap:6, marginBottom:14, flexWrap:"wrap" },
  quickBtn:      { paddingHorizontal:12, paddingVertical:7, borderRadius:8, backgroundColor:C.bg, borderWidth:1, borderColor:C.border },
  quickBtnActive:{ backgroundColor:C.brand, borderColor:C.brand },
  quickTxt:      { fontSize:12, fontWeight:"600", color:C.text3 },
  quickTxtActive:{ color:"#fff" },

  dateRow:       { flexDirection:"row", alignItems:"flex-end", gap:8, marginBottom:14 },
  dateSep:       { paddingBottom:10, alignItems:"center" },
  dateSepTxt:    { fontSize:16, color:C.text4 },

  searchBtn:     { backgroundColor:C.bgDark, borderRadius:10, paddingVertical:14, alignItems:"center" },
  searchBtnTxt:  { color:"#fff", fontSize:14, fontWeight:"700" },

  section:       { paddingHorizontal:16, marginTop:16 },
  sectionHeader: { flexDirection:"row", alignItems:"center", gap:8, marginBottom:10 },
  sectionTitle:  { fontSize:11, fontWeight:"700", color:C.text4, textTransform:"uppercase", letterSpacing:0.6 },
  countBadge:    { backgroundColor:C.brand, paddingHorizontal:7, paddingVertical:2, borderRadius:8 },
  countBadgeTxt: { color:"#fff", fontSize:10, fontWeight:"700" },

  loadingBox:    { alignItems:"center", paddingVertical:40, gap:10 },
  loadingTxt:    { fontSize:12, color:C.text4 },

  empty:         { alignItems:"center", paddingVertical:40 },
  emptyIconBox:  { width:60, height:60, borderRadius:30, backgroundColor:"#F1F5F9", alignItems:"center", justifyContent:"center", marginBottom:12 },
  emptyTxt:      { fontSize:14, fontWeight:"600", color:C.text3, marginBottom:4 },
  emptyHint:     { fontSize:12, color:C.text4 },

  txnList:       { backgroundColor:C.bgCard, borderRadius:14, overflow:"hidden", borderWidth:1, borderColor:C.border },
  txnRow:        { flexDirection:"row", alignItems:"center", gap:10, paddingVertical:13, paddingHorizontal:14, borderBottomWidth:1, borderBottomColor:C.borderLt },
  txnIcon:       { width:38, height:38, borderRadius:10, alignItems:"center", justifyContent:"center" },
  txnIconTxt:    { fontSize:16, fontWeight:"700" },
  txnName:       { fontSize:14, fontWeight:"600", color:C.text, marginBottom:2 },
  txnMeta:       { fontSize:11, color:C.text4 },
  txnAmt:        { fontSize:14, fontWeight:"700", marginBottom:2 },
  badge:         { paddingHorizontal:7, paddingVertical:2, borderRadius:6 },
  badgeTxt:      { fontSize:10, fontWeight:"600" },
});
