/**
 * Auto-backup service — saves all Supabase data to a `backups` table
 * every 30 minutes while admin is logged in.
 */
import { supabase } from './supabase';

const BACKUP_TABLES = [
  'users', 'customers', 'accounts', 'transactions',
  'loans', 'hp_agreements', 'hp_payments', 'hp_items',
  'products', 'collectors', 'collections', 'pending_approvals',
  'pending_transactions', 'notifications', 'system_settings',
  'gl_accounts', 'gl_entries', 'audit_log', 'deduction_rules',
];

const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_BACKUPS  = 48;             // keep last 48 (24 hours worth)

let _timer = null;

// ── Run a single backup ───────────────────────────────────────────────────────
export async function runBackup(userName = 'system') {
  try {
    const snapshot = {};
    let totalRows = 0;

    for (const tbl of BACKUP_TABLES) {
      const { data } = await supabase
        .from(tbl)
        .select('*')
        .limit(10000);
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

    // Prune old backups — keep only the last MAX_BACKUPS
    const { data: all } = await supabase
      .from('backups')
      .select('id, created_at')
      .order('created_at', { ascending: false });

    if (all && all.length > MAX_BACKUPS) {
      const toDelete = all.slice(MAX_BACKUPS).map(b => b.id);
      await supabase.from('backups').delete().in('id', toDelete);
    }

    console.log(`[Backup] ✅ Saved at ${label} — ${totalRows} rows`);
    return { success: true, label, totalRows };
  } catch (e) {
    console.warn('[Backup] Error:', e.message);
    return { success: false, error: e.message };
  }
}

// ── Start auto-backup timer ───────────────────────────────────────────────────
export function startAutoBackup(userName = 'system', onComplete = null) {
  stopAutoBackup(); // clear any existing timer

  // Run immediately on start
  runBackup(userName).then(result => onComplete?.(result));

  // Then every 30 minutes
  _timer = setInterval(async () => {
    const result = await runBackup(userName);
    onComplete?.(result);
  }, INTERVAL_MS);

  console.log('[Backup] Auto-backup started — every 30 minutes');
}

// ── Stop auto-backup timer ────────────────────────────────────────────────────
export function stopAutoBackup() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    console.log('[Backup] Auto-backup stopped');
  }
}

// ── Restore from a backup ─────────────────────────────────────────────────────
export async function restoreBackup(backupId) {
  const { data: backup, error } = await supabase
    .from('backups')
    .select('data, label')
    .eq('id', backupId)
    .single();

  if (error || !backup) return { success: false, error: error?.message || 'Backup not found' };

  try {
    const snapshot = backup.data;

    // Delete in dependency order
    const deleteOrder = [
      'gl_entries', 'audit_log', 'deduction_rules', 'collections',
      'collector_assignments', 'hp_payments', 'pending_approvals',
      'pending_transactions', 'transactions', 'notifications',
      'loans', 'hp_agreements', 'accounts', 'customers',
      'collectors', 'hp_items', 'products', 'gl_accounts',
    ];
    for (const tbl of deleteOrder) {
      await supabase.from(tbl).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }
    await supabase.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('system_settings').delete().neq('key', '___never___');

    // Restore in reverse order (parents before children)
    const restoreOrder = [
      'users', 'system_settings', 'gl_accounts', 'products', 'hp_items',
      'customers', 'collectors', 'accounts', 'loans', 'hp_agreements',
      'hp_payments', 'transactions', 'collections', 'pending_approvals',
      'pending_transactions', 'notifications', 'gl_entries', 'audit_log',
      'deduction_rules',
    ];

    for (const tbl of restoreOrder) {
      const rows = snapshot[tbl];
      if (rows?.length) {
        // Insert in chunks of 500 to avoid payload limits
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          const { error: insErr } = await supabase.from(tbl).upsert(chunk, { ignoreDuplicates: true });
          if (insErr) console.warn(`[Restore] ${tbl}:`, insErr.message);
        }
      }
    }

    return { success: true, label: backup.label };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Get list of backups ───────────────────────────────────────────────────────
export async function listBackups() {
  const { data, error } = await supabase
    .from('backups')
    .select('id, created_at, created_by, label, size_rows')
    .order('created_at', { ascending: false })
    .limit(50);
  return { data: data || [], error };
}
