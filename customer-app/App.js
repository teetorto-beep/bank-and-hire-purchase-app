import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Alert, Platform,
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

// Tab config — 5 tabs, center one is highlighted
const TABS = [
  { key: 'home',    label: 'Home',     icon: '\u2302' },
  { key: 'accounts',label: 'Accounts', icon: '\u25C8' },
  { key: 'loans',   label: 'Loans',    icon: '\u25CE', center: true },
  { key: 'txns',    label: 'History',  icon: '\u2261' },
  { key: 'profile', label: 'Profile',  icon: '\u25A1' },
];

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
    const interval = setInterval(() => setTick(t => t + 1), 6000);
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

  return (
    <SafeAreaView style={A.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.white} />

      {/* Offline strip */}
      {!isOnline && (
        <View style={A.offlineBar}>
          <Text style={A.offlineTxt}>No internet connection — showing cached data</Text>
        </View>
      )}

      {/* Screen content */}
      <View style={A.content}>
        {tab === 'home'     && <HomeScreen     customer={customer} onTabChange={setTab} tick={tick} onNotifPress={() => setTab('notifs')} unread={unread} />}
        {tab === 'accounts' && <AccountsScreen customer={customer} tick={tick} />}
        {tab === 'loans'    && <LoanScreen     customer={customer} tick={tick} />}
        {tab === 'txns'     && <TransactionsScreen customer={customer} tick={tick} />}
        {tab === 'notifs'   && <NotificationsScreen customer={customer} onRead={() => setUnread(0)} tick={tick} />}
        {tab === 'profile'  && <ProfileScreen  customer={customer} onLogout={onLogout} />}
      </View>

      {/* Bottom tab bar */}
      <View style={A.tabBar}>
        {TABS.map(t => {
          const active = tab === t.key;
          if (t.center) {
            return (
              <TouchableOpacity key={t.key} style={A.tabCenter} onPress={() => setTab(t.key)} activeOpacity={0.85}>
                <View style={[A.tabCenterBtn, active && A.tabCenterBtnActive]}>
                  <Text style={A.tabCenterIcon}>{t.icon}</Text>
                </View>
                <Text style={[A.tabLabel, active && A.tabLabelActive]}>{t.label}</Text>
              </TouchableOpacity>
            );
          }
          return (
            <TouchableOpacity key={t.key} style={A.tabItem} onPress={() => setTab(t.key)} activeOpacity={0.7}>
              <View style={[A.tabIconWrap, active && A.tabIconWrapActive]}>
                <Text style={[A.tabIcon, active && A.tabIconActive]}>{t.icon}</Text>
                {t.key === 'home' && unread > 0 && <View style={A.tabBadge}><Text style={A.tabBadgeTxt}>{unread > 9 ? '9+' : unread}</Text></View>}
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
        <View style={A.splashCard}>
          <View style={A.splashLogo}><Text style={A.splashLogoTxt}>ML</Text></View>
          <Text style={A.splashName}>Majupat Love</Text>
          <Text style={A.splashSub}>Enterprise</Text>
        </View>
        <Text style={A.splashPow}>Powered by Maxbraynn Technology & Systems</Text>
      </View>
    </SafeAreaProvider>
  );

  if (!customer) return <SafeAreaProvider><LoginScreen onLogin={handleLogin} /></SafeAreaProvider>;
  return <SafeAreaProvider><MainApp customer={customer} onLogout={handleLogout} /></SafeAreaProvider>;
}

const A = StyleSheet.create({
  splash: { flex: 1, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  splashCard: { alignItems: 'center', marginBottom: 60 },
  splashLogo: { width: 96, height: 96, borderRadius: 28, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, elevation: 12 },
  splashLogoTxt: { color: C.brand, fontSize: 32, fontWeight: '900' },
  splashName: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  splashSub: { color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: '500', marginTop: 4 },
  splashPow: { position: 'absolute', bottom: 32, color: 'rgba(255,255,255,0.5)', fontSize: 11 },

  root: { flex: 1, backgroundColor: C.bg },
  offlineBar: { backgroundColor: '#fef3c7', paddingVertical: 7, paddingHorizontal: 16, alignItems: 'center' },
  offlineTxt: { fontSize: 12, color: '#92400e', fontWeight: '600' },
  content: { flex: 1 },

  tabBar: {
    flexDirection: 'row', backgroundColor: C.white,
    borderTopWidth: 1, borderTopColor: C.border,
    paddingBottom: Platform.OS === 'ios' ? 0 : 6,
    paddingTop: 8, paddingHorizontal: 8,
    ...{ shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, elevation: 10 },
  },
  tabItem: { flex: 1, alignItems: 'center', paddingBottom: 2 },
  tabIconWrap: { width: 40, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  tabIconWrapActive: { backgroundColor: C.greenBg },
  tabIcon: { fontSize: 20, color: C.text4 },
  tabIconActive: { color: C.brand },
  tabBadge: { position: 'absolute', top: 0, right: 0, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  tabBadgeTxt: { color: '#fff', fontSize: 8, fontWeight: '900' },
  tabLabel: { fontSize: 10, fontWeight: '600', color: C.text4, marginTop: 2 },
  tabLabelActive: { color: C.brand, fontWeight: '700' },

  // Center loan tab — elevated
  tabCenter: { flex: 1, alignItems: 'center', marginTop: -18 },
  tabCenterBtn: { width: 52, height: 52, borderRadius: 18, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: C.white, shadowColor: C.brand, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  tabCenterBtnActive: { backgroundColor: C.brand },
  tabCenterIcon: { fontSize: 22, color: C.text3 },
});
