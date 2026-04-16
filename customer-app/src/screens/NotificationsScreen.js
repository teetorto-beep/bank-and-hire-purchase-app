
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { supabase } from '../supabase';
import { C, fmtDate, fmtTime } from '../theme';

const TYPE_COLOR = { info: C.brand,  success: C.green, warning: C.amber, error: C.red };
const TYPE_BG    = { info: C.brandLt, success: C.greenLt, warning: C.amberLt, error: C.redLt };
const TYPE_ICON  = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };

export default function NotificationsScreen({ customer, onRead }) {
  const [notifs,     setNotifs]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const { data, error } = await supabase.from('notifications').select('*')
        .eq('user_id', customer.id).order('created_at', { ascending: false }).limit(60);
      if (!error) setNotifs(data || []);
    } catch (_) {}
    if (refresh) setRefreshing(false); else setLoading(false);
  }, [customer.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(async () => {
      await supabase.from('notifications').update({ read: true }).eq('user_id', customer.id).eq('read', false);
      onRead?.();
      setNotifs(p => p.map(n => ({ ...n, read: true })));
    }, 1500);
    return () => clearTimeout(t);
  }, [customer.id]);

  useEffect(() => {
    const ch = supabase.channel(`notif-screen-${customer.id}-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${customer.id}` },
        payload => {
          if (!payload.new) return;
          setNotifs(p => [payload.new, ...p]);
          setTimeout(() => supabase.from('notifications').update({ read: true }).eq('id', payload.new.id), 1500);
        })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [customer.id]);

  const markRead = async id => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifs(p => p.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const clearAll = () => Alert.alert('Clear All', 'Remove all notifications?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Clear', style: 'destructive', onPress: async () => {
      await supabase.from('notifications').delete().eq('user_id', customer.id);
      setNotifs([]);
    }},
  ]);

  const unread = notifs.filter(n => !n.read).length;

  const renderItem = ({ item: n }) => {
    const color = TYPE_COLOR[n.type] || C.brand;
    const bg    = TYPE_BG[n.type]    || C.brandLt;
    return (
      <TouchableOpacity
        style={[S.card, !n.read && { borderLeftColor: color, borderLeftWidth: 4 }]}
        onPress={() => markRead(n.id)} activeOpacity={0.8}>
        <View style={[S.iconBox, { backgroundColor: bg }]}>
          <Text style={{ fontSize: 20 }}>{TYPE_ICON[n.type] || 'ℹ️'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[S.cardTitle, !n.read && { fontWeight: '800', color: C.text }]}>{n.title}</Text>
          <Text style={S.cardMsg}>{n.message}</Text>
          {n.created_at && (
            <Text style={S.cardTime}>{fmtDate(n.created_at)}  ·  {fmtTime(n.created_at)}</Text>
          )}
        </View>
        {!n.read && <View style={[S.dot, { backgroundColor: color }]} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={S.root}>
      {/* Header */}
      <View style={S.header}>
        <View>
          <Text style={S.title}>Notifications</Text>
          {unread > 0
            ? <Text style={S.unreadLabel}>{unread} unread</Text>
            : <Text style={S.allReadLabel}>All caught up ✓</Text>}
        </View>
        {notifs.length > 0 && (
          <TouchableOpacity onPress={clearAll} style={S.clearBtn}>
            <Text style={S.clearTxt}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={S.center}><ActivityIndicator color={C.brand} size="large" /></View>
      ) : (
        <FlatList data={notifs} keyExtractor={i => i.id} renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingTop: 10, paddingBottom: 36 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={S.empty}>
              <Text style={{ fontSize: 52, marginBottom: 16 }}>🔔</Text>
              <Text style={S.emptyTitle}>No notifications yet</Text>
              <Text style={S.emptyHint}>Account activity, loan alerts and updates will appear here</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.borderLt },
  title: { fontSize: 20, fontWeight: '800', color: C.text },
  unreadLabel: { fontSize: 12, color: C.brand, fontWeight: '700', marginTop: 3 },
  allReadLabel: { fontSize: 12, color: C.green, fontWeight: '600', marginTop: 3 },
  clearBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: C.redLt, borderWidth: 1, borderColor: C.redBg },
  clearTxt: { color: C.red, fontSize: 12, fontWeight: '700' },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.borderLt, borderLeftWidth: 1, ...C.shadowSm },
  iconBox: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 4 },
  cardMsg: { fontSize: 13, color: C.text2, lineHeight: 19, marginBottom: 5 },
  cardTime: { fontSize: 11, color: C.text4 },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 5, flexShrink: 0 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: C.text3, marginBottom: 8 },
  emptyHint: { fontSize: 13, color: C.text4, textAlign: 'center', lineHeight: 20, paddingHorizontal: 32 },
});
