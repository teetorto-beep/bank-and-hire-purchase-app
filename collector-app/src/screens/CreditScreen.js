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

// Account type colours
const ACC_TYPE = {
  savings:      { label:"Savings",       color:"#16a34a", bg:"#dcfce7" },
  current:      { label:"Current",       color:"#2563eb", bg:"#dbeafe" },
  hire_purchase:{ label:"Hire Purchase", color:"#7c3aed", bg:"#ede9fe" },
  joint:        { label:"Joint",         color:"#0891b2", bg:"#cffafe" },
  fixed_deposit:{ label:"Fixed Deposit", color:"#b45309", bg:"#fef3c7" },
  micro_savings:{ label:"Micro Savings", color:"#16a34a", bg:"#dcfce7" },
  susu:         { label:"Susu",          color:"#be185d", bg:"#fce7f3" },
};
const accTypeInfo = (t) => {
  if (!t) return { label: t || "Account", color:"#6b7280", bg:"#f3f4f6" };
  if (t.startsWith("item_loan")) return { label: t.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase()), color:"#ea580c", bg:"#ffedd5" };
  return ACC_TYPE[t] || { label: (t||"").replace(/_/g," "), color:"#6b7280", bg:"#f3f4f6" };
};

export default function CreditScreen({ collector }) {
  const [step,        setStep]        = useState(1);
  const [query,       setQuery]       = useState("");
  const [searching,   setSearching]   = useState(false);
  // step 1b: customer chosen, pick account
  const [customer,    setCustomer]    = useState(null);
  const [custAccounts,setCustAccounts]= useState([]);
  const [account,     setAccount]     = useState(null);
  const [collType,    setCollType]    = useState("savings");
  const [amount,      setAmount]      = useState("");
  const [notes,       setNotes]       = useState("");
  const [submitting,  setSubmitting]  = useState(false);

  // ── Search by name or account number ─────────────────────────────────────
  const searchAccount = async () => {
    const q = query.trim();
    if (!q) { Alert.alert("Required", "Enter an account number or customer name"); return; }
    setSearching(true); setCustAccounts([]); setCustomer(null);
    try {
      // Try account number first
      const { data: byAcct } = await supabase
        .from("accounts").select("id,account_number,balance,type,status,customer_id")
        .ilike("account_number", "%" + q + "%").eq("status", "active").limit(20);

      if (byAcct?.length) {
        // Get all unique customers
        const ids = [...new Set(byAcct.map(a => a.customer_id).filter(Boolean))];
        let cm = {};
        if (ids.length) {
          const { data: custs } = await supabase.from("customers").select("id,name,phone").in("id", ids);
          (custs || []).forEach(c => { cm[c.id] = c; });
        }
        const found = byAcct.map(a => ({ ...a, customer: cm[a.customer_id] || null }));
        if (found.length === 1) {
          // Single account — go straight to step 2
          setAccount(found[0]); setStep(2);
        } else {
          // Multiple accounts — group by customer, let collector pick account
          const cust = found[0].customer;
          setCustomer(cust);
          setCustAccounts(found);
          setStep("pick_account");
        }
        setSearching(false); return;
      }

      // Try customer name
      const { data: byName } = await supabase
        .from("customers").select("id,name,phone").ilike("name", "%" + q + "%").limit(10);

      if (!byName?.length) {
        Alert.alert("Not Found", "No customer or account found matching that search.");
        setSearching(false); return;
      }

      if (byName.length === 1) {
        // One customer — load all their accounts
        await loadCustomerAccounts(byName[0]);
      } else {
        // Multiple customers — show customer picker
        setCustomer(null);
        setCustAccounts(byName.map(c => ({ ...c, _isCustomer: true })));
        setStep("pick_customer");
      }
    } catch (e) { Alert.alert("Error", e.message || "Search failed"); }
    setSearching(false);
  };

  const loadCustomerAccounts = async (cust) => {
    setSearching(true);
    try {
      const { data: accts } = await supabase
        .from("accounts").select("id,account_number,balance,type,status,customer_id")
        .eq("customer_id", cust.id).eq("status", "active").order("type");
      if (!accts?.length) {
        Alert.alert("No Accounts", cust.name + " has no active accounts.");
        setSearching(false); return;
      }
      const found = accts.map(a => ({ ...a, customer: cust }));
      if (found.length === 1) {
        setAccount(found[0]); setStep(2);
      } else {
        setCustomer(cust);
        setCustAccounts(found);
        setStep("pick_account");
      }
    } catch (e) { Alert.alert("Error", e.message || "Failed to load accounts"); }
    setSearching(false);
  };

  const reset = () => {
    setStep(1); setQuery(""); setAccount(null); setCustomer(null);
    setCustAccounts([]); setCollType("savings"); setAmount(""); setNotes("");
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

        // Verify the update by re-fetching the fresh outstanding
        const { data: freshLoan } = await supabase.from("loans")
          .select("outstanding").eq("id", loan.id).single();
        const confirmedOut = freshLoan ? Number(freshLoan.outstanding) : newOut;

        msg = (custName || account.account_number) + "\nLoan repayment: " + GHS(amt) +
          "\nOutstanding: " + GHS(confirmedOut) +
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
        // Use hp.remaining directly — it's the source of truth, not total_price - total_paid
        const newRemaining = Math.max(0, Number(hp.remaining || 0) - amt);
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

        // Verify by re-fetching fresh remaining from DB
        const { data: freshHP } = await supabase.from("hp_agreements")
          .select("remaining").eq("id", hp.id).single();
        const confirmedRemaining = freshHP ? Number(freshHP.remaining) : newRemaining;

        msg = (custName || account.account_number) + "\nHP payment: " + GHS(amt) +
          "\nRemaining: " + GHS(confirmedRemaining) +
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
            {[{n:1,label:"Find"},{n:"pick_account",label:"Account"},{n:2,label:"Post"}].map((s,i) => {
              const active = step === s.n;
              const done = (s.n === 1 && (step === "pick_customer" || step === "pick_account" || step === 2))
                        || (s.n === "pick_account" && step === 2);
              return (
                <React.Fragment key={String(s.n)}>
                  <View style={S.stepItem}>
                    <View style={[S.stepDot, active && S.stepDotOn, done && S.stepDotDone]}>
                      <Text style={[S.stepDotTxt, (active||done) && {color:"#fff"}]}>
                        {done ? "✓" : i+1}
                      </Text>
                    </View>
                    <Text style={[S.stepLbl, active && S.stepLblOn, done && {color:C.brand}]}>{s.label}</Text>
                  </View>
                  {i < 2 && <View style={[S.stepLine, done && {backgroundColor:C.brand}]} />}
                </React.Fragment>
              );
            })}
          </View>
        </View>

        {/* ── STEP 1: Search ── */}
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
                onChangeText={v => { setQuery(v); }}
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
          </View>
        )}

        {/* ── STEP pick_customer: multiple customers found ── */}
        {step === "pick_customer" && (
          <View style={S.card}>
            <Text style={S.cardTitle}>Select Customer</Text>
            <Text style={S.cardSub}>Multiple customers found — tap to select</Text>
            {custAccounts.map(c => (
              <TouchableOpacity key={c.id} style={S.resultRow}
                onPress={() => loadCustomerAccounts(c)} activeOpacity={0.7}>
                <View style={S.resultAvatar}>
                  <Text style={S.resultAvatarTxt}>{(c.name||"A")[0].toUpperCase()}</Text>
                </View>
                <View style={{flex:1}}>
                  <Text style={S.resultName}>{c.name}</Text>
                  <Text style={S.resultMeta}>{c.phone || "—"}</Text>
                </View>
                <Text style={{fontSize:18, color:C.text3}}>›</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={S.cancelBtn} onPress={reset}>
              <Text style={S.cancelBtnTxt}>← Back to Search</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP pick_account: customer has multiple accounts ── */}
        {step === "pick_account" && customer && (
          <View style={S.card}>
            {/* Customer header */}
            <View style={{flexDirection:"row", alignItems:"center", gap:12, marginBottom:16, paddingBottom:14, borderBottomWidth:1, borderBottomColor:C.borderLt}}>
              <View style={[S.resultAvatar, {width:44, height:44, borderRadius:22}]}>
                <Text style={[S.resultAvatarTxt, {fontSize:18}]}>{(customer.name||"A")[0].toUpperCase()}</Text>
              </View>
              <View style={{flex:1}}>
                <Text style={{fontSize:15, fontWeight:"700", color:C.text}}>{customer.name}</Text>
                <Text style={{fontSize:12, color:C.text4}}>{customer.phone || ""}</Text>
              </View>
            </View>

            <Text style={S.cardTitle}>Select Account</Text>
            <Text style={S.cardSub}>This customer has {custAccounts.length} active accounts — choose which to post against</Text>

            {custAccounts.map(a => {
              const ti = accTypeInfo(a.type);
              return (
                <TouchableOpacity key={a.id} style={[S.acctPickRow, {borderColor: ti.color + "40"}]}
                  onPress={() => { setAccount(a); setStep(2); }} activeOpacity={0.75}>
                  <View style={[S.acctPickBadge, {backgroundColor: ti.bg}]}>
                    <Text style={[S.acctPickBadgeTxt, {color: ti.color}]}>{ti.label}</Text>
                  </View>
                  <View style={{flex:1}}>
                    <Text style={S.acctPickNum}>{a.account_number}</Text>
                    <Text style={[S.acctPickType, {color: ti.color}]}>{ti.label}</Text>
                  </View>
                  <View style={{alignItems:"flex-end"}}>
                    <Text style={S.acctPickBal}>{GHS(a.balance)}</Text>
                    <Text style={{fontSize:10, color:C.text4}}>balance</Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity style={S.cancelBtn} onPress={reset}>
              <Text style={S.cancelBtnTxt}>← Back to Search</Text>
            </TouchableOpacity>
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

  // Account picker
  acctPickRow:     { flexDirection:"row", alignItems:"center", gap:12, padding:14, borderRadius:12, borderWidth:1.5, borderColor:C.border, marginBottom:8, backgroundColor:C.bg },
  acctPickBadge:   { paddingHorizontal:10, paddingVertical:5, borderRadius:8, minWidth:70, alignItems:"center" },
  acctPickBadgeTxt:{ fontSize:11, fontWeight:"700" },
  acctPickNum:     { fontSize:13, fontWeight:"700", color:C.text, marginBottom:2 },
  acctPickType:    { fontSize:11, fontWeight:"600" },
  acctPickBal:     { fontSize:14, fontWeight:"800", color:C.text },

  // Buttons
  postBtn:       { borderRadius:12, paddingVertical:15, alignItems:"center", marginTop:20, elevation:1 },
  postBtnTxt:    { color:"#fff", fontSize:15, fontWeight:"700" },
  cancelBtn:     { alignItems:"center", paddingVertical:12, marginTop:2 },
  cancelBtnTxt:  { fontSize:13, color:C.text3 },
});
