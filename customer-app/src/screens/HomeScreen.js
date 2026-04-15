import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Dimensions, FlatList,
} from "react-native";
import { supabase } from "../supabase";
import { cacheData, getCached, subscribeToNetwork } from "../offline";

const { width: W } = Dimensions.get("window");
const CARD_W = W - 48;

const GHS = n => `GH₵ ${Number(n || 0).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`;
const fmtDate = d => d ? new Date(d).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" }) : "";
const fmtTime = d => d ? new Date(d).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" }) : "";

const CARD_COLORS = ["#2563eb","#0f766e","#7c3aed","#b45309","#be185d"];
const ACC_ICON = { savings:"💰", current:"🏦", fixed_deposit:"🔒", hire_purchase:"🛍️", joint:"👥" };

function todayBounds() {
  const s = new Date(); s.setHours(0,0,0,0);
  const e = new Date(); e.setHours(23,59,59,999);
  return { start: s.toISOString(), end: e.toISOString() };
}

export default function HomeScreen({ customer, onTabChange, tick }) {
  const [accounts,     setAccounts]     = useState([]);
  const [loans,        setLoans]        = useState([]);
  const [loanPaid,     setLoanPaid]     = useState({});
  const [todayTxns,    setTodayTxns]    = useState([]);
  const [recentTxns,   setRecentTxns]   = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [activeCard,   setActiveCard]   = useState(0);
  const [isOnline,     setIsOnline]     = useState(true);
  const firstLoad = useRef(true);
  const flatRef = useRef(null);

  useEffect(() => {
    const unsub = subscribeToNetwork(setIsOnline);
    return () => unsub();
  }, []);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else if (firstLoad.current) setLoading(true);
    try {
      // Try cache first if offline
      const cacheKey = `home_${customer.id}`;
      if (!refresh && firstLoad.current) {
        const cached = await getCached(cacheKey);
        if (cached) {
          setAccounts(cached.accounts || []);
          setLoans(cached.loans || []);
          setLoanPaid(cached.loanPaid || {});
          setTodayTxns(cached.todayTxns || []);
          setRecentTxns(cached.recentTxns || []);
          setLoading(false); firstLoad.current = false;
          if (!isOnline) { setRefreshing(false); return; }
        }
      }

      const [accsRes, loansRes] = await Promise.all([
        supabase.from("accounts")
          .select("id,account_number,type,balance,status,interest_rate,opened_at")
          .eq("customer_id", customer.id).eq("status","active")
          .order("opened_at", { ascending: true }),
        supabase.from("loans")
          .select("id,type,amount,outstanding,monthly_payment,daily_payment,weekly_payment,status,next_due_date,disbursed_at,interest_rate,tenure,payment_frequency")
          .eq("customer_id", customer.id)
          .in("status", ["active","overdue"]),
      ]);

      const accs = accsRes.data || [];
      const lns  = loansRes.data || [];
      setAccounts(accs);
      setLoans(lns);

      // Loan payments totals
      if (lns.length) {
        const { data: cols } = await supabase.from("collections")
          .select("loan_id,amount").in("loan_id", lns.map(l => l.id));
        const totals = {};
        (cols || []).forEach(c => { totals[c.loan_id] = (totals[c.loan_id] || 0) + Number(c.amount); });
        setLoanPaid(totals);
      }

      if (accs.length) {
        const ids = accs.map(a => a.id);
        const { start, end } = todayBounds();
        const [todayRes, recentRes] = await Promise.all([
          supabase.from("transactions")
            .select("id,account_id,type,amount,narration,created_at,balance_after")
            .in("account_id", ids).gte("created_at", start).lte("created_at", end)
            .order("created_at", { ascending: false }),
          supabase.from("transactions")
            .select("id,account_id,type,amount,narration,created_at")
            .in("account_id", ids).lt("created_at", start)
            .order("created_at", { ascending: false }).limit(5),
        ]);
        setTodayTxns(todayRes.data || []);
        setRecentTxns(recentRes.data || []);
      }

      // Cache for offline use
      await cacheData(`home_${customer.id}`, {
        accounts: accs, loans: lns, loanPaid: {},
        todayTxns: [], recentTxns: [],
      });
    } catch (e) { console.warn(e.message); }
    if (refresh) setRefreshing(false); else { setLoading(false); firstLoad.current = false; }
  }, [customer.id, tick]);

  useEffect(() => { load(); }, [load]);

  const totalBal     = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
  const todayIn      = todayTxns.filter(t => t.type === "credit").reduce((s, t) => s + Number(t.amount), 0);
  const todayOut     = todayTxns.filter(t => t.type === "debit").reduce((s, t) => s + Number(t.amount), 0);

  // Derived stats
  const overdueLoans  = loans.filter(l => l.status === "overdue");
  const nextDue       = loans
    .filter(l => l.next_due_date)
    .sort((a, b) => new Date(a.next_due_date) - new Date(b.next_due_date))[0];
  const greeting      = (() => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; })();

  if (loading) return (
    <View style={S.center}>
      <ActivityIndicator color="#2563eb" size="large" />
      <Text style={S.loadTxt}>Loading dashboard…</Text>
    </View>
  );

  return (
    <ScrollView style={S.root} contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#2563eb" />}
      showsVerticalScrollIndicator={false}>

      {/* ── Offline banner ── */}
      {!isOnline && (
        <View style={S.offlineBanner}>
          <Text style={S.offlineTxt}>📡 Offline — showing cached data</Text>
        </View>
      )}

      {/* ── Hero ── */}
      <View style={S.hero}>
        <Text style={S.heroGreeting}>{greeting}, {customer.name?.split(" ")[0] || "there"} 👋</Text>
        <Text style={S.heroLabel}>Total Balance</Text>
        <Text style={S.heroAmt}>{GHS(totalBal)}</Text>
        <Text style={S.heroSub}>{accounts.length} account{accounts.length !== 1 ? "s" : ""}</Text>
        {(todayIn > 0 || todayOut > 0) && (
          <View style={S.todayRow}>
            {todayIn  > 0 && <View style={S.pillGreen}><Text style={S.pillTxt}>+{GHS(todayIn)} in</Text></View>}
            {todayOut > 0 && <View style={S.pillRed}><Text style={S.pillTxt}>-{GHS(todayOut)} out</Text></View>}
          </View>
        )}
      </View>

      {/* ── Quick stats bar ── */}
      <View style={S.statsBar}>
        {[
          { label: "Accounts",    value: accounts.length,    color: "#2563eb" },
          { label: "Active Loans",value: loans.length,       color: loans.length > 0 ? "#d97706" : "#64748b" },
          { label: "Overdue",     value: overdueLoans.length,color: overdueLoans.length > 0 ? "#dc2626" : "#64748b" },
          { label: "Today In",    value: GHS(todayIn),       color: "#16a34a", small: true },
        ].map(s => (
          <View key={s.label} style={S.statItem}>
            <Text style={[S.statVal, { color: s.color }, s.small && { fontSize: 13 }]}>{s.value}</Text>
            <Text style={S.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* ── Overdue alert ── */}
      {overdueLoans.length > 0 && (
        <View style={S.alertCard}>
          <Text style={S.alertIcon}>⚠️</Text>
          <View style={{ flex: 1 }}>
            <Text style={S.alertTitle}>Overdue Payment{overdueLoans.length > 1 ? "s" : ""}</Text>
            <Text style={S.alertBody}>
              {overdueLoans.length} loan{overdueLoans.length > 1 ? "s are" : " is"} overdue. Contact your branch to avoid penalties.
            </Text>
          </View>
        </View>
      )}

      {/* ── Next payment due ── */}
      {!overdueLoans.length && nextDue && (
        <View style={S.nextDueCard}>
          <Text style={{ fontSize: 20 }}>📅</Text>
          <View style={{ flex: 1 }}>
            <Text style={S.nextDueTitle}>Next Payment Due</Text>
            <Text style={S.nextDueBody}>{fmtDate(nextDue.next_due_date)} · {GHS(nextDue.monthly_payment)}</Text>
          </View>
        </View>
      )}

      {/* ── Account cards ── */}
      {accounts.length > 0 ? (
        <View style={{ marginTop: -10 }}>
          <Row label="My Accounts" action="See all" onAction={() => onTabChange?.("accounts")} />
          <FlatList ref={flatRef} data={accounts} horizontal pagingEnabled
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_W + 16} decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: 16 }}
            keyExtractor={i => i.id}
            onMomentumScrollEnd={e => setActiveCard(Math.round(e.nativeEvent.contentOffset.x / (CARD_W + 16)))}
            renderItem={({ item: acc, index }) => {
              const bg = CARD_COLORS[index % CARD_COLORS.length];
              return (
                <View style={[S.accCard, { backgroundColor: bg, width: CARD_W, marginRight: 16 }]}>
                  <View style={S.accCardTop}>
                    <Text style={S.accCardIcon}>{ACC_ICON[acc.type] || "🏧"}</Text>
                    <View style={S.accCardTypePill}>
                      <Text style={S.accCardTypeTxt}>{(acc.type||"").replace(/_/g," ").toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={S.accCardBal}>{GHS(acc.balance)}</Text>
                  <Text style={S.accCardBalLabel}>Available Balance</Text>
                  <View style={S.accCardDivider} />
                  <View style={S.accCardBottom}>
                    <View>
                      <Text style={S.accCardMetaLabel}>Account No.</Text>
                      <Text style={S.accCardMetaVal}>{acc.account_number}</Text>
                    </View>
                    {acc.opened_at && (
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={S.accCardMetaLabel}>Since</Text>
                        <Text style={S.accCardMetaVal}>{new Date(acc.opened_at).toLocaleDateString("en-GH",{month:"short",year:"numeric"})}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            }}
          />
          {accounts.length > 1 && (
            <View style={S.dots}>
              {accounts.map((_, i) => <View key={i} style={[S.dot, i === activeCard && S.dotActive]} />)}
            </View>
          )}
        </View>
      ) : (
        <View style={S.emptyCard}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>🏦</Text>
          <Text style={S.emptyTitle}>No Active Accounts</Text>
          <Text style={S.emptyHint}>Contact your branch to open an account</Text>
        </View>
      )}

      {/* ── Today's activity ── */}
      {todayTxns.length > 0 && (
        <View style={S.section}>
          <Row label="Today's Activity" badge={`${todayTxns.length} txn${todayTxns.length > 1 ? "s" : ""}`} />
          {todayTxns.map(txn => <TxnRow key={txn.id} txn={txn} showTime />)}
        </View>
      )}

      {/* ── Active loans ── */}
      {loans.length > 0 && (
        <View style={S.section}>
          <Row label="Active Loans" action="View all" onAction={() => onTabChange?.("loans")} />
          {loans.map(loan => {
            const overdue = loan.status === "overdue";
            const paid    = loanPaid[loan.id] || 0;
            const orig    = Number(loan.amount || 0);
            const monthly = Number(loan.monthly_payment || 0);
            const tenure  = Number(loan.tenure || 0);
            const totalRepay = monthly > 0 && tenure > 0 ? monthly * tenure : orig;
            const out     = Number(loan.outstanding || 0);
            // progress based on total repayable, not just principal
            const pct     = totalRepay > 0 ? Math.min(100, ((totalRepay - out) / totalRepay) * 100) : 0;
            return (
              <View key={loan.id} style={[S.loanCard, overdue && S.loanCardOverdue]}>
                <View style={S.loanCardTop}>
                  <View style={[S.loanIcon, { backgroundColor: overdue ? "#fef2f2" : "#fff7ed" }]}>
                    <Text style={{ fontSize: 20 }}>{overdue ? "⚠️" : "📋"}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.loanType}>{(loan.type||"Loan").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}</Text>
                    {loan.next_due_date && (
                      <Text style={[S.loanDue, overdue && { color: "#dc2626" }]}>
                        {overdue ? "⚠️ Overdue · " : "Due: "}{fmtDate(loan.next_due_date)}
                      </Text>
                    )}
                  </View>
                  <View style={[S.loanStatus, overdue && S.loanStatusOverdue]}>
                    <Text style={[S.loanStatusTxt, overdue && { color: "#dc2626" }]}>{overdue ? "OVERDUE" : "ACTIVE"}</Text>
                  </View>
                </View>
                <View style={S.progressTrack}>
                  <View style={[S.progressFill, { width: `${pct}%`, backgroundColor: overdue ? "#ef4444" : "#2563eb" }]} />
                </View>
                <Text style={S.progressPct}>{pct.toFixed(0)}% repaid</Text>
                <View style={S.loanStats}>
                  {[
                    ["Principal", GHS(orig)],
                    ["Outstanding", GHS(out)],
                    ["Total Paid", GHS(Math.max(0, totalRepay - out))],
                    ["Installment", GHS(loan.monthly_payment)],
                  ].map(([l, v]) => (
                    <View key={l} style={S.loanStat}>
                      <Text style={S.loanStatLabel}>{l}</Text>
                      <Text style={[S.loanStatVal, l === "Total Paid" && { color: "#16a34a" }, l === "Outstanding" && { color: overdue ? "#dc2626" : "#c2410c" }]}>{v}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ── Recent transactions ── */}
      <View style={S.section}>
        <Row label="Recent Transactions" action="View all" onAction={() => onTabChange?.("txns")} />
        {recentTxns.length === 0 && todayTxns.length === 0 ? (
          <View style={S.emptyCard}>
            <Text style={{ fontSize: 28, marginBottom: 6 }}>📋</Text>
            <Text style={S.emptyTitle}>No transactions yet</Text>
          </View>
        ) : recentTxns.length === 0 ? (
          <View style={[S.emptyCard, { paddingVertical: 16 }]}>
            <Text style={S.emptyHint}>No earlier transactions</Text>
          </View>
        ) : (
          recentTxns.map(txn => <TxnRow key={txn.id} txn={txn} />)
        )}
      </View>
    </ScrollView>
  );
}

function Row({ label, action, onAction, badge }) {
  return (
    <View style={S.rowHeader}>
      <Text style={S.rowLabel}>{label}</Text>
      {action && <TouchableOpacity onPress={onAction}><Text style={S.rowAction}>{action} →</Text></TouchableOpacity>}
      {badge  && <View style={S.rowBadge}><Text style={S.rowBadgeTxt}>{badge}</Text></View>}
    </View>
  );
}

function TxnRow({ txn, showTime }) {
  const isCredit = txn.type === "credit";
  return (
    <View style={S.txnRow}>
      <View style={[S.txnDot, { backgroundColor: isCredit ? "#dcfce7" : "#fee2e2" }]}>
        <Text style={[S.txnArrow, { color: isCredit ? "#16a34a" : "#dc2626" }]}>{isCredit ? "↑" : "↓"}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={S.txnNarr} numberOfLines={1}>{txn.narration || "Transaction"}</Text>
        <Text style={S.txnDate}>{showTime ? fmtTime(txn.created_at) : fmtDate(txn.created_at)}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={[S.txnAmt, { color: isCredit ? "#16a34a" : "#dc2626" }]}>
          {isCredit ? "+" : "-"}{GHS(txn.amount)}
        </Text>
        {txn.balance_after != null && <Text style={S.txnBal}>Bal: {GHS(txn.balance_after)}</Text>}
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f0f4f8" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  loadTxt: { color: "#64748b", fontSize: 13 },

  hero: { backgroundColor: "#0a0f1e", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 30 },
  heroGreeting: { color: "#64748b", fontSize: 13, fontWeight: "600", marginBottom: 8 },
  heroLabel: { color: "#64748b", fontSize: 12, fontWeight: "600", marginBottom: 4 },
  heroAmt: { color: "#fff", fontSize: 36, fontWeight: "900", letterSpacing: -1, marginBottom: 2 },
  heroSub: { color: "#334155", fontSize: 12, marginBottom: 10 },
  todayRow: { flexDirection: "row", gap: 8 },
  pillGreen: { backgroundColor: "rgba(22,163,74,0.25)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  pillRed:   { backgroundColor: "rgba(220,38,38,0.25)",  paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  pillTxt: { color: "#fff", fontSize: 11, fontWeight: "700" },

  offlineBanner: { backgroundColor: "#fef9c3", paddingVertical: 8, paddingHorizontal: 16, alignItems: "center" },
  offlineTxt: { fontSize: 12, color: "#92400e", fontWeight: "600" },

  statsBar: { flexDirection: "row", backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  statItem: { flex: 1, alignItems: "center", paddingVertical: 12, borderRightWidth: 1, borderRightColor: "#f1f5f9" },
  statVal: { fontSize: 16, fontWeight: "900", marginBottom: 2 },
  statLabel: { fontSize: 10, color: "#94a3b8", fontWeight: "600", textTransform: "uppercase" },

  alertCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#fef2f2", borderLeftWidth: 4, borderLeftColor: "#dc2626", marginHorizontal: 16, marginTop: 14, borderRadius: 12, padding: 14 },
  alertIcon: { fontSize: 20, marginTop: 1 },
  alertTitle: { fontSize: 13, fontWeight: "800", color: "#dc2626", marginBottom: 2 },
  alertBody: { fontSize: 12, color: "#7f1d1d", lineHeight: 17 },

  nextDueCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fffbeb", borderLeftWidth: 4, borderLeftColor: "#d97706", marginHorizontal: 16, marginTop: 14, borderRadius: 12, padding: 14 },
  nextDueTitle: { fontSize: 13, fontWeight: "800", color: "#92400e", marginBottom: 2 },
  nextDueBody: { fontSize: 12, color: "#78350f" },

  rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingHorizontal: 16 },
  rowLabel: { fontSize: 13, fontWeight: "700", color: "#475569", textTransform: "uppercase", letterSpacing: 0.5 },
  rowAction: { fontSize: 12, color: "#2563eb", fontWeight: "700" },
  rowBadge: { backgroundColor: "#dbeafe", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  rowBadgeTxt: { fontSize: 11, color: "#1d4ed8", fontWeight: "700" },

  accCard: { borderRadius: 20, padding: 20, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, elevation: 7 },
  accCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  accCardIcon: { fontSize: 22 },
  accCardTypePill: { backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  accCardTypeTxt: { color: "rgba(255,255,255,0.9)", fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  accCardBal: { color: "#fff", fontSize: 28, fontWeight: "900", letterSpacing: -0.5, marginBottom: 2 },
  accCardBalLabel: { color: "rgba(255,255,255,0.5)", fontSize: 11, marginBottom: 14 },
  accCardDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.15)", marginBottom: 12 },
  accCardBottom: { flexDirection: "row", justifyContent: "space-between" },
  accCardMetaLabel: { color: "rgba(255,255,255,0.5)", fontSize: 10, marginBottom: 2 },
  accCardMetaVal: { color: "#fff", fontSize: 12, fontWeight: "700", fontFamily: "monospace" },

  dots: { flexDirection: "row", justifyContent: "center", gap: 5, marginTop: 12, marginBottom: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#cbd5e1" },
  dotActive: { width: 18, backgroundColor: "#2563eb" },

  section: { marginTop: 20 },

  emptyCard: { marginHorizontal: 16, backgroundColor: "#fff", borderRadius: 14, padding: 28, alignItems: "center", borderWidth: 1, borderColor: "#e8edf2" },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: "#475569", marginBottom: 4 },
  emptyHint: { fontSize: 12, color: "#94a3b8" },

  loanCard: { marginHorizontal: 16, backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: "#fed7aa", shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  loanCardOverdue: { borderColor: "#fecaca" },
  loanCardTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  loanIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  loanType: { fontSize: 14, fontWeight: "800", color: "#0f172a", marginBottom: 2 },
  loanDue: { fontSize: 12, color: "#92400e" },
  loanStatus: { backgroundColor: "#f0fdf4", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  loanStatusOverdue: { backgroundColor: "#fef2f2" },
  loanStatusTxt: { fontSize: 10, fontWeight: "800", color: "#15803d" },
  progressTrack: { height: 5, backgroundColor: "#f1f5f9", borderRadius: 3, overflow: "hidden", marginBottom: 3 },
  progressFill: { height: 5, borderRadius: 3 },
  progressPct: { fontSize: 10, color: "#94a3b8", textAlign: "right", marginBottom: 10 },
  loanStats: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  loanStat: { flex: 1, minWidth: "45%", backgroundColor: "#f8fafc", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: "#f1f5f9" },
  loanStatLabel: { fontSize: 10, color: "#94a3b8", fontWeight: "600", marginBottom: 3 },
  loanStatVal: { fontSize: 13, fontWeight: "800", color: "#0f172a" },

  txnRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 12, padding: 13, marginBottom: 6, marginHorizontal: 16, borderWidth: 1, borderColor: "#f1f5f9" },
  txnDot: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  txnArrow: { fontSize: 17, fontWeight: "800" },
  txnNarr: { fontSize: 13, fontWeight: "600", color: "#0f172a", marginBottom: 1 },
  txnDate: { fontSize: 11, color: "#94a3b8" },
  txnAmt: { fontSize: 14, fontWeight: "800" },
  txnBal: { fontSize: 10, color: "#94a3b8", marginTop: 1 },
});

