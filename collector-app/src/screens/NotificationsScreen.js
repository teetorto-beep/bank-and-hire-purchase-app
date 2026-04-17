import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { supabase } from '../supabase';
import { C, fmtDateTime } from '../theme';

const TYPE = {
  info:    { color: C.blue,  bg: C.blueLt,  icon: 'ℹ️' },
  success: { color: C.green, bg: C.greenLt, icon: '✅' },
  warning: { color: C.amber, bg: C.amberLt, icon: '⚠️' },
  error:   { color: C.red,   bg: C.redLt,   icon: '❌' },
};

export default function NotificationsScreen({ collector, onRead }) {
  const [notifs,     setNotifs]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    const { data } = await supabase.from('notifications').select('*')
      .eq('user_id', collector.id).order('created_at', { ascending: false }).limit(50);
    setNotifs(data || []);
    if (refresh) setRefreshing(false); else setLoading(false);
  }, [collector.id]);

  useEffect(() => {
    load();
    supabase.from('notifications').update({ read: true }).eq('user_id', collector.id).eq('read', false);
    onRead?.();
  }, []);

  useEffect(() => {
    const ch = supabase.channel(`notif-col-${collector.id}-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, p => {
        const n = p.new;
        if (!n || n.user_id !== collector.id) return;
        setNotifs(prev => [n, ...prev]);
        supabase.from('notifications').update({ read: true }).eq('id', n.id);
      }).subscribe();
    return () => supabase.removeChannel(ch);
  }, [collector.id]);

  const unread = notifs.filter(n => !n.read).length;

  if (loading) return <View style={S.center}><ActivityIndicator color={C.brand} size="large" /></View>;

  return (
    <View style={S.root}>
      <View style={S.header}>
        <View>
          <Text style={S.title}>Notifications</Text>
          <Text style={[S.sub, { color: unread > 0 ? C.brand : C.green }]}>
            {unread > 0 ? `${unread} unread` : 'All caught up ✓'}
          </Text>
        </View>
        {notifs.length > 0 && (
          <TouchableOpacity style={S.clearBtn} onPress={async () => {
            await supabase.from('notifications').delete().eq('user_id', collector.id);
            setNotifs([]);
          }}>
            <Text style={S.clearTxt}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList data={notifs} keyExtractor={i => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
        contentContainerStyle={{ paddingVertical: 8, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={S.empty}>
            <Text style={{ fontSize: 48, marginBottom: 14 }}>🔔</Text>
            <Text style={S.emptyTxt}>No notifications yet</Text>
            <Text style={S.emptyHint}>Alerts and updates will appear here</Text>
          </View>
        }
        renderItem={({ item: n }) => {
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
                <Text style={S.cardTime}>{fmtDateTime(n.created_at)}</Text>
              </View>
              {!n.read && <View style={[S.dot, { backgroundColor: t.color }]} />}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.borderLt },
  title: { fontSize: 22, fontWeight: '900', color: C.text },
  sub: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  clearBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: C.redLt, borderWidth: 1, borderColor: C.redBg },
  clearTxt: { color: C.red, fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 72 },
  emptyTxt: { fontSize: 16, fontWeight: '700', color: C.text3, marginBottom: 6 },
  emptyHint: { fontSize: 13, color: C.text4, textAlign: 'center' },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: C.white, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.borderLt, borderLeftWidth: 1, borderLeftColor: 'transparent' },
  iconBox: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 4 },
  cardMsg: { fontSize: 13, color: C.text2, lineHeight: 18, marginBottom: 4 },
  cardTime: { fontSize: 11, color: C.text4 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, flexShrink: 0 },
});
