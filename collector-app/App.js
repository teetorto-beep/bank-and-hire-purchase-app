import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Alert, Platform } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './src/supabase';
import { subscribeToNetwork, syncQueue, getQueue } from './src/offline';
import { subscribeToNotifications, subscribeToApprovals, subscribeToCollections } from './src/notifications';
import { C, GHS } from './src/theme';
import LoginScreen         from './src/screens/LoginScreen';
import CreditScreen        from './src/screens/CreditScreen';
import ReportScreen        from './src/screens/ReportScreen';
import AccountScreen       from './src/screens/AccountScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import ApprovalsScreen     from './src/screens/ApprovalsScreen';

const TABS = [
  { key: 'report',    label: 'Dashboard',  icon: '⊞' },
  { key: 'credit',    label: 'Record',     icon: '＋', center: true },
  { key: 'approvals', label: 'Approvals',  icon: '✅' },
  { key: 'account',   label: 'Accounts',   icon: '◈' },
];

function MainApp({ collector, onLogout }) {
  const [tab,           setTab]           = useState('report');
  const [unread,        setUnread]        = useState(0);
  const [todayTotal,    setTodayTotal]    = useState(0);
  const [isOnline,      setIsOnline]      = useState(true);
  const [syncing,       setSyncing]       = useState(false);
  const [toasts,        setToasts]        = useState([]);
  const [pendingCount,  setPendingCount]  = useState(0);

  const addToast = (title, message, type = 'info') => {
    const id = Date.now();
    setToasts(p => [...p.slice(-2), { id, title, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  };

  const loadTodayTotal = async () => {
    try {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const { data } = await supabase.from('collections').select('amount')
        .eq('collector_id', collector.id).gte('created_at', today.toISOString());
      setTodayTotal((data || []).reduce((s, c) => s + Number(c.amount || 0), 0));
    } catch (_) {}
  };

  useEffect(() => { loadTodayTotal(); }, []);

  // Load pending count for badge
  useEffect(() => {
    const loadPending = async () => {
      try {
        const { data: pt } = await supabase.from('pending_transactions')
          .select('id').eq('submitted_by', collector.id).eq('status', 'pending');
        const { data: pa } = await supabase.from('pending_approvals')
          .select('id').eq('submitted_by', collector.id).eq('status', 'pending');
        setPendingCount((pt?.length || 0) + (pa?.length || 0));
      } catch (_) {}
    };
    loadPending();
  }, [collector.id]);

  useEffect(() => {
    let unsub;
    try {
      unsub = subscribeToNetwork(async (online) => {
        setIsOnline(online);
        if (online) {
          const q = await getQueue();
          if (q.length > 0) {
            setSyncing(true);
            const { synced, failed } = await syncQueue();
            setSyncing(false);
            loadTodayTotal();
            if (synced > 0) addToast('Sync Complete', `${synced} record(s) synced`, 'success');
            if (failed > 0) addToast('Sync Issues', `${failed} record(s) failed`, 'warning');
          }
        }
      });
    } catch (_) {}
    return () => { try { unsub?.(); } catch (_) {} };
  }, []);

  useEffect(() => {
    let u1 = () => {}, u2 = () => {}, u3 = () => {};
    try {
      u1 = subscribeToNotifications(collector.id, (n) => {
        setUnread(p => p + 1);
        addToast(n.title || 'Notification', n.message || '', n.type || 'info');
      });
      u2 = subscribeToApprovals(collector.id, (row) => {
        setUnread(p => p + 1);
        if (row.status === 'approved') addToast('✅ Approved', `Your ${row.type || 'request'} was approved`, 'success');
        else if (row.status === 'rejected') addToast('❌ Rejected', `Your ${row.type || 'request'} was rejected`, 'error');
      });
      u3 = subscribeToCollections(collector.id, (col) => {
        addToast('Collection Recorded', `${GHS(col.amount)} from ${col.customer_name || 'customer'}`, 'success');
        loadTodayTotal();
      });
    } catch (_) {}
    return () => { try { u1(); u2(); u3(); } catch (_) {} };
  }, [collector.id]);

  const TOAST_STYLE = {
    info:    { bg: C.blueLt,  border: C.blue,  text: '#1e40af' },
    success: { bg: C.greenLt, border: C.green, text: '#065f46' },
    warning: { bg: C.amberLt, border: C.amber, text: '#92400e' },
    error:   { bg: C.redLt,   border: C.red,   text: '#991b1b' },
  };

  return (
    <SafeAreaView style={S.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.white} />

      {/* Header */}
      <View style={S.header}>
        <View>
          <Text style={S.headerName}>{collector.name}</Text>
          <Text style={S.headerSub}>{collector.zone ? `Zone: ${collector.zone}` : 'Collector'}</Text>
        </View>
        <View style={S.headerRight}>
          {!isOnline && <View style={S.offlinePill}><Text style={S.offlineTxt}>Offline</Text></View>}
          {syncing   && <View style={[S.offlinePill, { backgroundColor: C.blueLt }]}><Text style={[S.offlineTxt, { color: C.blue }]}>Syncing…</Text></View>}
          <View style={S.todayBox}>
            <Text style={S.todayLabel}>Today</Text>
            <Text style={S.todayAmt}>{GHS(todayTotal)}</Text>
          </View>
          <TouchableOpacity onPress={() => { setTab('notifs'); setUnread(0); }} style={S.notifBtn}>
            <Text style={S.notifIcon}>🔔</Text>
            {unread > 0 && <View style={S.notifDot}><Text style={S.notifDotTxt}>{unread > 9 ? '9+' : unread}</Text></View>}
          </TouchableOpacity>
        </View>
      </View>

      {/* Toasts */}
      {toasts.length > 0 && (
        <View style={S.toastWrap}>
          {toasts.map(t => {
            const ts = TOAST_STYLE[t.type] || TOAST_STYLE.info;
            return (
              <TouchableOpacity key={t.id} style={[S.toast, { backgroundColor: ts.bg, borderLeftColor: ts.border }]}
                onPress={() => setToasts(p => p.filter(x => x.id !== t.id))} activeOpacity={0.9}>
                <Text style={[S.toastTitle, { color: ts.text }]}>{t.title}</Text>
                {t.message ? <Text style={[S.toastMsg, { color: ts.text }]}>{t.message}</Text> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Content */}
      <View style={S.content}>
        {tab === 'report'    && <ReportScreen    collector={collector} onLogout={onLogout} />}
        {tab === 'credit'    && <CreditScreen    collector={collector} onDone={() => { loadTodayTotal(); setTab('report'); }} />}
        {tab === 'account'   && <AccountScreen   collector={collector} />}
        {tab === 'approvals' && <ApprovalsScreen collector={collector} />}
        {tab === 'notifs'    && <NotificationsScreen collector={collector} onRead={() => setUnread(0)} />}
      </View>

      {/* Tab bar */}
      <View style={S.tabBar}>
        {TABS.map(t => {
          const active = tab === t.key;
          if (t.center) {
            return (
              <TouchableOpacity key={t.key} style={S.tabCenter} onPress={() => setTab(t.key)} activeOpacity={0.85}>
                <View style={[S.tabCenterBtn, active && { backgroundColor: C.brand }]}>
                  <Text style={[S.tabCenterIcon, active && { color: '#fff' }]}>{t.icon}</Text>
                </View>
                <Text style={[S.tabLabel, active && S.tabLabelActive]}>{t.label}</Text>
              </TouchableOpacity>
            );
          }
          return (
            <TouchableOpacity key={t.key} style={S.tabItem} onPress={() => setTab(t.key)} activeOpacity={0.7}>
              <View style={[S.tabIconWrap, active && { backgroundColor: C.greenBg }]}>
                <Text style={[S.tabIcon, active && { color: C.brand }]}>{t.icon}</Text>
                {t.key === 'approvals' && pendingCount > 0 && (
                  <View style={S.tabBadge}>
                    <Text style={S.tabBadgeTxt}>{pendingCount > 9 ? '9+' : pendingCount}</Text>
                  </View>
                )}
              </View>
              <Text style={[S.tabLabel, active && S.tabLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  const [collector, setCollector] = useState(null);
  const [ready,     setReady]     = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('collector_session')
      .then(raw => { if (raw) { try { setCollector(JSON.parse(raw)); } catch (_) {} } })
      .finally(() => setReady(true));
  }, []);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        await AsyncStorage.removeItem('collector_session');
        setCollector(null);
      }},
    ]);
  };

  if (!ready) return (
    <SafeAreaProvider>
      <View style={S.splash}>
        <View style={S.splashLogo}><Text style={S.splashTxt}>ML</Text></View>
        <Text style={S.splashName}>Majupat Love</Text>
        <Text style={S.splashSub}>Collector Portal</Text>
        <Text style={S.splashPow}>Powered by Maxbraynn Technology & Systems</Text>
      </View>
    </SafeAreaProvider>
  );

  if (!collector) return <SafeAreaProvider><LoginScreen onLogin={setCollector} /></SafeAreaProvider>;
  return <SafeAreaProvider><MainApp collector={collector} onLogout={handleLogout} /></SafeAreaProvider>;
}

const S = StyleSheet.create({
  splash: { flex: 1, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  splashLogo: { width: 88, height: 88, borderRadius: 26, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 18, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16, elevation: 8 },
  splashTxt: { color: C.brand, fontSize: 30, fontWeight: '900' },
  splashName: { color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  splashSub: { color: 'rgba(255,255,255,0.75)', fontSize: 14, marginTop: 4 },
  splashPow: { position: 'absolute', bottom: 28, color: 'rgba(255,255,255,0.45)', fontSize: 11 },

  root: { flex: 1, backgroundColor: C.bg },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border },
  headerName: { fontSize: 17, fontWeight: '800', color: C.text },
  headerSub: { fontSize: 11, color: C.text3, marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  offlinePill: { backgroundColor: C.redLt, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  offlineTxt: { fontSize: 10, fontWeight: '700', color: C.red },
  todayBox: { alignItems: 'flex-end' },
  todayLabel: { fontSize: 9, fontWeight: '700', color: C.text4, textTransform: 'uppercase', letterSpacing: 0.5 },
  todayAmt: { fontSize: 14, fontWeight: '900', color: C.green },
  notifBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', position: 'relative', borderWidth: 1, borderColor: C.border },
  notifIcon: { fontSize: 18 },
  notifDot: { position: 'absolute', top: 4, right: 4, minWidth: 14, height: 14, borderRadius: 7, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  notifDotTxt: { color: '#fff', fontSize: 8, fontWeight: '900' },

  toastWrap: { position: 'absolute', top: 68, left: 12, right: 12, zIndex: 999, gap: 6 },
  toast: { borderLeftWidth: 4, borderRadius: 10, padding: 12, ...C.shadow },
  toastTitle: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  toastMsg: { fontSize: 12, lineHeight: 16 },

  content: { flex: 1 },

  tabBar: { flexDirection: 'row', backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.border, paddingBottom: Platform.OS === 'ios' ? 0 : 6, paddingTop: 8, paddingHorizontal: 8, ...C.shadowSm },
  tabItem: { flex: 1, alignItems: 'center' },
  tabIconWrap: { width: 38, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tabIcon: { fontSize: 20, color: C.text4 },
  tabLabel: { fontSize: 10, fontWeight: '600', color: C.text4, marginTop: 2 },
  tabLabelActive: { color: C.brand, fontWeight: '700' },
  tabCenter: { flex: 1, alignItems: 'center', marginTop: -16 },
  tabCenterBtn: { width: 50, height: 50, borderRadius: 16, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: C.white, ...C.shadow },
  tabCenterIcon: { fontSize: 24, color: C.text3, fontWeight: '900' },
  tabBadge:      { position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  tabBadgeTxt:   { color: '#fff', fontSize: 8, fontWeight: '900' },
});
