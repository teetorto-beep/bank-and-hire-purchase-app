import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { supabase } from '../supabase';
import { C, fmtDate, fmtTime } from '../theme';

const TYPE = {
  info:    { color: C.blue,  bg: C.blueLt,  icon: 'ℹ️' },
  success: { color: C.green, bg: C.greenLt, icon: '✅' },
  warning: { color: C.amber, bg: C.amberLt, icon: '⚠️' },
  error:   { color: C.red,   bg: C.redLt,   icon: '❌' },
};

export default function NotificationsScreen({ customer, onRead }) {
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    const { data } = await supabase.from('notifications').select('*')
      .eq('user_id', customer.id).order('created_at', { ascending: false }).limit(60);
    setNotifs(data || []);
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
    const ch = supabase.channel(`notif-${customer.id}-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${customer.id}` },
        payload => {
          if (!payload.new) return;
          setNotifs(p => [payload.new, ...p]);
          setTimeout(() => supabase.from('notifications').update({ read: true }).eq('id', payload.new.id), 1500);
        })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [customer.id]);

  const clearAll = () => Alert.alert('Clear All', 'Remove all notifications?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Clear', style: 'destructive', onPress: async () => {
      await supabase.from('notifications').delete().eq('user_id', customer.id);
      setNotifs([]);
    }},
  ]);

  const unread = notifs.filter(n => !n.read).length;

  const renderItem = ({ item: n }) => {
    const t = TYPE[n.type] || TYPE.info;
    return (
      <TouchableOpacity style={[S.card, !n.read && { borderLeftColor: t.color, borderLeftWidth: 4 }]}
        onPress={async () => {
          await supabase.from('notifications').update({ read: true }).eq('id', n.id);
          setNotifs(p => p.map(x => x.id === n.id ? { ...x, read: true } : x));
        }} activeOpacity={0.8}>
        <View style={[S.iconBox, { backgroundColor: t.bg }]}>
          <Text style={{ fontSize: 20 }}>{t.icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[S.cardTitle, !n.read && { fontWeight: '800' }]}>{n.title}</Text>
          <Text style={S.cardMsg}>{n.message}</Text>
          <Text style={S.cardTime}>{fmtDate(n.created_at)} · {fmtTime(n.created_at)}</Text>
        </View>
        {!n.read && <View style={[S.unreadDot, { backgroundColor: t.color }]} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={S.root}>
      <View style={S.header}>
        <View>
          <Text style={S.pageTitle}>Notifications</Text>
          <Text style={[S.subTxt, { color: unread > 0 ? C.brand : C.green }]}>
            {unread > 0 ? `${unread} unread` : 'All caught up ✓'}
          </Text>
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
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={S.empty}>
              <Text style={{ fontSize: 52, marginBottom: 16 }}>🔔</Text>
              <Text style={S.emptyTitle}>No notifications</Text>
              <Text style={S.emptyHint}>Account activity and alerts will appear here</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.borderLt },
  pageTitle: { fontSize: 22, fontWeight: '900', color: C.text },
  subTxt: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  clearBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: C.redLt, borderWidth: 1, borderColor: C.redBg },
  clearTxt: { color: C.red, fontSize: 12, fontWeight: '700' },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: C.white, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.borderLt, borderLeftWidth: 1, borderLeftColor: 'transparent' },
  iconBox: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 4 },
  cardMsg: { fontSize: 13, color: C.text2, lineHeight: 19, marginBottom: 5 },
  cardTime: { fontSize: 11, color: C.text4 },
  unreadDot: { width: 9, height: 9, borderRadius: 5, marginTop: 5, flexShrink: 0 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: C.text3, marginBottom: 8 },
  emptyHint: { fontSize: 13, color: C.text4, textAlign: 'center', lineHeight: 20, paddingHorizontal: 32 },
});
