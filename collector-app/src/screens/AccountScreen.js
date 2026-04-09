import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Alert, RefreshControl,
} from "react-native";
import { supabase } from "../supabase";

const GHS = (n) => `GH\u20B5 ${Number(n || 0).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`;

const STEP_CUSTOMER  = 1;
const STEP_NEW_FORM  = 2;
const STEP_ACCOUNT   = 3;

const EMPTY_CUST = {
  name: "", email: "", phone: "", ghana_card: "",
  dob: "", address: "", occupation: "", employer: "", monthly_income: "",
};

export default function AccountScreen({ collector }) {
  const [view, setView] = useState("list");
  const [step, setStep] = useState(STEP_CUSTOMER);

  const [products, setProducts]         = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [custSearch, setCustSearch]     = useState("");
  const [customers, setCustomers]       = useState([]);
  const [loadingCust, setLoadingCust]   = useState(false);
  const [selCustomer, setSelCustomer]   = useState(null);
  const [isNewCust, setIsNewCust]       = useState(false);
  const [newCust, setNewCust]           = useState(EMPTY_CUST);

  const [selProduct, setSelProduct]     = useState(null);
  const [initialDeposit, setInitialDeposit] = useState("");
  const [notes, setNotes]               = useState("");
  const [submitting, setSubmitting]     = useState(false);

  const [myRequests, setMyRequests]     = useState([]);
  const [loadingReqs, setLoadingReqs]   = useState(true);
  const [refreshing, setRefreshing]     = useState(false);

  // Load ALL active products from DB
  useEffect(() => {
    setLoadingProducts(true);
    supabase
      .from("products")
      .select("id, name, category, interest_rate, description, min_balance, monthly_fee, tenure_months, benefits")
      .eq("status", "active")
      .order("name")
      .then(({ data, error }) => {
        if (error) console.warn("products error:", error.message);
        setProducts(data || []);
        setLoadingProducts(false);
      });
  }, []);

  const loadRequests = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoadingReqs(true);
    const { data } = await supabase
      .from("pending_approvals")
      .select("*")
      .eq("submitted_by", collector.id)
      .order("submitted_at", { ascending: false });
    setMyRequests(data || []);
    if (refresh) setRefreshing(false); else setLoadingReqs(false);
  }, [collector.id]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  // Realtime: update request status when admin approves/rejects
  useEffect(() => {
    const ch = supabase
      .channel(`approvals-collector-${collector.id}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "pending_approvals",
      }, (payload) => {
        const row = payload.new;
        if (!row || row.submitted_by !== collector.id) return;
        setMyRequests(p => p.map(r => r.id === row.id ? row : r));
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [collector.id]);

  // Customer search
  const searchCustomers = useCallback(async (q) => {
    if (!q || q.length < 2) { setCustomers([]); return; }
    setLoadingCust(true);
    const { data } = await supabase
      .from("customers")
      .select("id, name, phone, ghana_card, email")
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%,ghana_card.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(15);
    setCustomers(data || []);
    setLoadingCust(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchCustomers(custSearch), 400);
    return () => clearTimeout(t);
  }, [custSearch, searchCustomers]);

  const resetForm = () => {
    setStep(STEP_CUSTOMER); setCustSearch(""); setCustomers([]);
    setSelCustomer(null); setIsNewCust(false); setNewCust(EMPTY_CUST);
    setSelProduct(null); setInitialDeposit(""); setNotes("");
  };

  const nc = (k) => (v) => setNewCust(p => ({ ...p, [k]: v }));

  const validateNewCust = () => {
    if (!newCust.name.trim())  { Alert.alert("Required", "Full name is required"); return false; }
    if (!newCust.phone.trim()) { Alert.alert("Required", "Phone number is required"); return false; }
    return true;
  };

  const submitRequest = async () => {
    if (!selProduct) { Alert.alert("Error", "Select an account product"); return; }
    const deposit = parseFloat(initialDeposit) || 0;
    setSubmitting(true);
    try {
      if (isNewCust) {
        // Submit a single combined request — customer + account in one payload
        // Admin approves once and both get created
        const { error: accErr } = await supabase.from("pending_approvals").insert({
          type: "account",
          payload: {
            // New customer fields
            isNewCustomer: true,
            name: newCust.name.trim(),
            email: newCust.email.trim() || null,
            phone: newCust.phone.trim(),
            ghana_card: newCust.ghana_card.trim() || null,
            dob: newCust.dob.trim() || null,
            address: newCust.address.trim() || null,
            occupation: newCust.occupation.trim() || null,
            employer: newCust.employer.trim() || null,
            monthly_income: newCust.monthly_income ? parseFloat(newCust.monthly_income) : null,
            // Account fields
            customerName: newCust.name.trim(),
            newCustomerPhone: newCust.phone.trim(),
            type: selProduct.category,
            productId: selProduct.id,
            productName: selProduct.name,
            interestRate: selProduct.interest_rate,
            initialDeposit: deposit,
            notes: notes || null,
            requestedBy: collector.name,
          },
          submitted_by: collector.id,
          submitter_name: collector.name,
          status: "pending",
          submitted_at: new Date().toISOString(),
        });
        if (accErr) throw accErr;
      } else {
        // Existing customer — straightforward account request
        const { error: accErr } = await supabase.from("pending_approvals").insert({
          type: "account",
          payload: {
            customer_id: selCustomer.id,
            customerId: selCustomer.id,
            customerName: selCustomer.name,
            type: selProduct.category,
            productId: selProduct.id,
            productName: selProduct.name,
            interestRate: selProduct.interest_rate,
            initialDeposit: deposit,
            notes: notes || null,
            requestedBy: collector.name,
            isNewCustomer: false,
          },
          submitted_by: collector.id,
          submitter_name: collector.name,
          status: "pending",
          submitted_at: new Date().toISOString(),
        });
        if (accErr) throw accErr;
      }

      // Notify admins
      const { data: admins } = await supabase
        .from("users").select("id")
        .in("role", ["admin","manager"]).eq("status","active");
      if (admins?.length) {
        await supabase.from("notifications").insert(
          admins.map(a => ({
            user_id: a.id,
            title: isNewCust ? "New Customer + Account Request" : "Account Opening Request",
            message: `${collector.name} requests ${isNewCust ? "to register " + newCust.name.trim() + " and " : ""}open a ${selProduct.name} account${deposit > 0 ? " with GH₵" + deposit : ""}`,
            type: "info", read: false,
          }))
        );
      }

      Alert.alert("Submitted ✅", isNewCust
        ? "Customer registration and account opening request sent for approval as a single request."
        : "Account opening request sent for approval.");
      setView("list"); resetForm(); loadRequests();
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to submit");
    }
    setSubmitting(false);
  };

  // ── LIST VIEW ───────────────────────────────────────────────────────────────
  if (view === "list") {
    return (
      <ScrollView style={styles.root} contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadRequests(true)} tintColor="#1a56db" />}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Account Opening</Text>
          <TouchableOpacity style={styles.newBtn} onPress={() => { resetForm(); setView("new"); }}>
            <Text style={styles.newBtnText}>+ New Request</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>Account opening requires admin approval. You can also register new customers here.</Text>
        </View>
        <Text style={styles.sectionTitle}>My Requests ({myRequests.length})</Text>
        {loadingReqs ? <ActivityIndicator color="#1a56db" style={{ marginTop: 24 }} /> :
          myRequests.length === 0 ? (
            <View style={styles.empty}>
              <Text style={{ fontSize: 36, marginBottom: 10 }}>🏦</Text>
              <Text style={styles.emptyText}>No requests yet</Text>
              <Text style={styles.emptyHint}>Tap "+ New Request" to submit one</Text>
            </View>
          ) : myRequests.map(r => {
            const p = r.payload || {};
            const status = r.status || "pending";
            const sc = { pending:"#f59e0b", approved:"#16a34a", rejected:"#ef4444" }[status] || "#64748b";
            const sb = { pending:"#fef9c3", approved:"#f0fdf4", rejected:"#fef2f2" }[status] || "#f1f5f9";
            return (
              <View key={r.id} style={styles.reqCard}>
                <View style={[styles.reqHeader, { backgroundColor: "#fafafa" }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reqType}>{r.type === "customer" ? "👤 New Customer" : "🏦 Account Opening"}</Text>
                    <Text style={styles.reqDetail}>{p.customerName || p.name || "—"}{p.productName ? " · " + p.productName : ""}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: sb }]}>
                    <Text style={[styles.statusText, { color: sc }]}>{status.toUpperCase()}</Text>
                  </View>
                </View>
                <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
                  {p.initialDeposit > 0 && <Text style={styles.reqSub}>Deposit: GH₵ {Number(p.initialDeposit).toLocaleString("en-GH", { minimumFractionDigits: 2 })}</Text>}
                  <Text style={styles.reqSub}>{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : ""}</Text>
                  {status === "rejected" && r.reject_reason && <Text style={[styles.reqSub, { color:"#ef4444" }]}>Reason: {r.reject_reason}</Text>}
                  {status === "approved" && r.type === "account" && (
                    <View style={{ backgroundColor: "#f0fdf4", borderRadius: 8, padding: 10, marginTop: 6, borderWidth: 1, borderColor: "#86efac" }}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: "#16a34a", marginBottom: 2 }}>✅ Account Opened</Text>
                      <Text style={{ fontSize: 11, color: "#166534" }}>Approved by {r.approver_name || "admin"} · {r.approved_at ? new Date(r.approved_at).toLocaleDateString() : ""}</Text>
                      <Text style={{ fontSize: 11, color: "#166534", marginTop: 2 }}>You can now credit this account in the Record tab.</Text>
                    </View>
                  )}
                  {status === "approved" && r.type === "customer" && (
                    <Text style={[styles.reqSub, { color:"#16a34a" }]}>✅ Customer registered · Approved by {r.approver_name || "admin"}</Text>
                  )}
                </View>
              </View>
            );
          })
        }
      </ScrollView>
    );
  }

  // ── NEW REQUEST FORM ────────────────────────────────────────────────────────
  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <View style={styles.pageHeader}>
        <TouchableOpacity onPress={() => { setView("list"); resetForm(); }}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>New Request</Text>
      </View>

      {/* Step indicator */}
      <View style={styles.stepRow}>
        {["Customer","Account"].map((s, i) => {
          const n = i + 1;
          const active = (n === 1 && step < STEP_ACCOUNT) || (n === 2 && step === STEP_ACCOUNT);
          const done   = n === 1 && step === STEP_ACCOUNT;
          return (
            <React.Fragment key={s}>
              <View style={styles.stepItem}>
                <View style={[styles.stepCircle, active && styles.stepCircleActive, done && styles.stepCircleDone]}>
                  <Text style={[styles.stepNum, (active||done) && { color:"#fff" }]}>{done ? "✓" : n}</Text>
                </View>
                <Text style={[styles.stepLabel, active && { color:"#1a56db", fontWeight:"700" }]}>{s}</Text>
              </View>
              {i < 1 && <View style={[styles.stepLine, done && { backgroundColor:"#1a56db" }]} />}
            </React.Fragment>
          );
        })}
      </View>

      {/* ── STEP 1: Customer ── */}
      {step < STEP_ACCOUNT && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>STEP 1 · CUSTOMER</Text>

          {/* Toggle: existing vs new */}
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleTab, !isNewCust && styles.toggleTabActive]}
              onPress={() => { setIsNewCust(false); setNewCust(EMPTY_CUST); }}>
              <Text style={[styles.toggleTabText, !isNewCust && styles.toggleTabTextActive]}>Existing Customer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleTab, isNewCust && styles.toggleTabActive]}
              onPress={() => { setIsNewCust(true); setSelCustomer(null); setCustSearch(""); setCustomers([]); }}>
              <Text style={[styles.toggleTabText, isNewCust && styles.toggleTabTextActive]}>New Customer</Text>
            </TouchableOpacity>
          </View>

          {/* Existing customer search */}
          {!isNewCust && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Search by name, phone or Ghana Card…"
                placeholderTextColor="#94a3b8"
                value={custSearch}
                onChangeText={setCustSearch}
              />
              {loadingCust && <ActivityIndicator color="#1a56db" size="small" style={{ marginBottom: 8 }} />}
              {customers.map(c => (
                <TouchableOpacity key={c.id}
                  style={[styles.custItem, selCustomer?.id === c.id && styles.custItemActive]}
                  onPress={() => { setSelCustomer(c); setCustSearch(c.name); setCustomers([]); }}>
                  <View style={[styles.avatar, selCustomer?.id === c.id && { backgroundColor:"#1a56db" }]}>
                    <Text style={[styles.avatarText, selCustomer?.id === c.id && { color:"#fff" }]}>{c.name[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.custName, selCustomer?.id === c.id && { color:"#1a56db" }]}>{c.name}</Text>
                    <Text style={styles.custSub}>{c.phone}{c.ghana_card ? " · " + c.ghana_card : ""}</Text>
                  </View>
                  {selCustomer?.id === c.id && <Text style={{ color:"#1a56db", fontSize:18 }}>✓</Text>}
                </TouchableOpacity>
              ))}
              {selCustomer && customers.length === 0 && (
                <View style={styles.selBox}>
                  <Text style={styles.selName}>✓ {selCustomer.name}</Text>
                  <Text style={styles.selSub}>{selCustomer.phone}</Text>
                  <TouchableOpacity onPress={() => { setSelCustomer(null); setCustSearch(""); }} style={{ marginTop: 6 }}>
                    <Text style={{ color:"#ef4444", fontSize:12, fontWeight:"700" }}>Change</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}

          {/* New customer full form */}
          {isNewCust && (
            <>
              {[
                { k:"name",           label:"Full Name *",           ph:"Ama Boateng",        kb:"default",    cap:"words" },
                { k:"email",          label:"Email",                 ph:"ama@email.com",      kb:"email-address", cap:"none" },
                { k:"phone",          label:"Phone *",               ph:"0551234567",         kb:"phone-pad",  cap:"none" },
                { k:"ghana_card",     label:"Ghana Card Number",     ph:"GHA-XXXXXXX-X",      kb:"default",    cap:"characters" },
                { k:"dob",            label:"Date of Birth",         ph:"DD/MM/YYYY",         kb:"default",    cap:"none" },
                { k:"address",        label:"Address",               ph:"e.g. Accra Central", kb:"default",    cap:"sentences" },
                { k:"occupation",     label:"Occupation",            ph:"e.g. Trader",        kb:"default",    cap:"words" },
                { k:"employer",       label:"Employer",              ph:"e.g. Self-employed",  kb:"default",    cap:"words" },
                { k:"monthly_income", label:"Monthly Income (GH₵)",  ph:"0.00",               kb:"decimal-pad",cap:"none" },
              ].map(f => (
                <View key={f.k}>
                  <Text style={styles.fieldLabel}>{f.label}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={f.ph}
                    placeholderTextColor="#94a3b8"
                    value={newCust[f.k]}
                    onChangeText={nc(f.k)}
                    keyboardType={f.kb}
                    autoCapitalize={f.cap}
                    autoCorrect={false}
                  />
                </View>
              ))}
            </>
          )}

          <TouchableOpacity
            style={styles.nextBtn}
            onPress={() => {
              if (!isNewCust && !selCustomer) { Alert.alert("Required", "Select a customer or choose New Customer"); return; }
              if (isNewCust && !validateNewCust()) return;
              setStep(STEP_ACCOUNT);
            }}>
            <Text style={styles.nextBtnText}>Continue to Account →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── STEP 2: Account product ── */}
      {step === STEP_ACCOUNT && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>STEP 2 · ACCOUNT PRODUCT</Text>

          <View style={styles.forBox}>
            <Text style={styles.forLabel}>For:</Text>
            <Text style={styles.forName}>{selCustomer?.name || newCust.name}{isNewCust ? " (new)" : ""}</Text>
            <TouchableOpacity onPress={() => setStep(STEP_CUSTOMER)}>
              <Text style={styles.changeLink}>Change</Text>
            </TouchableOpacity>
          </View>

          {loadingProducts ? (
            <ActivityIndicator color="#1a56db" style={{ marginVertical: 16 }} />
          ) : products.length === 0 ? (
            <View style={styles.noProducts}>
              <Text style={styles.noProductsText}>No savings products configured.</Text>
              <Text style={styles.noProductsHint}>Ask your admin to add products in the system.</Text>
            </View>
          ) : (
            <>
              <Text style={styles.fieldLabel}>Select Product *</Text>
              {products.map(p => {
                const isLoan = ["personal","hire_purchase","micro","mortgage","emergency","group"]
                  .includes((p.category || "").toLowerCase().replace(/ /g, "_"));
                return (
                  <TouchableOpacity key={p.id}
                    style={[styles.productItem, selProduct?.id === p.id && styles.productItemActive]}
                    onPress={() => setSelProduct(p)}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <Text style={[styles.productName, selProduct?.id === p.id && { color:"#1a56db" }]}>{p.name}</Text>
                        <View style={{ backgroundColor: isLoan ? "#faf5ff" : "#f0fdf4", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 }}>
                          <Text style={{ fontSize: 10, fontWeight: "700", color: isLoan ? "#7c3aed" : "#16a34a" }}>
                            {isLoan ? "💳 Loan" : "💰 Savings"}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.productSub}>
                        {(p.category || "").replace(/_/g," ")}
                        {p.interest_rate > 0 ? " · " + p.interest_rate + "% p.a." : ""}
                        {p.min_balance > 0 ? " · Min: GH₵" + Number(p.min_balance).toLocaleString() : ""}
                      </Text>
                      {p.description ? <Text style={styles.productDesc}>{p.description}</Text> : null}
                    </View>
                    {selProduct?.id === p.id && <Text style={{ color:"#1a56db", fontSize:20 }}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Initial Deposit (GH₵)</Text>
          <TextInput
            style={[styles.input, { fontSize:24, fontWeight:"800", textAlign:"center" }]}
            placeholder="0.00" placeholderTextColor="#94a3b8"
            value={initialDeposit} onChangeText={setInitialDeposit}
            keyboardType="decimal-pad"
          />

          <Text style={styles.fieldLabel}>Notes for Supervisor</Text>
          <TextInput
            style={[styles.input, { minHeight:60 }]}
            placeholder="Any additional notes…" placeholderTextColor="#94a3b8"
            value={notes} onChangeText={setNotes} multiline
          />

          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              This request will be sent to your supervisor for approval before the account is opened.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, submitting && { opacity:0.6 }]}
            onPress={submitRequest} disabled={submitting}>
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>Submit for Approval</Text>}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex:1, backgroundColor:"#f8fafc" },
  pageHeader: { flexDirection:"row", alignItems:"center", justifyContent:"space-between", marginBottom:16 },
  pageTitle: { fontSize:20, fontWeight:"800", color:"#0f172a" },
  backBtn: { fontSize:14, color:"#1a56db", fontWeight:"700", marginRight:12 },
  newBtn: { backgroundColor:"#1a56db", paddingHorizontal:14, paddingVertical:8, borderRadius:10 },
  newBtnText: { color:"#fff", fontSize:13, fontWeight:"700" },
  infoBox: { backgroundColor:"#eff6ff", borderRadius:10, padding:12, marginBottom:20 },
  infoText: { fontSize:13, color:"#1e40af", lineHeight:18 },
  sectionTitle: { fontSize:13, fontWeight:"700", color:"#64748b", textTransform:"uppercase", letterSpacing:0.6, marginBottom:12 },
  empty: { alignItems:"center", paddingTop:40 },
  emptyText: { fontSize:15, fontWeight:"700", color:"#475569", marginBottom:4 },
  emptyHint: { fontSize:12, color:"#94a3b8" },
  reqCard: { backgroundColor:"#fff", borderRadius:12, marginBottom:12, borderWidth:1, borderColor:"#e2e8f0", overflow:"hidden" },
  reqHeader: { flexDirection:"row", alignItems:"center", padding:14, borderBottomWidth:1, borderBottomColor:"#f1f5f9", backgroundColor:"#fafafa" },
  reqType: { fontSize:14, fontWeight:"700", color:"#0f172a" },
  reqDetail: { fontSize:12, color:"#64748b", marginTop:2 },
  reqSub: { fontSize:12, color:"#64748b", marginBottom:2 },
  statusBadge: { paddingHorizontal:10, paddingVertical:4, borderRadius:12 },
  statusText: { fontSize:10, fontWeight:"800", letterSpacing:0.5 },
  stepRow: { flexDirection:"row", alignItems:"center", marginBottom:20, paddingHorizontal:8 },
  stepItem: { flexDirection:"row", alignItems:"center" },
  stepCircle: { width:28, height:28, borderRadius:14, borderWidth:2, borderColor:"#e2e8f0", backgroundColor:"#fff", alignItems:"center", justifyContent:"center", marginRight:6 },
  stepCircleActive: { borderColor:"#1a56db", backgroundColor:"#1a56db" },
  stepCircleDone: { borderColor:"#16a34a", backgroundColor:"#16a34a" },
  stepNum: { fontSize:12, fontWeight:"800", color:"#94a3b8" },
  stepLabel: { fontSize:12, color:"#94a3b8", fontWeight:"600" },
  stepLine: { flex:1, height:2, backgroundColor:"#e2e8f0", marginHorizontal:10 },
  card: { backgroundColor:"#fff", borderRadius:12, padding:16, marginBottom:14, borderWidth:1, borderColor:"#e2e8f0", elevation:1 },
  cardLabel: { fontSize:11, fontWeight:"700", color:"#94a3b8", textTransform:"uppercase", letterSpacing:0.8, marginBottom:14 },
  toggleRow: { flexDirection:"row", backgroundColor:"#f1f5f9", borderRadius:10, padding:3, marginBottom:16 },
  toggleTab: { flex:1, paddingVertical:9, alignItems:"center", borderRadius:8 },
  toggleTabActive: { backgroundColor:"#fff", shadowColor:"#000", shadowOpacity:0.08, shadowRadius:4, elevation:2 },
  toggleTabText: { fontSize:13, fontWeight:"600", color:"#64748b" },
  toggleTabTextActive: { color:"#1a56db", fontWeight:"800" },
  fieldLabel: { fontSize:12, fontWeight:"700", color:"#475569", marginBottom:6 },
  input: { backgroundColor:"#f8fafc", borderWidth:1, borderColor:"#e2e8f0", borderRadius:10, padding:12, color:"#0f172a", fontSize:15, marginBottom:12 },
  custItem: { flexDirection:"row", alignItems:"center", padding:10, borderRadius:10, borderWidth:2, borderColor:"#e2e8f0", marginBottom:8 },
  custItemActive: { borderColor:"#1a56db", backgroundColor:"#eff6ff" },
  avatar: { width:36, height:36, borderRadius:18, backgroundColor:"#f1f5f9", alignItems:"center", justifyContent:"center", marginRight:10 },
  avatarText: { fontSize:14, fontWeight:"800", color:"#64748b" },
  custName: { fontSize:14, fontWeight:"700", color:"#0f172a" },
  custSub: { fontSize:12, color:"#64748b", marginTop:1 },
  selBox: { backgroundColor:"#f0fdf4", borderRadius:10, padding:12, borderWidth:1, borderColor:"#86efac", marginBottom:12 },
  selName: { fontSize:14, fontWeight:"700", color:"#16a34a" },
  selSub: { fontSize:12, color:"#64748b", marginTop:2 },
  nextBtn: { backgroundColor:"#1a56db", borderRadius:10, padding:14, alignItems:"center", marginTop:8 },
  nextBtnText: { color:"#fff", fontSize:14, fontWeight:"700" },
  forBox: { flexDirection:"row", alignItems:"center", backgroundColor:"#f8fafc", borderRadius:10, padding:12, marginBottom:16, gap:8 },
  forLabel: { fontSize:12, color:"#64748b", fontWeight:"600" },
  forName: { flex:1, fontSize:13, fontWeight:"700", color:"#0f172a" },
  changeLink: { fontSize:12, color:"#1a56db", fontWeight:"700" },
  productItem: { flexDirection:"row", alignItems:"center", padding:14, borderRadius:10, borderWidth:2, borderColor:"#e2e8f0", marginBottom:8, backgroundColor:"#fff" },
  productItemActive: { borderColor:"#1a56db", backgroundColor:"#eff6ff" },
  productName: { fontSize:14, fontWeight:"700", color:"#0f172a" },
  productSub: { fontSize:12, color:"#64748b", marginTop:2, textTransform:"capitalize" },
  productDesc: { fontSize:11, color:"#94a3b8", marginTop:3 },
  noProducts: { padding:20, alignItems:"center" },
  noProductsText: { fontSize:14, fontWeight:"700", color:"#475569", marginBottom:4 },
  noProductsHint: { fontSize:12, color:"#94a3b8", textAlign:"center" },
  warningBox: { backgroundColor:"#fef9c3", borderRadius:10, padding:12, marginBottom:16, borderWidth:1, borderColor:"#fde68a" },
  warningText: { fontSize:13, color:"#92400e", lineHeight:18 },
  submitBtn: { backgroundColor:"#1a56db", borderRadius:12, padding:16, alignItems:"center", marginBottom:32 },
  submitBtnText: { color:"#fff", fontSize:16, fontWeight:"700" },
});
