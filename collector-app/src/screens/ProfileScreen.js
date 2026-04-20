import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { C } from "../theme";

export default function ProfileScreen({ collector, onLogout }) {
  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure?", [
      { text:"Cancel", style:"cancel" },
      { text:"Sign Out", style:"destructive", onPress: async () => {
        await AsyncStorage.removeItem("collector_session");
        onLogout();
      }},
    ]);
  };

  const INFO = [
    { label:"Full Name",  value: collector.name        },
    { label:"Username",   value: collector.username     },
    { label:"Zone",       value: collector.zone || "—"  },
    { label:"Phone",      value: collector.phone || "—" },
    { label:"Status",     value: collector.status       },
  ];

  return (
    <ScrollView style={S.root} contentContainerStyle={{ paddingBottom:40 }} showsVerticalScrollIndicator={false}>
      <View style={S.hero}>
        <View style={S.avatar}><Text style={S.avatarTxt}>{(collector.name||"C")[0].toUpperCase()}</Text></View>
        <Text style={S.name}>{collector.name}</Text>
        <Text style={S.role}>Field Collector</Text>
        {collector.zone ? <Text style={S.zone}>{collector.zone}</Text> : null}
      </View>

      <View style={S.card}>
        <Text style={S.cardTitle}>Account Details</Text>
        {INFO.map((item, i) => (
          <View key={item.label} style={[S.row, i===INFO.length-1 && { borderBottomWidth:0 }]}>
            <Text style={S.rowLabel}>{item.label}</Text>
            <Text style={[S.rowValue, item.label==="Status" && { color:C.green }]}>{item.value}</Text>
          </View>
        ))}
      </View>

      <View style={S.card}>
        <Text style={S.cardTitle}>App Info</Text>
        {[
          ["App", "Majupat Love Collector"],
          ["Version", "1.0.0"],
          ["Powered by", "Maxbraynn Technology"],
        ].map(([label, value], i, arr) => (
          <View key={label} style={[S.row, i===arr.length-1 && { borderBottomWidth:0 }]}>
            <Text style={S.rowLabel}>{label}</Text>
            <Text style={S.rowValue}>{value}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={S.signOut} onPress={handleLogout} activeOpacity={0.8}>
        <Text style={S.signOutTxt}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const S = StyleSheet.create({
  root:       { flex:1, backgroundColor:C.bg },
  hero:       { backgroundColor:C.bgDark, paddingTop:36, paddingBottom:28, alignItems:"center" },
  avatar:     { width:72, height:72, borderRadius:36, backgroundColor:C.brand, alignItems:"center", justifyContent:"center", marginBottom:12 },
  avatarTxt:  { color:"#fff", fontSize:28, fontWeight:"800" },
  name:       { color:"#fff", fontSize:20, fontWeight:"700", marginBottom:4 },
  role:       { color:"rgba(255,255,255,0.45)", fontSize:13, marginBottom:6 },
  zone:       { color:"rgba(255,255,255,0.6)", fontSize:12, backgroundColor:"rgba(255,255,255,0.08)", paddingHorizontal:12, paddingVertical:4, borderRadius:20 },
  card:       { backgroundColor:C.bgCard, marginHorizontal:16, marginTop:14, borderRadius:14, borderWidth:1, borderColor:C.border, overflow:"hidden" },
  cardTitle:  { fontSize:11, fontWeight:"700", color:C.text4, textTransform:"uppercase", letterSpacing:0.6, paddingHorizontal:16, paddingTop:14, paddingBottom:10, borderBottomWidth:1, borderBottomColor:C.borderLt },
  row:        { flexDirection:"row", alignItems:"center", justifyContent:"space-between", paddingHorizontal:16, paddingVertical:13, borderBottomWidth:1, borderBottomColor:C.borderLt },
  rowLabel:   { fontSize:13, color:C.text3 },
  rowValue:   { fontSize:13, color:C.text, fontWeight:"600", textAlign:"right", flex:1, marginLeft:16 },
  signOut:    { marginHorizontal:16, marginTop:20, paddingVertical:15, borderRadius:12, backgroundColor:C.redBg, alignItems:"center", borderWidth:1, borderColor:"#FECACA" },
  signOutTxt: { color:C.red, fontSize:14, fontWeight:"700" },
});
