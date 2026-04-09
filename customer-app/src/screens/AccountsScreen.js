import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal,
} from "react-native";
import { supabase } from "../supabase";

const GHS = n => `GH\u20B5 ${Number(n||0).toLocaleString("en-GH",{minimumFractionDigits:2})}`;
const fmtDate = (d, opts={day:"numeric",month:"short",year:"numeric"}) =>
  d ? new Date(d).toLocaleDateString("en-GH", opts) : "";

const COLORS = [
  { bg:"#2563eb", accent:"#1d4ed8", light:"#eff6ff", text:"#1d4ed8" },
  { bg:"#0f766e", accent:"#0d5c56", light:"#f0fdfa", text:"#0f766e" },
  { bg:"#7c3aed", accent:"#6d28d9", light:"#faf5ff", text:"#7c3aed" },
  { bg:"#b45309", accent:"#92400e", light:"#fffbeb", text:"#b45309" },
  { bg:"#be185d", accent:"#9d174d", light:"#fdf2f8", text:"#be185d" },
];
const ICONS = { savings:"💰", current:"🏦", fixed_deposit:"🔒", hire_purchase:"🛍️", joint:"👥" };

export default function AccountsScreen({ customer, tick }) {
  const [accounts,    setAccounts]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [selected,    setSelected]    = useState(null);
  const firstLoad = useRef(true);
  const [accTxns,     setAccTxns]     = useState([]);
  const [loadingTxns, setLoadingTxns] = useState(false);

  const load = useCallback(async (refresh=false) => {
    if (refresh) setRefreshing(true); else if (firstLoad.current) setLoading(true);
    const { data } = await supabase
      .from("accounts")
      .select("id,account_number,type,balance,status,interest_rate,opened_at")
      .eq("customer_id", customer.id)
      .neq("type", "hire_purchase")   // HP is a loan product, not a deposit account
      .order("opened_at", { ascending: true });
    setAccounts(data || []);
    if (refresh) setRefreshing(false); else { setLoading(false); firstLoad.current = false; }
  }, [customer.id, tick]);

  useEffect(() => { load(); }, [load]);

  const openAccount = async acc => {
    setSelected(acc);
    setLoadingTxns(true);
    const { data } = await supabase
      .from("transactions")
      .select("id,type,amount,narration,created_at,balance_after,reference")
      .eq("account_id", acc.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setAccTxns(data || []);
    setLoadingTxns(false);
  };

  const totalBal = accounts.reduce((s,a) => s + Number(a.balance||0), 0);

  if (loading) return (
    <View style={S.center}>
      <ActivityIndicator color="#2563eb" size="large" />
      <Text style={S.loadTxt}>Loading accounts…</Text>
    </View>
  );

  return (
    <>
      <ScrollView style={S.root} contentContainerStyle={{ padding:16, paddingBottom:32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>load(true)} tintColor="#2563eb" />}
        showsVerticalScrollIndicator={false}>

        <View style={S.summaryCard}>
          <Text style={S.summaryLabel}>Total Balance</Text>
          <Text style={S.summaryAmt}>{GHS(totalBal)}</Text>
          <Text style={S.summarySub}>{accounts.length} account{accounts.length!==1?"s":""}</Text>
        </View>

        <Text style={S.sectionTitle}>All Accounts</Text>

        {accounts.length === 0 ? (
          <View style={S.empty}>
            <Text style={{fontSize:40,marginBottom:12}}>🏦</Text>
            <Text style={S.emptyTitle}>No Accounts Found</Text>
            <Text style={S.emptyHint}>Contact your branch to open an account</Text>
          </View>
        ) : accounts.map((acc, idx) => {
          const c = COLORS[idx % COLORS.length];
          const icon = ICONS[acc.type] || "🏧";
          const typeName = (acc.type||"Account").replace(/_/g," ").replace(/\b\w/g,x=>x.toUpperCase());
          return (
            <TouchableOpacity key={acc.id} style={S.accCard} onPress={()=>openAccount(acc)} activeOpacity={0.85}>
              <View style={[S.accStrip, {backgroundColor:c.bg}]} />
              <View style={S.accBody}>
                <View style={S.accTop}>
                  <View style={[S.accIconBox, {backgroundColor:c.light}]}>
                    <Text style={{fontSize:22}}>{icon}</Text>
                  </View>
                  <View style={{flex:1,marginLeft:12}}>
                    <Text style={[S.accType, {color:c.text}]}>{typeName}</Text>
                    <Text style={S.accNum}>{acc.account_number}</Text>
                  </View>
                  <View style={[S.statusPill, acc.status!=="active"&&S.statusPillInactive]}>
                    <Text style={[S.statusTxt, acc.status!=="active"&&{color:"#92400e"}]}>{acc.status}</Text>
                  </View>
                </View>
                <View style={S.accDivider} />
                <View style={S.accBottom}>
                  <View>
                    <Text style={S.accBalLabel}>Available Balance</Text>
                    <Text style={[S.accBal, {color:c.text}]}>{GHS(acc.balance)}</Text>
                  </View>
                  <View style={{alignItems:"flex-end"}}>
                    {acc.interest_rate > 0 && <Text style={S.accRate}>{acc.interest_rate}% p.a.</Text>}
                    {acc.opened_at && <Text style={S.accOpened}>Since {new Date(acc.opened_at).toLocaleDateString("en-GH",{month:"short",year:"numeric"})}</Text>}
                  </View>
                </View>
                <Text style={S.tapHint}>Tap to view transactions →</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setSelected(null)}>
        {selected && (
          <AccountModal
            account={selected}
            transactions={accTxns}
            loading={loadingTxns}
            onClose={()=>setSelected(null)}
            colorIndex={accounts.findIndex(a=>a.id===selected.id)}
          />
        )}
      </Modal>
    </>
  );
}

function AccountModal({ account, transactions, loading, onClose, colorIndex }) {
  const c = COLORS[colorIndex % COLORS.length];
  const icon = ICONS[account.type] || "🏧";
  const typeName = (account.type||"Account").replace(/_/g," ").replace(/\b\w/g,x=>x.toUpperCase());
  const credits = transactions.filter(t=>t.type==="credit").reduce((s,t)=>s+Number(t.amount),0);
  const debits  = transactions.filter(t=>t.type==="debit").reduce((s,t)=>s+Number(t.amount),0);

  return (
    <View style={M.root}>
      <View style={[M.header, {backgroundColor:c.bg}]}>
        <TouchableOpacity onPress={onClose} style={M.closeBtn}>
          <Text style={M.closeTxt}>✕  Close</Text>
        </TouchableOpacity>
        <View style={[M.headerIcon, {backgroundColor:c.accent}]}>
          <Text style={{fontSize:28}}>{icon}</Text>
        </View>
        <Text style={M.headerType}>{typeName}</Text>
        <Text style={M.headerNum}>{account.account_number}</Text>
        <Text style={M.headerBal}>{GHS(account.balance)}</Text>
        <Text style={M.headerBalLabel}>Available Balance</Text>
      </View>

      <View style={M.statsRow}>
        {[
          ["Credits",      "+"+GHS(credits), "#16a34a"],
          ["Debits",       "-"+GHS(debits),  "#dc2626"],
          ["Transactions", String(transactions.length), "#0f172a"],
        ].map(([l,v,col],i)=>(
          <React.Fragment key={i}>
            {i>0 && <View style={M.statDiv} />}
            <View style={M.statBox}>
              <Text style={M.statLabel}>{l}</Text>
              <Text style={[M.statVal,{color:col}]}>{v}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      <View style={M.infoRow}>
        {account.interest_rate > 0 && (
          <View style={M.chip}><Text style={M.chipTxt}>📈 {account.interest_rate}% p.a.</Text></View>
        )}
        {account.opened_at && (
          <View style={M.chip}><Text style={M.chipTxt}>📅 Opened {fmtDate(account.opened_at)}</Text></View>
        )}
      </View>

      <Text style={M.txnTitle}>Transactions</Text>
      <ScrollView contentContainerStyle={{paddingHorizontal:16,paddingBottom:40}} showsVerticalScrollIndicator={false}>
        {loading ? <ActivityIndicator color="#2563eb" style={{marginTop:32}} /> :
         transactions.length === 0 ? (
          <View style={M.empty}>
            <Text style={{fontSize:32,marginBottom:10}}>📋</Text>
            <Text style={M.emptyTxt}>No transactions yet</Text>
          </View>
        ) : transactions.map(txn => {
          const isCredit = txn.type === "credit";
          return (
            <View key={txn.id} style={M.txnRow}>
              <View style={[M.txnDot, {backgroundColor:isCredit?"#dcfce7":"#fee2e2"}]}>
                <Text style={[M.txnArrow, {color:isCredit?"#16a34a":"#dc2626"}]}>{isCredit?"↑":"↓"}</Text>
              </View>
              <View style={{flex:1}}>
                <Text style={M.txnNarr} numberOfLines={1}>{txn.narration||"Transaction"}</Text>
                <Text style={M.txnDate}>{fmtDate(txn.created_at)}{txn.reference?"  ·  "+txn.reference:""}</Text>
              </View>
              <View style={{alignItems:"flex-end"}}>
                <Text style={[M.txnAmt, {color:isCredit?"#16a34a":"#dc2626"}]}>
                  {isCredit?"+":"-"}{GHS(txn.amount)}
                </Text>
                {txn.balance_after!=null && <Text style={M.txnBal}>Bal: {GHS(txn.balance_after)}</Text>}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  root:{flex:1,backgroundColor:"#f0f4f8"},
  center:{flex:1,alignItems:"center",justifyContent:"center",gap:10},
  loadTxt:{color:"#64748b",fontSize:13},
  summaryCard:{backgroundColor:"#0a0f1e",borderRadius:16,padding:20,marginBottom:20,alignItems:"center",shadowColor:"#000",shadowOpacity:0.15,shadowRadius:12,elevation:6},
  summaryLabel:{color:"#475569",fontSize:12,fontWeight:"600",marginBottom:4},
  summaryAmt:{color:"#fff",fontSize:30,fontWeight:"900",marginBottom:2},
  summarySub:{color:"#334155",fontSize:12},
  sectionTitle:{fontSize:12,fontWeight:"700",color:"#64748b",textTransform:"uppercase",letterSpacing:0.6,marginBottom:12},
  accCard:{backgroundColor:"#fff",borderRadius:16,marginBottom:12,flexDirection:"row",overflow:"hidden",shadowColor:"#000",shadowOpacity:0.05,shadowRadius:8,elevation:3,borderWidth:1,borderColor:"#f1f5f9"},
  accStrip:{width:5},
  accBody:{flex:1,padding:16},
  accTop:{flexDirection:"row",alignItems:"center",marginBottom:12},
  accIconBox:{width:48,height:48,borderRadius:14,alignItems:"center",justifyContent:"center"},
  accType:{fontSize:15,fontWeight:"800",marginBottom:2},
  accNum:{fontSize:12,color:"#64748b",fontFamily:"monospace"},
  statusPill:{backgroundColor:"#f0fdf4",paddingHorizontal:10,paddingVertical:4,borderRadius:20},
  statusPillInactive:{backgroundColor:"#fef9c3"},
  statusTxt:{fontSize:11,fontWeight:"700",color:"#15803d",textTransform:"capitalize"},
  accDivider:{height:1,backgroundColor:"#f1f5f9",marginBottom:12},
  accBottom:{flexDirection:"row",justifyContent:"space-between",alignItems:"flex-end"},
  accBalLabel:{fontSize:11,color:"#94a3b8",marginBottom:3},
  accBal:{fontSize:20,fontWeight:"900"},
  accRate:{fontSize:12,fontWeight:"700",color:"#475569"},
  accOpened:{fontSize:10,color:"#94a3b8",marginTop:2},
  tapHint:{fontSize:11,color:"#94a3b8",marginTop:10,textAlign:"right"},
  empty:{alignItems:"center",paddingVertical:48,backgroundColor:"#fff",borderRadius:16,borderWidth:1,borderColor:"#f1f5f9"},
  emptyTitle:{fontSize:15,fontWeight:"700",color:"#475569",marginBottom:6},
  emptyHint:{fontSize:13,color:"#94a3b8"},
});

const M = StyleSheet.create({
  root:{flex:1,backgroundColor:"#f0f4f8"},
  header:{paddingTop:20,paddingBottom:28,paddingHorizontal:24,alignItems:"center"},
  closeBtn:{alignSelf:"flex-start",marginBottom:14,backgroundColor:"rgba(255,255,255,0.2)",paddingHorizontal:14,paddingVertical:7,borderRadius:20},
  closeTxt:{color:"#fff",fontSize:13,fontWeight:"700"},
  headerIcon:{width:60,height:60,borderRadius:18,alignItems:"center",justifyContent:"center",marginBottom:12},
  headerType:{color:"rgba(255,255,255,0.7)",fontSize:12,fontWeight:"700",textTransform:"uppercase",letterSpacing:0.8,marginBottom:4},
  headerNum:{color:"#fff",fontSize:16,fontWeight:"700",fontFamily:"monospace",marginBottom:12},
  headerBal:{color:"#fff",fontSize:32,fontWeight:"900",letterSpacing:-0.5},
  headerBalLabel:{color:"rgba(255,255,255,0.5)",fontSize:12,marginTop:4},
  statsRow:{flexDirection:"row",backgroundColor:"#fff",marginHorizontal:16,borderRadius:14,padding:16,marginTop:-16,shadowColor:"#000",shadowOpacity:0.08,shadowRadius:12,elevation:4,marginBottom:12},
  statBox:{flex:1,alignItems:"center"},
  statDiv:{width:1,backgroundColor:"#f1f5f9"},
  statLabel:{fontSize:11,color:"#94a3b8",marginBottom:4},
  statVal:{fontSize:14,fontWeight:"800"},
  infoRow:{flexDirection:"row",flexWrap:"wrap",gap:8,paddingHorizontal:16,marginBottom:16},
  chip:{backgroundColor:"#fff",borderRadius:20,paddingHorizontal:12,paddingVertical:6,borderWidth:1,borderColor:"#e2e8f0"},
  chipTxt:{fontSize:12,color:"#475569",fontWeight:"600"},
  txnTitle:{fontSize:12,fontWeight:"700",color:"#64748b",textTransform:"uppercase",letterSpacing:0.6,paddingHorizontal:16,marginBottom:10},
  txnRow:{flexDirection:"row",alignItems:"center",gap:10,backgroundColor:"#fff",borderRadius:12,padding:14,marginBottom:8,borderWidth:1,borderColor:"#f1f5f9"},
  txnDot:{width:40,height:40,borderRadius:12,alignItems:"center",justifyContent:"center"},
  txnArrow:{fontSize:18,fontWeight:"800"},
  txnNarr:{fontSize:13,fontWeight:"600",color:"#0f172a",marginBottom:2},
  txnDate:{fontSize:11,color:"#94a3b8"},
  txnAmt:{fontSize:14,fontWeight:"800",marginBottom:2},
  txnBal:{fontSize:11,color:"#94a3b8"},
  empty:{alignItems:"center",paddingTop:48},
  emptyTxt:{fontSize:14,fontWeight:"700",color:"#475569"},
});

