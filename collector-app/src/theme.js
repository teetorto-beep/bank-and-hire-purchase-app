export const C = {
  brand:    '#059669',
  brandDk:  '#047857',
  brandLt:  '#ecfdf5',
  brandMid: '#10b981',
  bg:       '#f9fafb',
  white:    '#ffffff',
  card:     '#ffffff',
  surface:  '#f3f4f6',
  text:     '#111827',
  text2:    '#374151',
  text3:    '#6b7280',
  text4:    '#9ca3af',
  green:    '#059669',
  greenBg:  '#d1fae5',
  greenLt:  '#ecfdf5',
  red:      '#dc2626',
  redBg:    '#fee2e2',
  redLt:    '#fef2f2',
  amber:    '#d97706',
  amberBg:  '#fef3c7',
  amberLt:  '#fffbeb',
  blue:     '#2563eb',
  blueBg:   '#dbeafe',
  blueLt:   '#eff6ff',
  purple:   '#7c3aed',
  purpleBg: '#ede9fe',
  border:   '#e5e7eb',
  borderLt: '#f3f4f6',
  shadow:   { shadowColor: '#111827', shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  shadowSm: { shadowColor: '#111827', shadowOpacity: 0.04, shadowRadius: 6,  elevation: 1 },
};

export const GHS = n =>
  'GH₵ ' + Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 });

export const fmtDate = d =>
  d ? new Date(d).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const fmtDateTime = d =>
  d ? new Date(d).toLocaleString('en-GH') : '—';
