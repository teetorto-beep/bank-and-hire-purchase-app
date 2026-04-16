
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { C, GHS, fmtDate } from '../theme';

export default function ProfileScreen({ customer, onLogout }) {
  const initials = (customer.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const kyc = {
    verified: { bg: C.greenLt, text: C.green,  label: '✓ Verified',  border: '#86efac' },
    pending:  { bg: C.amberLt, text: C.amber,  label: '⏳ Pending',   border: '#fde68a' },
    rejected: { bg: C.redLt,   text: C.red,    label: '✕ Rejected',  border: '#fca5a5' },
  }[customer.kyc_status] || { bg: C.surface, text: C.text4, label: 'Unknown', border: C.border };

  const personal = [
    ['Full Name',      customer.name],
    ['Phone',          customer.phone],
    ['Email',          customer.email || '—'],
    ['Ghana Card',     customer.ghana_card || '—'],
    ['Date of Birth',  customer.dob || '—'],
    ['Address',        customer.address || '—'],
    ['Occupation',     customer.occupation || '—'],
    ['Employer',       customer.employer || '—'],
    ['Monthly Income', customer.monthly_income ? GHS(customer.monthly_income) : '—'],
    ['Member Since',   customer.created_at ? fmtDate(customer.created_at, { day: 'numeric', month: 'long', year: 'numeric' }) : '—'],
  ];

  return (
    <ScrollView style={S.root} contentContainerStyle={{ paddingBottom: 56 }} showsVerticalScrollIndicator={false}>

      {/* Hero */}
      <View style={S.hero}>
        <View style={S.avatarRing}>
          <View style={S.avatar}><Text style={S.avatarTxt}>{initials}</Text></View>
        </View>
        <Text style={S.name}>{customer.name}</Text>
        <Text style={S.username}>@{customer.app_username || '—'}</Text>
        <View style={[S.kycBadge, { backgroundColor: kyc.bg, borderColor: kyc.border }]}>
          <Text style={[S.kycTxt, { color: kyc.text }]}>KYC · {kyc.label}</Text>
        </View>
      </View>

      {/* Personal info */}
      <View style={S.section}>
        <Text style={S.sectionTitle}>Personal Information</Text>
        <View style={S.card}>
          {personal.map(([l, v], i) => (
            <View key={l} style={[S.row, i === personal.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={S.rowLabel}>{l}</Text>
              <Text style={S.rowVal} numberOfLines={2}>{v}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* App info */}
      <View style={S.section}>
        <Text style={S.sectionTitle}>Account Details</Text>
        <View style={S.card}>
          {[
            ['Username',    customer.app_username || '—'],
            ['Customer ID', customer.id],
            ['KYC Status',  (customer.kyc_status || 'unknown').toUpperCase()],
          ].map(([l, v], i) => (
            <View key={l} style={[S.row, i === 2 && { borderBottomWidth: 0 }]}>
              <Text style={S.rowLabel}>{l}</Text>
              <Text style={[S.rowVal, l === 'Customer ID' && { fontFamily: 'monospace', fontSize: 11 }]} numberOfLines={1}>{v}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Sign out */}
      <View style={S.section}>
        <TouchableOpacity style={S.logoutBtn} onPress={onLogout} activeOpacity={0.85}>
          <Text style={S.logoutIcon}>🚪</Text>
          <Text style={S.logoutTxt}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={S.footer}>
        <Text style={S.footerName}>Majupat Love Enterprise</Text>
        <Text style={S.footerSub}>Powered by Maxbraynn Technology & Systems</Text>
      </View>
    </ScrollView>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  hero: { backgroundColor: C.navyMid, paddingTop: 32, paddingBottom: 36, alignItems: 'center' },
  avatarRing: { width: 104, height: 104, borderRadius: 30, borderWidth: 2, borderColor: 'rgba(26,86,219,0.4)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  avatar: { width: 88, height: 88, borderRadius: 26, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', shadowColor: C.brand, shadowOpacity: 0.5, shadowRadius: 16, elevation: 10 },
  avatarTxt: { color: '#fff', fontSize: 36, fontWeight: '900' },
  name: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 5, letterSpacing: -0.3 },
  username: { color: '#475569', fontSize: 13, marginBottom: 14 },
  kycBadge: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  kycTxt: { fontSize: 12, fontWeight: '700' },
  section: { paddingHorizontal: 20, marginTop: 20 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: C.text4, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  card: { backgroundColor: C.card, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: C.borderLt, ...C.shadowSm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.borderLt },
  rowLabel: { fontSize: 13, color: C.text3, flex: 1 },
  rowVal: { fontSize: 13, fontWeight: '600', color: C.text, flex: 1.5, textAlign: 'right' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.redLt, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.redBg },
  logoutIcon: { fontSize: 18 },
  logoutTxt: { color: C.red, fontSize: 16, fontWeight: '700' },
  footer: { alignItems: 'center', marginTop: 32, paddingHorizontal: 20 },
  footerName: { fontSize: 13, color: C.text4, fontWeight: '600', marginBottom: 4 },
  footerSub: { fontSize: 11, color: C.text4 },
});
