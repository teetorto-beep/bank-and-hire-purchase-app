import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Alert, Platform,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './src/supabase';
import { subscribeToNetwork, syncQueue, getQueue } from './src/offline';
import {
  subscribeToNotifications,
  subscribeToApprovals,
  subscribeToCollections,
} from './src/notifications';
import LoginScreen from './src/screens/LoginScreen';
import CreditScreen from './src/screens/CreditScreen';
import ReportScreen from './src/screens/ReportScreen';
import AccountScreen from './src/screens/AccountScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';

// ── Error Boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('App error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#581c87', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 12 }}>Something went wrong</Text>
          <Text style={{ color: '#c084fc', fontSize: 13, textAlign: 'center', marginBottom: 24 }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: '#a855f7', borderRadius: 10, padding: 14, paddingHorizontal: 28 }}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const TABS = [
  { key: 'credit',  label: 'Record',   icon: '💳' },
  { key: 'account', label: 'Accounts', icon: '🏦' },
  { key: 'report',  label: 'Report',   icon: '📊' },
  { key: 'notifs',  label: 'Alerts',   icon: '🔔' },
];

const GHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

function MainApp({ collector, onLogout }) {
  const [tab, setTab] = useState('credit');
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [todayTotal, setTodayTotal] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const loadTodayTotal = async () => {
    try {
      const today = new Date(); today.setHours(0,0,0,0);
      const { data } = await supabase
        .from('collections').select('amount')
        .eq('collector_id', collector.id)
        .gte('created_at', today.toISOString());
      setTodayTotal((data || []).reduce((s, c) => s + Number(c.amount || 0), 0));
    } catch (e) {
      console.warn('loadTodayTotal error:', e.message);
    }
  };

  useEffect(() => { loadTodayTotal(); }, []);

  // Network monitoring + auto-sync
  useEffect(() => {
    let unsub;
    try {
      unsub = subscribeToNetwork(async (online) => {
        setIsOnline(online);
        if (online) {
          const q = await getQueue();
          if (q.length > 0) {
            setSyncing(true);
            addToast('🔄 Back Online', `Syncing ${q.length} offline record(s)…`, 'info');
            const { synced, failed } = await syncQueue();
            setSyncing(false);
            setQueueCount(0);
            loadTodayTotal();
            if (synced > 0) addToast('✅ Sync Complete', `${synced} record(s) synced successfully`, 'success');
            if (failed > 0) addToast('⚠️ Sync Issues', `${failed} record(s) failed to sync`, 'warning');
          }
        }
      });
    } catch (e) {
      console.warn('Network subscription error:', e.message);
    }
    // Check queue count on mount
    getQueue().then(q => setQueueCount(q.length)).catch(() => {});
    return () => { try { unsub?.(); } catch (_) {} };
  }, []);

  const addToast = (title, message, type = 'info') => {
    const id = Date.now();
    setToasts(p => [...p.slice(-2), { id, title, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 5000);
  };

  useEffect(() => {
    let unsubNotifs = () => {};
    let unsubApprovals = () => {};
    let unsubCols = () => {};
    try {
      // 1. Subscribe to notifications table
      unsubNotifs = subscribeToNotifications(collector.id, (n) => {
        setUnread(p => p + 1);
        addToast(n.title || 'Notification', n.message || '', n.type || 'info');
      });

      // 2. Subscribe to approval status changes
      unsubApprovals = subscribeToApprovals(collector.id, (row) => {
        setUnread(p => p + 1);
        if (row.status === 'approved') {
          addToast('✅ Request Approved', `Your ${row.type || 'request'} has been approved!`, 'success');
        } else if (row.status === 'rejected') {
          const reason = row.reject_reason ? ` Reason: ${row.reject_reason}` : '';
          addToast('❌ Request Rejected', `Your ${row.type || 'request'} was rejected.${reason}`, 'error');
        }
      });

      // 3. Subscribe to new collections
      unsubCols = subscribeToCollections(collector.id, (col) => {
        addToast(
          '✅ Collection Recorded',
          `${GHS(col.amount)} from ${col.customer_name || 'customer'}`,
          'success'
        );
        loadTodayTotal();
      });
    } catch (e) {
      console.warn('Realtime subscription error:', e.message);
    }

    return () => {
      try { unsubNotifs(); } catch (_) {}
      try { unsubApprovals(); } catch (_) {}
      try { unsubCols(); } catch (_) {}
    };
  }, [collector.id]);

  const clearUnread = () => setUnread(0);

  const TOAST_COLOR = {
    info:    { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af' },
    success: { bg: '#f0fdf4', border: '#16a34a', text: '#166534' },
    warning: { bg: '#fef9c3', border: '#f59e0b', text: '#92400e' },
    error:   { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' },
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#581c87" />

      {/* Top bar */}
      <View style={styles.topbar}>
        <View>
          <Text style={styles.topbarTitle}>Majupat Collector</Text>
          <Text style={styles.topbarSub}>
            {collector.name}{collector.zone ? ` · ${collector.zone}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.todayLabel}>Today</Text>
          <Text style={styles.todayAmount}>{GHS(todayTotal)}</Text>
        </View>
        <TouchableOpacity onPress={onLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Offline banner */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            📵 Offline — {queueCount > 0 ? `${queueCount} record(s) queued` : 'Collections will be saved locally'}
          </Text>
        </View>
      )}
      {syncing && (
        <View style={[styles.offlineBanner, { backgroundColor: '#eff6ff' }]}>
          <Text style={[styles.offlineText, { color: '#1d4ed8' }]}>🔄 Syncing offline records…</Text>
        </View>
      )}

      {/* In-app toast banners */}
      {toasts.length > 0 && (
        <View style={styles.toastContainer}>
          {toasts.map(t => {
            const c = TOAST_COLOR[t.type] || TOAST_COLOR.info;
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.toast, { backgroundColor: c.bg, borderLeftColor: c.border }]}
                onPress={() => setToasts(p => p.filter(x => x.id !== t.id))}
                activeOpacity={0.9}
              >
                <Text style={[styles.toastTitle, { color: c.text }]}>{t.title}</Text>
                {t.message ? <Text style={[styles.toastMsg, { color: c.text }]}>{t.message}</Text> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Screen content */}
      <View style={styles.content}>
        {tab === 'credit'  && <CreditScreen collector={collector} />}
        {tab === 'account' && <AccountScreen collector={collector} />}
        {tab === 'report'  && <ReportScreen collector={collector} />}
        {tab === 'notifs'  && <NotificationsScreen collector={collector} onRead={clearUnread} />}
      </View>

      {/* Bottom tab bar */}
      <View style={styles.tabbar}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={styles.tabItem}
              onPress={() => setTab(t.key)}
              activeOpacity={0.7}
            >
              {active && <View style={styles.tabIndicator} />}
              <View style={{ position: 'relative' }}>
                <Text style={styles.tabIcon}>{t.icon}</Text>
                {t.key === 'notifs' && unread > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  const [collector, setCollector] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('collector_session')
      .then(raw => { if (raw) { try { setCollector(JSON.parse(raw)); } catch (_) {} } })
      .finally(() => setReady(true));
  }, []);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem('collector_session');
          setCollector(null);
        },
      },
    ]);
  };

  if (!ready) {
    return (
      <SafeAreaProvider>
        <View style={styles.splash}>
          <View style={styles.splashLogo}><Text style={styles.splashLetter}>M</Text></View>
          <Text style={styles.splashName}>Majupat Love Enterprise</Text>
          <Text style={styles.splashSub}>Collector Portal</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  if (!collector) {
    return <SafeAreaProvider><ErrorBoundary><LoginScreen onLogin={setCollector} /></ErrorBoundary></SafeAreaProvider>;
  }

  return <SafeAreaProvider><ErrorBoundary><MainApp collector={collector} onLogout={handleLogout} /></ErrorBoundary></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: '#581c87', alignItems: 'center', justifyContent: 'center' },
  splashLogo: { width: 72, height: 72, borderRadius: 18, backgroundColor: '#a855f7', alignItems: 'center', justifyContent: 'center', marginBottom: 16, elevation: 8 },
  splashLetter: { color: '#fff', fontSize: 36, fontWeight: '900' },
  splashName: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  splashSub: { color: '#c084fc', fontSize: 13, fontWeight: '600' },
  root: { flex: 1, backgroundColor: '#faf5ff' },
  topbar: { backgroundColor: '#581c87', paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topbarTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  topbarSub: { color: '#c084fc', fontSize: 12, marginTop: 2 },
  todayLabel: { color: '#c084fc', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  todayAmount: { color: '#22c55e', fontSize: 15, fontWeight: '900' },
  logoutBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#7c3aed' },
  logoutText: { color: '#c084fc', fontSize: 12, fontWeight: '600' },
  offlineBanner: { backgroundColor: '#fef2f2', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#fecaca' },
  offlineText: { color: '#dc2626', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  toastContainer: { position: 'absolute', top: 70, left: 12, right: 12, zIndex: 999, gap: 6 },
  toast: { borderLeftWidth: 4, borderRadius: 10, padding: 12, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  toastTitle: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  toastMsg: { fontSize: 12, lineHeight: 16 },
  content: { flex: 1 },
  tabbar: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e9d5ff', paddingBottom: Platform.OS === 'ios' ? 0 : 4 },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 8, position: 'relative' },
  tabIndicator: { position: 'absolute', top: 0, left: '20%', right: '20%', height: 3, backgroundColor: '#a855f7', borderRadius: 2 },
  tabIcon: { fontSize: 20, marginBottom: 2 },
  tabLabel: { fontSize: 10, fontWeight: '600', color: '#7c3aed' },
  tabLabelActive: { color: '#a855f7' },
  badge: { position: 'absolute', top: -4, right: -8, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
