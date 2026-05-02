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

const DEFAULT_INTERVAL_MIN  = 30;            // default 30 minutes
const AUTO_DOWNLOAD_DAYS    = 10;            // auto-download every 10 days
const MAX_BACKUPS           = 48;            // keep last 48 in DB
const INTERVAL_KEY          = 'backup_interval_minutes';
const DOWNLOAD_INTERVAL_KEY = 'backup_download_days';

// ── Get/set interval from localStorage ───────────────────────────────────────
export function getBackupIntervalMinutes() {
  return parseInt(localStorage.getItem(INTERVAL_KEY) || DEFAULT_INTERVAL_MIN);
}
export function setBackupIntervalMinutes(mins) {
  localStorage.setItem(INTERVAL_KEY, String(Math.max(1, parseInt(mins) || DEFAULT_INTERVAL_MIN)));
}
export function getDownloadIntervalDays() {
  return parseInt(localStorage.getItem(DOWNLOAD_INTERVAL_KEY) || AUTO_DOWNLOAD_DAYS);
}
export function setDownloadIntervalDays(days) {
  localStorage.setItem(DOWNLOAD_INTERVAL_KEY, String(Math.max(1, parseInt(days) || AUTO_DOWNLOAD_DAYS)));
}

const LAST_DOWNLOAD_KEY = 'last_backup_download';

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

    // Check if auto-download is due
    await checkAutoDownload(snapshot, label);

    console.log(`[Backup] ✅ ${label} — ${totalRows} rows`);
    return { success: true, label, totalRows };
  } catch (e) {
    console.warn('[Backup] Error:', e.message);
    return { success: false, error: e.message };
  }
}

// ── Check if auto-download is due ────────────────────────────────────────────
async function checkAutoDownload(snapshot, label) {
  try {
    const last    = localStorage.getItem(LAST_DOWNLOAD_KEY);
    const now     = Date.now();
    const days    = getDownloadIntervalDays();
    const due     = !last || (now - parseInt(last)) >= days * 24 * 60 * 60 * 1000;
    if (due) {
      await downloadBackupAsZip(snapshot, label);
      localStorage.setItem(LAST_DOWNLOAD_KEY, String(now));
      console.log(`[Backup] 📥 Auto-download triggered (every ${days} days)`);
    }
  } catch (e) {
    console.warn('[Backup] Auto-download failed:', e.message);
  }
}

// ── Start auto-backup timer ───────────────────────────────────────────────────
export function startAutoBackup(userName = 'system', onComplete = null) {
  stopAutoBackup();
  runBackup(userName).then(r => onComplete?.(r));
  const mins = getBackupIntervalMinutes();
  _timer = setInterval(async () => {
    const r = await runBackup(userName);
    onComplete?.(r);
  }, mins * 60 * 1000);
  console.log(`[Backup] Auto-backup started — every ${mins} min, auto-download every ${getDownloadIntervalDays()} days`);
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
  const days = getDownloadIntervalDays();
  const next = new Date(parseInt(last) + days * 24 * 60 * 60 * 1000);
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

// ── Export a single backup as PDF (FULL DETAIL — all tables with data) ────────
export async function exportBackupPDF(backupId) {
  const { data: backup } = await supabase
    .from('backups').select('data, label, created_at, created_by, size_rows').eq('id', backupId).single();
  if (!backup) return;

  const snapshot = backup.data;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = 297;
  const ts    = new Date(backup.created_at).toISOString().slice(0, 10);

  const addHeader = (title) => {
    doc.setFillColor(30, 64, 175);
    doc.rect(0, 0, pageW, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text('Majupat Love Enterprise — Database Backup', 10, 12);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(`${backup.label}  |  By: ${backup.created_by || '—'}  |  ${title}  |  Generated: ${new Date().toLocaleString()}`, pageW - 10, 12, { align: 'right' });
  };

  // ── PAGE 1: Cover + Table of Contents ────────────────────────────────────
  addHeader('Cover');
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(22); doc.setFont('helvetica', 'bold');
  doc.text('Full Database Backup Report', pageW / 2, 50, { align: 'center' });
  doc.setFontSize(12); doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`Backup Date: ${backup.label}`, pageW / 2, 62, { align: 'center' });
  doc.text(`Total Records: ${(backup.size_rows || 0).toLocaleString()}`, pageW / 2, 70, { align: 'center' });

  // Table of contents
  autoTable(doc, {
    startY: 82,
    head: [['Table', 'Records', 'Description']],
    body: [
      ['users',               (snapshot?.users||[]).length,               'System users and staff'],
      ['customers',           (snapshot?.customers||[]).length,           'Registered customers'],
      ['accounts',            (snapshot?.accounts||[]).length,            'Customer bank accounts'],
      ['transactions',        (snapshot?.transactions||[]).length,        'All posted transactions'],
      ['loans',               (snapshot?.loans||[]).length,               'Loan records'],
      ['hp_agreements',       (snapshot?.hp_agreements||[]).length,       'Hire purchase agreements'],
      ['hp_payments',         (snapshot?.hp_payments||[]).length,         'HP payment records'],
      ['hp_items',            (snapshot?.hp_items||[]).length,            'HP items catalogue'],
      ['products',            (snapshot?.products||[]).length,            'Bank products'],
      ['collectors',          (snapshot?.collectors||[]).length,          'Field collectors'],
      ['collections',         (snapshot?.collections||[]).length,         'Field collection records'],
      ['pending_approvals',   (snapshot?.pending_approvals||[]).length,   'Pending approval requests'],
      ['pending_transactions',(snapshot?.pending_transactions||[]).length,'Pending transactions'],
      ['notifications',       (snapshot?.notifications||[]).length,       'System notifications'],
      ['system_settings',     (snapshot?.system_settings||[]).length,     'System configuration'],
      ['gl_accounts',         (snapshot?.gl_accounts||[]).length,         'Chart of accounts'],
      ['gl_entries',          (snapshot?.gl_entries||[]).length,          'GL journal entries'],
      ['audit_log',           (snapshot?.audit_log||[]).length,           'Audit trail'],
      ['deduction_rules',     (snapshot?.deduction_rules||[]).length,     'Auto-deduction rules'],
    ].map(([t, c, d]) => [t, Number(c).toLocaleString(), d]),
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 55, fontStyle: 'bold' }, 1: { cellWidth: 25, halign: 'right' }, 2: { cellWidth: 100 } },
  });

  // ── Helper: add a data table for a section ────────────────────────────────
  const addSection = (title, rows, columns, colWidths) => {
    if (!rows || rows.length === 0) return;
    doc.addPage();
    addHeader(title);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(`${title} (${rows.length.toLocaleString()} records)`, 10, 26);

    const body = rows.map(r => columns.map(c => {
      const v = r[c];
      if (v === null || v === undefined) return '—';
      if (typeof v === 'object') return JSON.stringify(v).slice(0, 60);
      return String(v).slice(0, 80);
    }));

    const styles = {};
    colWidths.forEach((w, i) => { styles[i] = { cellWidth: w }; });

    autoTable(doc, {
      startY: 30,
      head: [columns],
      body,
      styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: styles,
    });
  };

  // ── CUSTOMERS ─────────────────────────────────────────────────────────────
  addSection('Customers', snapshot?.customers || [],
    ['id','name','phone','email','ghana_card','address','occupation','kyc_status','created_at'],
    [40,35,25,40,28,40,30,18,28]);

  // ── ACCOUNTS ─────────────────────────────────────────────────────────────
  addSection('Accounts', snapshot?.accounts || [],
    ['account_number','type','balance','status','interest_rate','opened_at','customer_id'],
    [30,22,22,16,16,28,40]);

  // ── TRANSACTIONS ──────────────────────────────────────────────────────────
  addSection('Transactions', snapshot?.transactions || [],
    ['reference','type','amount','narration','balance_after','channel','poster_name','created_at'],
    [38,14,20,55,22,18,25,28]);

  // ── LOANS ─────────────────────────────────────────────────────────────────
  addSection('Loans', snapshot?.loans || [],
    ['id','type','amount','outstanding','total_repayment','interest_rate','tenure','monthly_payment','status','disbursed_at'],
    [40,20,20,22,24,14,12,22,16,28]);

  // ── HP AGREEMENTS ─────────────────────────────────────────────────────────
  addSection('HP Agreements', snapshot?.hp_agreements || [],
    ['id','item_name','total_price','down_payment','total_paid','remaining','payment_frequency','status','last_payment_date'],
    [40,35,20,20,20,20,22,16,28]);

  // ── HP PAYMENTS ───────────────────────────────────────────────────────────
  addSection('HP Payments', snapshot?.hp_payments || [],
    ['id','agreement_id','amount','remaining','note','collected_by','created_at'],
    [40,40,20,20,40,30,28]);

  // ── HP ITEMS ──────────────────────────────────────────────────────────────
  addSection('HP Items', snapshot?.hp_items || [],
    ['name','category','price','daily_payment','weekly_payment','stock','status'],
    [45,30,22,22,22,16,18]);

  // ── PRODUCTS ──────────────────────────────────────────────────────────────
  addSection('Products', snapshot?.products || [],
    ['name','category','interest_rate','min_balance','monthly_fee','tenure_months','status'],
    [45,30,18,22,18,18,16]);

  // ── COLLECTORS ────────────────────────────────────────────────────────────
  addSection('Collectors', snapshot?.collectors || [],
    ['name','phone','zone','username','status','total_collected','created_at'],
    [40,25,25,25,16,25,28]);

  // ── COLLECTIONS ───────────────────────────────────────────────────────────
  addSection('Collections', snapshot?.collections || [],
    ['collector_name','customer_name','amount','payment_type','notes','status','created_at'],
    [35,35,20,20,45,16,28]);

  // ── USERS ─────────────────────────────────────────────────────────────────
  addSection('Users', (snapshot?.users || []).map(u => ({ ...u, password: '***' })),
    ['name','email','role','phone','status','created_at'],
    [40,50,20,25,16,28]);

  // ── GL ACCOUNTS ───────────────────────────────────────────────────────────
  addSection('GL Accounts', snapshot?.gl_accounts || [],
    ['code','name','type','category','balance','status'],
    [18,60,20,30,22,16]);

  // ── GL ENTRIES ────────────────────────────────────────────────────────────
  addSection('GL Entries', snapshot?.gl_entries || [],
    ['journal_ref','gl_account_code','gl_account_name','entry_type','amount','narration','created_at'],
    [35,18,40,14,20,50,28]);

  // ── PENDING APPROVALS ─────────────────────────────────────────────────────
  addSection('Pending Approvals', snapshot?.pending_approvals || [],
    ['type','submitter_name','status','approver_name','submitted_at'],
    [30,40,16,40,28]);

  // ── NOTIFICATIONS ─────────────────────────────────────────────────────────
  addSection('Notifications', snapshot?.notifications || [],
    ['title','message','type','read','created_at'],
    [50,80,16,12,28]);

  // ── AUDIT LOG ─────────────────────────────────────────────────────────────
  addSection('Audit Log', snapshot?.audit_log || [],
    ['action','entity','user_name','detail','timestamp'],
    [30,25,30,80,28]);

  doc.save(`majupat-full-backup-${ts}.pdf`);
}

// ── Helper: trigger browser download ─────────────────────────────────────────
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
