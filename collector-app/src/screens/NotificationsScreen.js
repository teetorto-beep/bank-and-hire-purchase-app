import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { supabase } from '../supabase';

const TYPE_COLOR = { info: '#3b82f6', success: '#16a34a', warning: '#f59e0b', error: '#ef4444' };
const TYPE_ICON  = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };

export default function NotificationsScreen({ collector, onRead }) {
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', collector.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setNotifs(data || []);
    if (refresh) setRefreshing(false); else setLoading(false);
  }, [collector.id]);

  useEffect(() => {
    load();
    // Mark all as read when screen opens
    supabase.from('notifications').update({ read: true }).eq('user_id', collector.id).eq('read', false);
    onRead?.();
  }, []);

  // Realtime — new notif arrives while on this screen
  useEffect(() => {
    const ch = supabase
      .channel(`notif-screen-${collector.id}-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        const n = payload.new;
        if (!n || n.user_id !== collector.id) return;
        setNotifs(p => [n, ...p]);
        supabase.from('notifications').update({ read: true }).eq('id', n.id);
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [collector.id]);

  const markRead = async (id) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifs(p => p.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const clearAll = async () => {
    await supabase.from('notifications').delete().eq('user_id', collector.id);
    setNotifs([]);
  };

  if (loading) return <ActivityIndicator color="#1a56db" style={{ flex: 1, marginTop: 40 }} />;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
        {notifs.length > 0 && (
          <TouchableOpacity onPress={clearAll} style={styles.clearBtn}>
            <Text style={styles.clearText}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={notifs}
        keyExtractor={i => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#1a56db" />}
        contentContainerStyle={{ padding: 16, paddingTop: 8 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>🔔</Text>
            <Text style={styles.emptyText}>No notifications yet</Text>
            <Text style={styles.emptyHint}>You'll see alerts here when things happen</Text>
          </View>
        }
        renderItem={({ item: n }) => {
          const color = TYPE_COLOR[n.type] || '#3b82f6';
          return (
            <TouchableOpacity
              style={[styles.card, !n.read && { borderLeftColor: color, borderLeftWidth: 4 }]}
              onPress={() => markRead(n.id)}
              activeOpacity={0.8}
            >
              <View style={styles.cardRow}>
                <Text style={styles.cardIcon}>{TYPE_ICON[n.type] || 'ℹ️'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, !n.read && { fontWeight: '800' }]}>{n.title}</Text>
                  <Text style={styles.cardMsg}>{n.message}</Text>
                  <Text style={styles.cardTime}>{n.created_at ? new Date(n.created_at).toLocaleString() : ''}</Text>
                </View>
                {!n.read && <View style={[styles.dot, { backgroundColor: color }]} />}
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  clearBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#fee2e2' },
  clearText: { color: '#ef4444', fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#475569', marginBottom: 6 },
  emptyHint: { fontSize: 13, color: '#94a3b8', textAlign: 'center' },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#e2e8f0', borderLeftWidth: 1,
    shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardIcon: { fontSize: 20, marginTop: 2 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#0f172a', marginBottom: 3 },
  cardMsg: { fontSize: 13, color: '#475569', lineHeight: 18 },
  cardTime: { fontSize: 11, color: '#94a3b8', marginTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, flexShrink: 0 },
});
