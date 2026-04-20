import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { supabase } from "../supabase";
import { C, GHS } from "../theme";

const TYPES = [
  { key:"savings", label:"Savings",  sub:"Deposit to savings account",       color:C.green,  bg:C.greenBg  },
  { key:"loan",    label:"Loan",     sub:"Repayment against loan balance",    color:C.blue,   bg:C.blueBg   },
  { key:"hp",      label:"HP",       sub:"Hire purchase instalment payment",  color:C.purple, bg:C.purpleBg },
];

export default function CreditScreen({ collector }) {
  const [step,       setStep]       = useState(1);
  const [query,      setQuery]      = useState("");
  const [searching,  setSearching]  = useState(false);
  const [results,    setResults]    = useState([]);
  const [account,    setAccount]    = useState(null);
  const [collType,   setCollType]   = useState("savings");
  const [amount,     setAmount]     = useState("");
  const [notes,      setNotes]      = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── Search ────────────────────────────────────────────────────────────────
  const searchAccount = async () => {
    const q = query.trim();
    if (!q) { Alert.alert("Required", "Enter an account number or customer name"); return; }
    setSearching(true); setResults([]);
    try {
      const { data: byAcct } = await supabase
        .from("accounts").select("id,account_number,balance,type,status,customer_id")
        .ilike("account_number", "%" + q + "%").eq("status", "active").limit(10);

      const { data: byName } = await supabase
        .from("customers").select("id,name,phone").ilike("name", "%" + q + "%").limit(10);

      let found = [];
      if (byAcct?.length) {
        const ids = [...new Set(byAcct.map(a => a.customer_id).filter(Boolean))];
        let cm = {};
        if (ids.length) {
          const { data: custs } = await supabase.from("customers").select("id,name,phone").in("id", ids);
          (custs || []).forEach(c => { cm[c.id] = c; });
        }
        found = byAcct.map(a => ({ ...a, customer: cm[a.customer_id] || null }));
      }
      if (!found.length && byName?.length) {
        const ids = byName.map(c => c.id);
        const { data: accts } = await supabase
          .from("accounts").select("id,account_number,balance,type,status,customer_id")
          .in("customer_id", ids).eq("status", "active").limit(10);
        const cm = {};
        byName.forEach(c => { cm[c.id] = c; });
        found = (accts || []).map(a => ({ ...a, customer: cm[a.customer_id] || null }));
      }

      if (!found.length) {
        Alert.alert("Not Found", "No active account found.");
      } else if (found.length === 1) {
        setAccount(found[0]); setStep(2);
      } else {
        setResults(found);
      }
    } catch (e) { Alert.alert("Error", e.message || "Search failed"); }
    setSearching(false);
  };

  const reset = () => {
    setStep(1); setQuery(""); setAccount(null); setResults([]);
    setCollType("savings"); setAmount(""); setNotes("");
  };

  // ── Post ──────────────────────────────────────────────────────────────────
  const postCollection = async () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) { Alert.alert("Required", "Enter a valid amount"); return; }

    setSubmitting(true);
    try {
      const custId   = account.customer?.id || account.customer_id || null;
      const custName = account.customer?.name || null;
      const ref      = "COL" + Date.now() + Math.random().toString(36).slice(2, 8).toUpperCase();
      let loanId = null, hpId = null, msg = "";

      // ── SAVINGS: credit account balance ──────────────────────────────────
      if (collType === "savings") {
        const { data: fresh, error: fe } = await supabase
          .from("accounts").select("balance").eq("id", account.id).single();
        if (fe || !fresh) throw new Error("Could not fetch balance: " + (fe?.message || ""));

        const newBal = Number(fresh.balance) + amt;

        const { error: be } = await supabase.from("accounts")
          .update({ balance: newBal, updated_at: new Date().toISOString() }).eq("id", account.id);
        if (be) throw new Error("Balance update failed: " + be.message);

        // type = "credit" — money coming IN to savings account ✓
        const { error: te } = await supabase.from("transactions").insert({
          account_id:    account.id,
          type:          "credit",
          amount:        amt,
          narration:     (notes.trim() || "Savings deposit") + " — via collector " + collector.name,
          reference:     ref,
          balance_after: newBal,
          channel:       "collection",
          poster_name:   collector.name,
          status:        "completed",
          created_at:    new Date().toISOString(),
        });
        if (te) throw new Error("Transaction failed: " + te.message);

        msg = (custName || account.account_number) + "\nDeposited: " + GHS(amt) + "\nNew balance: " + GHS(newBal);
      }

      // ── LOAN REPAYMENT: debit entry, reduce loans.outstanding ─────────────
      else if (collType === "loan") {
        let loan = null;
        const { data: la } = await supabase.from("loans")
          .select("id,outstanding,status,account_id")
          .eq("account_id", account.id).in("status", ["active","overdue"])
          .order("created_at", { ascending:false }).limit(1).single();
        loan = la || null;

        if (!loan && custId) {
          const { data: lc } = await supabase.from("loans")
            .select("id,outstanding,status,account_id")
            .eq("customer_id", custId).in("status", ["active","overdue"])
            .order("created_at", { ascending:false }).limit(1).single();
          loan = lc || null;
        }

        if (!loan) {
          Alert.alert("No Active Loan", "No active or overdue loan found for this customer.");
          setSubmitting(false); return;
        }

        loanId = loan.id;
        const newOut    = Math.max(0, Number(loan.outstanding) - amt);
        const newStatus = newOut <= 0 ? "completed" : loan.status;

        const { error: le } = await supabase.from("loans").update({
          outstanding:       newOut,
          status:            newStatus,
          last_payment_date: new Date().toISOString(),
          updated_at:        new Date().toISOString(),
        }).eq("id", loan.id);
        if (le) throw new Error("Loan update failed: " + le.message);

        // Fetch current account balance — does NOT change for loan repayment
        const { data: ab } = await supabase.from("accounts")
          .select("balance").eq("id", account.id).single();
        const currentBal = Number(ab?.balance || 0);

        // type = "debit" — loan repayment is a DEBIT entry (reduces loan receivable) ✓
        // balance_after = unchanged savings balance (loan payment doesn't touch savings)
        const { error: te } = await supabase.from("transactions").insert({
          account_id:    account.id,
          type:          "debit",
          amount:        amt,
          narration:     (notes.trim() || "Loan repayment") + " — via collector " + collector.name,
          reference:     ref,
          balance_after: currentBal,
          channel:       "collection",
          poster_name:   collector.name,
          loan_id:       loan.id,
          status:        "completed",
          created_at:    new Date().toISOString(),
        });
        if (te) throw new Error("Transaction failed: " + te.message);

        msg = (custName || account.account_number) + "\nLoan repayment: " + GHS(amt) +
          "\nOutstanding: " + GHS(newOut) +
          (newStatus === "completed" ? "\n\u2705 Loan fully paid!" : "");
      }

      // ── HP REPAYMENT: debit entry, reduce hp_agreements + linked loan ─────
      else if (collType === "hp") {
        if (!custId) throw new Error("Customer not found for this account");

        const { data: hp, error: hfe } = await supabase.from("hp_agreements")
          .select("id,total_paid,total_price,remaining,loan_id")
          .eq("customer_id", custId).eq("status", "active")
          .order("created_at", { ascending:false }).limit(1).single();

        if (hfe || !hp) {
          Alert.alert("No Active HP", "No active hire-purchase agreement found for this customer.");
          setSubmitting(false); return;
        }

        hpId = hp.id;
        const newPaid      = Number(hp.total_paid || 0) + amt;
        const newRemaining = Math.max(0, Number(hp.total_price || 0) - newPaid);
        const newHPStatus  = newRemaining <= 0 ? "completed" : "active";

        const { error: he } = await supabase.from("hp_agreements").update({
          total_paid:        newPaid,
          remaining:         newRemaining,
          status:            newHPStatus,
          last_payment_date: new Date().toISOString(),
          updated_at:        new Date().toISOString(),
        }).eq("id", hp.id);
        if (he) throw new Error("HP update failed: " + he.message);

        const { error: hpe } = await supabase.from("hp_payments").insert({
          agreement_id: hp.id,
          amount:       amt,
          remaining:    newRemaining,
          note:         notes.trim() || "HP collection via " + collector.name,
          collected_by: collector.name,
          created_at:   new Date().toISOString(),
        });
        if (hpe) throw new Error("HP payment record failed: " + hpe.message);

        // Reduce linked loan outstanding
        let linkedLoanId = hp.loan_id;
        if (!linkedLoanId) {
          const { data: fl } = await supabase.from("loans").select("id")
            .eq("hp_agreement_id", hp.id).in("status", ["active","overdue"]).limit(1).single();
          linkedLoanId = fl?.id || null;
        }
        if (linkedLoanId) {
          loanId = linkedLoanId;
          const { data: hl } = await supabase.from("loans")
            .select("outstanding,status").eq("id", linkedLoanId).single();
          if (hl) {
            const newOut = Math.max(0, Number(hl.outstanding) - amt);
            await supabase.from("loans").update({
              outstanding:       newOut,
              status:            newOut <= 0 ? "completed" : hl.status,
              last_payment_date: new Date().toISOString(),
              updated_at:        new Date().toISOString(),
            }).eq("id", linkedLoanId);
          }
        }

        // Fetch current account balance — does NOT change for HP payment
        const { data: ab } = await supabase.from("accounts")
          .select("balance").eq("id", account.id).single();
        const currentBal = Number(ab?.balance || 0);

        // type = "debit" — HP payment is a DEBIT entry ✓
        // balance_after = unchanged savings balance
        const { error: te } = await supabase.from("transactions").insert({
          account_id:      account.id,
          type:            "debit",
          amount:          amt,
          narration:       (notes.trim() || "HP payment") + " — via collector " + collector.name,
          reference:       ref,
          balance_after:   currentBal,
          channel:         "collection",
          poster_name:     collector.name,
          hp_agreement_id: hp.id,
          loan_id:         loanId || null,
          status:          "completed",
          created_at:      new Date().toISOString(),
        });
        if (te) throw new Error("Transaction failed: " + te.message);

        msg = (custName || account.account_number) + "\nHP payment: " + GHS(amt) +
          "\nRemaining: " + GHS(newRemaining) +
          (newHPStatus === "completed" ? "\n\u2705 HP fully paid!" : "");
      }

      // ── Record in collections ─────────────────────────────────────────────
      const { error: ce } = await supabase.from("collections").insert({
        account_id:      account.id,
        collector_id:    collector.id,
        collector_name:  collector.name,
        customer_id:     custId,
        customer_name:   custName,
        amount:          amt,
        payment_type:    collType,
        loan_id:         loanId,
        hp_agreement_id: hpId,
        notes:           notes.trim() || TYPES.find(t => t.key === collType)?.label,
        status:          "completed",
        created_at:      new Date().toISOString(),
      });
      if (ce) throw new Error("Collection record failed: " + ce.message);

      // ── Update collector total ────────────────────────────────────────────
      const { data: col } = await supabase.from("collectors")
        .select("total_collected").eq("id", collector.id).single();
      if (col) {
        await supabase.from("collectors").update({
          total_collected: Number(col.total_collected || 0) + amt,
          updated_at:      new Date().toISOString(),
        }).eq("id", collector.id);
      }

      Alert.alert("Posted", msg, [
        { text:"New Collection", onPress:reset },
        { text:"Done", onPress:reset },
      ]);
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to post. Please try again.");
    }
    setSubmitting(false);
  };

  const amtNum  = parseFloat(amount) || 0;
  const selType = TYPES.find(t => t.key === collType);
  const newBal  = collType === "savings" ? Number(account?.balance || 0) + amtNum : null;

  return (
    <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={S.root} contentContainerStyle={{ paddingBottom:48 }}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={S.header}>
          <Text style={S.headerTitle}>Record Collection</Text>
          <Text style={S.headerSub}>Post cash collection to customer account</Text>
          <View style={S.steps}>
            {[{n:1,label:"Find Account"},{n:2,label:"Post Collection"}].map((s,i) => {
              const active = step === s.n, done = step > s.n;
              return (
                <React.Fragment key={s.n}>
                  <View style={S.stepItem}>
                    <View style={[S.stepDot, active && S.stepDotOn, done && S.stepDotDone]}>
                      <Text style={[S.stepDotTxt, (active||done) && {color:"#fff"}]}>
                        {done ? "✓" : s.n}
                      </Text>
                    </View>
                    <Text style={[S.stepLbl, active && S.stepLblOn, done && {color:C.brand}]}>{s.label}</Text>
                  </View>
                  {i < 1 && <View style={[S.stepLine, done && {backgroundColor:C.brand}]} />}
                </React.Fragment>
              );
            })}
          </View>
        </View>

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <View style={S.card}>
            <Text style={S.cardTitle}>Find Customer Account</Text>
            <Text style={S.cardSub}>Search by account number or customer name</Text>

            <View style={S.searchRow}>
              <TextInput
                style={S.searchInput}
                placeholder="Account number or name..."
                placeholderTextColor={C.text4}
                value={query}
                onChangeText={v => { setQuery(v); setResults([]); }}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={searchAccount}
              />
              <TouchableOpacity style={[S.searchBtn, searching && {opacity:0.6}]}
                onPress={searchAccount} disabled={searching}>
                {searching
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={S.searchBtnTxt}>Search</Text>}
              </TouchableOpacity>
            </View>

            {results.length > 0 && (
              <View style={{marginTop:14}}>
                <Text style={S.fieldLabel}>Select Account</Text>
                {results.map(r => (
                  <TouchableOpacity key={r.id} style={S.resultRow}
                    onPress={() => { setAccount(r); setResults([]); setStep(2); }} activeOpacity={0.7}>
                    <View style={S.resultAvatar}>
                      <Text style={S.resultAvatarTxt}>{(r.customer?.name||"A")[0].toUpperCase()}</Text>
                    </View>
                    <View style={{flex:1}}>
                      <Text style={S.resultName}>{r.customer?.name||"—"}</Text>
                      <Text style={S.resultMeta}>{r.account_number} · {r.type}</Text>
                    </View>
                    <Text style={S.resultBal}>{GHS(r.balance)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && account && (
          <>
            {/* Account banner */}
            <View style={S.acctBanner}>
              <View style={S.acctAvatar}>
                <Text style={S.acctAvatarTxt}>{(account.customer?.name||"A")[0].toUpperCase()}</Text>
              </View>
              <View style={{flex:1}}>
                <Text style={S.acctName}>{account.customer?.name||"—"}</Text>
                <Text style={S.acctMeta}>{account.account_number}{account.customer?.phone ? " · "+account.customer.phone : ""}</Text>
                <Text style={S.acctType}>{(account.type||"").replace(/_/g," ")}</Text>
              </View>
              <View style={{alignItems:"flex-end"}}>
                <Text style={S.balLabel}>Balance</Text>
                <Text style={S.balAmt}>{GHS(account.balance)}</Text>
                <TouchableOpacity style={S.changeBtn} onPress={reset}>
                  <Text style={S.changeBtnTxt}>Change</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={S.card}>
              {/* Type selector */}
              <Text style={S.fieldLabel}>Payment Type</Text>
              <View style={S.typeRow}>
                {TYPES.map(t => {
                  const on = collType === t.key;
                  return (
                    <TouchableOpacity key={t.key}
                      style={[S.typeBtn, on && {borderColor:t.color, backgroundColor:t.bg}]}
                      onPress={() => setCollType(t.key)} activeOpacity={0.75}>
                      <Text style={[S.typeBtnLabel, on && {color:t.color}]}>{t.label}</Text>
                      <Text style={S.typeBtnSub} numberOfLines={2}>{t.sub}</Text>
                      {on && <View style={[S.typeCheck, {backgroundColor:t.color}]}><Text style={S.typeCheckTxt}>✓</Text></View>}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Amount */}
              <Text style={[S.fieldLabel, {marginTop:18}]}>Amount (GH₵)</Text>
              <View style={[S.amtWrap, amtNum > 0 && {borderColor:selType?.color}]}>
                <Text style={[S.amtPrefix, {color:selType?.color||C.text3}]}>GH₵</Text>
                <TextInput
                  style={S.amtInput}
                  placeholder="0.00"
                  placeholderTextColor={C.text4}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                />
              </View>

              {/* Preview */}
              {amtNum > 0 && (
                <View style={[S.preview, {borderColor:(selType?.color||C.brand)+"30", backgroundColor:(selType?.bg||C.blueBg)+"80"}]}>
                  {collType === "savings" ? (
                    <>
                      <Text style={[S.previewLabel, {color:selType?.color}]}>New balance after deposit</Text>
                      <Text style={[S.previewAmt, {color:selType?.color}]}>{GHS(newBal)}</Text>
                    </>
                  ) : (
                    <Text style={[S.previewLabel, {color:selType?.color}]}>
                      {collType === "loan" ? "Reduces loan outstanding by" : "Reduces HP balance by"} {GHS(amtNum)}
                    </Text>
                  )}
                </View>
              )}

              {/* Notes */}
              <Text style={[S.fieldLabel, {marginTop:18}]}>Notes (optional)</Text>
              <TextInput
                style={S.notesInput}
                placeholder="Receipt no., remarks..."
                placeholderTextColor={C.text4}
                value={notes}
                onChangeText={setNotes}
                autoCapitalize="sentences"
                multiline
              />

              <TouchableOpacity
                style={[S.postBtn, {backgroundColor:selType?.color||C.brand}, (submitting||amtNum<=0) && {opacity:0.45}]}
                onPress={postCollection} disabled={submitting||amtNum<=0} activeOpacity={0.85}>
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={S.postBtnTxt}>Post {selType?.label||"Collection"}</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={S.cancelBtn} onPress={reset}>
                <Text style={S.cancelBtnTxt}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const S = StyleSheet.create({
  root:          { flex:1, backgroundColor:C.bg },

  // Header
  header:        { backgroundColor:C.bgDark, paddingHorizontal:20, paddingTop:18, paddingBottom:24 },
  headerTitle:   { fontSize:20, fontWeight:"700", color:"#fff", marginBottom:2 },
  headerSub:     { fontSize:12, color:"rgba(255,255,255,0.4)", marginBottom:20 },
  steps:         { flexDirection:"row", alignItems:"center" },
  stepItem:      { flexDirection:"row", alignItems:"center", gap:6 },
  stepDot:       { width:22, height:22, borderRadius:11, borderWidth:1.5, borderColor:"rgba(255,255,255,0.2)", alignItems:"center", justifyContent:"center" },
  stepDotOn:     { borderColor:C.brand, backgroundColor:C.brand },
  stepDotDone:   { borderColor:C.brandDk, backgroundColor:C.brandDk },
  stepDotTxt:    { fontSize:10, fontWeight:"700", color:"rgba(255,255,255,0.3)" },
  stepLbl:       { fontSize:12, color:"rgba(255,255,255,0.35)" },
  stepLblOn:     { color:"#fff", fontWeight:"600" },
  stepLine:      { flex:1, height:1, backgroundColor:"rgba(255,255,255,0.1)", marginHorizontal:10 },

  // Card
  card:          { backgroundColor:C.bgCard, marginHorizontal:16, marginTop:14, borderRadius:14, padding:18, borderWidth:1, borderColor:C.border },
  cardTitle:     { fontSize:16, fontWeight:"700", color:C.text, marginBottom:2 },
  cardSub:       { fontSize:13, color:C.text3, marginBottom:16 },

  // Search
  searchRow:     { flexDirection:"row", gap:8 },
  searchInput:   { flex:1, backgroundColor:C.bg, borderWidth:1, borderColor:C.border, borderRadius:10, paddingHorizontal:14, paddingVertical:13, fontSize:14, color:C.text },
  searchBtn:     { backgroundColor:C.bgDark, borderRadius:10, paddingHorizontal:18, justifyContent:"center", minHeight:46 },
  searchBtnTxt:  { color:"#fff", fontSize:14, fontWeight:"600" },

  fieldLabel:    { fontSize:11, fontWeight:"600", color:C.text3, textTransform:"uppercase", letterSpacing:0.5, marginBottom:8 },

  // Results
  resultRow:     { flexDirection:"row", alignItems:"center", gap:10, paddingVertical:11, paddingHorizontal:12, borderRadius:10, borderWidth:1, borderColor:C.border, marginBottom:6, backgroundColor:C.bg },
  resultAvatar:  { width:36, height:36, borderRadius:18, backgroundColor:C.blueLt, alignItems:"center", justifyContent:"center" },
  resultAvatarTxt:{ fontSize:14, fontWeight:"700", color:C.brand },
  resultName:    { fontSize:14, fontWeight:"600", color:C.text, marginBottom:1 },
  resultMeta:    { fontSize:11, color:C.text4 },
  resultBal:     { fontSize:13, fontWeight:"600", color:C.text },

  // Account banner
  acctBanner:    { backgroundColor:C.bgDark, marginHorizontal:16, marginTop:14, borderRadius:14, padding:16, flexDirection:"row", alignItems:"flex-start", gap:12 },
  acctAvatar:    { width:42, height:42, borderRadius:21, backgroundColor:C.brand, alignItems:"center", justifyContent:"center" },
  acctAvatarTxt: { fontSize:17, fontWeight:"800", color:"#fff" },
  acctName:      { fontSize:15, fontWeight:"700", color:"#fff", marginBottom:2 },
  acctMeta:      { fontSize:11, color:"rgba(255,255,255,0.4)", marginBottom:3 },
  acctType:      { fontSize:10, color:"rgba(255,255,255,0.5)", textTransform:"capitalize" },
  balLabel:      { fontSize:9, color:"rgba(255,255,255,0.35)", textTransform:"uppercase", marginBottom:2 },
  balAmt:        { fontSize:15, fontWeight:"700", color:"#fff", marginBottom:6 },
  changeBtn:     { paddingHorizontal:10, paddingVertical:4, borderRadius:8, borderWidth:1, borderColor:"rgba(255,255,255,0.2)" },
  changeBtnTxt:  { fontSize:11, color:"rgba(255,255,255,0.5)" },

  // Type selector
  typeRow:       { flexDirection:"row", gap:6 },
  typeBtn:       { flex:1, borderRadius:10, borderWidth:1.5, borderColor:C.border, padding:11, backgroundColor:C.bgCard, position:"relative" },
  typeBtnLabel:  { fontSize:12, fontWeight:"700", color:C.text, marginBottom:3 },
  typeBtnSub:    { fontSize:10, color:C.text4, lineHeight:13 },
  typeCheck:     { position:"absolute", top:6, right:6, width:15, height:15, borderRadius:8, alignItems:"center", justifyContent:"center" },
  typeCheckTxt:  { color:"#fff", fontSize:9, fontWeight:"900" },

  // Amount
  amtWrap:       { flexDirection:"row", alignItems:"center", backgroundColor:C.bg, borderWidth:1.5, borderColor:C.border, borderRadius:12, overflow:"hidden" },
  amtPrefix:     { paddingHorizontal:14, paddingVertical:15, fontSize:14, fontWeight:"700", color:C.text3 },
  amtInput:      { flex:1, paddingVertical:14, paddingHorizontal:8, fontSize:26, fontWeight:"800", color:C.text },

  // Preview
  preview:       { borderRadius:10, padding:12, marginTop:10, borderWidth:1 },
  previewLabel:  { fontSize:12, fontWeight:"600", marginBottom:2 },
  previewAmt:    { fontSize:18, fontWeight:"800" },

  // Notes
  notesInput:    { backgroundColor:C.bg, borderWidth:1, borderColor:C.border, borderRadius:10, paddingHorizontal:14, paddingVertical:12, fontSize:14, color:C.text, minHeight:68, textAlignVertical:"top" },

  // Buttons
  postBtn:       { borderRadius:12, paddingVertical:15, alignItems:"center", marginTop:20, elevation:1 },
  postBtnTxt:    { color:"#fff", fontSize:15, fontWeight:"700" },
  cancelBtn:     { alignItems:"center", paddingVertical:12, marginTop:2 },
  cancelBtnTxt:  { fontSize:13, color:C.text3 },
});
