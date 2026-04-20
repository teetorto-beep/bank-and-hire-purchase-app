import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Animated } from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./src/supabase";

import LoginScreen         from "./src/screens/LoginScreen";
import HomeScreen          from "./src/screens/HomeScreen";
import CreditScreen        from "./src/screens/CreditScreen";
import AccountScreen       from "./src/screens/AccountScreen";
import ReportScreen        from "./src/screens/ReportScreen";
import NotificationsScreen from "./src/screens/NotificationsScreen";
import ProfileScreen       from "./src/screens/ProfileScreen";

const BRAND = "#2563EB";
const DARK  = "#0F172A";
const WHITE = "#FFFFFF";
const GRAY  = "#94A3B8";
const RED   = "#DC2626";
const BG    = "#F8FAFC";
const BORD  = "#E2E8F0";

const TABS = [
  { key:"home",    label:"Home",    icon:"⊞"  },
  { key:"credit",  label:"Collect", icon:"⊕"  },
  { key:"account", label:"Accounts",icon:"≡"  },
  { key:"report",  label:"Reports", icon:"⊟"  },
  { key:"notif",   label:"Alerts",  icon:"◎"  },
  { key:"profile", label:"Profile", icon:"◉"  },
];

function TabBar({ active, onPress, badge }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[T.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map(tab => {
        const on = active === tab.key;
        const showBadge = tab.key === "notif" && badge > 0;
        return (
          <TouchableOpacity key={tab.key} style={T.tab} onPress={() => onPress(tab.key)} activeOpacity={0.6}>
            <View style={[T.dot, on && T.dotOn]} />
            <Text style={[T.label, on && T.labelOn]}>{tab.label}</Text>
            {showBadge && <View style={T.badge}><Text style={T.badgeTxt}>{badge > 9 ? "9+" : badge}</Text></View>}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const T = StyleSheet.create({
  bar:      { flexDirection:"row", backgroundColor:WHITE, borderTopWidth:1, borderTopColor:BORD, paddingTop:10, paddingHorizontal:4 },
  tab:      { flex:1, alignItems:"center", gap:5, position:"relative" },
  dot:      { width:4, height:4, borderRadius:2, backgroundColor:"transparent" },
  dotOn:    { backgroundColor:BRAND },
  label:    { fontSize:10, color:GRAY, fontWeight:"500" },
  labelOn:  { color:BRAND, fontWeight:"700" },
  badge:    { position:"absolute", top:-2, right:6, backgroundColor:RED, minWidth:15, height:15, borderRadius:8, alignItems:"center", justifyContent:"center", paddingHorizontal:3 },
  badgeTxt: { color:WHITE, fontSize:8, fontWeight:"800" },
});

function AppShell({ collector, onLogout }) {
  const [tab,   setTab]   = useState("home");
  const [badge, setBadge] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    supabase.from("notifications").select("id").eq("user_id", collector.id).eq("read", false)
      .then(({ data }) => setBadge(data?.length || 0));
    const ch = supabase.channel("nb-" + collector.id)
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"notifications" }, p => {
        if (p.new?.user_id === collector.id && !p.new?.read) setBadge(n => n + 1);
      }).subscribe();
    return () => supabase.removeChannel(ch);
  }, [collector.id]);

  const go = (key) => {
    if (key === tab) return;
    if (key === "notif") setBadge(0);
    Animated.sequence([
      Animated.timing(fade, { toValue:0, duration:60,  useNativeDriver:true }),
      Animated.timing(fade, { toValue:1, duration:100, useNativeDriver:true }),
    ]).start();
    setTab(key);
  };

  return (
    <View style={{ flex:1, backgroundColor:BG }}>
      <StatusBar barStyle="light-content" backgroundColor={DARK} />
      {tab !== "profile" && (
        <SafeAreaView edges={["top"]} style={{ backgroundColor:DARK }}>
          <View style={H.bar}>
            <View style={H.logo}><Text style={H.logoTxt}>ML</Text></View>
            <Text style={H.name}>Majupat Love</Text>
            {badge > 0 && tab !== "notif" && (
              <TouchableOpacity style={H.bell} onPress={() => go("notif")}>
                <Text style={{ fontSize:18 }}>🔔</Text>
                <View style={H.bellBadge}><Text style={H.bellBadgeTxt}>{badge > 9 ? "9+" : badge}</Text></View>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      )}
      <Animated.View style={{ flex:1, opacity:fade }}>
        {tab === "home"    && <HomeScreen    collector={collector} />}
        {tab === "credit"  && <CreditScreen  collector={collector} />}
        {tab === "account" && <AccountScreen collector={collector} />}
        {tab === "report"  && <ReportScreen  collector={collector} />}
        {tab === "notif"   && <NotificationsScreen collector={collector} onRead={() => setBadge(0)} />}
        {tab === "profile" && <ProfileScreen collector={collector} onLogout={onLogout} />}
      </Animated.View>
      <TabBar active={tab} onPress={go} badge={badge} />
    </View>
  );
}

const H = StyleSheet.create({
  bar:          { flexDirection:"row", alignItems:"center", paddingHorizontal:16, paddingVertical:12, gap:10 },
  logo:         { width:32, height:32, borderRadius:8, backgroundColor:BRAND, alignItems:"center", justifyContent:"center" },
  logoTxt:      { color:WHITE, fontSize:11, fontWeight:"900" },
  name:         { flex:1, fontSize:15, fontWeight:"700", color:WHITE },
  bell:         { width:36, height:36, borderRadius:10, backgroundColor:"rgba(255,255,255,0.08)", alignItems:"center", justifyContent:"center" },
  bellBadge:    { position:"absolute", top:3, right:3, backgroundColor:RED, minWidth:13, height:13, borderRadius:7, alignItems:"center", justifyContent:"center", paddingHorizontal:2 },
  bellBadgeTxt: { color:WHITE, fontSize:8, fontWeight:"800" },
});

export default function App() {
  const [collector, setCollector] = useState(null);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    AsyncStorage.getItem("collector_session").then(raw => {
      if (raw) { try { setCollector(JSON.parse(raw)); } catch (_) {} }
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <SafeAreaProvider>
      <View style={{ flex:1, backgroundColor:DARK, alignItems:"center", justifyContent:"center" }}>
        <View style={{ width:64, height:64, borderRadius:16, backgroundColor:BRAND, alignItems:"center", justifyContent:"center" }}>
          <Text style={{ color:WHITE, fontSize:22, fontWeight:"900" }}>ML</Text>
        </View>
      </View>
    </SafeAreaProvider>
  );

  return (
    <SafeAreaProvider>
      {collector
        ? <AppShell collector={collector} onLogout={() => setCollector(null)} />
        : <LoginScreen onLogin={d => setCollector(d)} />}
    </SafeAreaProvider>
  );
}
