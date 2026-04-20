// Collector App — Navy Blue Design System
export const C = {
  brand:    '#1e40af',   // navy blue
  brandDk:  '#1e3a8a',
  brandLt:  '#eff6ff',
  brandMid: '#2563eb',
  bg:       '#f8fafc',
  white:    '#ffffff',
  card:     '#ffffff',
  surface:  '#f1f5f9',
  text:     '#0f172a',
  text2:    '#1e293b',
  text3:    '#64748b',
  text4:    '#94a3b8',
  green:    '#16a34a',
  greenBg:  '#dcfce7',
  greenLt:  '#f0fdf4',
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
  purpleLt: '#f5f3ff',
  border:   '#e2e8f0',
  borderLt: '#f1f5f9',
  bgDark:   '#0f172a',
  bgCard:   '#ffffff',
  bgMuted:  '#f8fafc',
  shadow:   { shadowColor:'#0f172a', shadowOpacity:0.08, shadowRadius:16, elevation:4 },
  shadowSm: { shadowColor:'#0f172a', shadowOpacity:0.05, shadowRadius:8,  elevation:2 },
  shadowLg: { shadowColor:'#1e40af', shadowOpacity:0.18, shadowRadius:24, elevation:8 },
};

export const GHS = n =>
  'GH\u20B5 ' + Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 });

export const fmtDate = d =>
  d ? new Date(d).toLocaleDateString('en-GH', { day:'numeric', month:'short', year:'numeric' }) : '\u2014';

export const fmtTime = d =>
  d ? new Date(d).toLocaleTimeString('en-GH', { hour:'2-digit', minute:'2-digit' }) : '\u2014';

export const fmtDateTime = d =>
  d ? fmtDate(d) + ' \u00B7 ' + fmtTime(d) : '\u2014';

export const PT = {
  savings: { color:'#16a34a', bg:'#dcfce7', label:'Savings' },
  loan:    { color:'#2563eb', bg:'#dbeafe', label:'Loan'    },
  hp:      { color:'#7c3aed', bg:'#ede9fe', label:'HP'      },
};
