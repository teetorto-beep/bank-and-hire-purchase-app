import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, SectionList, ScrollView,
  TouchableOpacity, ActivityIndicator, RefreshControl, TextInput,
} from "react-native";
import { supabase } from "../supabase";
import { C, GHS, fmtDate, fmtTime } from "../theme";

const FILTERS = [
  { key: "all",    label: "All"     },
  { key: "credit", label: "Credits" },
  { key: "debit",  label: "Debits"  },
];

export default function TransactionsScreen({ customer, tick }) {
  const [accounts,     setAccounts]     = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [filter,       setFilter]       = useState("all");
  const [search,       setSearch]       = useState("");
  const [selAcc,       setSelAcc]       = useState("all");
  const firstLoad = useRef(true);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else if (firstLoad.current) setLoading(true);
    try {
      const { data: accs } = await supabase
        .from("accounts")
        .select("id,account_number,type")
        .eq("customer_id", customer.id);
      setAccounts(accs || []);
      const ids = (accs || []).map(a => a.id);
      if (!ids.length) { setTransactions([]); return; }
      const { data } = await supabase
        .from("transactions")
        .select("id,account_id,type,amount,narration,reference,created_at,balance_after,channel")
        .in("account_id", ids)
        .order("created_at", { ascending: false })
        .limit(300);
      setTransactions(data || []);
    } catch(e) { console.warn(e.message); }
    finally {
      if (refresh) setRefreshing(false);
      else { setLoading(false); firstLoad.current = false; }
    }
  }, [customer.id, tick]);

  useEffect(() => { load(); }, [load]);

  // Build filtered list
  const filtered = React.useMemo(() => {
    let r = transactions;
    if (selAcc !== "all") r = r.filter(t => t.account_id === selAcc);
    if (filter !== "all") r = r.filter(t => t.type === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(t =>
        (t.narration || "").toLowerCase().includes(q) ||
        (t.reference || "").toLowerCase().includes(q)
      );
    }
    return r;
  }, [transactions, filter, selAcc, search]);

  // Build SectionList sections grouped by date
  const sections = React.useMemo(() => {
    const map = {};
    filtered.forEach(t => {
      const d = fmtDate(t.created_at);
      if (!map[d]) map[d] = [];
      map[d].push(t);
    });
    return Object.entries(map).map(([title, data]) => ({ title, data }));
  }, [filtered]);

  const getAccNum = id => {
    const a = accounts.find(x => x.id === id);
    return a ? a.account_number : "\u2014";
  };

  const totalIn  = filtered.filter(t => t.type === "credit").reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = filtered.filter(t => t.type === "debit").reduce((s, t) => s + Number(t.amount), 0);

  const renderItem = ({ item: txn }) => {
    const cr = txn.type === "credit";
    return (
      <View style={S.txnCard}>
        <View style={[S.txnDot, { backgroundColor: cr ? C.greenBg : C.redBg }]}>
          <Text style={[S.txnArrow, { color: cr ? C.green : C.red }]}>{cr ? "\u2191" : "\u2193"}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={S.txnNarr} numberOfLines={1}>{txn.narration || "Transaction"}</Text>
          <Text style={S.txnMeta}>
            {getAccNum(txn.account_id)}{txn.channel ? " \u00B7 " + txn.channel : ""}
          </Text>
          <Text style={S.txnTime}>{fmtTime(txn.created_at)}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[S.txnAmt, { color: cr ? C.green : C.red }]}>
            {cr ? "+" : "-"}{GHS(txn.amount)}
          </Text>
          {txn.balance_after != null && (
            <Text style={S.txnBal}>Bal: {GHS(txn.balance_after)}</Text>
          )}
        </View>
      </View>
    );
  };

  const renderSectionHeader = ({ section: { title } }) => (
    <View style={S.dateHeader}>
      <Text style={S.dateHeaderTxt}>{title}</Text>
    </View>
  );

  return (
    <View style={S.root}>
      {/* Header */}
      <View style={S.header}>
        <View>
          <Text style={S.pageTitle}>Transaction History</Text>
          <Text style={S.countTxt}>{filtered.length} record{filtered.length !== 1 ? "s" : ""}</Text>
        </View>
        {filtered.length > 0 && (
          <View style={S.summaryPill}>
            <Text style={S.summaryIn}>+{GHS(totalIn)}</Text>
            <Text style={S.summarySep}> / </Text>
            <Text style={S.summaryOut}>-{GHS(totalOut)}</Text>
          </View>
        )}
      </View>

      {/* Search bar */}
      <View style={S.searchWrap}>
        <Text style={S.searchIcon}>&#128269;</Text>
        <TextInput
          style={S.searchInput}
          placeholder="Search narration or reference..."
          placeholderTextColor={C.text4}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")} style={S.clearSearch}>
            <Text style={S.clearSearchTxt}>&#10005;</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Account filter chips — only shown when customer has multiple accounts */}
      {accounts.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={S.chipsRow}
          style={S.chipsScroll}
        >
          {[{ id: "all", account_number: "All Accounts" }, ...accounts].map(acc => (
            <TouchableOpacity
              key={acc.id}
              style={[S.chip, selAcc === acc.id && S.chipActive]}
              onPress={() => setSelAcc(acc.id)}
            >
              <Text style={[S.chipTxt, selAcc === acc.id && S.chipTxtActive]}>
                {acc.account_number}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Type filter tabs */}
      <View style={S.filterRow}>
        <View style={S.filterTabs}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[S.filterTab, filter === f.key && S.filterTabActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[S.filterTxt, filter === f.key && S.filterTxtActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Content */}
      {loading ? (
        <View style={S.center}>
          <ActivityIndicator color={C.brand} size="large" />
          <Text style={S.loadTxt}>Loading transactions...</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />
          }
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={true}
          ListEmptyComponent={
            <View style={S.empty}>
              <View style={S.emptyIconBox}>
                <Text style={{ fontSize: 32 }}>&#128203;</Text>
              </View>
              <Text style={S.emptyTitle}>No transactions found</Text>
              <Text style={S.emptyHint}>
                {search || filter !== "all" || selAcc !== "all"
                  ? "Try adjusting your search or filters"
                  : "Your transaction history will appear here"}
              </Text>
              {(search || filter !== "all" || selAcc !== "all") && (
                <TouchableOpacity
                  style={S.resetBtn}
                  onPress={() => { setSearch(""); setFilter("all"); setSelAcc("all"); }}
                >
                  <Text style={S.resetBtnTxt}>Clear Filters</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}

const S = StyleSheet.create({
  root:           { flex: 1, backgroundColor: C.bg },
  center:         { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 10 },
  loadTxt:        { fontSize: 13, color: C.text3 },

  header:         { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.borderLt },
  pageTitle:      { fontSize: 22, fontWeight: "900", color: C.text },
  countTxt:       { fontSize: 12, color: C.text4, fontWeight: "600", marginTop: 2 },
  summaryPill:    { flexDirection: "row", alignItems: "center", backgroundColor: C.bg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: C.borderLt },
  summaryIn:      { fontSize: 12, fontWeight: "700", color: C.green },
  summarySep:     { fontSize: 12, color: C.text4 },
  summaryOut:     { fontSize: 12, fontWeight: "700", color: C.red },

  searchWrap:     { flexDirection: "row", alignItems: "center", backgroundColor: C.white, marginHorizontal: 16, marginTop: 14, marginBottom: 10, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: C.border, gap: 10, shadowColor: "#0f172a", shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  searchIcon:     { fontSize: 16, color: C.text4 },
  searchInput:    { flex: 1, fontSize: 14, color: C.text, paddingVertical: 0 },
  clearSearch:    { padding: 4 },
  clearSearchTxt: { fontSize: 13, color: C.text4, fontWeight: "700" },

  chipsScroll:    { maxHeight: 44 },
  chipsRow:       { paddingHorizontal: 16, gap: 8, paddingBottom: 8, alignItems: "center" },
  chip:           { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.white, borderWidth: 1, borderColor: C.border },
  chipActive:     { backgroundColor: C.brand, borderColor: C.brand },
  chipTxt:        { fontSize: 12, fontWeight: "600", color: C.text3 },
  chipTxtActive:  { color: "#fff", fontWeight: "700" },

  filterRow:      { paddingHorizontal: 16, marginBottom: 8 },
  filterTabs:     { flexDirection: "row", backgroundColor: C.white, borderRadius: 12, padding: 3, borderWidth: 1, borderColor: C.border, alignSelf: "flex-start" },
  filterTab:      { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10 },
  filterTabActive:{ backgroundColor: C.brand },
  filterTxt:      { fontSize: 13, fontWeight: "600", color: C.text3 },
  filterTxtActive:{ color: "#fff", fontWeight: "700" },

  dateHeader:     { backgroundColor: C.bg, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.borderLt },
  dateHeaderTxt:  { fontSize: 11, fontWeight: "700", color: C.text4, textTransform: "uppercase", letterSpacing: 0.8 },

  txnCard:        { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.borderLt, backgroundColor: C.white },
  txnDot:         { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  txnArrow:       { fontSize: 20, fontWeight: "900" },
  txnNarr:        { fontSize: 14, fontWeight: "600", color: C.text, marginBottom: 2 },
  txnMeta:        { fontSize: 11, color: C.text4, marginBottom: 1 },
  txnTime:        { fontSize: 11, color: C.text4 },
  txnAmt:         { fontSize: 15, fontWeight: "800", marginBottom: 3 },
  txnBal:         { fontSize: 11, color: C.text4 },

  empty:          { alignItems: "center", paddingTop: 64, paddingHorizontal: 32 },
  emptyIconBox:   { width: 72, height: 72, borderRadius: 36, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle:     { fontSize: 16, fontWeight: "700", color: C.text3, marginBottom: 8 },
  emptyHint:      { fontSize: 13, color: C.text4, textAlign: "center", lineHeight: 20, marginBottom: 20 },
  resetBtn:       { backgroundColor: C.brand, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12 },
  resetBtnTxt:    { color: "#fff", fontSize: 13, fontWeight: "700" },
});
