// ── Majupat Customer App — New Design System ─────────────────────────────────
export const C = {
  brand:    '#16a34a',   // green
  brandDk:  '#15803d',
  brandLt:  '#f0fdf4',
  brandMid: '#22c55e',
  accent:   '#7c3aed',   // purple accent
  accentLt: '#f5f3ff',
  gold:     '#d97706',
  goldLt:   '#fffbeb',
  bg:       '#f8fafc',
  white:    '#ffffff',
  card:     '#ffffff',
  surface:  '#f1f5f9',
  text:     '#0f172a',
  text2:    '#1e293b',
  text3:    '#64748b',
  text4:    '#94a3b8',
  green:    '#16a34a',
  greenDk:  '#15803d',
  greenBg:  '#dcfce7',
  greenLt:  '#f0fdf4',
  red:      '#dc2626',
  redDk:    '#b91c1c',
  redBg:    '#fee2e2',
  redLt:    '#fef2f2',
  amber:    '#d97706',
  amberBg:  '#fef3c7',
  amberLt:  '#fffbeb',
  blue:     '#2563eb',
  blueBg:   '#dbeafe',
  blueLt:   '#eff6ff',
  border:   '#e2e8f0',
  borderLt: '#f1f5f9',
  shadow:   { shadowColor: '#0f172a', shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  shadowSm: { shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 8,  elevation: 2 },
  shadowLg: { shadowColor: '#0f172a', shadowOpacity: 0.14, shadowRadius: 24, elevation: 8 },
};

export const GRADIENTS = [
  ['#16a34a', '#15803d'],
  ['#2563eb', '#1d4ed8'],
  ['#7c3aed', '#6d28d9'],
  ['#d97706', '#b45309'],
  ['#db2777', '#be185d'],
];

export const ACCOUNT_ICONS = {
  savings:       '💰',
  current:       '🏦',
  fixed_deposit: '🔒',
  hire_purchase: '🛍️',
  joint:         '👥',
};

export const GHS = n =>
  'GH₵ ' + Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 });

export const fmtDate = (d, opts) =>
  d ? new Date(d).toLocaleDateString('en-GH', opts || { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const fmtTime = d =>
  d ? new Date(d).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' }) : '—';

export const fmtDateTime = d =>
  d ? fmtDate(d) + ' · ' + fmtTime(d) : '—';
