import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { C, GHS, fmtDate } from '../theme';

export default function ProfileScreen({ customer, onLogout }) {
  const initials = (customer.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const kyc = {
    verified: { bg: C.greenBg, text: C.green,  label: 'Verified',  icon: '✓' },
    pending:  { bg: C.amberBg, text: C.amber,  label: 'Pending',   icon: '⏳' },
    rejected: { bg: C.redBg,   text: C.red,    label: 'Rejected',  icon: '✕' },
  }[customer.kyc_status] || { bg: C.surface, text: C.text4, label: 'Unknown', icon: '?' };

  const sections = [
    {
      title: 'Personal Information',
      rows: [
        ['Full Name',      customer.name],
        ['Phone',          customer.phone],
        ['Email',          customer.email || '—'],
        ['Ghana Card',     customer.ghana_card || '—'],
        ['Date of Birth',  customer.dob || '—'],
        ['Address',        customer.address || '—'],
        ['Occupation',     customer.occupation || '—'],
        ['Employer',       customer.employer || '—'],
        ['Monthly Income', customer.monthly_income ? GHS(customer.monthly_income) : '—'],
      ],
    },
    {
      title: 'Account Details',
      rows: [
        ['Username',    customer.app_username || '—'],
        ['Customer ID', customer.id],
        ['KYC Status',  (customer.kyc_status || 'unknown').toUpperCase()],
        ['Member Since', customer.created_at ? fmtDate(customer.created_at, { month: 'long', year: 'numeric' }) : '—'],
      ],
    },
  ];

  return (
    <ScrollView style={S.root} contentContainerStyle={{ paddingBottom: 56 }} showsVerticalScrollIndicator={false}>

      {/* Profile hero */}
      <View style={S.hero}>
        <View style={S.avatarWrap}>
          <View style={S.avatar}><Text style={S.avatarTxt}>{initials}</Text></View>
          <View style={[S.kycBadge, { backgroundColor: kyc.bg }]}>
            <Text style={[S.kycTxt, { color: kyc.text }]}>{kyc.icon} {kyc.label}</Text>
          </View>
        </View>
        <Text style={S.name}>{customer.name}</Text>
        <Text style={S.username}>@{customer.app_username || '—'}</Text>
      </View>

      {/* Info sections */}
      {sections.map(sec => (
        <View key={sec.title} style={S.section}>
          <Text style={S.sectionTitle}>{sec.title}</Text>
          <View style={S.card}>
            {sec.rows.map(([l, v], i) => (
              <View key={l} style={[S.row, i === sec.rows.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={S.rowLabel}>{l}</Text>
                <Text style={[S.rowVal, l === 'Customer ID' && { fontFamily: 'monospace', fontSize: 11 }]} numberOfLines={1}>{v}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}

      {/* Sign out */}
      <View style={S.section}>
        <TouchableOpacity style={S.logoutBtn} onPress={onLogout} activeOpacity={0.85}>
          <Text style={S.logoutTxt}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <Text style={S.footer}>Majupat Love Enterprise{'\n'}Powered by Maxbraynn Technology & Systems</Text>
    </ScrollView>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  hero: { backgroundColor: C.white, paddingTop: 28, paddingBottom: 28, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.borderLt },
  avatarWrap: { position: 'relative', marginBottom: 14 },
  avatar: { width: 88, height: 88, borderRadius: 28, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', shadowColor: C.brand, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 },
  avatarTxt: { color: '#fff', fontSize: 34, fontWeight: '900' },
  kycBadge: { position: 'absolute', bottom: -8, right: -8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 2, borderColor: C.white },
  kycTxt: { fontSize: 11, fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '900', color: C.text, marginBottom: 4 },
  username: { fontSize: 13, color: C.text3 },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: C.text4, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  card: { backgroundColor: C.white, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: C.borderLt, ...C.shadowSm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.borderLt },
  rowLabel: { fontSize: 13, color: C.text3, flex: 1 },
  rowVal: { fontSize: 13, fontWeight: '600', color: C.text, flex: 1.5, textAlign: 'right' },
  logoutBtn: { backgroundColor: C.redLt, borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: C.redBg },
  logoutTxt: { color: C.red, fontSize: 16, fontWeight: '700' },
  footer: { textAlign: 'center', color: C.text4, fontSize: 11, lineHeight: 18, marginTop: 28, paddingHorizontal: 20 },
});
