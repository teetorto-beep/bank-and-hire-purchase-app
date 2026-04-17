import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { supabase } from '../supabase';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { C, GHS, fmtDateTime } from '../theme';

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week',  label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all',   label: 'All Time' },
];

function getRange(key) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (key === 'today') return [today.toISOString(), now.toISOString()];
  if (key === 'week')  { const w = new Date(today); w.setDate(w.getDate() - 7); return [w.toISOString(), now.toISOString()]; }
  if (key === 'month') { return [new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), now.toISOString()]; }
  return [null, null];
}

const PT = { savings: { color: C.green, bg: C.greenBg, label: 'Savings' }, loan: { color: C.blue, bg: C.blueBg, label: 'Loan' }, hp: { color: C.purple, bg: C.purpleBg, label: 'HP' } };

export default function ReportScreen({ collector, onLogout }) {
  const [period,      setPeriod]      = useState('today');
  const [collections, setCollections] = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [exporting,   setExporting]   = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const [from, to] = getRange(period);
      let q = supabase.from('collections').select('*, accounts(account_number, balance)')
        .eq('collector_id', collector.id).order('created_at', { ascending: false });
      if (from) q = q.gte('created_at', from);
      if (to)   q = q.lte('created_at', to);
      const { data } = await q;
      setCollections(data || []);
    } catch (_) {}
    if (refresh) setRefreshing(false); else setLoading(false);
  }, [period, collector.id]);

  useEffect(() => { load(); }, [load]);

  const total    = collections.reduce((s, c) => s + Number(c.amount || 0), 0);
  const byType   = { savings: 0, loan: 0, hp: 0 };
  collections.forEach(c => { const t = c.payment_type || 'savings'; byType[t] = (byType[t] || 0) + Number(c.amount || 0); });

  const handleExport = async () => {
    if (!collections.length) { Alert.alert('No Data', 'No collections to export'); return; }
    setExporting(true);
    try {
      const periodLabel = PERIODS.find(p => p.key === period)?.label || period;
      const rows = collections.map((c, i) => {
        const pt = c.payment_type || 'savings';
        const col = { savings: '#059669', loan: '#2563eb', hp: '#7c3aed' }[pt] || '#64748b';
        return `<tr style="background:${i%2===0?'#f9fafb':'#fff'}">
          <td>${i+1}</td>
          <td>${fmtDateTime(c.created_at)}</td>
          <td><strong>${c.customer_name||'—'}</strong></td>
          <td style="font-family:monospace">${c.accounts?.account_number||'—'}</td>
          <td><span style="background:${col}20;color:${col};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">${PT[pt]?.label||pt}</span></td>
          <td style="text-align:right;font-weight:700;color:#059669">GH₵ ${Number(c.amount||0).toLocaleString('en-GH',{minimumFractionDigits:2})}</td>
          <td style="text-align:right">${c.accounts?'GH₵ '+Number(c.accounts.balance||0).toLocaleString('en-GH',{minimumFractionDigits:2}):'—'}</td>
          <td style="color:#6b7280;font-size:11px">${c.notes||'—'}</td>
        </tr>`;
      }).join('');
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <style>body{font-family:Arial,sans-serif;margin:0;padding:20px;font-size:12px;color:#111827}
      .hdr{background:#059669;color:#fff;padding:16px 20px;border-radius:8px;margin-bottom:20px}
      .hdr h1{margin:0 0 4px;font-size:18px}.hdr p{margin:0;font-size:12px;color:rgba(255,255,255,0.7)}
      .meta{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap}
      .mc{background:#f3f4f6;border-radius:8px;padding:10px 14px;flex:1;min-width:100px}
      .mc .lbl{font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase}
      .mc .val{font-size:16px;font-weight:800;color:#111827;margin-top:2px}
      table{width:100%;border-collapse:collapse}
      th{background:#059669;color:#fff;padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase}
      td{padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px}
      .footer{margin-top:20px;text-align:center;font-size:10px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px}
      </style></head><body>
      <div class="hdr"><h1>Majupat Love Enterprise</h1><p>Collection Report — ${collector.name}${collector.zone?' · '+collector.zone:''}</p></div>
      <div class="meta">
        <div class="mc"><div class="lbl">Period</div><div class="val">${periodLabel}</div></div>
        <div class="mc"><div class="lbl">Total</div><div class="val">GH₵ ${Number(total).toLocaleString('en-GH',{minimumFractionDigits:2})}</div></div>
        <div class="mc"><div class="lbl">Collections</div><div class="val">${collections.length}</div></div>
        <div class="mc"><div class="lbl">Generated</div><div class="val" style="font-size:11px">${new Date().toLocaleString()}</div></div>
      </div>
      <table><thead><tr><th>#</th><th>Date & Time</th><th>Customer</th><th>Account</th><th>Type</th><th style="text-align:right">Amount</th><th style="text-align:right">Balance</th><th>Notes</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="footer">Maxbraynn Technology & Systems · Majupat Love Enterprise</div>
      </body></html>`;
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Collections - ${collector.name}`, UTI: 'com.adobe.pdf' });
      } else {
        Alert.alert('PDF Created', uri);
      }
    } catch (e) { Alert.alert('Export Failed', e.message); }
    setExporting(false);
  };

  return (
    <ScrollView style={S.root} contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
      showsVerticalScrollIndicator={false}>

      {/* Hero card */}
      <View style={S.hero}>
        <View style={S.heroDecor} />
        <Text style={S.heroLabel}>Total Collected</Text>
        <Text style={S.heroAmt}>{GHS(total)}</Text>
        <Text style={S.heroSub}>{collections.length} collection{collections.length !== 1 ? 's' : ''} · {PERIODS.find(p => p.key === period)?.label}</Text>
        <View style={S.heroStats}>
          {Object.entries(byType).map(([k, v], i) => (
            <React.Fragment key={k}>
              {i > 0 && <View style={S.heroStatDiv} />}
              <View style={S.heroStat}>
                <Text style={S.heroStatLabel}>{PT[k]?.label}</Text>
                <Text style={[S.heroStatVal, { color: PT[k]?.color || C.text }]}>{GHS(v)}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>

      {/* Period + Export */}
      <View style={S.controlRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
          {PERIODS.map(p => (
            <TouchableOpacity key={p.key} style={[S.periodBtn, period === p.key && S.periodBtnActive]} onPress={() => setPeriod(p.key)}>
              <Text style={[S.periodTxt, period === p.key && S.periodTxtActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={[S.exportBtn, exporting && { opacity: 0.6 }]} onPress={handleExport} disabled={exporting}>
          <Text style={S.exportTxt}>{exporting ? '…' : '📤'}</Text>
        </TouchableOpacity>
      </View>

      {/* Sign out */}
      <TouchableOpacity style={S.signOutBtn} onPress={onLogout} activeOpacity={0.8}>
        <Text style={S.signOutTxt}>Sign Out</Text>
      </TouchableOpacity>

      {/* Collections list */}
      <View style={S.listSection}>
        <Text style={S.sectionTitle}>Transactions</Text>
        {loading ? (
          <ActivityIndicator color={C.brand} style={{ marginTop: 24 }} />
        ) : collections.length === 0 ? (
          <View style={S.empty}>
            <Text style={{ fontSize: 36, marginBottom: 10 }}>📋</Text>
            <Text style={S.emptyTxt}>No collections in this period</Text>
            <Text style={S.emptyHint}>Pull down to refresh</Text>
          </View>
        ) : collections.map((c, i) => {
          const pt  = c.payment_type || 'savings';
          const ptc = PT[pt] || PT.savings;
          return (
            <View key={c.id || i} style={S.txnRow}>
              <View style={[S.txnDot, { backgroundColor: ptc.bg }]}>
                <Text style={{ fontSize: 14, color: ptc.color, fontWeight: '800' }}>↑</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={S.txnName} numberOfLines={1}>{c.customer_name || '—'}</Text>
                <Text style={S.txnMeta}>{c.accounts?.account_number || '—'} · {fmtDateTime(c.created_at)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[S.txnAmt, { color: ptc.color }]}>{GHS(c.amount)}</Text>
                <View style={[S.ptBadge, { backgroundColor: ptc.bg }]}>
                  <Text style={[S.ptBadgeTxt, { color: ptc.color }]}>{ptc.label}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  hero: { margin: 16, borderRadius: 22, backgroundColor: C.brand, padding: 22, overflow: 'hidden', ...C.shadow },
  heroDecor: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.07)', top: -60, right: -40 },
  heroLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  heroAmt: { color: '#fff', fontSize: 34, fontWeight: '900', letterSpacing: -1, marginBottom: 4 },
  heroSub: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 18 },
  heroStats: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 14, padding: 12 },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatDiv: { width: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  heroStatLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '600', marginBottom: 3 },
  heroStatVal: { fontSize: 13, fontWeight: '800' },
  controlRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8, gap: 8 },
  periodBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.white, borderWidth: 1, borderColor: C.border },
  periodBtnActive: { backgroundColor: C.brand, borderColor: C.brand },
  periodTxt: { fontSize: 12, fontWeight: '600', color: C.text3 },
  periodTxtActive: { color: '#fff' },
  exportBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  exportTxt: { fontSize: 18 },
  signOutBtn: { marginHorizontal: 16, marginBottom: 8, paddingVertical: 10, borderRadius: 12, backgroundColor: C.redLt, alignItems: 'center', borderWidth: 1, borderColor: C.redBg },
  signOutTxt: { color: C.red, fontSize: 13, fontWeight: '700' },
  listSection: { paddingHorizontal: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyTxt: { fontSize: 15, fontWeight: '700', color: C.text3, marginBottom: 4 },
  emptyHint: { fontSize: 12, color: C.text4 },
  txnRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.borderLt, backgroundColor: C.white, paddingHorizontal: 14, borderRadius: 0 },
  txnDot: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  txnName: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 2 },
  txnMeta: { fontSize: 11, color: C.text4 },
  txnAmt: { fontSize: 14, fontWeight: '800', marginBottom: 3 },
  ptBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  ptBadgeTxt: { fontSize: 10, fontWeight: '700' },
});
