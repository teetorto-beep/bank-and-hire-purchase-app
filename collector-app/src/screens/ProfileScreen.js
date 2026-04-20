import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C } from '../theme';

export default function ProfileScreen({ collector, onLogout }) {
  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text:'Cancel', style:'cancel' },
      { text:'Sign Out', style:'destructive', onPress: async () => {
        await AsyncStorage.removeItem('collector_session');
        onLogout();
      }},
    ]);
  };

  const INFO = [
    { label:'Full Name',  value:collector.name,         icon:'👤' },
    { label:'Username',   value:collector.username,      icon:'🪪' },
    { label:'Zone',       value:collector.zone || '—',   icon:'📍' },
    { label:'Phone',      value:collector.phone || '—',  icon:'📞' },
    { label:'Status',     value:collector.status,        icon:'✅' },
  ];

  return (
    <ScrollView style={S.root} contentContainerStyle={{ paddingBottom:40 }} showsVerticalScrollIndicator={false}>

      {/* Hero */}
      <View style={S.hero}>
        <View style={S.heroDecor} />
        <View style={S.avatarRing}>
          <View style={S.avatar}>
            <Text style={S.avatarTxt}>{(collector.name||'C')[0].toUpperCase()}</Text>
          </View>
        </View>
        <Text style={S.heroName}>{collector.name}</Text>
        <Text style={S.heroRole}>Field Collector</Text>
        {collector.zone ? (
          <View style={S.zoneBadge}><Text style={S.zoneTxt}>📍 {collector.zone}</Text></View>
        ) : null}
        <View style={S.heroStat}>
          <Text style={S.heroStatVal}>{GHS(collector.total_collected || 0)}</Text>
          <Text style={S.heroStatLabel}>Total Collected</Text>
        </View>
      </View>

      {/* Info */}
      <View style={S.card}>
        <Text style={S.cardTitle}>Account Details</Text>
        {INFO.map((item, i) => (
          <View key={item.label} style={[S.row, i === INFO.length - 1 && { borderBottomWidth:0 }]}>
            <Text style={S.rowIcon}>{item.icon}</Text>
            <Text style={S.rowLabel}>{item.label}</Text>
            <Text style={[S.rowValue, item.label === 'Status' && { color:C.green, fontWeight:'700' }]}>{item.value}</Text>
          </View>
        ))}
      </View>

      {/* App info */}
      <View style={S.card}>
        <Text style={S.cardTitle}>App Info</Text>
        {[
          { icon:'📱', label:'App',        value:'Majupat Love Collector' },
          { icon:'🔢', label:'Version',    value:'1.0.0'                  },
          { icon:'⚡', label:'Powered by', value:'Maxbraynn Technology'   },
        ].map((item, i, arr) => (
          <View key={item.label} style={[S.row, i === arr.length - 1 && { borderBottomWidth:0 }]}>
            <Text style={S.rowIcon}>{item.icon}</Text>
            <Text style={S.rowLabel}>{item.label}</Text>
            <Text style={S.rowValue}>{item.value}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={S.signOut} onPress={handleLogout} activeOpacity={0.85}>
        <Text style={{ fontSize:18 }}>🚪</Text>
        <Text style={S.signOutTxt}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// Need GHS here
const GHS = n => 'GH\u20B5 ' + Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits:2 });

const S = StyleSheet.create({
  root:        { flex:1, backgroundColor:C.bg },
  hero:        { backgroundColor:C.brand, paddingTop:32, paddingBottom:28, alignItems:'center', overflow:'hidden' },
  heroDecor:   { position:'absolute', width:240, height:240, borderRadius:120, backgroundColor:'rgba(255,255,255,0.06)', top:-80, right:-60 },
  avatarRing:  { width:88, height:88, borderRadius:44, borderWidth:3, borderColor:'rgba(255,255,255,0.3)', alignItems:'center', justifyContent:'center', marginBottom:12 },
  avatar:      { width:76, height:76, borderRadius:38, backgroundColor:'rgba(255,255,255,0.2)', alignItems:'center', justifyContent:'center' },
  avatarTxt:   { color:'#fff', fontSize:30, fontWeight:'900' },
  heroName:    { color:'#fff', fontSize:22, fontWeight:'800', marginBottom:4 },
  heroRole:    { color:'rgba(255,255,255,0.65)', fontSize:13, marginBottom:10 },
  zoneBadge:   { backgroundColor:'rgba(255,255,255,0.15)', paddingHorizontal:14, paddingVertical:5, borderRadius:20, marginBottom:16 },
  zoneTxt:     { color:'#fff', fontSize:12, fontWeight:'600' },
  heroStat:    { backgroundColor:'rgba(0,0,0,0.15)', paddingHorizontal:24, paddingVertical:10, borderRadius:14, alignItems:'center' },
  heroStatVal: { color:'#fff', fontSize:20, fontWeight:'900', marginBottom:2 },
  heroStatLabel:{ color:'rgba(255,255,255,0.6)', fontSize:11, fontWeight:'600' },
  card:        { backgroundColor:C.white, marginHorizontal:16, marginTop:16, borderRadius:18, borderWidth:1, borderColor:C.borderLt, overflow:'hidden', ...C.shadowSm },
  cardTitle:   { fontSize:12, fontWeight:'700', color:C.text4, textTransform:'uppercase', letterSpacing:0.8, paddingHorizontal:16, paddingTop:14, paddingBottom:10, borderBottomWidth:1, borderBottomColor:C.borderLt },
  row:         { flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:13, borderBottomWidth:1, borderBottomColor:C.borderLt, gap:10 },
  rowIcon:     { fontSize:16, width:24, textAlign:'center' },
  rowLabel:    { fontSize:13, color:C.text3, flex:1 },
  rowValue:    { fontSize:13, color:C.text, fontWeight:'600', textAlign:'right' },
  signOut:     { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:10, marginHorizontal:16, marginTop:20, paddingVertical:15, borderRadius:14, backgroundColor:C.redLt, borderWidth:1, borderColor:'#fecaca' },
  signOutTxt:  { color:C.red, fontSize:15, fontWeight:'700' },
});
