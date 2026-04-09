import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";

const GHS = n => `GH\u20B5 ${Number(n||0).toLocaleString("en-GH",{minimumFractionDigits:2})}`;

export default function ProfileScreen({ customer, onLogout }) {
  const initials = (customer.name||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();

  const kycColor = {
    verified: { bg:"#f0fdf4", text:"#15803d", label:"✓ Verified" },
    pending:  { bg:"#fef9c3", text:"#92400e", label:"Pending"    },
    rejected: { bg:"#fef2f2", text:"#dc2626", label:"Rejected"   },
  }[customer.kyc_status] || { bg:"#f1f5f9", text:"#475569", label:"Unknown" };

  const personal = [
    ["Full Name",       customer.name],
    ["Phone",           customer.phone],
    ["Email",           customer.email||"—"],
    ["Ghana Card",      customer.ghana_card||"—"],
    ["Date of Birth",   customer.dob||"—"],
    ["Address",         customer.address||"—"],
    ["Occupation",      customer.occupation||"—"],
    ["Employer",        customer.employer||"—"],
    ["Monthly Income",  customer.monthly_income ? GHS(customer.monthly_income) : "—"],
    ["Member Since",    customer.created_at ? new Date(customer.created_at).toLocaleDateString("en-GH",{day:"numeric",month:"long",year:"numeric"}) : "—"],
  ];

  const appInfo = [
    ["App Username", customer.app_username||"—"],
    ["Customer ID",  customer.id],
  ];

  return (
    <ScrollView style={S.root} contentContainerStyle={{paddingBottom:48}} showsVerticalScrollIndicator={false}>

      {/* Avatar */}
      <View style={S.header}>
        <View style={S.avatar}><Text style={S.avatarTxt}>{initials}</Text></View>
        <Text style={S.name}>{customer.name}</Text>
        <Text style={S.username}>@{customer.app_username||"—"}</Text>
        <View style={[S.kycBadge,{backgroundColor:kycColor.bg}]}>
          <Text style={[S.kycTxt,{color:kycColor.text}]}>KYC · {kycColor.label}</Text>
        </View>
      </View>

      {/* Personal info */}
      <View style={S.card}>
        <Text style={S.cardTitle}>Personal Information</Text>
        {personal.map(([l,v]) => (
          <View key={l} style={S.row}>
            <Text style={S.rowLabel}>{l}</Text>
            <Text style={S.rowVal} numberOfLines={1}>{v}</Text>
          </View>
        ))}
      </View>

      {/* App info */}
      <View style={S.card}>
        <Text style={S.cardTitle}>App Information</Text>
        {appInfo.map(([l,v]) => (
          <View key={l} style={S.row}>
            <Text style={S.rowLabel}>{l}</Text>
            <Text style={[S.rowVal, l==="Customer ID"&&{fontFamily:"monospace",fontSize:11}]} numberOfLines={1}>{v}</Text>
          </View>
        ))}
      </View>

      {/* Sign out */}
      <View style={S.section}>
        <TouchableOpacity style={S.logoutBtn} onPress={onLogout} activeOpacity={0.85}>
          <Text style={S.logoutTxt}>🚪  Sign Out</Text>
        </TouchableOpacity>
        <Text style={S.footer}>Majupat Love Enterprise · Customer Portal</Text>
        <Text style={S.footerSub}>Powered by Maxbraynn Technology & Systems</Text>
      </View>
    </ScrollView>
  );
}

const S = StyleSheet.create({
  root:{flex:1,backgroundColor:"#f0f4f8"},
  header:{backgroundColor:"#0a0f1e",paddingTop:28,paddingBottom:32,alignItems:"center"},
  avatar:{width:84,height:84,borderRadius:24,backgroundColor:"#2563eb",alignItems:"center",justifyContent:"center",marginBottom:14,elevation:8},
  avatarTxt:{color:"#fff",fontSize:34,fontWeight:"900"},
  name:{color:"#fff",fontSize:20,fontWeight:"800",marginBottom:4},
  username:{color:"#475569",fontSize:13,marginBottom:12},
  kycBadge:{paddingHorizontal:14,paddingVertical:5,borderRadius:20},
  kycTxt:{fontSize:12,fontWeight:"700"},
  card:{backgroundColor:"#fff",borderRadius:16,marginHorizontal:16,marginTop:16,padding:16,shadowColor:"#000",shadowOpacity:0.04,shadowRadius:8,elevation:2,borderWidth:1,borderColor:"#f1f5f9"},
  cardTitle:{fontSize:12,fontWeight:"700",color:"#64748b",textTransform:"uppercase",letterSpacing:0.6,marginBottom:14},
  row:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",paddingVertical:10,borderBottomWidth:1,borderBottomColor:"#f8fafc"},
  rowLabel:{fontSize:13,color:"#64748b",flex:1},
  rowVal:{fontSize:13,fontWeight:"600",color:"#0f172a",flex:1.5,textAlign:"right"},
  section:{alignItems:"center",marginTop:24,paddingHorizontal:16},
  logoutBtn:{width:"100%",backgroundColor:"#fef2f2",borderRadius:12,padding:16,alignItems:"center",marginBottom:20,borderWidth:1,borderColor:"#fecaca"},
  logoutTxt:{color:"#dc2626",fontSize:15,fontWeight:"700"},
  footer:{fontSize:12,color:"#64748b",fontWeight:"600",marginBottom:4},
  footerSub:{fontSize:11,color:"#94a3b8"},
});
