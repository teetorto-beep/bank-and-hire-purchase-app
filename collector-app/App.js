import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Animated, Platform,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './src/supabase';
import { C } from './src/theme';

import LoginScreen         from './src/screens/LoginScreen';
import HomeScreen          from './src/screens/HomeScreen';
import CreditScreen        from './src/screens/CreditScreen';
import AccountScreen       from './src/screens/AccountScreen';
import ReportScreen        from './src/screens/ReportScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import ProfileScreen       from './src/screens/ProfileScreen';

// Collector-specific icons — different from customer app
const TABS = [
  { key:'home',    label:'Dashboard', icon:'⊞',  },
  { key:'credit',  label:'Collect',   icon:'⊕',  center:true },
  { key:'account', label:'Accounts',  icon:'⊟',  },
  { key:'report',  label:'Reports',   icon:'≡',  },
  { key:'profile', label:'Profile',   icon:'◉',  },
];

function TabBar({ active, onPress, badge }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[T.bar, { paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 0 : 6) }]}>
      {TABS.map(t => {
        const on = active === t.key;
        const showBadge = t.key === 'home' && badge > 0;

        if (t.center) {
          return (
            <TouchableOpacity key={t.key} style={T.centerTab} onPress={() => onPress(t.key)} activeOpacity={0.85}>
              <View style={[T.centerBtn, on && T.centerBtnOn]}>
                <Text style={[T.centerIcon, on && { color: '#fff' }]}>{t.icon}</Text>
              </View>
              <Text style={[T.label, on && T.labelOn]}>{t.label}</Text>
            </TouchableOpacity>
          );
        }

        return (
          <TouchableOpacity key={t.key} style={T.tab} onPress={() => onPress(t.key)} activeOpacity={0.7}>
            <View style={[T.iconWrap, on && T.iconWrapOn]}>
              <Text style={[T.icon, on && T.iconOn]}>{t.icon}</Text>
              {showBadge && (
                <View style={T.badge}><Text style={T.badgeTxt}>{badge > 9 ? '9+' : badge}</Text></View>
              )}
            </View>
            <Text style={[T.label, on && T.labelOn]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const T = StyleSheet.create({
  bar:         { flexDirection:'row', backgroundColor:C.white, borderTopWidth:1, borderTopColor:C.border, paddingTop:8, paddingHorizontal:8, shadowColor:'#000', shadowOpacity:0.06, shadowRadius:12, elevation:10 },
  tab:         { flex:1, alignItems:'center', paddingBottom:2 },
  iconWrap:    { width:40, height:32, borderRadius:10, alignItems:'center', justifyContent:'center', position:'relative' },
  iconWrapOn:  { backgroundColor:C.blueLt },
  icon:        { fontSize:20, color:C.text4 },
  iconOn:      { color:C.brand },
  label:       { fontSize:10, fontWeight:'600', color:C.text4, marginTop:2 },
  labelOn:     { color:C.brand, fontWeight:'700' },
  badge:       { position:'absolute', top:0, right:0, minWidth:16, height:16, borderRadius:8, backgroundColor:C.red, alignItems:'center', justifyContent:'center', paddingHorizontal:3 },
  badgeTxt:    { color:'#fff', fontSize:8, fontWeight:'900' },
  // Center collect button — elevated
  centerTab:   { flex:1, alignItems:'center', marginTop:-18 },
  centerBtn:   { width:52, height:52, borderRadius:18, backgroundColor:C.surface, alignItems:'center', justifyContent:'center', borderWidth:3, borderColor:C.white, shadowColor:C.brand, shadowOpacity:0.25, shadowRadius:8, elevation:6 },
  centerBtnOn: { backgroundColor:C.brand },
  centerIcon:  { fontSize:24, color:C.text3 },
});

function AppShell({ collector, onLogout }) {
  const [tab,   setTab]   = useState('home');
  const [badge, setBadge] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    supabase.from('notifications').select('id', { count:'exact', head:true })
      .eq('user_id', collector.id).eq('read', false)
      .then(({ count }) => setBadge(count || 0));

    const ch = supabase.channel('nb-' + collector.id)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'notifications' }, p => {
        if (p.new?.user_id === collector.id && !p.new?.read) setBadge(n => n + 1);
      }).subscribe();
    return () => supabase.removeChannel(ch);
  }, [collector.id]);

  const go = key => {
    if (key === tab) return;
    Animated.sequence([
      Animated.timing(fade, { toValue:0, duration:60,  useNativeDriver:true }),
      Animated.timing(fade, { toValue:1, duration:100, useNativeDriver:true }),
    ]).start();
    setTab(key);
  };

  return (
    <SafeAreaView style={A.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.white} />

      {/* Top header */}
      <View style={A.header}>
        <View style={A.logoMark}><Text style={A.logoTxt}>ML</Text></View>
        <View style={{ flex:1 }}>
          <Text style={A.appName}>Majupat Love</Text>
          <Text style={A.appSub}>Collector Portal</Text>
        </View>
        {badge > 0 && tab !== 'home' && (
          <TouchableOpacity style={A.notifBtn} onPress={() => go('home')} activeOpacity={0.8}>
            <Text style={{ fontSize:20 }}>🔔</Text>
            <View style={A.notifBadge}><Text style={A.notifBadgeTxt}>{badge > 9 ? '9+' : badge}</Text></View>
          </TouchableOpacity>
        )}
      </View>

      <Animated.View style={{ flex:1, opacity:fade }}>
        {tab === 'home'    && <HomeScreen    collector={collector} badge={badge} onBadgeClear={() => setBadge(0)} />}
        {tab === 'credit'  && <CreditScreen  collector={collector} />}
        {tab === 'account' && <AccountScreen collector={collector} />}
        {tab === 'report'  && <ReportScreen  collector={collector} />}
        {tab === 'profile' && <ProfileScreen collector={collector} onLogout={onLogout} />}
      </Animated.View>

      <TabBar active={tab} onPress={go} badge={badge} />
    </SafeAreaView>
  );
}

const A = StyleSheet.create({
  root:          { flex:1, backgroundColor:C.bg },
  header:        { flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:10, gap:10, backgroundColor:C.white, borderBottomWidth:1, borderBottomColor:C.borderLt },
  logoMark:      { width:36, height:36, borderRadius:10, backgroundColor:C.brand, alignItems:'center', justifyContent:'center' },
  logoTxt:       { color:'#fff', fontSize:12, fontWeight:'900' },
  appName:       { fontSize:15, fontWeight:'800', color:C.text },
  appSub:        { fontSize:10, color:C.text4, fontWeight:'500' },
  notifBtn:      { width:40, height:40, borderRadius:12, backgroundColor:C.bg, alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:C.border, position:'relative' },
  notifBadge:    { position:'absolute', top:6, right:6, minWidth:14, height:14, borderRadius:7, backgroundColor:C.red, alignItems:'center', justifyContent:'center', paddingHorizontal:2 },
  notifBadgeTxt: { color:'#fff', fontSize:8, fontWeight:'900' },
});

export default function App() {
  const [collector, setCollector] = useState(null);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('collector_session')
      .then(raw => { if (raw) { try { setCollector(JSON.parse(raw)); } catch (_) {} } })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <SafeAreaProvider>
      <View style={{ flex:1, backgroundColor:C.brand, alignItems:'center', justifyContent:'center', gap:16 }}>
        <View style={{ width:80, height:80, borderRadius:22, backgroundColor:'#fff', alignItems:'center', justifyContent:'center', shadowColor:'#000', shadowOpacity:0.2, shadowRadius:20, elevation:12 }}>
          <Text style={{ color:C.brand, fontSize:28, fontWeight:'900' }}>ML</Text>
        </View>
        <Text style={{ color:'rgba(255,255,255,0.7)', fontSize:14, fontWeight:'600' }}>Majupat Love</Text>
        <Text style={{ color:'rgba(255,255,255,0.45)', fontSize:12 }}>Collector Portal</Text>
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
