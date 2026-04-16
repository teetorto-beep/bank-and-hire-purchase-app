import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from "react-native";
import { supabase } from "../supabase";

const TYPE_COLOR = { info:"#3b82f6", success:"#16a34a", warning:"#f59e0b", error:"#ef4444" };
const TYPE_BG    = { info:"#eff6ff", success:"#f0fdf4", warning:"#fefce8", error:"#fef2f2" };
const TYPE_ICON  = { info:"ℹ️",      success:"✅",       warning:"⚠️",      error:"❌"      };

export default function NotificationsScreen({ customer, onRead }) {
  const [notifs,     setNotifs]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(60);
      if (!error) setNotifs(data || []);
    } catch (_) {}
    if (refresh) setRefreshing(false); else setLoading(false);
  }, [customer.id]);

  // Load on mount
  useEffect(() => { load(); }, [load]);

  // Mark all unread as read after a short delay (so badge updates first)
  useEffect(() => {
    const t = setTimeout(async () => {
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", customer.id)
        .eq("read", false);
      onRead?.();
      setNotifs(p => p.map(n => ({ ...n, read: true })));
    }, 1500);
    return () => clearTimeout(t);
  }, [customer.id]);

  // Realtime: new notification arrives while screen is open
  useEffect(() => {
    const ch = supabase
      .channel(`notif-screen-${customer.id}-${Date.now()}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "notifications",
        filter: `user_id=eq.${customer.id}`,
      }, payload => {
        if (!payload.new) return;
        setNotifs(p => [payload.new, ...p]);
        // Mark it read after a moment since screen is open
        setTimeout(() => {
          supabase.from("notifications").update({ read: true }).eq("id", payload.new.id);
        }, 1500);
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [customer.id]);

  const markRead = async id => {
    await supabase.from("notifications").update({read:true}).eq("id",id);
    setNotifs(p => p.map(n => n.id===id ? {...n,read:true} : n));
  };

  const clearAll = () => Alert.alert("Clear All","Remove all notifications?",[
    {text:"Cancel",style:"cancel"},
    {text:"Clear",style:"destructive",onPress:async()=>{
      await supabase.from("notifications").delete().eq("user_id",customer.id);
      setNotifs([]);
    }},
  ]);

  const unread = notifs.filter(n=>!n.read).length;

  const renderItem = ({ item: n }) => {
    const color = TYPE_COLOR[n.type]||"#3b82f6";
    const bg    = TYPE_BG[n.type]   ||"#eff6ff";
    const date  = n.created_at ? new Date(n.created_at) : null;
    return (
      <TouchableOpacity style={[S.card, !n.read&&{borderLeftColor:color,borderLeftWidth:4}]}
        onPress={()=>markRead(n.id)} activeOpacity={0.8}>
        <View style={[S.iconBox,{backgroundColor:bg}]}>
          <Text style={{fontSize:18}}>{TYPE_ICON[n.type]||"ℹ️"}</Text>
        </View>
        <View style={{flex:1}}>
          <Text style={[S.cardTitle,!n.read&&{fontWeight:"800"}]}>{n.title}</Text>
          <Text style={S.cardMsg}>{n.message}</Text>
          {date && (
            <Text style={S.cardTime}>
              {date.toLocaleDateString("en-GH",{day:"numeric",month:"short"})}{"  ·  "}
              {date.toLocaleTimeString("en-GH",{hour:"2-digit",minute:"2-digit"})}
            </Text>
          )}
        </View>
        {!n.read && <View style={[S.dot,{backgroundColor:color}]} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={S.root}>
      <View style={S.header}>
        <View>
          <Text style={S.title}>Notifications</Text>
          {unread > 0 && <Text style={S.unreadLabel}>{unread} unread</Text>}
        </View>
        {notifs.length > 0 && (
          <TouchableOpacity onPress={clearAll} style={S.clearBtn}>
            <Text style={S.clearTxt}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={S.center}><ActivityIndicator color="#2563eb" size="large" /></View>
      ) : (
        <FlatList data={notifs} keyExtractor={i=>i.id} renderItem={renderItem}
          contentContainerStyle={{padding:16,paddingTop:8,paddingBottom:32}}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>load(true)} tintColor="#2563eb" />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={S.empty}>
              <Text style={{fontSize:44,marginBottom:14}}>🔔</Text>
              <Text style={S.emptyTitle}>No notifications yet</Text>
              <Text style={S.emptyHint}>You will see alerts here when things happen on your account</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const S = StyleSheet.create({
  root:{flex:1,backgroundColor:"#f0f4f8"},
  center:{flex:1,alignItems:"center",justifyContent:"center",paddingTop:60},
  header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:16,paddingTop:14,paddingBottom:10,backgroundColor:"#fff",borderBottomWidth:1,borderBottomColor:"#f1f5f9"},
  title:{fontSize:18,fontWeight:"800",color:"#0f172a"},
  unreadLabel:{fontSize:12,color:"#2563eb",fontWeight:"600",marginTop:2},
  clearBtn:{paddingHorizontal:12,paddingVertical:6,borderRadius:8,backgroundColor:"#fef2f2"},
  clearTxt:{color:"#dc2626",fontSize:12,fontWeight:"700"},
  card:{flexDirection:"row",alignItems:"flex-start",gap:12,backgroundColor:"#fff",borderRadius:12,padding:14,marginBottom:8,borderWidth:1,borderColor:"#f1f5f9",borderLeftWidth:1,shadowColor:"#000",shadowOpacity:0.02,shadowRadius:4,elevation:1},
  iconBox:{width:42,height:42,borderRadius:12,alignItems:"center",justifyContent:"center",flexShrink:0},
  cardTitle:{fontSize:14,fontWeight:"600",color:"#0f172a",marginBottom:3},
  cardMsg:{fontSize:13,color:"#475569",lineHeight:18,marginBottom:4},
  cardTime:{fontSize:11,color:"#94a3b8"},
  dot:{width:8,height:8,borderRadius:4,marginTop:6,flexShrink:0},
  empty:{alignItems:"center",paddingTop:70},
  emptyTitle:{fontSize:16,fontWeight:"700",color:"#475569",marginBottom:6},
  emptyHint:{fontSize:13,color:"#94a3b8",textAlign:"center",lineHeight:20,paddingHorizontal:24},
});
