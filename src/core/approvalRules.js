/**
 * Approval Rules — load from Supabase system_settings, cache in memory.
 * Used by PostTransaction, AccountOpening, LoanApplication to decide
 * whether a transaction needs approval.
 */
import { supabase } from './supabase';

const CACHE_KEY = 'approval_rules_cache';

export const DEFAULT_RULES = {
  credit_threshold:   { enabled: true,  amount: 10000, roles: ['teller'] },
  debit_threshold:    { enabled: true,  amount: 5000,  roles: ['teller'] },
  transfer_threshold: { enabled: true,  amount: 5000,  roles: ['teller', 'manager'] },
  account_opening:    { enabled: false, roles: ['teller'] },
  loan_creation:      { enabled: true,  roles: ['teller'] },
  gl_entry:           { enabled: true,  roles: ['teller', 'manager'] },
  customer_creation:  { enabled: false, roles: ['teller'] },
  user_creation:      { enabled: false, roles: [] },
};

let _cache = null;

export async function loadApprovalRules() {
  if (_cache) return _cache;
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'approval_rules')
      .single();
    _cache = data?.value || DEFAULT_RULES;
  } catch (_) {
    _cache = DEFAULT_RULES;
  }
  return _cache;
}

export function clearRulesCache() { _cache = null; }

export async function saveApprovalRules(rules) {
  _cache = rules;
  return supabase.from('system_settings').upsert({
    key: 'approval_rules',
    value: rules,
    updated_at: new Date().toISOString(),
  });
}

/**
 * Check if a given action requires approval for the current user's role.
 * @param {string} action  - 'credit'|'debit'|'transfer'|'account_opening'|'loan_creation'|'gl_entry'
 * @param {string} role    - user's role
 * @param {number} amount  - transaction amount (for threshold checks)
 * @param {object} rules   - loaded rules object
 */
export function requiresApproval(action, role, amount = 0, rules = DEFAULT_RULES) {
  if (role === 'admin') return false; // admins never need approval

  if (action === 'credit') {
    const r = rules.credit_threshold;
    return r?.enabled && (r.roles || []).includes(role) && amount >= (r.amount || 0);
  }
  if (action === 'debit') {
    const r = rules.debit_threshold;
    return r?.enabled && (r.roles || []).includes(role) && amount >= (r.amount || 0);
  }
  if (action === 'transfer') {
    const r = rules.transfer_threshold;
    return r?.enabled && (r.roles || []).includes(role) && amount >= (r.amount || 0);
  }
  if (action === 'account_opening') {
    const r = rules.account_opening;
    return r?.enabled && (r.roles || []).includes(role);
  }
  if (action === 'loan_creation') {
    const r = rules.loan_creation;
    return r?.enabled && (r.roles || []).includes(role);
  }
  if (action === 'gl_entry') {
    const r = rules.gl_entry;
    return r?.enabled && (r.roles || []).includes(role);
  }
  if (action === 'customer_creation') {
    const r = rules.customer_creation;
    return r?.enabled && (r.roles || []).includes(role);
  }
  return false;
}
