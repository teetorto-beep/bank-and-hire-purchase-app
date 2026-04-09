import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal,
} from "react-native";
import { supabase } from "../supabase";

// ─── helpers ──────────────────────────────────────────────────────────────────
const GHS = n =>
  "GH\u20B5 " + Number(n || 0).toLocaleString("en-GH", { minimumFractionDigits: 2 });

const fmtD = (d, opts) =>
  d ? new Date(d).toLocaleDateString("en-GH", opts || { day: "numeric", month: "short", year: "numeric" }) : "—";

const r2 = n => Math.round(n * 100) / 100;

// ─── amortisation ─────────────────────────────────────────────────────────────
// The schema has: amount (principal), outstanding, interest_rate (annual %),
// tenure (months), monthly_payment.
// We compute the FULL loan totals from the original principal, not just outstanding.
function calcLoan(loan) {
  const principal   = Number(loan.amount       || 0);
  const rate        = Number(loan.interest_rate || 0);   // annual %
  const tenure      = Number(loan.tenure        || 0);   // months
  const monthlyPmt  = Number(loan.monthly_payment || 0);
  const outstanding = Number(loan.outstanding   || 0);

  // Monthly periodic rate
  const mr = rate / 100 / 12;

  // Compute installment: use stored monthly_payment if available, else annuity formula
  let installment = monthlyPmt;
  if (!installment && principal > 0 && tenure > 0) {
    if (mr > 0) {
      installment = r2(principal * mr / (1 - Math.pow(1 + mr, -tenure)));
    } else {
      installment = r2(principal / tenure);
    }
  }

  // Total repayable = installment × tenure  (or principal if no tenure)
  const totalRepayable = tenure > 0 ? r2(installment * tenure) : principal;
  const totalInterest  = r2(Math.max(0, totalRepayable - principal));
  const totalPaid      = r2(Math.max(0, principal - outstanding));

  // Build next-10 schedule from current outstanding balance
  const rows = [];
  let bal  = outstanding;
  let date = loan.next_due_date ? new Date(loan.next_due_date) : new Date();

  for (let i = 0; i < 10; i++) {
    if (bal <= 0.005) break;
    const interest  = r2(bal * mr);
    const principal_ = r2(Math.min(installment - interest, bal));
    const payment   = r2(principal_ + interest);
    bal = r2(Math.max(0, bal - principal_));
    rows.push({
      index: i + 1,
      date: new Date(date),
      principal: principal_,
      interest,
      payment,
      remaining: bal,
    });
    const d = new Date(date);
    d.setMonth(d.getMonth() + 1);
    date = d;
  }

  return { installment, totalRepayable, totalInterest, totalPaid, rows };
}

// ─── colours ──────────────────────────────────────────────────────────────────
const STATUS_STYLE = {
  active:    { border: "#bfdbfe", bg: "#eff6ff", badge: "#dbeafe", badgeTxt: "#1d4ed8" },
  overdue:   { border: "#fecaca", bg: "#fef2f2", badge: "#fee2e2", badgeTxt: "#dc2626" },
  completed: { border: "#bbf7d0", bg: "#f0fdf4", badge: "#dcfce7", badgeTxt: "#15803d" },
  pending:   { border: "#e2e8f0", bg: "#f8fafc", badge: "#f1f5f9", badgeTxt: "#64748b" },
};

const loanTypeName = t =>
  (t || "Loan").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

// ─── main screen ──────────────────────────────────────────────────────────────
export default function LoanScreen({ customer, tick }) {
  const [loans,      setLoans]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected,   setSelected]   = useState(null);
  const firstLoad = useRef(true);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else if (firstLoad.current) setLoading(true);
    const { data, error } = await supabase
      .from("loans")
      .select(
        "id, type, amount, outstanding, monthly_payment, status, " +
        "next_due_date, disbursed_at, interest_rate, tenure, " +
        "purpose, last_payment_date"
      )
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });

    if (error) console.warn("LoanScreen:", error.message);
    setLoans(data || []);
    if (refresh) setRefreshing(false); else { setLoading(false); firstLoad.current = false; }
  }, [customer.id, tick]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <View style={S.center}>
      <ActivityIndicator color="#2563eb" size="large" />
      <Text style={S.loadTxt}>Loading loans…</Text>
    </View>
  );

  const active    = loans.filter(l => ["active", "overdue"].includes(l.status));
  const others    = loans.filter(l => !["active", "overdue"].includes(l.status));

  return (
    <>
      <ScrollView
        style={S.root}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#2563eb" />}
        showsVerticalScrollIndicator={false}
      >
        {loans.length === 0 ? (
          <View style={S.empty}>
            <Text style={{ fontSize: 48, marginBottom: 14 }}>📋</Text>
            <Text style={S.emptyTitle}>No Loans</Text>
            <Text style={S.emptyHint}>You have no loan records on this account</Text>
          </View>
        ) : (
          <>
            {active.length > 0 && (
              <>
                <Text style={S.sectionLabel}>Active Loans</Text>
                {active.map(l => (
                  <LoanCard key={l.id} loan={l} onPress={() => setSelected(l)} />
                ))}
              </>
            )}
            {others.length > 0 && (
              <>
                <Text style={[S.sectionLabel, { marginTop: 20 }]}>Other Loans</Text>
                {others.map(l => (
                  <LoanCard key={l.id} loan={l} onPress={() => setSelected(l)} />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      <Modal
        visible={!!selected}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelected(null)}
      >
        {selected && (
          <LoanDetail loan={selected} onClose={() => setSelected(null)} />
        )}
      </Modal>
    </>
  );
}

// ─── loan card ────────────────────────────────────────────────────────────────
function LoanCard({ loan, onPress }) {
  const st  = STATUS_STYLE[loan.status] || STATUS_STYLE.pending;
  const { installment, totalRepayable, totalInterest, totalPaid } = calcLoan(loan);
  const principal   = Number(loan.amount || 0);
  const outstanding = Number(loan.outstanding || 0);
  const pct = principal > 0 ? Math.min(100, (totalPaid / principal) * 100) : 0;

  return (
    <TouchableOpacity
      style={[S.card, { borderColor: st.border, backgroundColor: "#fff" }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* header row */}
      <View style={S.cardHead}>
        <View style={[S.cardIconBox, { backgroundColor: st.bg }]}>
          <Text style={{ fontSize: 22 }}>
            {loan.status === "completed" ? "✅" : loan.status === "overdue" ? "⚠️" : "📋"}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={S.cardType}>{loanTypeName(loan.type)}</Text>
          {loan.next_due_date && loan.status !== "completed" && (
            <Text style={[S.cardDue, loan.status === "overdue" && { color: "#dc2626" }]}>
              {loan.status === "overdue" ? "⚠️ Overdue · " : "Due: "}
              {fmtD(loan.next_due_date, { day: "numeric", month: "short" })}
            </Text>
          )}
        </View>
        <View style={[S.statusPill, { backgroundColor: st.badge }]}>
          <Text style={[S.statusPillTxt, { color: st.badgeTxt }]}>
            {(loan.status || "").toUpperCase()}
          </Text>
        </View>
      </View>

      {/* progress */}
      <View style={S.progTrack}>
        <View style={[S.progFill, {
          width: pct + "%",
          backgroundColor: loan.status === "completed" ? "#16a34a"
            : loan.status === "overdue" ? "#ef4444" : "#2563eb",
        }]} />
      </View>
      <Text style={S.progPct}>{pct.toFixed(0)}% repaid</Text>

      {/* amounts — the key section */}
      <View style={S.amtGrid}>
        <AmtBox label="Principal"      value={GHS(principal)}      color="#0f172a" />
        <AmtBox label="Interest"       value={GHS(totalInterest)}  color="#b45309" />
        <AmtBox label="Total Repayable" value={GHS(totalRepayable)} color="#2563eb" bold />
        <AmtBox label="Outstanding"    value={GHS(outstanding)}    color={loan.status === "overdue" ? "#dc2626" : "#c2410c"} />
        <AmtBox label="Total Paid"     value={GHS(totalPaid)}      color="#16a34a" />
        <AmtBox label="Installment"    value={GHS(installment)}    color="#0f172a" />
      </View>

      <Text style={S.tapHint}>Tap to view payment schedule →</Text>
    </TouchableOpacity>
  );
}

function AmtBox({ label, value, color, bold }) {
  return (
    <View style={S.amtBox}>
      <Text style={S.amtLabel}>{label}</Text>
      <Text style={[S.amtVal, { color }, bold && { fontSize: 14 }]}>{value}</Text>
    </View>
  );
}

// ─── loan detail modal ────────────────────────────────────────────────────────
function LoanDetail({ loan, onClose }) {
  const [payments,    setPayments]    = useState([]);
  const [loadingPay,  setLoadingPay]  = useState(true);
  const [tab,         setTab]         = useState("schedule");

  const { installment, totalRepayable, totalInterest, totalPaid, rows } = calcLoan(loan);
  const principal   = Number(loan.amount || 0);
  const outstanding = Number(loan.outstanding || 0);
  const pct = principal > 0 ? Math.min(100, (totalPaid / principal) * 100) : 0;
  const st  = STATUS_STYLE[loan.status] || STATUS_STYLE.pending;

  const headerBg = loan.status === "overdue" ? "#7f1d1d"
    : loan.status === "completed" ? "#14532d" : "#0a0f1e";

  useEffect(() => {
    supabase
      .from("collections")
      .select("id, amount, created_at, notes, collector_name")
      .eq("loan_id", loan.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => { setPayments(data || []); setLoadingPay(false); });
  }, [loan.id]);

  return (
    <View style={D.root}>
      {/* ── header ── */}
      <View style={[D.header, { backgroundColor: headerBg }]}>
        <TouchableOpacity onPress={onClose} style={D.closeBtn}>
          <Text style={D.closeTxt}>✕  Close</Text>
        </TouchableOpacity>
        <Text style={D.emoji}>
          {loan.status === "completed" ? "✅" : loan.status === "overdue" ? "⚠️" : "📋"}
        </Text>
        <Text style={D.headerType}>{loanTypeName(loan.type)}</Text>
        <Text style={D.headerBal}>{GHS(outstanding)}</Text>
        <Text style={D.headerBalLabel}>Outstanding Balance</Text>
        <View style={D.progTrack}>
          <View style={[D.progFill, { width: pct + "%" }]} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
          <Text style={D.progLabel}>{GHS(totalPaid)} paid</Text>
          <Text style={D.progLabel}>{pct.toFixed(0)}% complete</Text>
        </View>
      </View>

      {/* ── summary cards ── */}
      <View style={D.summaryRow}>
        {[
          ["Principal",       GHS(principal),      "#0f172a"],
          ["Interest",        GHS(totalInterest),  "#b45309"],
          ["Total Repayable", GHS(totalRepayable), "#2563eb"],
          ["Total Paid",      GHS(totalPaid),      "#16a34a"],
        ].map(([l, v, c]) => (
          <View key={l} style={D.summaryBox}>
            <Text style={D.summaryLabel}>{l}</Text>
            <Text style={[D.summaryVal, { color: c }]}>{v}</Text>
          </View>
        ))}
      </View>

      {/* ── tabs ── */}
      <View style={D.tabs}>
        {[["schedule", "Schedule"], ["history", "Payments"], ["details", "Details"]].map(([k, lbl]) => (
          <TouchableOpacity key={k} style={[D.tab, tab === k && D.tabActive]} onPress={() => setTab(k)}>
            <Text style={[D.tabTxt, tab === k && D.tabTxtActive]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* ── schedule ── */}
        {tab === "schedule" && (
          <>
            <View style={D.infoBox}>
              <Text style={D.infoTxt}>
                {GHS(installment)} / month · {loan.interest_rate}% p.a.
                {loan.next_due_date ? "  ·  Next due " + fmtD(loan.next_due_date, { day: "numeric", month: "short" }) : ""}
              </Text>
            </View>

            {rows.length === 0 ? (
              <View style={D.empty}>
                <Text style={D.emptyTxt}>Loan fully repaid</Text>
              </View>
            ) : rows.map((row, i) => {
              const isToday = row.date.toDateString() === new Date().toDateString();
              return (
                <View key={i} style={[D.schedRow, isToday && D.schedRowToday]}>
                  <View style={[D.schedNum, isToday && { backgroundColor: "#2563eb" }]}>
                    <Text style={[D.schedNumTxt, isToday && { color: "#fff" }]}>{row.index}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[D.schedDate, isToday && { color: "#2563eb", fontWeight: "800" }]}>
                      {isToday ? "Today" : fmtD(row.date, { weekday: "short", day: "numeric", month: "short" })}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 10, marginTop: 2 }}>
                      <Text style={D.schedPrincipal}>Principal: {GHS(row.principal)}</Text>
                      {row.interest > 0 && (
                        <Text style={D.schedInterest}>Interest: {GHS(row.interest)}</Text>
                      )}
                    </View>
                    <Text style={D.schedBal}>Balance after: {GHS(row.remaining)}</Text>
                  </View>
                  <Text style={D.schedAmt}>{GHS(row.payment)}</Text>
                </View>
              );
            })}
          </>
        )}

        {/* ── payment history ── */}
        {tab === "history" && (
          <>
            <Text style={D.sectionTitle}>Payment History ({payments.length})</Text>
            {loadingPay ? (
              <ActivityIndicator color="#2563eb" style={{ marginTop: 24 }} />
            ) : payments.length === 0 ? (
              <View style={D.empty}>
                <Text style={{ fontSize: 32, marginBottom: 10 }}>💳</Text>
                <Text style={D.emptyTxt}>No payments recorded yet</Text>
              </View>
            ) : payments.map(p => (
              <View key={p.id} style={D.payRow}>
                <View style={D.payIcon}><Text style={{ fontSize: 18 }}>💳</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={D.payNarr}>{p.notes || "Loan Repayment"}</Text>
                  <Text style={D.payMeta}>
                    {p.collector_name ? "via " + p.collector_name + "  ·  " : ""}
                    {fmtD(p.created_at)}
                  </Text>
                </View>
                <Text style={D.payAmt}>+{GHS(p.amount)}</Text>
              </View>
            ))}
          </>
        )}

        {/* ── details ── */}
        {tab === "details" && (
          <>
            <Text style={D.sectionTitle}>Loan Details</Text>
            <View style={D.detailCard}>
              {[
                ["Type",           loanTypeName(loan.type)],
                ["Principal",      GHS(principal)],
                ["Interest Rate",  loan.interest_rate + "% p.a."],
                ["Total Interest", GHS(totalInterest)],
                ["Total Repayable",GHS(totalRepayable)],
                ["Tenure",         loan.tenure ? loan.tenure + " months" : "—"],
                ["Installment",    GHS(installment)],
                ["Disbursed",      fmtD(loan.disbursed_at)],
                ["Next Due",       fmtD(loan.next_due_date)],
                ["Last Payment",   fmtD(loan.last_payment_date)],
                ["Purpose",        loan.purpose || "—"],
                ["Status",         (loan.status || "").toUpperCase()],
              ].map(([l, v]) => (
                <View key={l} style={D.detailRow}>
                  <Text style={D.detailLabel}>{l}</Text>
                  <Text style={D.detailVal}>{v}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f0f4f8" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadTxt: { color: "#64748b", fontSize: 13 },
  sectionLabel: { fontSize: 11, fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 10 },
  empty: { alignItems: "center", paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: "#475569", marginBottom: 6 },
  emptyHint: { fontSize: 13, color: "#94a3b8", textAlign: "center" },

  card: { borderRadius: 16, borderWidth: 1.5, padding: 16, marginBottom: 14, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 },
  cardIconBox: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardType: { fontSize: 16, fontWeight: "800", color: "#0f172a", marginBottom: 3 },
  cardDue: { fontSize: 12, color: "#92400e" },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusPillTxt: { fontSize: 10, fontWeight: "800" },
  progTrack: { height: 6, backgroundColor: "#f1f5f9", borderRadius: 3, overflow: "hidden", marginBottom: 4 },
  progFill: { height: 6, borderRadius: 3 },
  progPct: { fontSize: 11, color: "#94a3b8", textAlign: "right", marginBottom: 12 },
  amtGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  amtBox: { flex: 1, minWidth: "30%", backgroundColor: "#f8fafc", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#f1f5f9" },
  amtLabel: { fontSize: 10, color: "#94a3b8", fontWeight: "600", marginBottom: 4 },
  amtVal: { fontSize: 13, fontWeight: "800" },
  tapHint: { fontSize: 11, color: "#94a3b8", textAlign: "right" },
});

const D = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f0f4f8" },
  header: { paddingTop: 20, paddingBottom: 24, paddingHorizontal: 20, alignItems: "center" },
  closeBtn: { alignSelf: "flex-start", marginBottom: 14, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  closeTxt: { color: "#fff", fontSize: 13, fontWeight: "700" },
  emoji: { fontSize: 32, marginBottom: 8 },
  headerType: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  headerBal: { color: "#fff", fontSize: 34, fontWeight: "900", letterSpacing: -0.5 },
  headerBalLabel: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 4, marginBottom: 16 },
  progTrack: { width: "100%", height: 6, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 3, overflow: "hidden" },
  progFill: { height: 6, backgroundColor: "#22c55e", borderRadius: 3 },
  progLabel: { color: "rgba(255,255,255,0.6)", fontSize: 11 },

  summaryRow: { flexDirection: "row", flexWrap: "wrap", backgroundColor: "#fff", marginHorizontal: 16, borderRadius: 14, marginTop: -16, marginBottom: 12, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  summaryBox: { width: "50%", padding: 14, borderBottomWidth: 1, borderRightWidth: 1, borderColor: "#f1f5f9" },
  summaryLabel: { fontSize: 10, color: "#94a3b8", marginBottom: 4 },
  summaryVal: { fontSize: 14, fontWeight: "800" },

  tabs: { flexDirection: "row", backgroundColor: "#fff", marginHorizontal: 16, borderRadius: 12, padding: 4, marginBottom: 6, borderWidth: 1, borderColor: "#f1f5f9" },
  tab: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: 10 },
  tabActive: { backgroundColor: "#2563eb" },
  tabTxt: { fontSize: 13, fontWeight: "600", color: "#64748b" },
  tabTxtActive: { color: "#fff", fontWeight: "700" },

  infoBox: { backgroundColor: "#eff6ff", borderRadius: 10, padding: 12, marginBottom: 14 },
  infoTxt: { fontSize: 12, color: "#1e40af", lineHeight: 18 },

  schedRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: "#f1f5f9" },
  schedRowToday: { borderColor: "#2563eb", backgroundColor: "#eff6ff" },
  schedNum: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" },
  schedNumTxt: { fontSize: 13, fontWeight: "800", color: "#475569" },
  schedDate: { fontSize: 13, fontWeight: "600", color: "#0f172a", marginBottom: 2 },
  schedPrincipal: { fontSize: 11, color: "#2563eb", fontWeight: "600" },
  schedInterest: { fontSize: 11, color: "#b45309", fontWeight: "600" },
  schedBal: { fontSize: 11, color: "#94a3b8", marginTop: 2 },
  schedAmt: { fontSize: 16, fontWeight: "900", color: "#0f172a" },

  sectionTitle: { fontSize: 11, fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 12 },
  payRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: "#f1f5f9" },
  payIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: "#f0fdf4", alignItems: "center", justifyContent: "center" },
  payNarr: { fontSize: 13, fontWeight: "600", color: "#0f172a", marginBottom: 2 },
  payMeta: { fontSize: 11, color: "#94a3b8" },
  payAmt: { fontSize: 15, fontWeight: "800", color: "#16a34a" },

  detailCard: { backgroundColor: "#fff", borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#f1f5f9" },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: "#f8fafc" },
  detailLabel: { fontSize: 13, color: "#64748b" },
  detailVal: { fontSize: 13, fontWeight: "700", color: "#0f172a", textAlign: "right", flex: 1, marginLeft: 12 },

  empty: { alignItems: "center", paddingTop: 40 },
  emptyTxt: { fontSize: 14, fontWeight: "700", color: "#475569" },
});

