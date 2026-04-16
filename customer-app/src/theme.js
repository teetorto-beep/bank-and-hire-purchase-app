// ── Majupat Customer App — Design System ─────────────────────────────────────
export const C = {
  // Brand
  brand:     '#1a56db',
  brandDk:   '#1e429f',
  brandLt:   '#eff6ff',
  brandMid:  '#3b82f6',
  // Backgrounds
  bg:        '#f0f4fb',
  navy:      '#0b1120',
  navyMid:   '#0f172a',
  card:      '#ffffff',
  surface:   '#f8fafc',
  // Text
  text:      '#0f172a',
  text2:     '#334155',
  text3:     '#64748b',
  text4:     '#94a3b8',
  // Status
  green:     '#10b981',
  greenDk:   '#059669',
  greenBg:   '#d1fae5',
  greenLt:   '#f0fdf4',
  red:       '#ef4444',
  redDk:     '#dc2626',
  redBg:     '#fee2e2',
  redLt:     '#fef2f2',
  amber:     '#f59e0b',
  amberBg:   '#fef3c7',
  amberLt:   '#fffbeb',
  purple:    '#8b5cf6',
  purpleBg:  '#ede9fe',
  teal:      '#0d9488',
  tealBg:    '#f0fdfa',
  // Border
  border:    '#e2e8f0',
  borderLt:  '#f1f5f9',
  // Shadows
  shadow:    { shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 12, elevation: 4 },
  shadowSm:  { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6,  elevation: 2 },
  shadowLg:  { shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 20, elevation: 8 },
};

export const ACCOUNT_GRADIENTS = [
  { from: '#1a56db', to: '#1e429f' },
  { from: '#0d9488', to: '#0f766e' },
  { from: '#7c3aed', to: '#6d28d9' },
  { from: '#b45309', to: '#92400e' },
  { from: '#be185d', to: '#9d174d' },
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
  d ? fmtDate(d) + '  ·  ' + fmtTime(d) : '—';
