import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, RefreshControl, KeyboardAvoidingView, Platform, Modal } from "react-native";
import { supabase } from "../supabase";
import { C, GHS } from "../theme";

const EMPTY = { name:"", email:"", phone:"", ghana_card:"", dob:"", address:"", occupation:"", employer:"", monthly_income:"" };

export default function AccountScreen({ collector }) {
  const [view,         setView]         = useState("list");
  const [step,         setStep]         = useState(1);
  const [products,     setProducts]     = useState([]);
  const [loadingProds, setLoadingProds] = useState(false);
  const [custSearch,   setCustSearch]   = useState("");
  const [customers,    setCustomers]    = useState([]);
  const [loadingCust,  setLoadingCust]  = useState(false);
  const [selCust,      setSelCust]      = useState(null);
  const [isNew,        setIsNew]        = useState(false);
  const [newCust,      setNewCust]      = useState(EMPTY);
  const [selProduct,   setSelProduct]   = useState(null);
  const [deposit,      setDeposit]      = useState("");
  const [notes,        setNotes]        = useState("");
  const [submitting,   setSubmitting]   = useState(false);
  const [requests,     setRequests]     = useState([]);
  const [loadingReqs,  setLoadingReqs]  = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);

  // Deposit modal state
  const [depositReq,   setDepositReq]   = useState(null); // the approved request
  const [depositAmt,   setDepositAmt]   = useState("");
  const [depositNotes, setDepositNotes] = useState("");
  const [postingDep,   setPostingDep]   = useState(false);

  // Load products and system settings
  useEffect(() => {
    setLoadingProds(true);
    supabase.from("products")
      .select("id,name,category,interest_rate,description,min_balance,tenure_months")
      .eq("status","active").order("name")
      .then(({ data }) => { setProducts(data||[]); setLoadingProds(false); });
  }, []);

  // Load my requests
  const loadRequests = useCallback(async (refresh=false) => {
    if (refresh) setRefreshing(true); else setLoadingReqs(true);
    const { data } = await supabase.from("pending_approvals")
      .select("*").eq("submitted_by", collector.id)
      .order("submitted_at", { ascending:false });
    setRequests(data||[]);
    if (refresh) setRefreshing(false); else setLoadingReqs(false);
  }, [collector.id]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  // Realtime: update request status when admin acts
  useEffect(() => {
    const ch = supabase.channel("approvals-" + collector.id)
      .on("postgres_changes", { event:"UPDATE", schema:"public", table:"pending_approvals" }, p => {
        const r = p.new;
        if (!r || r.submitted_by !== collector.id) return;
        setRequests(prev => prev.map(x => x.id===r.id ? r : x));
        // Notify collector of status change
        if (r.status === "approved") {
          Alert.alert("Request Approved", "Your account opening request for " + (r.payload?.customerName||"customer") + " has been approved.");
        } else if (r.status === "rejected") {
          Alert.alert("Request Rejected", "Your request was rejected. Reason: " + (r.reject_reason||"No reason given"));
        }
      }).subscribe();
    return () => supabase.removeChannel(ch);
  }, [collector.id]);

  // Customer search with debounce
  useEffect(() => {
    if (!custSearch || custSearch.length < 2) { setCustomers([]); return; }
    const t = setTimeout(async () => {
      setLoadingCust(true);
      const { data } = await supabase.from("customers")
        .select("id,name,phone,ghana_card,email")
        .or("name.ilike.%"+custSearch+"%,phone.ilike.%"+custSearch+"%,ghana_card.ilike.%"+custSearch+"%")
        .limit(15);
      setCustomers(data||[]);
      setLoadingCust(false);
    }, 400);
    return () => clearTimeout(t);
  }, [custSearch]);

  const reset = () => {
    setStep(1); setCustSearch(""); setCustomers([]);
    setSelCust(null); setIsNew(false); setNewCust(EMPTY);
    setSelProduct(null); setDeposit(""); setNotes("");
  };

  const nc = k => v => setNewCust(p => ({ ...p, [k]:v }));

  const validateStep1 = () => {
    if (!isNew && !selCust) { Alert.alert("Required","Select an existing customer or choose New Customer"); return false; }
    if (isNew) {
      if (!newCust.name.trim())  { Alert.alert("Required","Full name is required"); return false; }
      if (!newCust.phone.trim()) { Alert.alert("Required","Phone number is required"); return false; }
    }
    return true;
  };

  // Submit account opening request for approval
  const submit = async () => {
    if (!selProduct) { Alert.alert("Required","Select an account product"); return; }
    const dep = parseFloat(deposit)||0;
    setSubmitting(true);
    try {
      const payload = isNew ? {
        isNewCustomer: true,
        name:          newCust.name.trim(),
        email:         newCust.email.trim()||null,
        phone:         newCust.phone.trim(),
        ghana_card:    newCust.ghana_card.trim()||null,
        dob:           newCust.dob.trim()||null,
        address:       newCust.address.trim()||null,
        occupation:    newCust.occupation.trim()||null,
        employer:      newCust.employer.trim()||null,
        monthly_income:newCust.monthly_income ? parseFloat(newCust.monthly_income) : null,
        customerName:  newCust.name.trim(),
        type:          selProduct.category,
        productId:     selProduct.id,
        productName:   selProduct.name,
        interestRate:  selProduct.interest_rate,
        initialDeposit:dep,
        notes:         notes||null,
        requestedBy:   collector.name,
        collectorId:   collector.id,
      } : {
        isNewCustomer: false,
        customer_id:   selCust.id,
        customerName:  selCust.name,
        customerPhone: selCust.phone,
        type:          selProduct.category,
        productId:     selProduct.id,
        productName:   selProduct.name,
        interestRate:  selProduct.interest_rate,
        initialDeposit:dep,
        notes:         notes||null,
        requestedBy:   collector.name,
        collectorId:   collector.id,
      };

      const { error } = await supabase.from("pending_approvals").insert({
        type:           "account",
        payload,
        submitted_by:   collector.id,
        submitter_name: collector.name,
        status:         "pending",
        submitted_at:   new Date().toISOString(),
      });
      if (error) throw error;

      // Notify all admins and managers
      const { data: admins } = await supabase.from("users").select("id")
        .in("role",["admin","manager"]).eq("status","active");
      if (admins?.length) {
        const custLabel = isNew ? newCust.name.trim() : selCust.name;
        await supabase.from("notifications").insert(
          admins.map(a => ({
            user_id: a.id,
            title:   isNew ? "New Customer + Account Request" : "Account Opening Request",
            message: collector.name + " requests " + (isNew?"to register "+custLabel+" and ":"") + "open a " + selProduct.name + " account for " + custLabel + (dep>0?" with initial deposit GH\u20B5"+dep.toLocaleString("en-GH",{minimumFractionDigits:2}):""),
            type:    "info",
            read:    false,
          }))
        );
      }

      Alert.alert(
        "Request Submitted",
        "Your account opening request has been sent to the admin for approval. You will be notified once it is reviewed.",
        [{ text:"OK", onPress:() => { setView("list"); reset(); loadRequests(); } }]
      );
    } catch(e) {
      Alert.alert("Error", e.message||"Failed to submit request");
    }
    setSubmitting(false);
  };

  const ST_COLOR = { pending:"#D97706", approved:"#2563EB", rejected:"#DC2626" };
  const ST_BG    = { pending:"#FEF3C7", approved:"#DBEAFE", rejected:"#FEE2E2" };

  // ── Post initial deposit after account is approved ─────────────────────────
  const postDeposit = async () => {
    const amt = parseFloat(depositAmt) || 0;
    if (amt <= 0) { Alert.alert("Required", "Enter a valid deposit amount"); return; }
    if (!depositReq?.account_number_created) {
      Alert.alert("Error", "Account number not found. Contact admin.");
      return;
    }
    setPostingDep(true);
    try {
      // Find the account that was created from this approval
      const { data: acct, error: acctErr } = await supabase
        .from("accounts")
        .select("id, balance, customer_id")
        .eq("account_number", depositReq.account_number_created)
        .single();
      if (acctErr || !acct) throw new Error("Account not found. It may not have been created yet.");

      const newBal = Number(acct.balance || 0) + amt;
      const { error: collErr } = await supabase.from("collections").insert({
        account_id:    acct.id,
        collector_id:  collector.id,
        collector_name:collector.name,
        customer_id:   acct.customer_id,
        customer_name: depositReq.payload?.customerName || null,
        amount:        amt,
        payment_type:  "savings",
        notes:         depositNotes.trim() || "Initial deposit",
        status:        "completed",
        created_at:    new Date().toISOString(),
      });
      if (collErr) throw collErr;
      await supabase.from("accounts").update({ balance: newBal }).eq("id", acct.id);

      Alert.alert(
        "Deposit Posted",
        "GH\u20B5" + amt.toLocaleString("en-GH", { minimumFractionDigits: 2 }) + " deposited successfully into " + depositReq.account_number_created,
        [{ text: "OK", onPress: () => { setDepositReq(null); setDepositAmt(""); setDepositNotes(""); } }]
      );
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to post deposit");
    }
    setPostingDep(false);
  };

  // ── LIST VIEW ──────────────────────────────────────────────────────────────
  if (view === "list") {
    return (
      <>
      <ScrollView style={S.root} contentContainerStyle={{ paddingBottom:40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadRequests(true)} tintColor={C.brand} />}
        showsVerticalScrollIndicator={false}>

        {/* Dark header */}
        <View style={S.pageTop}>
          <View style={{ flex:1 }}>
            <Text style={S.pageTitle}>Account Opening</Text>
            <Text style={S.pageSub}>All requests go for admin approval</Text>
          </View>
          <TouchableOpacity style={S.newBtn} onPress={() => { reset(); setView("new"); }}>
            <Text style={S.newBtnTxt}>+ New Request</Text>
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal:16, paddingTop:16 }}>
          {/* Info banner */}
          <View style={S.infoBanner}>
            <Text style={S.infoBannerIcon}>i</Text>
            <Text style={S.infoBannerTxt}>Account openings require admin approval. New customer registrations are included in the same request.</Text>
          </View>

          <Text style={S.sectionTitle}>My Requests ({requests.length})</Text>

          {loadingReqs ? (
            <ActivityIndicator color={C.brand} style={{ marginTop:40 }} />
          ) : requests.length === 0 ? (
            <View style={S.empty}>
              <View style={S.emptyIconBox}><Text style={{ fontSize:28 }}>&#127974;</Text></View>
              <Text style={S.emptyTxt}>No requests yet</Text>
              <Text style={S.emptyHint}>Tap "+ New Request" to submit one</Text>
            </View>
          ) : requests.map(r => {
            const p  = r.payload||{};
            const st = r.status||"pending";
            return (
              <View key={r.id} style={S.reqCard}>
                {/* Status stripe */}
                <View style={[S.reqStripe, { backgroundColor:ST_COLOR[st]||C.text4 }]} />
                <View style={S.reqContent}>
                  <View style={S.reqTopRow}>
                    <View style={{ flex:1 }}>
                      <Text style={S.reqTypeLabel}>{p.isNewCustomer ? "New Customer + Account" : "Account Opening"}</Text>
                      <Text style={S.reqCustomer}>{p.customerName||p.name||"\u2014"}</Text>
                      {p.productName ? <Text style={S.reqProduct}>{p.productName}</Text> : null}
                    </View>
                    <View style={[S.statusBadge, { backgroundColor:ST_BG[st]||"#F4F6FA" }]}>
                      <Text style={[S.statusTxt, { color:ST_COLOR[st]||C.text4 }]}>{st.toUpperCase()}</Text>
                    </View>
                  </View>
                  <View style={S.reqMeta}>
                    {p.initialDeposit > 0 && (
                      <View style={S.metaChip}>
                        <Text style={S.metaChipTxt}>Deposit: {GHS(p.initialDeposit)}</Text>
                      </View>
                    )}
                    <Text style={S.metaDate}>{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString("en-GH",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}) : ""}</Text>
                  </View>
                  {st === "rejected" && r.reject_reason && (
                    <View style={S.rejectBox}>
                      <Text style={S.rejectLabel}>Rejection Reason</Text>
                      <Text style={S.rejectTxt}>{r.reject_reason}</Text>
                    </View>
                  )}
                  {st === "approved" && (
                    <View style={S.approvedBox}>
                      <View style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                        <Text style={S.approvedTxt}>&#10003; Approved by {r.approver_name||"admin"}</Text>
                      </View>
                      {r.account_number_created ? (
                        <>
                          <Text style={S.approvedAccNum}>Account: {r.account_number_created}</Text>
                          <TouchableOpacity
                            style={S.depositBtn}
                            onPress={() => { setDepositReq(r); setDepositAmt(""); setDepositNotes(""); }}
                          >
                            <Text style={S.depositBtnTxt}>Make Deposit</Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <Text style={S.approvedSub}>Account is being set up. Check back shortly.</Text>
                      )}
                    </View>
                  )}
                  {st === "pending" && (
                    <View style={S.pendingBox}>
                      <Text style={S.pendingTxt}>Awaiting admin review</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <Modal visible={!!depositReq} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDepositReq(null)}>
        <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS==="ios"?"padding":undefined}>
          <ScrollView style={S.modalRoot} contentContainerStyle={{ padding:24, paddingBottom:48 }} keyboardShouldPersistTaps="handled">
            <View style={S.modalHeader}>
              <View>
                <Text style={S.modalTitle}>Make Deposit</Text>
                <Text style={S.modalSub}>{depositReq?.payload?.customerName || "Customer"}</Text>
              </View>
              <TouchableOpacity onPress={() => setDepositReq(null)} style={S.modalClose}>
                <Text style={S.modalCloseTxt}>&#10005;</Text>
              </TouchableOpacity>
            </View>

            {/* Account info */}
            <View style={S.modalAccBox}>
              <Text style={S.modalAccLabel}>Account Number</Text>
              <Text style={S.modalAccNum}>{depositReq?.account_number_created}</Text>
              <Text style={S.modalAccProduct}>{depositReq?.payload?.productName}</Text>
            </View>

            {/* Amount */}
            <Text style={S.fieldLabel}>Deposit Amount (GH\u20B5) *</Text>
            <View style={S.amtBox}>
              <Text style={S.amtCcy}>GH\u20B5</Text>
              <TextInput
                style={S.amtInput}
                placeholder="0.00"
                placeholderTextColor={C.text4}
                value={depositAmt}
                onChangeText={setDepositAmt}
                keyboardType="decimal-pad"
                autoFocus
              />
            </View>

            {/* Notes */}
            <Text style={[S.fieldLabel, { marginTop:16 }]}>Notes (optional)</Text>
            <TextInput
              style={S.notesInput}
              placeholder="e.g. Initial deposit, receipt no..."
              placeholderTextColor={C.text4}
              value={depositNotes}
              onChangeText={setDepositNotes}
              autoCapitalize="sentences"
              multiline
            />

            <TouchableOpacity
              style={[S.submitBtn, (postingDep || !depositAmt) && { opacity:0.5 }]}
              onPress={postDeposit}
              disabled={postingDep || !depositAmt}
            >
              {postingDep
                ? <ActivityIndicator color="#fff" />
                : <Text style={S.submitBtnTxt}>Post Deposit</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={S.cancelLink} onPress={() => setDepositReq(null)}>
              <Text style={S.cancelLinkTxt}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
      </>
    );
  }

  // ── NEW REQUEST FORM ───────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS==="ios"?"padding":undefined}>
      <ScrollView style={S.root} contentContainerStyle={{ paddingBottom:40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Dark header */}
        <View style={S.pageTop}>
          <TouchableOpacity style={S.backBtn} onPress={() => { setView("list"); reset(); }}>
            <Text style={S.backTxt}>\u2190 Back</Text>
          </TouchableOpacity>
          <Text style={S.pageTitle}>New Account Request</Text>
          <Text style={S.pageSub}>Will be sent for admin approval</Text>
        </View>

        {/* Progress steps */}
        <View style={S.stepBar}>
          {[{n:1,label:"Customer"},{n:2,label:"Product"}].map((s,i) => {
            const active = step===s.n;
            const done   = step>s.n;
            return (
              <React.Fragment key={s.n}>
                <View style={S.stepItem}>
                  <View style={[S.stepDot, active&&S.stepDotActive, done&&S.stepDotDone]}>
                    <Text style={[S.stepDotTxt,(active||done)&&{color:"#fff"}]}>{done?"\u2713":s.n}</Text>
                  </View>
                  <Text style={[S.stepLbl, active&&{color:C.brand,fontWeight:"700"}, done&&{color:C.brandDk}]}>{s.label}</Text>
                </View>
                {i<1 && <View style={[S.stepLine, done&&{backgroundColor:C.brand}]} />}
              </React.Fragment>
            );
          })}
        </View>

        {/* STEP 1: Customer */}
        {step===1 && (
          <View style={S.card}>
            <Text style={S.cardLabel}>STEP 1 \u00B7 CUSTOMER DETAILS</Text>

            {/* Toggle existing / new */}
            <View style={S.toggle}>
              <TouchableOpacity style={[S.toggleTab, !isNew&&S.toggleTabActive]} onPress={() => { setIsNew(false); setNewCust(EMPTY); }}>
                <Text style={[S.toggleTxt, !isNew&&S.toggleTxtActive]}>Existing Customer</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[S.toggleTab, isNew&&S.toggleTabActive]} onPress={() => { setIsNew(true); setSelCust(null); setCustSearch(""); setCustomers([]); }}>
                <Text style={[S.toggleTxt, isNew&&S.toggleTxtActive]}>New Customer</Text>
              </TouchableOpacity>
            </View>

            {/* Existing customer search */}
            {!isNew && (
              <>
                <TextInput style={S.input} placeholder="Search by name, phone or Ghana Card..." placeholderTextColor={C.text4} value={custSearch} onChangeText={setCustSearch} autoCapitalize="none" autoCorrect={false} />
                {loadingCust && <ActivityIndicator color={C.brand} size="small" style={{ marginBottom:8 }} />}
                {customers.map(c => (
                  <TouchableOpacity key={c.id} style={[S.custRow, selCust?.id===c.id&&S.custRowActive]} onPress={() => { setSelCust(c); setCustSearch(c.name); setCustomers([]); }}>
                    <View style={[S.custAvatar, selCust?.id===c.id&&{backgroundColor:C.brand}]}>
                      <Text style={[S.custAvatarTxt, selCust?.id===c.id&&{color:"#fff"}]}>{c.name[0].toUpperCase()}</Text>
                    </View>
                    <View style={{ flex:1 }}>
                      <Text style={[S.custName, selCust?.id===c.id&&{color:C.brand}]}>{c.name}</Text>
                      <Text style={S.custSub}>{c.phone}{c.ghana_card?" \u00B7 "+c.ghana_card:""}</Text>
                    </View>
                    {selCust?.id===c.id && <Text style={{ color:C.brand, fontSize:18 }}>\u2713</Text>}
                  </TouchableOpacity>
                ))}
                {selCust && customers.length===0 && (
                  <View style={S.selBox}>
                    <View style={{ flex:1 }}>
                      <Text style={S.selName}>{selCust.name}</Text>
                      <Text style={S.selSub}>{selCust.phone}</Text>
                    </View>
                    <TouchableOpacity onPress={() => { setSelCust(null); setCustSearch(""); }}>
                      <Text style={{ color:C.red, fontSize:12, fontWeight:"700" }}>Change</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}

            {/* New customer form */}
            {isNew && (
              <>
                {[
                  {k:"name",           label:"Full Name *",          ph:"Ama Boateng",       kb:"default",     cap:"words"    },
                  {k:"phone",          label:"Phone Number *",       ph:"0551234567",        kb:"phone-pad",   cap:"none"     },
                  {k:"email",          label:"Email Address",        ph:"ama@email.com",     kb:"email-address",cap:"none"   },
                  {k:"ghana_card",     label:"Ghana Card Number",    ph:"GHA-XXXXXXX-X",     kb:"default",     cap:"characters"},
                  {k:"dob",            label:"Date of Birth",        ph:"DD/MM/YYYY",        kb:"default",     cap:"none"     },
                  {k:"address",        label:"Residential Address",  ph:"e.g. Accra Central",kb:"default",     cap:"sentences"},
                  {k:"occupation",     label:"Occupation",           ph:"e.g. Trader",       kb:"default",     cap:"words"    },
                  {k:"employer",       label:"Employer / Business",  ph:"e.g. Self-employed",kb:"default",     cap:"words"    },
                  {k:"monthly_income", label:"Monthly Income (GH\u20B5)",ph:"0.00",          kb:"decimal-pad", cap:"none"     },
                ].map(f => (
                  <View key={f.k}>
                    <Text style={S.fieldLabel}>{f.label}</Text>
                    <TextInput style={S.input} placeholder={f.ph} placeholderTextColor={C.text4} value={newCust[f.k]} onChangeText={nc(f.k)} keyboardType={f.kb} autoCapitalize={f.cap} autoCorrect={false} />
                  </View>
                ))}
              </>
            )}

            <TouchableOpacity style={S.nextBtn} onPress={() => { if (validateStep1()) setStep(2); }}>
              <Text style={S.nextBtnTxt}>Continue to Product \u2192</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 2: Product */}
        {step===2 && (
          <View style={S.card}>
            <Text style={S.cardLabel}>STEP 2 \u00B7 ACCOUNT PRODUCT</Text>

            {/* For whom */}
            <View style={S.forRow}>
              <View style={S.forAvatar}>
                <Text style={S.forAvatarTxt}>{(isNew?newCust.name:selCust?.name||"?")[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex:1 }}>
                <Text style={S.forName}>{isNew ? newCust.name : selCust?.name}</Text>
                <Text style={S.forSub}>{isNew ? "New customer" : selCust?.phone}</Text>
              </View>
              <TouchableOpacity onPress={() => setStep(1)}>
                <Text style={S.changeLink}>Change</Text>
              </TouchableOpacity>
            </View>

            {/* Product list */}
            {loadingProds ? (
              <ActivityIndicator color={C.brand} style={{ marginVertical:20 }} />
            ) : products.length===0 ? (
              <View style={S.empty}>
                <Text style={S.emptyTxt}>No products configured</Text>
                <Text style={S.emptyHint}>Ask your admin to add products in the system.</Text>
              </View>
            ) : (
              <>
                <Text style={S.fieldLabel}>Select Product *</Text>
                {products.map(p => {
                  const isLoan = ["personal","hire_purchase","micro","mortgage","emergency","group"].includes((p.category||"").toLowerCase().replace(/ /g,"_"));
                  const sel    = selProduct?.id===p.id;
                  return (
                    <TouchableOpacity key={p.id} style={[S.productRow, sel&&S.productRowActive]} onPress={() => setSelProduct(p)}>
                      <View style={{ flex:1 }}>
                        <View style={{ flexDirection:"row", alignItems:"center", gap:8, marginBottom:3 }}>
                          <Text style={[S.productName, sel&&{color:C.brand}]}>{p.name}</Text>
                          <View style={{ backgroundColor:isLoan?"#EDE9FE":"#DBEAFE", paddingHorizontal:7, paddingVertical:2, borderRadius:8 }}>
                            <Text style={{ fontSize:10, fontWeight:"700", color:isLoan?"#7C3AED":"#2563EB" }}>{isLoan?"Loan":"Savings"}</Text>
                          </View>
                        </View>
                        <Text style={S.productSub}>
                          {(p.category||"").replace(/_/g," ")}
                          {p.interest_rate>0?" \u00B7 "+p.interest_rate+"% p.a.":""}
                          {p.min_balance>0?" \u00B7 Min: "+GHS(p.min_balance):""}
                        </Text>
                        {p.description ? <Text style={S.productDesc}>{p.description}</Text> : null}
                      </View>
                      <View style={[S.radio, sel&&S.radioActive]}>
                        {sel && <View style={S.radioDot} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            {/* Initial deposit */}
            <Text style={[S.fieldLabel,{marginTop:20}]}>Initial Deposit (GH\u20B5)</Text>
            <View style={S.amtBox}>
              <Text style={S.amtCcy}>GH\u20B5</Text>
              <TextInput style={S.amtInput} placeholder="0.00" placeholderTextColor={C.text4} value={deposit} onChangeText={setDeposit} keyboardType="decimal-pad" />
            </View>

            {/* Notes */}
            <Text style={[S.fieldLabel,{marginTop:16}]}>Notes for Supervisor</Text>
            <TextInput style={[S.input,{minHeight:70,textAlignVertical:"top"}]} placeholder="Any additional notes or context..." placeholderTextColor={C.text4} value={notes} onChangeText={setNotes} multiline />

            {/* Approval notice */}
            <View style={S.approvalNotice}>
              <Text style={S.approvalNoticeTitle}>Requires Admin Approval</Text>
              <Text style={S.approvalNoticeTxt}>This request will be sent to your supervisor. The account will only be opened after approval. You will be notified of the decision.</Text>
            </View>

            <TouchableOpacity style={[S.submitBtn, submitting&&{opacity:0.65}]} onPress={submit} disabled={submitting}>
              {submitting
                ? <ActivityIndicator color={C.bgDark} />
                : <Text style={S.submitBtnTxt}>Submit for Approval</Text>}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const S = StyleSheet.create({
  root:              { flex:1, backgroundColor:C.bg },
  pageTop:           { backgroundColor:C.bgDark, paddingHorizontal:20, paddingTop:16, paddingBottom:24 },
  pageTitle:         { fontSize:22, fontWeight:"900", color:"#fff" },
  pageSub:           { fontSize:13, color:"rgba(255,255,255,0.45)", marginTop:4 },
  newBtn:            { backgroundColor:C.brand, paddingHorizontal:16, paddingVertical:10, borderRadius:12 },
  newBtnTxt:         { color:C.bgDark, fontSize:13, fontWeight:"800" },
  backBtn:           { marginBottom:8 },
  backTxt:           { fontSize:14, color:C.brand, fontWeight:"700" },
  infoBanner:        { flexDirection:"row", alignItems:"flex-start", gap:10, backgroundColor:C.brandLt, borderRadius:14, padding:14, marginBottom:20, borderWidth:1, borderColor:C.greenBg },
  infoBannerIcon:    { width:22, height:22, borderRadius:11, backgroundColor:C.brand, color:C.bgDark, textAlign:"center", lineHeight:22, fontSize:13, fontWeight:"900" },
  infoBannerTxt:     { flex:1, fontSize:13, color:C.greenDk, lineHeight:19 },
  sectionTitle:      { fontSize:11, fontWeight:"700", color:C.text4, textTransform:"uppercase", letterSpacing:1, marginBottom:14 },
  empty:             { alignItems:"center", paddingVertical:48 },
  emptyIconBox:      { width:64, height:64, borderRadius:32, backgroundColor:C.bgMuted, alignItems:"center", justifyContent:"center", marginBottom:14 },
  emptyTxt:          { fontSize:15, fontWeight:"700", color:C.text3, marginBottom:4 },
  emptyHint:         { fontSize:12, color:C.text4, textAlign:"center" },
  reqCard:           { flexDirection:"row", backgroundColor:C.bgCard, borderRadius:16, marginBottom:12, borderWidth:1, borderColor:C.border, overflow:"hidden", shadowColor:"#0D1B2A", shadowOpacity:0.05, shadowRadius:10, elevation:2 },
  reqStripe:         { width:4 },
  reqContent:        { flex:1, padding:14 },
  reqTopRow:         { flexDirection:"row", alignItems:"flex-start", marginBottom:10 },
  reqTypeLabel:      { fontSize:11, fontWeight:"700", color:C.text4, textTransform:"uppercase", letterSpacing:0.5, marginBottom:3 },
  reqCustomer:       { fontSize:15, fontWeight:"800", color:C.text },
  reqProduct:        { fontSize:12, color:C.text3, marginTop:2 },
  statusBadge:       { paddingHorizontal:10, paddingVertical:4, borderRadius:20, alignSelf:"flex-start" },
  statusTxt:         { fontSize:10, fontWeight:"800", letterSpacing:0.5 },
  reqMeta:           { flexDirection:"row", alignItems:"center", gap:8, flexWrap:"wrap" },
  metaChip:          { backgroundColor:C.bg, paddingHorizontal:8, paddingVertical:3, borderRadius:8 },
  metaChipTxt:       { fontSize:11, color:C.text3, fontWeight:"600" },
  metaDate:          { fontSize:11, color:C.text4 },
  rejectBox:         { backgroundColor:C.redBg, borderRadius:10, padding:10, marginTop:10 },
  rejectLabel:       { fontSize:10, fontWeight:"700", color:C.red, textTransform:"uppercase", letterSpacing:0.5, marginBottom:3 },
  rejectTxt:         { fontSize:12, color:C.red, lineHeight:17 },
  approvedBox:       { backgroundColor:C.greenBg, borderRadius:10, padding:10, marginTop:10 },
  approvedTxt:       { fontSize:12, fontWeight:"700", color:C.greenDk, marginBottom:2 },
  approvedSub:       { fontSize:11, color:C.greenDk },
  pendingBox:        { backgroundColor:C.amberBg, borderRadius:10, padding:8, marginTop:10 },
  pendingTxt:        { fontSize:11, color:C.amber, fontWeight:"600" },
  stepBar:           { flexDirection:"row", alignItems:"center", backgroundColor:C.bgDark, paddingHorizontal:20, paddingBottom:20, borderBottomLeftRadius:24, borderBottomRightRadius:24, marginBottom:16 },
  stepItem:          { flexDirection:"row", alignItems:"center", gap:8 },
  stepDot:           { width:28, height:28, borderRadius:14, borderWidth:2, borderColor:"rgba(255,255,255,0.2)", alignItems:"center", justifyContent:"center" },
  stepDotActive:     { borderColor:C.brand, backgroundColor:C.brand },
  stepDotDone:       { borderColor:C.brandDk, backgroundColor:C.brandDk },
  stepDotTxt:        { fontSize:12, fontWeight:"800", color:"rgba(255,255,255,0.4)" },
  stepLbl:           { fontSize:13, fontWeight:"600", color:"rgba(255,255,255,0.45)" },
  stepLine:          { flex:1, height:2, backgroundColor:"rgba(255,255,255,0.1)", marginHorizontal:10 },
  card:              { backgroundColor:C.bgCard, marginHorizontal:16, marginBottom:14, borderRadius:20, padding:20, borderWidth:1, borderColor:C.border, shadowColor:"#0D1B2A", shadowOpacity:0.06, shadowRadius:12, elevation:3 },
  cardLabel:         { fontSize:11, fontWeight:"700", color:C.text4, textTransform:"uppercase", letterSpacing:1, marginBottom:18 },
  toggle:            { flexDirection:"row", backgroundColor:C.bg, borderRadius:12, padding:3, marginBottom:18 },
  toggleTab:         { flex:1, paddingVertical:10, alignItems:"center", borderRadius:10 },
  toggleTabActive:   { backgroundColor:C.bgCard, shadowColor:"#0D1B2A", shadowOpacity:0.08, shadowRadius:6, elevation:2 },
  toggleTxt:         { fontSize:13, fontWeight:"600", color:C.text3 },
  toggleTxtActive:   { color:C.brand, fontWeight:"800" },
  fieldLabel:        { fontSize:11, fontWeight:"700", color:C.text3, letterSpacing:0.8, marginBottom:8 },
  input:             { backgroundColor:C.bg, borderWidth:1.5, borderColor:C.border, borderRadius:12, paddingHorizontal:14, paddingVertical:13, fontSize:15, color:C.text, marginBottom:12 },
  custRow:           { flexDirection:"row", alignItems:"center", padding:12, borderRadius:12, borderWidth:1.5, borderColor:C.border, marginBottom:8, gap:10 },
  custRowActive:     { borderColor:C.brand, backgroundColor:C.brandLt },
  custAvatar:        { width:38, height:38, borderRadius:19, backgroundColor:C.bg, alignItems:"center", justifyContent:"center" },
  custAvatarTxt:     { fontSize:15, fontWeight:"800", color:C.text3 },
  custName:          { fontSize:14, fontWeight:"700", color:C.text },
  custSub:           { fontSize:12, color:C.text3, marginTop:1 },
  selBox:            { flexDirection:"row", alignItems:"center", backgroundColor:C.greenBg, borderRadius:12, padding:14, borderWidth:1, borderColor:C.greenBg, marginBottom:12, gap:10 },
  selName:           { fontSize:14, fontWeight:"700", color:C.greenDk },
  selSub:            { fontSize:12, color:C.text3, marginTop:2 },
  nextBtn:           { backgroundColor:C.brand, borderRadius:14, padding:16, alignItems:"center", marginTop:8, shadowColor:C.brand, shadowOpacity:0.3, shadowRadius:16, elevation:6 },
  nextBtnTxt:        { color:C.bgDark, fontSize:14, fontWeight:"900" },
  forRow:            { flexDirection:"row", alignItems:"center", backgroundColor:C.bg, borderRadius:14, padding:14, marginBottom:18, gap:12 },
  forAvatar:         { width:40, height:40, borderRadius:20, backgroundColor:C.brand, alignItems:"center", justifyContent:"center" },
  forAvatarTxt:      { fontSize:16, fontWeight:"900", color:C.bgDark },
  forName:           { fontSize:14, fontWeight:"700", color:C.text },
  forSub:            { fontSize:12, color:C.text3, marginTop:1 },
  changeLink:        { fontSize:12, color:C.brand, fontWeight:"700" },
  productRow:        { flexDirection:"row", alignItems:"center", padding:14, borderRadius:14, borderWidth:1.5, borderColor:C.border, marginBottom:8 },
  productRowActive:  { borderColor:C.brand, backgroundColor:C.brandLt },
  productName:       { fontSize:14, fontWeight:"700", color:C.text },
  productSub:        { fontSize:12, color:C.text3, marginTop:2, textTransform:"capitalize" },
  productDesc:       { fontSize:11, color:C.text4, marginTop:3 },
  radio:             { width:22, height:22, borderRadius:11, borderWidth:2, borderColor:C.border, alignItems:"center", justifyContent:"center" },
  radioActive:       { borderColor:C.brand },
  radioDot:          { width:11, height:11, borderRadius:6, backgroundColor:C.brand },
  amtBox:            { flexDirection:"row", alignItems:"center", backgroundColor:C.bg, borderWidth:1.5, borderColor:C.border, borderRadius:14, paddingHorizontal:16, gap:8, marginBottom:12 },
  amtCcy:            { fontSize:18, fontWeight:"700", color:C.text3 },
  amtInput:          { flex:1, paddingVertical:14, fontSize:26, fontWeight:"900", color:C.text },
  approvalNotice:    { backgroundColor:C.amberLt, borderRadius:14, padding:16, marginBottom:20, borderWidth:1, borderColor:C.amberBg },
  approvalNoticeTitle:{ fontSize:13, fontWeight:"800", color:C.amber, marginBottom:6 },
  approvalNoticeTxt: { fontSize:12, color:C.amber, lineHeight:18 },
  submitBtn:         { backgroundColor:C.brand, borderRadius:14, padding:17, alignItems:"center", shadowColor:C.brand, shadowOpacity:0.3, shadowRadius:16, elevation:6 },
  submitBtnTxt:      { color:C.bgDark, fontSize:15, fontWeight:"900" },

  // Approved state
  approvedAccNum:    { fontSize:13, fontFamily:"monospace", color:C.greenDk, fontWeight:"700", marginBottom:10 },
  depositBtn:        { backgroundColor:C.brand, borderRadius:10, paddingVertical:10, paddingHorizontal:16, alignSelf:"flex-start", marginTop:4 },
  depositBtnTxt:     { color:"#fff", fontSize:13, fontWeight:"800" },

  // Deposit modal
  modalRoot:         { flex:1, backgroundColor:C.bg },
  modalHeader:       { flexDirection:"row", alignItems:"flex-start", justifyContent:"space-between", marginBottom:24 },
  modalTitle:        { fontSize:22, fontWeight:"900", color:C.text },
  modalSub:          { fontSize:13, color:C.text3, marginTop:3 },
  modalClose:        { width:36, height:36, borderRadius:18, backgroundColor:C.bg, alignItems:"center", justifyContent:"center", borderWidth:1, borderColor:C.border },
  modalCloseTxt:     { fontSize:14, color:C.text3, fontWeight:"700" },
  modalAccBox:       { backgroundColor:C.bgDark, borderRadius:16, padding:18, marginBottom:24 },
  modalAccLabel:     { fontSize:10, color:"rgba(255,255,255,0.4)", fontWeight:"700", textTransform:"uppercase", letterSpacing:0.8, marginBottom:6 },
  modalAccNum:       { fontSize:20, fontWeight:"900", color:"#fff", fontFamily:"monospace", marginBottom:4 },
  modalAccProduct:   { fontSize:13, color:C.brand, fontWeight:"600" },
  notesInput:        { backgroundColor:C.bg, borderWidth:1.5, borderColor:C.border, borderRadius:12, paddingHorizontal:14, paddingVertical:12, fontSize:14, color:C.text, minHeight:70, textAlignVertical:"top", marginBottom:12 },
  cancelLink:        { alignItems:"center", paddingVertical:16 },
  cancelLinkTxt:     { fontSize:14, color:C.text3, fontWeight:"600" },
});
