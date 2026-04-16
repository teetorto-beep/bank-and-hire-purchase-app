import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Alert, Platform,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./src/supabase";
import { subscribeToNetwork } from "./src/offline";
import {
  checkAndNotifyLoansDue,
  registerPushToken,
  subscribeToNotifications,
} from "./src/notifications";
import LoginScreen    from "./src/screens/LoginScreen";
import HomeScreen     from "./src/screens/HomeScreen";
import AccountsScreen from "./src/screens/AccountsScreen";
import LoanScreen     from "./src/screens/LoanScreen";
import TransactionsScreen  from "./src/screens/TransactionsScreen";
import NotificationsScreen from "./src/screens/NotificationsScreen";
import ProfileScreen  from "./src/screens/ProfileScreen";

// ── Design tokens ─────────────────────────────────────────────────────────────
export const C = {
  navy:    "#0a0f1e",
  navy2:   "#111827",
  brand:   "#2563eb",
  brandDk: "#1d4ed8",
  bg:      "#f0f4f8",
  card:    "#ffffff",
  border:  "#e8edf2",
  text:    "#0f172a",
  text2:   "#475569",
  text3:   "#94a3b8",
  green:   "#16a34a",
  red:     "#dc2626",
  amber:   "#d97706",
};

const TABS = [
  { key: "home",     label: "Home",     emoji: "🏠" },
  { key: "accounts", label: "Accounts", emoji: "💳" },
  { key: "loans",    label: "Loans",    emoji: "📋" },
  { key: "txns",     label: "History",  emoji: "🕐" },
  { key: "notifs",   label: "Alerts",   emoji: "🔔" },
  { key: "profile",  label: "Profile",  emoji: "👤" },
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function MainApp({ customer, onLogout }) {
  const [tab, setTab]           = useState("home");
  const [unread, setUnread]     = useState(0);
  const [accounts, setAccounts] = useState([]);
  const [tick, setTick]         = useState(0);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsub = subscribeToNetwork(setIsOnline);
    return () => unsub();
  }, []);

  // Load account IDs once
  useEffect(() => {
    supabase
      .from("accounts")
      .select("id")
      .eq("customer_id", customer.id)
      .eq("status", "active")
      .then(({ data }) => { if (data) setAccounts(data); });
  }, [customer.id]);

  // 5-second background polling + Supabase Realtime
  useEffect(() => {
    // Poll every 5 seconds
    const interval = setInterval(() => setTick(t => t + 1), 5000);

    const bump = () => setTick(t => t + 1);

    const ch = supabase.channel(`customer-realtime-${customer.id}-${Date.now()}`);
    const accIds = () => accounts.map(a => a.id);

    // New transaction on any of this customer's accounts
    ch.on("postgres_changes", {
      event: "INSERT", schema: "public", table: "transactions",
    }, (payload) => {
      const ids = accIds();
      if (ids.length === 0 || ids.includes(payload.new?.account_id)) {
        bump();
        setUnread(p => p + 1);
      }
    });

    // Account balance updated — filter client-side (avoids REPLICA IDENTITY requirement)
    ch.on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "accounts",
    }, (payload) => {
      if (payload.new?.customer_id === customer.id) bump();
    });

    // Loan updated (outstanding reduced, status changed)
    ch.on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "loans",
    }, (payload) => {
      if (payload.new?.customer_id === customer.id) {
        bump();
        if (payload.new?.status === "overdue") setUnread(p => p + 1);
      }
    });

    // HP agreement updated (payment recorded, completed)
    ch.on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "hp_agreements",
    }, (payload) => {
      if (payload.new?.customer_id === customer.id) bump();
    });

    // New collection payment recorded
    ch.on("postgres_changes", {
      event: "INSERT", schema: "public", table: "collections",
    }, (payload) => {
      if (payload.new?.customer_id === customer.id) { bump(); setUnread(p => p + 1); }
    });

    // New notification
    ch.on("postgres_changes", {
      event: "INSERT", schema: "public", table: "notifications",
    }, (payload) => {
      if (payload.new?.user_id === customer.id) setUnread(p => p + 1);
    });

    ch.subscribe();
    return () => {
      clearInterval(interval);
      supabase.removeChannel(ch);
    };
  }, [customer.id, accounts.map(a => a.id).join(",")]);

  useEffect(() => {
    supabase.from("accounts").select("id").eq("customer_id", customer.id).eq("status", "active")
      .then(({ data }) => { if (data) setAccounts(data); });
  }, [customer.id]);

  // Initial unread count + loan due alerts + realtime subscription
  useEffect(() => {
    // Load unread count
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", customer.id)
      .eq("read", false)
      .then(({ count }) => setUnread(count || 0));

    // Check for loan due alerts (inserts notification rows)
    checkAndNotifyLoansDue(customer.id);

    // Register for OS push notifications
    registerPushToken(customer.id);

    // Subscribe: new notification row → bump unread badge
    const unsub = subscribeToNotifications(customer.id, (n) => {
      setUnread(p => p + 1);
    });

    return () => unsub();
  }, [customer.id]);

  const firstName = customer.name?.split(" ")[0] || "there";

  return (
    <SafeAreaView style={A.root} edges={["top", "bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy} />

      {/* ── Top bar ── */}
      <View style={A.topbar}>
        <View style={A.topLeft}>
          <View style={A.topLogo}><Text style={A.topLogoTxt}>M</Text></View>
          <View>
            <Text style={A.topGreeting}>{getGreeting()}</Text>
            <Text style={A.topName}>{firstName}</Text>
          </View>
        </View>
        <View style={A.topRight}>
          <TouchableOpacity style={A.notifWrap} onPress={() => setTab("notifs")}>
            <Text style={A.notifEmoji}>🔔</Text>
            {unread > 0 && (
              <View style={A.badge}><Text style={A.badgeTxt}>{unread > 9 ? "9+" : unread}</Text></View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={A.logoutWrap} onPress={onLogout}>
            <Text style={A.logoutTxt}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Offline banner */}
      {!isOnline && (
        <View style={{ backgroundColor: '#fef2f2', paddingHorizontal: 16, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#fecaca' }}>
          <Text style={{ color: '#dc2626', fontSize: 11, fontWeight: '700', textAlign: 'center' }}>
            📵 You are offline — showing cached data
          </Text>
        </View>
      )}

      {/* ── Content ── */}
      <View style={A.content}>
        {tab === "home"     && <HomeScreen     customer={customer} onTabChange={setTab} tick={tick} />}
        {tab === "accounts" && <AccountsScreen customer={customer} tick={tick} />}
        {tab === "loans"    && <LoanScreen     customer={customer} tick={tick} />}
        {tab === "txns"     && <TransactionsScreen customer={customer} tick={tick} />}
        {tab === "notifs"   && <NotificationsScreen customer={customer} onRead={() => setUnread(0)} tick={tick} />}
        {tab === "profile"  && <ProfileScreen  customer={customer} onLogout={onLogout} />}
      </View>

      {/* ── Tab bar ── */}
      <View style={A.tabbar}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <TouchableOpacity key={t.key} style={A.tabItem} onPress={() => setTab(t.key)} activeOpacity={0.7}>
              <View style={[A.tabPill, active && A.tabPillActive]}>
                <Text style={A.tabEmoji}>{t.emoji}</Text>
                {t.key === "notifs" && unread > 0 && (
                  <View style={A.tabBadge}><Text style={A.tabBadgeTxt}>{unread > 9 ? "9+" : unread}</Text></View>
                )}
              </View>
              <Text style={[A.tabLabel, active && A.tabLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  const [customer, setCustomer] = useState(null);
  const [ready, setReady]       = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("customer_session")
      .then(raw => { if (raw) { try { setCustomer(JSON.parse(raw)); } catch (_) {} } })
      .finally(() => setReady(true));
  }, []);

  const handleLogin = async data => {
    await AsyncStorage.setItem("customer_session", JSON.stringify(data));
    setCustomer(data);
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: async () => {
        await AsyncStorage.removeItem("customer_session");
        setCustomer(null);
      }},
    ]);
  };

  if (!ready) return (
    <SafeAreaProvider>
      <View style={A.splash}>
        <View style={A.splashLogoWrap}><Text style={A.splashLogoTxt}>M</Text></View>
        <Text style={A.splashName}>Majupat Love Enterprise</Text>
        <Text style={A.splashSub}>Customer Portal</Text>
        <Text style={A.splashPow}>Powered by Maxbraynn Technology</Text>
      </View>
    </SafeAreaProvider>
  );

  if (!customer) return <SafeAreaProvider><LoginScreen onLogin={handleLogin} /></SafeAreaProvider>;
  return <SafeAreaProvider><MainApp customer={customer} onLogout={handleLogout} /></SafeAreaProvider>;
}

const A = StyleSheet.create({
  splash: { flex: 1, backgroundColor: C.navy, alignItems: "center", justifyContent: "center" },
  splashLogoWrap: { width: 88, height: 88, borderRadius: 24, backgroundColor: C.brand, alignItems: "center", justifyContent: "center", marginBottom: 20, elevation: 12 },
  splashLogoTxt: { color: "#fff", fontSize: 44, fontWeight: "900" },
  splashName: { color: "#fff", fontSize: 22, fontWeight: "800", marginBottom: 6 },
  splashSub: { color: C.brand, fontSize: 14, fontWeight: "700", marginBottom: 10 },
  splashPow: { color: "#334155", fontSize: 11 },

  root: { flex: 1, backgroundColor: C.bg },

  topbar: { backgroundColor: C.navy, paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  topLogo: { width: 38, height: 38, borderRadius: 11, backgroundColor: C.brand, alignItems: "center", justifyContent: "center" },
  topLogoTxt: { color: "#fff", fontSize: 20, fontWeight: "900" },
  topGreeting: { color: C.text3, fontSize: 11 },
  topName: { color: "#fff", fontSize: 15, fontWeight: "800" },
  topRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  notifWrap: { position: "relative", padding: 4 },
  notifEmoji: { fontSize: 20 },
  badge: { position: "absolute", top: 0, right: 0, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: C.red, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  badgeTxt: { color: "#fff", fontSize: 9, fontWeight: "800" },
  logoutWrap: { backgroundColor: "#1e293b", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  logoutTxt: { color: C.text3, fontSize: 11, fontWeight: "600" },

  content: { flex: 1 },

  tabbar: { flexDirection: "row", backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border, paddingBottom: Platform.OS === "ios" ? 0 : 4, paddingTop: 6 },
  tabItem: { flex: 1, alignItems: "center" },
  tabPill: { width: 44, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", position: "relative" },
  tabPillActive: { backgroundColor: "#dbeafe" },
  tabEmoji: { fontSize: 17 },
  tabBadge: { position: "absolute", top: -2, right: -2, minWidth: 14, height: 14, borderRadius: 7, backgroundColor: C.red, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
  tabBadgeTxt: { color: "#fff", fontSize: 8, fontWeight: "800" },
  tabLabel: { fontSize: 10, fontWeight: "600", color: C.text3, marginTop: 2 },
  tabLabelActive: { color: C.brand, fontWeight: "700" },
});
