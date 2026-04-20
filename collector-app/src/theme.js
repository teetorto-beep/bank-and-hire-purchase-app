export const C = {
  brand:    "#2563EB",
  brandDk:  "#1D4ED8",
  brandLt:  "#EFF6FF",
  bg:       "#F8FAFC",
  bgDark:   "#0F172A",
  bgCard:   "#FFFFFF",
  text:     "#0F172A",
  text2:    "#334155",
  text3:    "#64748B",
  text4:    "#94A3B8",
  green:    "#16A34A",
  greenBg:  "#DCFCE7",
  red:      "#DC2626",
  redBg:    "#FEE2E2",
  redLt:    "#FFF1F0",
  amber:    "#D97706",
  amberBg:  "#FEF3C7",
  amberLt:  "#FFFBEB",
  blue:     "#2563EB",
  blueBg:   "#DBEAFE",
  blueLt:   "#EFF6FF",
  purple:   "#7C3AED",
  purpleBg: "#EDE9FE",
  purpleLt: "#F5F3FF",
  white:    "#FFFFFF",
  border:   "#E2E8F0",
  borderLt: "#F1F5F9",
  shadow:   { shadowColor:"#0F172A", shadowOpacity:0.06, shadowRadius:8, elevation:2 },
};

export const GHS = n =>
  "GH\u20B5 " + Number(n || 0).toLocaleString("en-GH", { minimumFractionDigits: 2 });

export const fmtDate = d =>
  d ? new Date(d).toLocaleDateString("en-GH", { day:"numeric", month:"short", year:"numeric" }) : "\u2014";

export const fmtDateTime = d =>
  d ? new Date(d).toLocaleString("en-GH", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }) : "\u2014";

export const PT = {
  savings: { color:"#16A34A", bg:"#DCFCE7", label:"Savings" },
  loan:    { color:"#2563EB", bg:"#DBEAFE", label:"Loan"    },
  hp:      { color:"#7C3AED", bg:"#EDE9FE", label:"HP"      },
};
