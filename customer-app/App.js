import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Alert, Platform, Animated,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './src/supabase';
import { subscribeToNetwork } from './src/offline';
import { checkAndNotifyLoansDue, registerPushToken, subscribeToNotifications } from './src/notifications';
import { C } from './src/theme';
import LoginScreen         from './src/screens/LoginScreen';
import HomeScreen          from './src/screens/HomeScreen';
import AccountsScreen      from './src/screens/AccountsScreen';
import LoanScreen          from './src/screens/LoanScreen';
import TransactionsScreen  from './src/screens/TransactionsScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import ProfileScreen       from './src/screens/ProfileScreen';

const TABS = [
  { key: 'home',     label: 'Home',     icon: '⊞', activeIcon: '⊟' },
  { key: 'accounts', label: 'Accounts', icon: '◈', activeIcon: '◈' },
  { key: 'loans',    label: 'Loans',    icon: '◉', activeIcon: '◉' },
  { key: 'txns',     label: 'History',  icon: '≡',  activeIcon: '≡'  },
  { key: 'notifs',   label: 'Alerts',   icon: '◎', activeIcon: '◎' },
  { key: 'profile',  label: 'Profile',  icon: '◯', activeIcon: '◯' },
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function MainApp({ customer, onLogout }) {
  const [tab,      setTab]      = useState('home');
  const [unread,   setUnread]   = useState(0);
  const [accounts, setAccounts] = useState([]);
  const [tick,     setTick]     = useState(0);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => { const u = subscribeToNetwork(setIsOnline); return () => u(); }, []);

  useEffect(() => {
    supabase.from('accounts').select('id').eq('customer_id', customer.id).eq('status', 'active')
      .then(({ data }) => { if (data) setAccounts(data); });
  }, [customer.id]);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 5000);
    const bump = () => setTick(t => t + 1);
    const ch = supabase.channel(`cust-rt-${customer.id}-${Date.now()}`);
    const ids = () => accounts.map(a => a.id);
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, p => {
      const i = ids(); if (!i.length || i.includes(p.new?.account_id)) { bump(); setUnread(n => n + 1); }
    });
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'accounts' }, p => {
      if (p.new?.customer_id === customer.id) bump();
    });
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'loans' }, p => {
      if (p.new?.customer_id === customer.id) { bump(); if (p.new?.status === 'overdue') setUnread(n => n + 1); }
    });
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'collections' }, p => {
      if (p.new?.customer_id === customer.id) { bump(); setUnread(n => n + 1); }
    });
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, p => {
      if (p.new?.user_id === customer.id) setUnread(n => n + 1);
    });
    ch.subscribe();
    return () => { clearInterval(interval); supabase.removeChannel(ch); };
  }, [customer.id, accounts.map(a => a.id).join(',')]);

  useEffect(() => {
    supabase.from('notifications').select('id', { count: 'exact', head: true })
      .eq('user_id', customer.id).eq('read', false)
      .then(({ count }) => setUnread(count || 0));
    checkAndNotifyLoansDue(customer.id);
    registerPushToken(customer.id);
    const unsub = subscribeToNotifications(customer.id, () => setUnread(n => n + 1));
    return () => unsub();
  }, [customer.id]);

  const firstName = customer.name?.split(' ')[0] || 'there';

  return (
    <SafeAreaView style={A.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy} />

      {/* ── Header ── */}
      <View style={A.header}>
        <View style={A.headerLeft}>
          <View style={A.logoBox}>
            <Text style={A.logoTxt}>M</Text>
          </View>
          <View>
            <Text style={A.greeting}>{getGreeting()}</Text>
            <Text style={A.userName}>{firstName}</Text>
          </View>
        </View>
        <View style={A.headerRight}>
          {!isOnline && (
            <View style={A.offlinePill}>
              <Text style={A.offlineTxt}>● Offline</Text>
            </View>
          )}
          <TouchableOpacity style={A.notifBtn} onPress={() => setTab('notifs')} activeOpacity={0.8}>
            <Text style={A.notifIcon}>🔔</Text>
            {unread > 0 && (
              <View style={A.notifBadge}>
                <Text style={A.notifBadgeTxt}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Content ── */}
      <View style={A.content}>
        {tab === 'home'     && <HomeScreen     customer={customer} onTabChange={setTab} tick={tick} />}
        {tab === 'accounts' && <AccountsScreen customer={customer} tick={tick} />}
        {tab === 'loans'    && <LoanScreen     customer={customer} tick={tick} />}
        {tab === 'txns'     && <TransactionsScreen customer={customer} tick={tick} />}
        {tab === 'notifs'   && <NotificationsScreen customer={customer} onRead={() => setUnread(0)} tick={tick} />}
        {tab === 'profile'  && <ProfileScreen  customer={customer} onLogout={onLogout} />}
      </View>

      {/* ── Tab bar ── */}
      <View style={A.tabBar}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <TouchableOpacity key={t.key} style={A.tabItem} onPress={() => setTab(t.key)} activeOpacity={0.7}>
              <View style={[A.tabPill, active && A.tabPillActive]}>
                <Text style={[A.tabIcon, active && A.tabIconActive]}>{t.icon}</Text>
                {t.key === 'notifs' && unread > 0 && <View style={A.tabDot} />}
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
  const [ready,    setReady]    = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('customer_session')
      .then(raw => { if (raw) { try { setCustomer(JSON.parse(raw)); } catch (_) {} } })
      .finally(() => setReady(true));
  }, []);

  const handleLogin = async data => {
    await AsyncStorage.setItem('customer_session', JSON.stringify(data));
    setCustomer(data);
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        await AsyncStorage.removeItem('customer_session');
        setCustomer(null);
      }},
    ]);
  };

  if (!ready) return (
    <SafeAreaProvider>
      <View style={A.splash}>
        <View style={A.splashRing}>
          <View style={A.splashLogo}><Text style={A.splashLogoTxt}>M</Text></View>
        </View>
        <Text style={A.splashName}>Majupat Love Enterprise</Text>
        <Text style={A.splashSub}>Customer Portal</Text>
        <View style={A.splashDots}>
          {[0, 1, 2].map(i => <View key={i} style={[A.splashDot, { opacity: 0.3 + i * 0.35 }]} />)}
        </View>
        <Text style={A.splashPow}>Powered by Maxbraynn Technology & Systems</Text>
      </View>
    </SafeAreaProvider>
  );

  if (!customer) return <SafeAreaProvider><LoginScreen onLogin={handleLogin} /></SafeAreaProvider>;
  return <SafeAreaProvider><MainApp customer={customer} onLogout={handleLogout} /></SafeAreaProvider>;
}

const A = StyleSheet.create({
  splash: { flex: 1, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  splashRing: { width: 116, height: 116, borderRadius: 34, borderWidth: 1.5, borderColor: 'rgba(26,86,219,0.35)', alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  splashLogo: { width: 92, height: 92, borderRadius: 28, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', ...{ shadowColor: C.brand, shadowOpacity: 0.5, shadowRadius: 24, elevation: 16 } },
  splashLogoTxt: { color: '#fff', fontSize: 46, fontWeight: '900' },
  splashName: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 6, letterSpacing: -0.3 },
  splashSub: { color: C.brand, fontSize: 13, fontWeight: '600', marginBottom: 36 },
  splashDots: { flexDirection: 'row', gap: 8, marginBottom: 48 },
  splashDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.brand },
  splashPow: { color: '#1e293b', fontSize: 11, position: 'absolute', bottom: 32 },

  root: { flex: 1, backgroundColor: C.bg },

  header: {
    backgroundColor: C.navy,
    paddingHorizontal: 20, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoBox: {
    width: 42, height: 42, borderRadius: 13, backgroundColor: C.brand,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.brand, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  logoTxt: { color: '#fff', fontSize: 21, fontWeight: '900' },
  greeting: { color: '#475569', fontSize: 11, fontWeight: '500', marginBottom: 1 },
  userName: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  offlinePill: { backgroundColor: 'rgba(239,68,68,0.15)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },
  offlineTxt: { color: '#fca5a5', fontSize: 10, fontWeight: '700' },
  notifBtn: { width: 42, height: 42, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center', position: 'relative', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  notifIcon: { fontSize: 18 },
  notifBadge: { position: 'absolute', top: 5, right: 5, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1.5, borderColor: C.navy },
  notifBadgeTxt: { color: '#fff', fontSize: 8, fontWeight: '900' },

  content: { flex: 1 },

  tabBar: {
    flexDirection: 'row', backgroundColor: C.card,
    borderTopWidth: 1, borderTopColor: C.border,
    paddingBottom: Platform.OS === 'ios' ? 0 : 8,
    paddingTop: 8, paddingHorizontal: 4,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, elevation: 8,
  },
  tabItem: { flex: 1, alignItems: 'center' },
  tabPill: { width: 44, height: 30, borderRadius: 12, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  tabPillActive: { backgroundColor: C.brandLt },
  tabIcon: { fontSize: 19, color: C.text4 },
  tabIconActive: { color: C.brand },
  tabDot: { position: 'absolute', top: 3, right: 5, width: 7, height: 7, borderRadius: 4, backgroundColor: C.red, borderWidth: 1.5, borderColor: C.card },
  tabLabel: { fontSize: 10, fontWeight: '600', color: C.text4, marginTop: 3 },
  tabLabelActive: { color: C.brand, fontWeight: '700' },
});
