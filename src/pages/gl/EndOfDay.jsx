import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../../core/supabase";
import { glDB, authDB } from "../../core/db";
import { exportReportPDF } from "../../core/export";
import { CheckCircle, AlertCircle, Clock, DollarSign, TrendingUp, Users, FileText, RefreshCw } from "lucide-react";

const GHS = (n) => `GH\u20B5 ${Number(n||0).toLocaleString("en-GH",{minimumFractionDigits:2})}`;
const today = () => new Date().toISOString().slice(0,10);
const fmtTime = (v) => v ? new Date(v).toLocaleTimeString() : "--";

export default function EndOfDay() {
  const user = authDB.currentUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bankAmount, setBankAmount] = useState("");
  const [bankNarr, setBankNarr] = useState("");
  const [banking, setBanking] = useState(false);
  const [bankMsg, setBankMsg] = useState("");
  const [closing, setClosing] = useState(false);
  const [closeMsg, setCloseMsg] = useState("");

  const load = async () => {
    setLoading(true);
    const todayStr = today();
    const todayStart = todayStr + "T00:00:00";
    const todayEnd   = todayStr + "T23:59:59";

    const [txns, cols, loans, accounts, glAccs, glEntries] = await Promise.all([
      supabase.from("transactions").select("*").gte("created_at", todayStart).lte("created_at", todayEnd).eq("status","completed"),
      supabase.from("collections").select("*, collectors(name)").gte("created_at", todayStart).lte("created_at", todayEnd),
      supabase.from("loans").select("*").in("status",["active","overdue"]),
      supabase.from("accounts").select("*").eq("status","active"),
      supabase.from("gl_accounts").select("*").in("code",["1000","1010","1020","1100","2010","4000","5000"]),
      supabase.from("gl_entries").select("*").gte("created_at", todayStart).lte("created_at", todayEnd),
    ]);

    const t = txns.data || [];
    const c = cols.data || [];
    const l = loans.data || [];
    const a = accounts.data || [];
    const ga = glAccs.data || [];
    const ge = glEntries.data || [];

    const getBalance = (code) => Number(ga.find(x=>x.code===code)?.balance||0);

    // Today GL entries
    const todayDr = ge.filter(e=>e.entry_type==="debit").reduce((s,e)=>s+Number(e.amount),0);
    const todayCr = ge.filter(e=>e.entry_type==="credit").reduce((s,e)=>s+Number(e.amount),0);

    // Collections by collector
    const byCollector = {};
    c.forEach(col => {
      const name = col.collector_name || col.collectors?.name || "Unknown";
      if (!byCollector[name]) byCollector[name] = { name, count:0, total:0, types:{savings:0,loan:0,hp:0} };
      byCollector[name].count++;
      byCollector[name].total += Number(col.amount||0);
      const pt = col.payment_type || "savings";
      byCollector[name].types[pt] = (byCollector[name].types[pt]||0) + Number(col.amount||0);
    });

    setData({
      // Transactions
      totalDeposits: t.filter(x=>x.type==="credit").reduce((s,x)=>s+Number(x.amount),0),
      totalWithdrawals: t.filter(x=>x.type==="debit").reduce((s,x)=>s+Number(x.amount),0),
      txnCount: t.length,
      // Collections
      totalCollected: c.reduce((s,x)=>s+Number(x.amount),0),
      collectionCount: c.length,
      byCollector: Object.values(byCollector),
      savingsCollected: c.filter(x=>(x.payment_type||"savings")==="savings").reduce((s,x)=>s+Number(x.amount),0),
      loanCollected: c.filter(x=>x.payment_type==="loan").reduce((s,x)=>s+Number(x.amount),0),
      hpCollected: c.filter(x=>x.payment_type==="hp").reduce((s,x)=>s+Number(x.amount),0),
      // Loans
      activeLoans: l.length,
      overdueLoans: l.filter(x=>x.status==="overdue").length,
      totalOutstanding: l.reduce((s,x)=>s+Number(x.outstanding),0),
      // Accounts
      totalAccounts: a.length,
      totalSavings: a.reduce((s,x)=>s+Number(x.balance),0),
      // GL
      cashInHand: getBalance("1000"),
      mainAccount: getBalance("1010"),
      loanReceivable: getBalance("1100"),
      interestIncome: getBalance("4000"),
      todayDr, todayCr,
      glBalanced: Math.abs(todayDr-todayCr)<0.01,
      glEntryCount: ge.length,
    });
    setLoading(false);
  };

  useEffect(()=>{load();},[]);

  const doBankCash = async () => {
    const amt = parseFloat(bankAmount);
    if (!amt||amt<=0){setBankMsg("Enter a valid amount");return;}
    setBanking(true);setBankMsg("");
    const narr = bankNarr.trim()||`EOD Cash Banking — ${today()}`;
    const{error}=await glDB.postJournal([
      {accountCode:"1010",entryType:"debit", amount:amt,narration:narr},
      {accountCode:"1000",entryType:"credit",amount:amt,narration:narr},
    ],narr,"cash_banking",null,null,user?.name||"admin");
    if(error){setBankMsg("Error: "+error.message);}
    else{setBankMsg(`GH\u20B5 ${amt.toLocaleString("en-GH",{minimumFractionDigits:2})} banked successfully.`);setBankAmount("");setBankNarr("");load();}
    setBanking(false);
  };

  const exportEOD = () => {
    if(!data)return;
    exportReportPDF({
      title:"End of Day Report",
      subtitle:`Date: ${today()} | Generated by: ${user?.name||"admin"} | ${new Date().toLocaleTimeString()}`,
      columns:["Item","Value"],
      rows:[
        ["DATE",today()],
        ["",""],
        ["TRANSACTIONS",""],
        ["Total Deposits",GHS(data.totalDeposits)],
        ["Total Withdrawals",GHS(data.totalWithdrawals)],
        ["Transaction Count",data.txnCount],
        ["",""],
        ["COLLECTIONS",""],
        ["Total Collected",GHS(data.totalCollected)],
        ["Savings Deposits",GHS(data.savingsCollected)],
        ["Loan Repayments",GHS(data.loanCollected)],
        ["HP Repayments",GHS(data.hpCollected)],
        ["Collection Count",data.collectionCount],
        ["",""],
        ["LOANS",""],
        ["Active Loans",data.activeLoans],
        ["Overdue Loans",data.overdueLoans],
        ["Total Outstanding",GHS(data.totalOutstanding)],
        ["",""],
        ["GL BALANCES",""],
        ["Cash in Hand (Unbanked)",GHS(data.cashInHand)],
        ["Main Operating Account",GHS(data.mainAccount)],
        ["Loan Receivables",GHS(data.loanReceivable)],
        ["Interest Income (Today)",GHS(data.interestIncome)],
        ["GL Balanced",data.glBalanced?"YES - BALANCED":"NO - CHECK ENTRIES"],
        ["",""],
        ["COLLECTOR BREAKDOWN",""],
        ...data.byCollector.map(c=>[c.name,GHS(c.total)+" ("+c.count+" collections)"]),
      ],
      summary:[["Total Deposits",GHS(data.totalDeposits)],["Total Collected",GHS(data.totalCollected)],["Cash in Hand",GHS(data.cashInHand)]],
    });
  };

  if(loading) return <div style={{padding:40,textAlign:"center",color:"var(--text-3)"}}>Loading end of day data...</div>;
  if(!data)   return null;

  const checks = [
    {label:"All transactions posted to GL",ok:data.glEntryCount>0,detail:data.glEntryCount+" GL entries today"},
    {label:"GL is balanced (Dr = Cr)",ok:data.glBalanced,detail:data.glBalanced?"Balanced":"OFF — check journal entries"},
    {label:"Cash in hand banked",ok:data.cashInHand===0,detail:data.cashInHand===0?"All cash banked":GHS(data.cashInHand)+" still unbanked"},
    {label:"No overdue loans",ok:data.overdueLoans===0,detail:data.overdueLoans===0?"All loans current":data.overdueLoans+" overdue loans"},
  ];
  const allClear = checks.every(c=>c.ok);

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">End of Day</div>
          <div className="page-desc">{today()} · {new Date().toLocaleTimeString()}</div>
        </div>
        <div className="page-header-right">
          <button className="btn btn-secondary" onClick={load}><RefreshCw size={14}/>Refresh</button>
          <button className="btn btn-primary" onClick={exportEOD}><FileText size={14}/>Export EOD Report</button>
        </div>
      </div>

      {/* EOD Status */}
      <div className="card" style={{marginBottom:20,borderLeft:`4px solid ${allClear?"var(--green)":"var(--yellow)"}`,background:allClear?"var(--green-bg)":"#fefce8",padding:20}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
          {allClear
            ?<CheckCircle size={28} style={{color:"var(--green)"}}/>
            :<AlertCircle size={28} style={{color:"#f59e0b"}}/>}
          <div>
            <div style={{fontWeight:800,fontSize:16,color:allClear?"var(--green)":"#92400e"}}>{allClear?"Day Closed Successfully":"Action Required Before Closing"}</div>
            <div style={{fontSize:12,color:"var(--text-3)",marginTop:2}}>Complete all checks below before closing the day</div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:10}}>
          {checks.map((c,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:10,background:c.ok?"#f0fdf4":"#fef9c3",border:`1px solid ${c.ok?"#86efac":"#fde68a"}`}}>
              {c.ok
                ?<CheckCircle size={18} style={{color:"var(--green)",flexShrink:0}}/>
                :<Clock size={18} style={{color:"#f59e0b",flexShrink:0}}/>}
              <div>
                <div style={{fontSize:13,fontWeight:700,color:c.ok?"#166534":"#92400e"}}>{c.label}</div>
                <div style={{fontSize:11,color:"var(--text-3)"}}>{c.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* KPI Grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:20}}>
        {[
          {label:"Today Deposits",value:GHS(data.totalDeposits),sub:data.txnCount+" transactions",color:"var(--green)",icon:TrendingUp},
          {label:"Today Collections",value:GHS(data.totalCollected),sub:data.collectionCount+" collections",color:"var(--brand)",icon:DollarSign},
          {label:"Cash in Hand",value:GHS(data.cashInHand),sub:data.cashInHand>0?"Needs banking":"All banked",color:data.cashInHand>0?"#f59e0b":"var(--green)",icon:DollarSign},
          {label:"Interest Income",value:GHS(data.interestIncome),sub:"Loan & HP interest",color:"var(--purple)",icon:TrendingUp},
        ].map(s=>(
          <div key={s.label} className="card" style={{padding:16,borderLeft:`4px solid ${s.color}`}}>
            <div style={{fontSize:11,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>{s.label}</div>
            <div style={{fontSize:20,fontWeight:900,color:s.color,marginBottom:2}}>{s.value}</div>
            <div style={{fontSize:11,color:"var(--text-3)"}}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>

        {/* Bank Cash */}
        <div className="card" style={{borderLeft:"4px solid #f59e0b"}}>
          <div style={{fontWeight:800,fontSize:14,marginBottom:4}}>💰 Bank Collected Cash</div>
          <div style={{fontSize:12,color:"var(--text-3)",marginBottom:14}}>
            Move <strong>{GHS(data.cashInHand)}</strong> from Cash in Hand → Main Operating Account
          </div>
          <div style={{display:"flex",gap:8,marginBottom:8}}>
            <input className="form-control" type="number" step="0.01" placeholder={`Amount (max ${GHS(data.cashInHand)})`} value={bankAmount} onChange={e=>setBankAmount(e.target.value)} style={{flex:1,fontWeight:700}}/>
          </div>
          <input className="form-control" placeholder="Narration e.g. EOD cash deposit to bank" value={bankNarr} onChange={e=>setBankNarr(e.target.value)} style={{marginBottom:10}}/>
          <button className="btn btn-primary" style={{width:"100%",background:"#d97706",border:"none"}} onClick={doBankCash} disabled={banking||!bankAmount||parseFloat(bankAmount)<=0}>
            {banking?"Banking...":"Bank Cash → Main Account"}
          </button>
          {bankMsg&&<div className={`alert ${bankMsg.startsWith("Error")?"alert-error":"alert-success"}`} style={{marginTop:10,marginBottom:0}}>{bankMsg}</div>}
          <div style={{marginTop:12,padding:"10px 12px",background:"var(--surface-2)",borderRadius:8,fontSize:11,color:"var(--text-3)"}}>
            <div style={{fontWeight:700,marginBottom:4}}>Journal Entry:</div>
            <div>Dr 1010 Main Operating Account</div>
            <div>Cr 1000 Cash in Hand</div>
          </div>
        </div>

        {/* Collector Summary */}
        <div className="card">
          <div style={{fontWeight:800,fontSize:14,marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
            <Users size={16}/>Collector Summary
          </div>
          {data.byCollector.length===0?(
            <div style={{textAlign:"center",padding:24,color:"var(--text-3)"}}>No collections today</div>
          ):(
            <div>
              {data.byCollector.map((c,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid var(--border)"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:13}}>{c.name}</div>
                    <div style={{fontSize:11,color:"var(--text-3)"}}>{c.count} collections · Savings: {GHS(c.types.savings||0)} · Loan: {GHS(c.types.loan||0)} · HP: {GHS(c.types.hp||0)}</div>
                  </div>
                  <div style={{fontWeight:800,color:"var(--green)",fontSize:14}}>{GHS(c.total)}</div>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0",fontWeight:800}}>
                <span>TOTAL</span>
                <span style={{color:"var(--green)"}}>{GHS(data.totalCollected)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* GL Status */}
      <div className="card">
        <div style={{fontWeight:800,fontSize:14,marginBottom:14}}>GL Status — Today</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
          {[
            {label:"Cash in Hand",code:"1000",value:data.cashInHand,color:"#f59e0b"},
            {label:"Main Operating",code:"1010",value:data.mainAccount,color:"var(--green)"},
            {label:"Loan Receivables",code:"1100",value:data.loanReceivable,color:"var(--brand)"},
            {label:"Interest Income",code:"4000",value:data.interestIncome,color:"var(--purple)"},
          ].map(s=>(
            <div key={s.code} style={{padding:"12px 14px",background:"var(--surface-2)",borderRadius:10,borderLeft:`3px solid ${s.color}`}}>
              <div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>{s.code} · {s.label}</div>
              <div style={{fontSize:16,fontWeight:800,color:s.color}}>{GHS(s.value)}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderRadius:10,background:data.glBalanced?"var(--green-bg)":"var(--red-bg)",border:`1px solid ${data.glBalanced?"#86efac":"#fca5a5"}`}}>
          <div>
            <div style={{fontWeight:700,color:data.glBalanced?"var(--green)":"var(--red)"}}>
              {data.glBalanced?"GL BALANCED — Debits = Credits":"GL NOT BALANCED — Check journal entries"}
            </div>
            <div style={{fontSize:12,color:"var(--text-3)",marginTop:2}}>Today: {data.glEntryCount} entries · Dr: {GHS(data.todayDr)} · Cr: {GHS(data.todayCr)}</div>
          </div>
          {data.glBalanced
            ?<CheckCircle size={24} style={{color:"var(--green)"}}/>
            :<AlertCircle size={24} style={{color:"var(--red)"}}/>}
        </div>
      </div>
    </div>
  );
}
