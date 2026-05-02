/**
 * Backup service — saves all Supabase data to a `backups` table.
 * Auto-backup every 30 minutes (in-app).
 * Auto-download ZIP every 10 days (to local machine).
 */
import { supabase } from './supabase';
import Papa from 'papaparse';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const BACKUP_TABLES = [
  'users', 'customers', 'accounts', 'transactions',
  'loans', 'hp_agreements', 'hp_payments', 'hp_items',
  'products', 'collectors', 'collections', 'pending_approvals',
  'pending_transactions', 'notifications', 'system_settings',
  'gl_accounts', 'gl_entries', 'audit_log', 'deduction_rules',
];

const INTERVAL_MS        = 30 * 60 * 1000;  // 30 minutes (in-app backup)
const AUTO_DOWNLOAD_DAYS = 10;               // auto-download every 10 days
const MAX_BACKUPS        = 48;              // keep last 48 in DB
const LAST_DOWNLOAD_KEY  = 'last_backup_download';

let _timer = null;

// ── Run a single in-app backup (saves to Supabase backups table) ──────────────
export async function runBackup(userName = 'system') {
  try {
    const snapshot = {};
    let totalRows = 0;

    for (const tbl of BACKUP_TABLES) {
      const { data } = await supabase.from(tbl).select('*').limit(10000);
      snapshot[tbl] = data || [];
      totalRows += (data || []).length;
    }

    const label = new Date().toLocaleString('en-GH', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const { error } = await supabase.from('backups').insert({
      created_by: userName,
      label,
      size_rows:  totalRows,
      data:       snapshot,
    });

    if (error) {
      console.warn('[Backup] Failed to save:', error.message);
      return { success: false, error: error.message };
    }

    // Prune — keep only last MAX_BACKUPS
    const { data: all } = await supabase
      .from('backups').select('id, created_at')
      .order('created_at', { ascending: false });
    if (all && all.length > MAX_BACKUPS) {
      const toDelete = all.slice(MAX_BACKUPS).map(b => b.id);
      await supabase.from('backups').delete().in('id', toDelete);
    }

    // Check if auto-download is due (every 10 days)
    await checkAutoDownload(snapshot, label, userName);

    console.log(`[Backup] ✅ ${label} — ${totalRows} rows`);
    return { success: true, label, totalRows };
  } catch (e) {
    console.warn('[Backup] Error:', e.message);
    return { success: false, error: e.message };
  }
}

// ── Check if 10-day auto-download is due ─────────────────────────────────────
async function checkAutoDownload(snapshot, label, userName) {
  try {
    const last = localStorage.getItem(LAST_DOWNLOAD_KEY);
    const now  = Date.now();
    const due  = !last || (now - parseInt(last)) >= AUTO_DOWNLOAD_DAYS * 24 * 60 * 60 * 1000;
    if (due) {
      await downloadBackupAsZip(snapshot, label);
      localStorage.setItem(LAST_DOWNLOAD_KEY, String(now));
      console.log('[Backup] 📥 Auto-download triggered (10-day schedule)');
    }
  } catch (e) {
    console.warn('[Backup] Auto-download failed:', e.message);
  }
}

// ── Start auto-backup timer ───────────────────────────────────────────────────
export function startAutoBackup(userName = 'system', onComplete = null) {
  stopAutoBackup();
  runBackup(userName).then(r => onComplete?.(r));
  _timer = setInterval(async () => {
    const r = await runBackup(userName);
    onComplete?.(r);
  }, INTERVAL_MS);
  console.log('[Backup] Auto-backup started — every 30 min, auto-download every 10 days');
}

export function stopAutoBackup() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

// ── Restore from a backup ─────────────────────────────────────────────────────
export async function restoreBackup(backupId) {
  const { data: backup, error } = await supabase
    .from('backups').select('data, label').eq('id', backupId).single();
  if (error || !backup) return { success: false, error: error?.message || 'Not found' };

  try {
    const snapshot = backup.data;
    const deleteOrder = [
      'gl_entries','audit_log','deduction_rules','collections',
      'collector_assignments','hp_payments','pending_approvals',
      'pending_transactions','transactions','notifications',
      'loans','hp_agreements','accounts','customers',
      'collectors','hp_items','products','gl_accounts',
    ];
    for (const tbl of deleteOrder) {
      await supabase.from(tbl).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }
    await supabase.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('system_settings').delete().neq('key', '___never___');

    const restoreOrder = [
      'users','system_settings','gl_accounts','products','hp_items',
      'customers','collectors','accounts','loans','hp_agreements',
      'hp_payments','transactions','collections','pending_approvals',
      'pending_transactions','notifications','gl_entries','audit_log','deduction_rules',
    ];
    for (const tbl of restoreOrder) {
      const rows = snapshot[tbl];
      if (rows?.length) {
        for (let i = 0; i < rows.length; i += 500) {
          const { error: e } = await supabase.from(tbl).upsert(rows.slice(i, i + 500), { ignoreDuplicates: true });
          if (e) console.warn(`[Restore] ${tbl}:`, e.message);
        }
      }
    }
    return { success: true, label: backup.label };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── List backups ──────────────────────────────────────────────────────────────
export async function listBackups() {
  const { data, error } = await supabase
    .from('backups').select('id, created_at, created_by, label, size_rows')
    .order('created_at', { ascending: false }).limit(100);
  return { data: data || [], error };
}

// ── Get next auto-download date ───────────────────────────────────────────────
export function getNextDownloadDate() {
  const last = localStorage.getItem(LAST_DOWNLOAD_KEY);
  if (!last) return 'On next backup';
  const next = new Date(parseInt(last) + AUTO_DOWNLOAD_DAYS * 24 * 60 * 60 * 1000);
  return next.toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function getLastDownloadDate() {
  const last = localStorage.getItem(LAST_DOWNLOAD_KEY);
  if (!last) return 'Never';
  return new Date(parseInt(last)).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Download backup as ZIP (CSV per table) ────────────────────────────────────
export async function downloadBackupAsZip(snapshot, label) {
  let JSZip;
  try { JSZip = (await import('jszip')).default; } catch { return; }

  const zip  = new JSZip();
  const ts   = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const folder = zip.folder(`majupat-backup-${ts}`);

  for (const tbl of BACKUP_TABLES) {
    const rows = snapshot?.[tbl] || [];
    folder.file(`${tbl}.csv`, rows.length ? Papa.unparse(rows) : '');
  }
  folder.file('_manifest.txt',
    `Majupat Love Enterprise — Database Backup\nGenerated: ${label}\nTables: ${BACKUP_TABLES.join(', ')}\n`
  );

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  triggerDownload(blob, `majupat-backup-${ts}.zip`, 'application/zip');
}

// ── Export a single backup as CSV (all tables merged) ────────────────────────
export async function exportBackupCSV(backupId) {
  const { data: backup } = await supabase
    .from('backups').select('data, label, created_at').eq('id', backupId).single();
  if (!backup) return;

  const snapshot = backup.data;
  let JSZip;
  try { JSZip = (await import('jszip')).default; } catch { return; }

  const zip    = new JSZip();
  const ts     = new Date(backup.created_at).toISOString().slice(0, 10);
  const folder = zip.folder(`majupat-backup-${ts}`);

  for (const tbl of BACKUP_TABLES) {
    const rows = snapshot?.[tbl] || [];
    folder.file(`${tbl}.csv`, rows.length ? Papa.unparse(rows) : '');
  }
  folder.file('_manifest.txt', `Majupat Love Enterprise\nBackup: ${backup.label}\nTables: ${BACKUP_TABLES.join(', ')}\n`);

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  triggerDownload(blob, `majupat-backup-${ts}.zip`, 'application/zip');
}

// ── Export a single backup as Excel (XLSX) ────────────────────────────────────
export async function exportBackupExcel(backupId) {
  const { data: backup } = await supabase
    .from('backups').select('data, label, created_at').eq('id', backupId).single();
  if (!backup) return;

  let XLSX;
  try { XLSX = await import('xlsx'); } catch {
    // Fallback to CSV if xlsx not available
    return exportBackupCSV(backupId);
  }

  const snapshot = backup.data;
  const wb = XLSX.utils.book_new();

  for (const tbl of BACKUP_TABLES) {
    const rows = snapshot?.[tbl] || [];
    if (rows.length) {
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, tbl.slice(0, 31)); // Excel sheet name max 31 chars
    }
  }

  const ts   = new Date(backup.created_at).toISOString().slice(0, 10);
  const buf  = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  triggerDownload(blob, `majupat-backup-${ts}.xlsx`, blob.type);
}

// ── Export a single backup as PDF (summary) ───────────────────────────────────
export async function exportBackupPDF(backupId) {
  const { data: backup } = await supabase
    .from('backups').select('data, label, created_at, created_by, size_rows').eq('id', backupId).single();
  if (!backup) return;

  const snapshot = backup.data;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;

  // Header
  doc.setFillColor(30, 64, 175);
  doc.rect(0, 0, pageW, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.text('Majupat Love Enterprise', 12, 14);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text('Database Backup Report', pageW - 12, 14, { align: 'right' });

  // Backup info
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text(`Backup: ${backup.label}`, 12, 32);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`Created by: ${backup.created_by || '—'}   |   Total rows: ${(backup.size_rows || 0).toLocaleString()}   |   Generated: ${new Date().toLocaleString()}`, 12, 38);

  // Table summary
  const summaryRows = BACKUP_TABLES.map(tbl => [
    tbl,
    (snapshot?.[tbl] || []).length.toLocaleString(),
  ]);

  autoTable(doc, {
    startY: 44,
    head: [['Table', 'Row Count']],
    body: summaryRows,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 40, halign: 'right', fontStyle: 'bold' },
    },
  });

  // Customers summary
  const customers = snapshot?.customers || [];
  const accounts  = snapshot?.accounts  || [];
  const loans     = snapshot?.loans     || [];
  const txns      = snapshot?.transactions || [];

  const finalY = (doc.lastAutoTable?.finalY || 100) + 10;
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
  doc.text('Summary Statistics', 12, finalY);
  autoTable(doc, {
    startY: finalY + 4,
    body: [
      ['Total Customers',    customers.length.toLocaleString()],
      ['Total Accounts',     accounts.length.toLocaleString()],
      ['Active Loans',       loans.filter(l => l.status === 'active').length.toLocaleString()],
      ['Total Transactions', txns.length.toLocaleString()],
      ['Total Loan Book',    'GHC ' + loans.reduce((s, l) => s + Number(l.outstanding || 0), 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 80, fontStyle: 'bold' }, 1: { cellWidth: 60, halign: 'right' } },
  });

  const ts = new Date(backup.created_at).toISOString().slice(0, 10);
  doc.save(`majupat-backup-${ts}.pdf`);
}

// ── Helper: trigger browser download ─────────────────────────────────────────
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
