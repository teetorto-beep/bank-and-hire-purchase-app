import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput,
} from "react-native";
import { supabase } from "../supabase";

const GHS = n => `GH\u20B5 ${Number(n||0).toLocaleString("en-GH",{minimumFractionDigits:2})}`;

const FILTERS = [
  { key:"all",    label:"All"     },
  { key:"credit", label:"Credits" },
  { key:"debit",  label:"Debits"  },
];

export default function TransactionsScreen({ customer, tick }) {
  const [accounts,     setAccounts]     = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [filtered,     setFiltered]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const firstLoad = useRef(true);
  const [filter,       setFilter]       = useState("all");
  const [search,       setSearch]       = useState("");
  const [selAcc,       setSelAcc]       = useState("all");

  const load = useCallback(async (refresh=false) => {
    if (refresh) setRefreshing(true); else if (firstLoad.current) setLoading(true);
    const accsRes = await supabase.from("accounts")
      .select("id,account_number,type").eq("customer_id", customer.id);
    const accs = accsRes.data || [];
    setAccounts(accs);
    const ids = accs.map(a => a.id);
    if (!ids.length) { setTransactions([]); setFiltered([]); if (refresh) setRefreshing(false); else { setLoading(false); firstLoad.current = false; } return; }
    const { data } = await supabase.from("transactions")
      .select("id,account_id,type,amount,narration,reference,created_at,balance_after,channel")
      .in("account_id", ids).order("created_at",{ascending:false}).limit(150);
    setTransactions(data || []);
    if (refresh) setRefreshing(false); else { setLoading(false); firstLoad.current = false; }
  }, [customer.id, tick]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let r = [...transactions];
    if (selAcc !== "all") r = r.filter(t => t.account_id === selAcc);
    if (filter !== "all") r = r.filter(t => t.type === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(t => (t.narration||"").toLowerCase().includes(q) || (t.reference||"").toLowerCase().includes(q));
    }
    setFiltered(r);
  }, [transactions, filter, selAcc, search]);

  const getAccNum = id => { const a = accounts.find(x=>x.id===id); return a?a.account_number:"—"; };
  const totalIn  = filtered.filter(t=>t.type==="credit").reduce((s,t)=>s+Number(t.amount),0);
  const totalOut = filtered.filter(t=>t.type==="debit").reduce((s,t)=>s+Number(t.amount),0);

  const renderItem = ({ item: txn }) => {
    const isCredit = txn.type === "credit";
    const date = txn.created_at ? new Date(txn.created_at) : null;
    return (
      <View style={S.txnCard}>
        <View style={[S.txnDot, {backgroundColor:isCredit?"#dcfce7":"#fee2e2"}]}>
          <Text style={[S.txnArrow, {color:isCredit?"#16a34a":"#dc2626"}]}>{isCredit?"↑":"↓"}</Text>
        </View>
        <View style={{flex:1}}>
          <Text style={S.txnNarr} numberOfLines={2}>{txn.narration||"Transaction"}</Text>
          <Text style={S.txnMeta}>{getAccNum(txn.account_id)}{txn.reference?"  ·  "+txn.reference:""}</Text>
          {date && <Text style={S.txnDate}>{date.toLocaleDateString("en-GH",{day:"numeric",month:"short",year:"numeric"})}{"  ·  "}{date.toLocaleTimeString("en-GH",{hour:"2-digit",minute:"2-digit"})}</Text>}
        </View>
        <View style={{alignItems:"flex-end"}}>
          <Text style={[S.txnAmt, {color:isCredit?"#16a34a":"#dc2626"}]}>{isCredit?"+":"-"}{GHS(txn.amount)}</Text>
          {txn.balance_after!=null && <Text style={S.txnBal}>Bal: {GHS(txn.balance_after)}</Text>}
          {txn.channel && <View style={S.channelBadge}><Text style={S.channelTxt}>{txn.channel}</Text></View>}
        </View>
      </View>
    );
  };

  return (
    <View style={S.root}>
      <View style={S.searchWrap}>
        <Text style={{fontSize:14,marginRight:8}}>🔍</Text>
        <TextInput style={S.searchInput} placeholder="Search narration or reference…"
          placeholderTextColor="#94a3b8" value={search} onChangeText={setSearch} returnKeyType="search" />
        {search.length > 0 && (
          <TouchableOpacity onPress={()=>setSearch("")} style={{padding:4}}>
            <Text style={{fontSize:12,color:"#94a3b8",fontWeight:"700"}}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {accounts.length > 1 && (
        <View style={S.chipRow}>
          <TouchableOpacity style={[S.chip, selAcc==="all"&&S.chipActive]} onPress={()=>setSelAcc("all")}>
            <Text style={[S.chipTxt, selAcc==="all"&&S.chipTxtActive]}>All</Text>
          </TouchableOpacity>
          {accounts.map(acc => (
            <TouchableOpacity key={acc.id} style={[S.chip, selAcc===acc.id&&S.chipActive]} onPress={()=>setSelAcc(acc.id)}>
              <Text style={[S.chipTxt, selAcc===acc.id&&S.chipTxtActive]} numberOfLines={1}>{acc.account_number}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={S.filterBar}>
        <View style={S.filterTabs}>
          {FILTERS.map(f => (
            <TouchableOpacity key={f.key} style={[S.filterTab, filter===f.key&&S.filterTabActive]} onPress={()=>setFilter(f.key)}>
              <Text style={[S.filterTxt, filter===f.key&&S.filterTxtActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={S.countTxt}>{filtered.length} records</Text>
      </View>

      {filtered.length > 0 && (
        <View style={S.summaryRow}>
          <View style={S.summaryItem}>
            <Text style={S.summaryLabel}>Total In</Text>
            <Text style={[S.summaryVal,{color:"#16a34a"}]}>+{GHS(totalIn)}</Text>
          </View>
          <View style={S.summaryDiv} />
          <View style={S.summaryItem}>
            <Text style={S.summaryLabel}>Total Out</Text>
            <Text style={[S.summaryVal,{color:"#dc2626"}]}>-{GHS(totalOut)}</Text>
          </View>
        </View>
      )}

      {loading ? (
        <View style={S.center}>
          <ActivityIndicator color="#2563eb" size="large" />
          <Text style={S.loadTxt}>Loading transactions…</Text>
        </View>
      ) : (
        <FlatList data={filtered} keyExtractor={i=>i.id} renderItem={renderItem}
          contentContainerStyle={{padding:16,paddingTop:8,paddingBottom:32}}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>load(true)} tintColor="#2563eb" />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={S.empty}>
              <Text style={{fontSize:36,marginBottom:12}}>📋</Text>
              <Text style={S.emptyTitle}>No transactions found</Text>
              <Text style={S.emptyHint}>{search||filter!=="all"?"Try adjusting your filters":"Your transaction history will appear here"}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const S = StyleSheet.create({
  root:{flex:1,backgroundColor:"#f0f4f8"},
  center:{flex:1,alignItems:"center",justifyContent:"center",gap:10,paddingTop:60},
  loadTxt:{color:"#64748b",fontSize:13},
  searchWrap:{flexDirection:"row",alignItems:"center",backgroundColor:"#fff",borderRadius:12,margin:16,marginBottom:8,paddingHorizontal:14,paddingVertical:10,borderWidth:1,borderColor:"#e2e8f0",shadowColor:"#000",shadowOpacity:0.03,shadowRadius:4,elevation:1},
  searchInput:{flex:1,fontSize:14,color:"#0f172a"},
  chipRow:{flexDirection:"row",flexWrap:"wrap",paddingHorizontal:16,gap:6,marginBottom:8},
  chip:{paddingHorizontal:14,paddingVertical:6,borderRadius:20,backgroundColor:"#fff",borderWidth:1,borderColor:"#e2e8f0"},
  chipActive:{backgroundColor:"#2563eb",borderColor:"#2563eb"},
  chipTxt:{fontSize:12,fontWeight:"600",color:"#64748b"},
  chipTxtActive:{color:"#fff"},
  filterBar:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:16,marginBottom:8},
  filterTabs:{flexDirection:"row",backgroundColor:"#fff",borderRadius:10,padding:3,borderWidth:1,borderColor:"#e2e8f0"},
  filterTab:{paddingHorizontal:14,paddingVertical:6,borderRadius:8},
  filterTabActive:{backgroundColor:"#2563eb"},
  filterTxt:{fontSize:13,fontWeight:"600",color:"#64748b"},
  filterTxtActive:{color:"#fff"},
  countTxt:{fontSize:12,color:"#94a3b8",fontWeight:"600"},
  summaryRow:{flexDirection:"row",backgroundColor:"#fff",marginHorizontal:16,borderRadius:12,padding:12,marginBottom:4,borderWidth:1,borderColor:"#f1f5f9"},
  summaryItem:{flex:1,alignItems:"center"},
  summaryDiv:{width:1,backgroundColor:"#f1f5f9"},
  summaryLabel:{fontSize:11,color:"#94a3b8",marginBottom:3},
  summaryVal:{fontSize:13,fontWeight:"800"},
  txnCard:{flexDirection:"row",alignItems:"flex-start",gap:10,backgroundColor:"#fff",borderRadius:12,padding:14,marginBottom:8,borderWidth:1,borderColor:"#f1f5f9",shadowColor:"#000",shadowOpacity:0.02,shadowRadius:4,elevation:1},
  txnDot:{width:40,height:40,borderRadius:12,alignItems:"center",justifyContent:"center",flexShrink:0},
  txnArrow:{fontSize:18,fontWeight:"800"},
  txnNarr:{fontSize:13,fontWeight:"600",color:"#0f172a",marginBottom:2,lineHeight:18},
  txnMeta:{fontSize:11,color:"#94a3b8",marginBottom:1},
  txnDate:{fontSize:11,color:"#94a3b8"},
  txnAmt:{fontSize:15,fontWeight:"800",marginBottom:2},
  txnBal:{fontSize:11,color:"#94a3b8"},
  channelBadge:{marginTop:4,backgroundColor:"#f1f5f9",borderRadius:6,paddingHorizontal:6,paddingVertical:2},
  channelTxt:{fontSize:10,color:"#64748b",fontWeight:"600",textTransform:"capitalize"},
  empty:{alignItems:"center",paddingTop:60},
  emptyTitle:{fontSize:15,fontWeight:"700",color:"#475569",marginBottom:6},
  emptyHint:{fontSize:13,color:"#94a3b8",textAlign:"center"},
});

