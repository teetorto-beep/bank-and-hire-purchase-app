import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Alert,
} from 'react-native';
import { supabase } from '../supabase';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const GHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;
const fmtDate = (v) => v ? new Date(v).toLocaleString() : '—';

const PERIODS = [
  { key: 'today',  label: 'Today' },
  { key: 'week',   label: 'This Week' },
  { key: 'month',  label: 'This Month' },
  { key: 'all',    label: 'All Time' },
];

function getRange(key) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (key === 'today') return [today.toISOString(), now.toISOString()];
  if (key === 'week')  { const w = new Date(today); w.setDate(w.getDate() - 7); return [w.toISOString(), now.toISOString()]; }
  if (key === 'month') { const m = new Date(now.getFullYear(), now.getMonth(), 1); return [m.toISOString(), now.toISOString()]; }
  return [null, null];
}

const PT_COLOR = { savings: '#16a34a', loan: '#1d4ed8', hp: '#7c3aed' };
const PT_LABEL = { savings: 'Savings', loan: 'Loan', hp: 'HP' };

export default function ReportScreen({ collector }) {
  const [period, setPeriod]       = useState('today');
  const [collections, setCollections] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]       = useState('');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true); else setLoading(true);
    const [from, to] = getRange(period);
    let q = supabase
      .from('collections')
      .select('*, accounts(account_number, balance)')
      .eq('collector_id', collector.id)
      .order('created_at', { ascending: false });
    if (from) q = q.gte('created_at', from);
    if (to)   q = q.lte('created_at', to);
    const { data } = await q;
    setCollections(data || []);
    if (showRefresh) setRefreshing(false); else setLoading(false);
  }, [period, collector.id]);

  useEffect(() => { load(); }, [load]);

  // ── Filtered by search ──────────────────────────────────────────────────────
  const filtered = search.trim()
    ? collections.filter(c =>
        (c.customer_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.accounts?.account_number || '').includes(search) ||
        (c.payment_type || '').includes(search.toLowerCase())
      )
    : collections;

  const total   = filtered.reduce((s, c) => s + Number(c.amount || 0), 0);
  const byType  = {
    savings: filtered.filter(c => (c.payment_type || 'savings') === 'savings').reduce((s, c) => s + Number(c.amount || 0), 0),
    loan:    filtered.filter(c => c.payment_type === 'loan').reduce((s, c) => s + Number(c.amount || 0), 0),
    hp:      filtered.filter(c => c.payment_type === 'hp').reduce((s, c) => s + Number(c.amount || 0), 0),
  };

  // ── Export as PDF ───────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (filtered.length === 0) { Alert.alert('No Data', 'No collections to export'); return; }
    setExporting(true);
    try {
      const periodLabel = PERIODS.find(p => p.key === period)?.label || period;
      const now = new Date().toLocaleString();

      const rows = filtered.map((c, i) => {
        const pt = c.payment_type || 'savings';
        const ptColor = { savings: '#16a34a', loan: '#1d4ed8', hp: '#7c3aed' }[pt] || '#64748b';
        const ptLabel = { savings: 'Savings', loan: 'Loan', hp: 'HP' }[pt] || pt;
        return `
          <tr style="background:${i % 2 === 0 ? '#f8fafc' : '#fff'}">
            <td>${i + 1}</td>
            <td>${fmtDate(c.created_at)}</td>
            <td><strong>${c.customer_name || '—'}</strong></td>
            <td style="font-family:monospace">${c.accounts?.account_number || '—'}</td>
            <td><span style="background:${ptColor}20;color:${ptColor};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">${ptLabel}</span></td>
            <td style="text-align:right;font-weight:700;color:#16a34a">GH₵ ${Number(c.amount || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}</td>
            <td style="text-align:right">${c.accounts ? 'GH₵ ' + Number(c.accounts.balance || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 }) : '—'}</td>
            <td style="color:#64748b;font-size:11px">${c.notes || '—'}</td>
          </tr>`;
      }).join('');

      const html = `
        <!DOCTYPE html><html><head>
        <meta charset="utf-8"/>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; font-size: 12px; color: #0f172a; }
          .header { background: #0f172a; color: #fff; padding: 16px 20px; border-radius: 8px; margin-bottom: 20px; }
          .header h1 { margin: 0 0 4px; font-size: 18px; }
          .header p { margin: 0; font-size: 12px; color: #94a3b8; }
          .meta { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
          .meta-card { background: #f1f5f9; border-radius: 8px; padding: 10px 14px; flex: 1; min-width: 100px; }
          .meta-card .label { font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
          .meta-card .value { font-size: 16px; font-weight: 800; color: #0f172a; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #1a56db; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
          td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
          .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; }
        </style></head><body>
        <div class="header">
          <h1>Majupat Love Enterprise</h1>
          <p>Collection Report — ${collector.name}${collector.zone ? ' · ' + collector.zone : ''}</p>
        </div>
        <div class="meta">
          <div class="meta-card"><div class="label">Period</div><div class="value">${periodLabel}</div></div>
          <div class="meta-card"><div class="label">Total Collected</div><div class="value">GH₵ ${Number(total).toLocaleString('en-GH', { minimumFractionDigits: 2 })}</div></div>
          <div class="meta-card"><div class="label">Collections</div><div class="value">${filtered.length}</div></div>
          <div class="meta-card"><div class="label">Generated</div><div class="value" style="font-size:11px">${now}</div></div>
        </div>
        <table>
          <thead><tr>
            <th>#</th><th>Date & Time</th><th>Customer</th><th>Account</th>
            <th>Type</th><th style="text-align:right">Amount</th>
            <th style="text-align:right">Balance</th><th>Notes</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="footer">Maxbraynn Technology & Systems · Majupat Love Enterprise · ${now}</div>
        </body></html>`;

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Collections Report - ${collector.name}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('PDF Created', 'PDF saved to: ' + uri);
      }
    } catch (e) {
      Alert.alert('Export Failed', e.message);
    }
    setExporting(false);
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#1a56db" />}
    >
      {/* Header */}
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>My Collections</Text>
        <TouchableOpacity
          style={[styles.exportBtn, exporting && { opacity: 0.6 }]}
          onPress={handleExport}
          disabled={exporting}
        >
          <Text style={styles.exportBtnText}>{exporting ? '…' : '📤 Export'}</Text>
        </TouchableOpacity>
      </View>

      {/* Period selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {PERIODS.map(p => (
            <TouchableOpacity
              key={p.key}
              style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
              onPress={() => setPeriod(p.key)}
            >
              <Text style={[styles.periodBtnText, period === p.key && styles.periodBtnTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Search */}
      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search customer, account, type…"
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={styles.clearSearch}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Summary */}
      <View style={[styles.summaryCard, { borderLeftColor: '#1a56db' }]}>
        <Text style={styles.summaryLabel}>Total Collected</Text>
        <Text style={[styles.summaryValue, { color: '#1a56db' }]}>{GHS(total)}</Text>
        <Text style={styles.summaryCount}>{filtered.length} collections{search ? ' (filtered)' : ''}</Text>
      </View>

      <View style={styles.typeRow}>
        {Object.entries(byType).map(([key, val]) => (
          <View key={key} style={[styles.typeCard, { borderTopColor: PT_COLOR[key] }]}>
            <Text style={[styles.typeCardLabel, { color: PT_COLOR[key] }]}>{PT_LABEL[key]}</Text>
            <Text style={styles.typeCardValue}>{GHS(val)}</Text>
          </View>
        ))}
      </View>

      {/* List */}
      <Text style={styles.sectionTitle}>Details</Text>

      {loading ? (
        <ActivityIndicator color="#1a56db" style={{ marginTop: 24 }} />
      ) : filtered.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>📋</Text>
          <Text style={styles.emptyText}>{search ? 'No results found' : 'No collections in this period'}</Text>
          <Text style={styles.emptyHint}>{search ? 'Try a different search' : 'Pull down to refresh'}</Text>
        </View>
      ) : (
        filtered.map((c, i) => {
          const pt  = c.payment_type || 'savings';
          const acc = c.accounts;
          return (
            <View key={c.id || i} style={styles.collectionCard}>
              <View style={styles.collectionHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.collectionCustomer}>{c.customer_name || '—'}</Text>
                  <Text style={styles.collectionDate}>{fmtDate(c.created_at)}</Text>
                </View>
                <View style={[styles.ptBadge, { backgroundColor: PT_COLOR[pt] + '20' }]}>
                  <Text style={[styles.ptBadgeText, { color: PT_COLOR[pt] }]}>{PT_LABEL[pt]}</Text>
                </View>
              </View>
              <View style={styles.collectionBody}>
                {[
                  ['Amount',      GHS(c.amount),           '#16a34a'],
                  ['Account',     acc?.account_number || '—', null],
                  ['Acct Balance',acc ? GHS(acc.balance) : '—', null],
                  c.notes ? ['Notes', c.notes, null] : null,
                ].filter(Boolean).map(([k, v, color]) => (
                  <View key={k} style={styles.collectionRow}>
                    <Text style={styles.collectionLabel}>{k}</Text>
                    <Text style={[styles.collectionValue, color && { color, fontWeight: '800' }]}>{v}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  pageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  pageTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  exportBtn: { backgroundColor: '#0f172a', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  exportBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  periodBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#fff' },
  periodBtnActive: { borderColor: '#1a56db', backgroundColor: '#eff6ff' },
  periodBtnText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  periodBtnTextActive: { color: '#1a56db' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 12, marginBottom: 14, gap: 8 },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: '#0f172a' },
  clearSearch: { fontSize: 16, color: '#94a3b8', padding: 4 },
  summaryCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderLeftWidth: 4, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 12, elevation: 2 },
  summaryLabel: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8 },
  summaryValue: { fontSize: 28, fontWeight: '900', marginTop: 4 },
  summaryCount: { fontSize: 12, color: '#64748b', marginTop: 2 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  typeCard: { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 12, borderTopWidth: 3, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' },
  typeCardLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  typeCardValue: { fontSize: 14, fontWeight: '800', color: '#0f172a', marginTop: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 },
  emptyBox: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 15, fontWeight: '700', color: '#475569', marginBottom: 4 },
  emptyHint: { fontSize: 12, color: '#94a3b8' },
  collectionCard: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0', elevation: 1, overflow: 'hidden' },
  collectionHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', backgroundColor: '#fafafa' },
  collectionCustomer: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  collectionDate: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  ptBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  ptBadgeText: { fontSize: 11, fontWeight: '700' },
  collectionBody: { padding: 12 },
  collectionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  collectionLabel: { fontSize: 12, color: '#64748b' },
  collectionValue: { fontSize: 12, fontWeight: '600', color: '#0f172a' },
});
