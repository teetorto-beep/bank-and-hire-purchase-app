import React, { useState, useEffect, useMemo } from 'react';
import { glDB, authDB, syncAllToGL } from '../../core/db';
import { exportCSV, exportReportPDF } from '../../core/export';
import { BookOpen, Plus, Download, FileText, Edit2, Trash2, Search, PenLine, Trash, RefreshCw } from 'lucide-react';
import Modal from '../../components/ui/Modal';

const GHS = (n) => 'GH₵ ' + Number(n||0).toLocaleString('en-GH',{minimumFractionDigits:2});
const TC = {asset:'#3b82f6',liability:'#ef4444',equity:'#8b5cf6',revenue:'#10b981',expense:'#f59e0b'};
const TB = {asset:'#eff6ff',liability:'#fef2f2',equity:'#f3e8ff',revenue:'#f0fdf4',expense:'#fef9c3'};
const TYPES = ['asset','liability','equity','revenue','expense'];
const TL = {asset:'Assets (1000-1999)',liability:'Liabilities (2000-2999)',equity:'Equity (3000-3999)',revenue:'Revenue / Income (4000-4999)',expense:'Expenses (5000-5999)'};
const CATS = {asset:['current_asset','fixed_asset','other_asset'],liability:['current_liability','long_term_liability'],equity:['equity'],revenue:['interest_income','fee_income','other_income'],expense:['interest_expense','operating_expense','provision','other_expense']};
const EMPTY_ACC = {code:'',name:'',type:'asset',category:'current_asset',description:'',status:'active'};
const EMPTY_LINE = {accountCode:'',entryType:'debit',amount:'',narration:''};
const MONTHS = ['All Months','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export default function GeneralLedger() {
  const user = authDB.currentUser();
  const [tab,setTab] = useState('coa');
  const [accounts,setAccounts] = useState([]);
  const [entries,setEntries] = useState([]);
  const [loading,setLoading] = useState(true);
  const [modal,setModal] = useState(false);
  const [editing,setEditing] = useState(null);
  const [form,setForm] = useState(EMPTY_ACC);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [search,setSearch] = useState('');
  const [typeFilter,setTypeFilter] = useState('all');
  const [selAccount,setSelAccount] = useState(null);
  const [year,setYear] = useState(new Date().getFullYear());
  const [month,setMonth] = useState(0);
  const [jNarration,setJNarration] = useState('');
  const [jLines,setJLines] = useState([{...EMPTY_LINE,entryType:'debit'},{...EMPTY_LINE,entryType:'credit'}]);
  const [jSaving,setJSaving] = useState(false);
  const [jError,setJError] = useState('');
  const [jSuccess,setJSuccess] = useState('');
  const [syncing,setSyncing] = useState(false);
  const [syncMsg,setSyncMsg] = useState('');
  const [bankAmount,setBankAmount] = useState('');
  const [bankNarr,setBankNarr] = useState('');
  const [banking,setBanking] = useState(false);
  const [bankMsg,setBankMsg] = useState('');

  const f = (k) => (e) => setForm(p=>({...p,[k]:e.target.value}));
  const setLine = (i,k,v) => setJLines(p=>p.map((l,idx)=>idx===i?{...l,[k]:v}:l));
  const addLine = (t) => setJLines(p=>[...p,{...EMPTY_LINE,entryType:t}]);
  const removeLine = (i) => setJLines(p=>p.filter((_,idx)=>idx!==i));
  const jTotalDr = jLines.filter(l=>l.entryType==='debit').reduce((s,l)=>s+(parseFloat(l.amount)||0),0);
  const jTotalCr = jLines.filter(l=>l.entryType==='credit').reduce((s,l)=>s+(parseFloat(l.amount)||0),0);
  const jBalanced = Math.abs(jTotalDr-jTotalCr)<0.01 && jTotalDr>0;

  const load = async () => {
    setLoading(true);
    const [a,e] = await Promise.all([glDB.getAccounts(),glDB.getEntries()]);
    setAccounts(a.data||[]);
    setEntries(e.data||[]);
    setLoading(false);
  };
  useEffect(()=>{load();},[]);

  const doSync = async () => {
    setSyncing(true); setSyncMsg('');
    const { results, error } = await syncAllToGL(user?.name || 'admin');
    if (error) { setSyncMsg('Error: ' + error.message); }
    else { setSyncMsg(`Synced: ${results.transactions} transactions, ${results.loans} loans, ${results.collections} collections to GL.${results.errors?.length ? ' Errors: ' + results.errors.slice(0,2).join(', ') : ''}`); }
    setSyncing(false);
    load();
  };

  // Bank collected cash: move from Cash in Hand → Main Operating Account
  const doBankCash = async () => {
    const amt = parseFloat(bankAmount);
    if (!amt || amt <= 0) { setBankMsg('Enter a valid amount'); return; }
    setBanking(true); setBankMsg('');
    const narr = bankNarr.trim() || `Cash banking — ${new Date().toLocaleDateString()}`;
    const { error } = await glDB.postJournal([
      { accountCode: '1010', entryType: 'debit',  amount: amt, narration: narr }, // Main Operating Account ↑
      { accountCode: '1000', entryType: 'credit', amount: amt, narration: narr }, // Cash in Hand ↓
    ], narr, 'cash_banking', null, null, user?.name || 'admin');
    if (error) { setBankMsg('Error: ' + error.message); }
    else { setBankMsg(`GH₵ ${amt.toLocaleString('en-GH', {minimumFractionDigits:2})} banked successfully.`); setBankAmount(''); setBankNarr(''); load(); }
    setBanking(false);
  };

  const saveAccount = async (ev) => {
    ev.preventDefault();
    if(!form.code||!form.name){setError('Code and name required');return;}
    setSaving(true);setError('');
    if(editing){await glDB.updateAccount(editing.id,form);}
    else{const{error:err}=await glDB.addAccount(form);if(err){setError(err.message);setSaving(false);return;}}
    setModal(false);setSaving(false);load();
  };

  const doDelete = async (acc) => {
    if(!window.confirm('Delete '+acc.code+' - '+acc.name+'?'))return;
    const{error:err}=await glDB.deleteAccount(acc.id);
    if(err)alert(err.message);else load();
  };

  const postJournal = async () => {
    setJError('');setJSuccess('');
    if(!jNarration.trim()){setJError('Narration is required');return;}
    for(const l of jLines){
      if(!l.accountCode){setJError('All lines must have an account');return;}
      if(!l.amount||parseFloat(l.amount)<=0){setJError('All amounts must be > 0');return;}
    }
    if(!jBalanced){setJError('Journal not balanced — Dr: '+GHS(jTotalDr)+' Cr: '+GHS(jTotalCr));return;}
    setJSaving(true);
    const lines = jLines.map(l=>({accountCode:l.accountCode,entryType:l.entryType,amount:parseFloat(l.amount),narration:l.narration||jNarration}));
    const{error:err}=await glDB.postJournal(lines,jNarration,'manual',null,null,user?.name||'admin');
    if(err){setJError(err.message);setJSaving(false);return;}
    setJSuccess('Journal entry posted successfully!');
    setJLines([{...EMPTY_LINE,entryType:'debit'},{...EMPTY_LINE,entryType:'credit'}]);
    setJNarration('');
    setJSaving(false);
    load();
  };

  const filtered = useMemo(()=>accounts.filter(a=>{
    const mt=typeFilter==='all'||a.type===typeFilter;
    const mq=!search||a.name.toLowerCase().includes(search.toLowerCase())||a.code.includes(search);
    return mt&&mq;
  }),[accounts,typeFilter,search]);

  const grouped = useMemo(()=>{const g={};TYPES.forEach(t=>{g[t]=filtered.filter(a=>a.type===t);});return g;},[filtered]);

  const accEntries = useMemo(()=>{
    if(!selAccount)return[];
    return entries.filter(e=>e.gl_account_id===selAccount.id&&(!year||e.period_year===year)&&(!month||e.period_month===month));
  },[entries,selAccount,year,month]);

  const lDr = accEntries.filter(e=>e.entry_type==='debit').reduce((s,e)=>s+Number(e.amount),0);
  const lCr = accEntries.filter(e=>e.entry_type==='credit').reduce((s,e)=>s+Number(e.amount),0);

  const pnlE = useMemo(()=>entries.filter(e=>{
    const acc=accounts.find(a=>a.id===e.gl_account_id);
    if(!acc)return false;
    return(acc.type==='revenue'||acc.type==='expense')&&(!year||e.period_year===year)&&(!month||e.period_month===month);
  }),[entries,accounts,year,month]);

  const revByAcc = useMemo(()=>{
    const m={};
    pnlE.filter(e=>accounts.find(a=>a.id===e.gl_account_id)?.type==='revenue').forEach(e=>{
      if(!m[e.gl_account_code])m[e.gl_account_code]={name:e.gl_account_name,total:0};
      m[e.gl_account_code].total+=e.entry_type==='credit'?Number(e.amount):-Number(e.amount);
    });
    return Object.entries(m).map(([code,v])=>({code,...v})).sort((a,b)=>a.code.localeCompare(b.code));
  },[pnlE,accounts]);

  const expByAcc = useMemo(()=>{
    const m={};
    pnlE.filter(e=>accounts.find(a=>a.id===e.gl_account_id)?.type==='expense').forEach(e=>{
      if(!m[e.gl_account_code])m[e.gl_account_code]={name:e.gl_account_name,total:0};
      m[e.gl_account_code].total+=e.entry_type==='debit'?Number(e.amount):-Number(e.amount);
    });
    return Object.entries(m).map(([code,v])=>({code,...v})).sort((a,b)=>a.code.localeCompare(b.code));
  },[pnlE,accounts]);

  const totRev = revByAcc.reduce((s,r)=>s+r.total,0);
  const totExp = expByAcc.reduce((s,r)=>s+r.total,0);
  const netProfit = totRev-totExp;

  // ── P&L grouped by category ────────────────────────────────────────────────
  const revGroups = useMemo(()=>{
    const g = {};
    revByAcc.forEach(r=>{
      const acc = accounts.find(a=>a.code===r.code);
      const cat = acc?.category || 'other_income';
      if(!g[cat]) g[cat] = {label: cat.replace(/_/g,' '), items:[], total:0};
      g[cat].items.push(r);
      g[cat].total += r.total;
    });
    return g;
  },[revByAcc,accounts]);

  const expGroups = useMemo(()=>{
    const g = {};
    expByAcc.forEach(r=>{
      const acc = accounts.find(a=>a.code===r.code);
      const cat = acc?.category || 'other_expense';
      if(!g[cat]) g[cat] = {label: cat.replace(/_/g,' '), items:[], total:0};
      g[cat].items.push(r);
      g[cat].total += r.total;
    });
    return g;
  },[expByAcc,accounts]);

  const grossProfit = (revGroups['interest_income']?.total||0) - (revGroups['interest_expense']?.total||0) - (expGroups['interest_expense']?.total||0);
  const operatingProfit = totRev - (expGroups['operating_expense']?.total||0) - (expGroups['interest_expense']?.total||0);
  const profitMargin = totRev > 0 ? ((netProfit/totRev)*100).toFixed(1) : '0.0';

  const trialBal = useMemo(()=>{
    const m={};
    entries.filter(e=>(!year||e.period_year===year)&&(!month||e.period_month===month)).forEach(e=>{
      if(!m[e.gl_account_code])m[e.gl_account_code]={code:e.gl_account_code,name:e.gl_account_name,dr:0,cr:0};
      if(e.entry_type==='debit')m[e.gl_account_code].dr+=Number(e.amount);
      else m[e.gl_account_code].cr+=Number(e.amount);
    });
    return Object.values(m).sort((a,b)=>a.code.localeCompare(b.code));
  },[entries,year,month]);

  const tbDr = trialBal.reduce((s,r)=>s+r.dr,0);
  const tbCr = trialBal.reduce((s,r)=>s+r.cr,0);
  return (<div className="fade-in"><div className="page-header"><div className="page-header-left"><div className="page-title">General Ledger</div><div className="page-desc">Chart of Accounts - Ledger - P&L - Trial Balance</div></div><div className="page-header-right">{tab==="coa"&&<button className="btn btn-primary" onClick={()=>{setEditing(null);setForm(EMPTY_ACC);setError("");setModal(true);}}><Plus size={15}/>Add Account</button>}{tab==="journal"&&<button className="btn btn-primary" onClick={postJournal} disabled={jSaving||!jBalanced}><PenLine size={15}/>{jSaving?"Posting...":"Post Journal Entry"}</button>}<button className="btn btn-secondary" onClick={doSync} disabled={syncing} style={{marginLeft:8}}><RefreshCw size={14}/>{syncing?"Syncing...":"Sync to GL"}</button></div></div>{syncMsg&&<div className={`alert ${syncMsg.startsWith('Error')?'alert-error':'alert-success'}`} style={{marginBottom:12}}>{syncMsg}<button onClick={()=>setSyncMsg('')} style={{float:'right',background:'none',border:'none',cursor:'pointer',fontSize:16}}>x</button></div>}
      <div className="card" style={{padding:"12px 16px",marginBottom:16,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}><div style={{display:"flex",alignItems:"center",gap:8}}><label style={{fontSize:12,fontWeight:700,color:"var(--text-3)"}}>YEAR</label><select className="form-control" style={{width:100}} value={year} onChange={e=>setYear(Number(e.target.value))}>{[2023,2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}</select></div><div style={{display:"flex",alignItems:"center",gap:8}}><label style={{fontSize:12,fontWeight:700,color:"var(--text-3)"}}>MONTH</label><select className="form-control" style={{width:130}} value={month} onChange={e=>setMonth(Number(e.target.value))}>{MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}</select></div><div style={{fontSize:12,color:"var(--text-3)",marginLeft:"auto"}}>{accounts.length} accounts - {entries.length} entries</div></div>
      <div className="tabs" style={{marginBottom:20}}>{[{k:"coa",l:"Chart of Accounts"},{k:"journal",l:"Post Journal"},{k:"ledger",l:"Ledger"},{k:"pnl",l:"P and L"},{k:"trial",l:"Trial Balance"}].map(t=>(<div key={t.k} className={`tab ${tab===t.k?"active":""}`} onClick={()=>setTab(t.k)}>{t.l}</div>))}</div>
      {tab==="coa"&&(<div>
        <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
          <div className="search-box" style={{flex:1,minWidth:200}}><Search size={14}/><input className="form-control" placeholder="Search code or name..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
          <select className="form-control" style={{width:200}} value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="all">All Types</option>{TYPES.map(t=><option key={t} value={t}>{TL[t]}</option>)}</select>
          <button className="btn btn-secondary btn-sm" onClick={()=>exportCSV(accounts.map(a=>({Code:a.code,Name:a.name,Type:a.type,Balance:a.balance})),"chart-of-accounts")}><Download size={13}/>CSV</button>
        </div>
        {loading?<div className="table-empty">Loading...</div>:TYPES.filter(t=>grouped[t]?.length>0).map(t=>(
          <div key={t} className="card" style={{marginBottom:16}}>
            <div className="card-header">
              <div style={{display:"flex",alignItems:"center",gap:10}}><span style={{padding:"3px 14px",borderRadius:20,background:TB[t],color:TC[t],fontSize:12,fontWeight:700}}>{TL[t]}</span><span style={{fontSize:12,color:"var(--text-3)"}}>{grouped[t].length} accounts</span></div>
              <div style={{fontWeight:800,color:TC[t]}}>{GHS(grouped[t].reduce((s,a)=>s+Number(a.balance||0),0))}</div>
            </div>
            <div className="table-wrap"><table>
              <thead><tr><th>Code</th><th>Account Name</th><th>Category</th><th style={{textAlign:"right"}}>Balance</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>{grouped[t].map(a=>(
                <tr key={a.id}>
                  <td className="font-mono" style={{fontWeight:800,color:TC[a.type]}}>{a.code}</td>
                  <td><div style={{fontWeight:600}}>{a.name}</div>{a.description&&<div style={{fontSize:11,color:"var(--text-3)"}}>{a.description}</div>}</td>
                  <td style={{fontSize:12,color:"var(--text-3)",textTransform:"capitalize"}}>{(a.category||"").replace(/_/g," ")}</td>
                  <td className="font-mono" style={{textAlign:"right",fontWeight:700,color:Number(a.balance)>=0?"var(--green)":"var(--red)"}}>{GHS(a.balance)}</td>
                  <td><span className={`badge badge-${a.status==="active"?"green":"gray"}`}>{a.status}</span></td>
                  <td><div style={{display:"flex",gap:4}}>
                    <button className="btn btn-ghost btn-sm btn-icon" title="View Ledger" onClick={()=>{setSelAccount(a);setTab("ledger");}}><BookOpen size={13}/></button>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={()=>{setEditing(a);setForm({code:a.code,name:a.name,type:a.type,category:a.category,description:a.description||"",status:a.status});setError("");setModal(true);}}><Edit2 size={13}/></button>
                    {!a.is_system&&<button className="btn btn-danger btn-sm btn-icon" onClick={()=>doDelete(a)}><Trash2 size={13}/></button>}
                  </div></td>
                </tr>
              ))}</tbody>
            </table></div>
          </div>
        ))}
      </div>)}
      {tab==="journal"&&(
        <div style={{maxWidth:900,margin:"0 auto"}}>
          {jError&&<div className="alert alert-error" style={{marginBottom:16}}>{jError}</div>}
          {jSuccess&&<div className="alert alert-success" style={{marginBottom:16}}>{jSuccess}</div>}

          {/* ── Quick Action: Bank Collected Cash ── */}
          <div className="card" style={{marginBottom:20,borderLeft:'4px solid #f59e0b',background:'#fefce8'}}>
            <div style={{display:'flex',alignItems:'flex-start',gap:16,flexWrap:'wrap'}}>
              <div style={{flex:1,minWidth:200}}>
                <div style={{fontWeight:800,fontSize:14,color:'#92400e',marginBottom:4}}>💰 Bank Collected Cash</div>
                <div style={{fontSize:12,color:'#78350f',lineHeight:1.5,marginBottom:12}}>
                  Move cash collected by field collectors from <strong>1000 Cash in Hand</strong> into <strong>1010 Main Operating Account</strong> when deposited at the bank.
                </div>
                <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                  <input
                    className="form-control"
                    type="number" step="0.01" min="0.01"
                    placeholder="Amount to bank (GH₵)"
                    value={bankAmount}
                    onChange={e=>setBankAmount(e.target.value)}
                    style={{width:200,fontWeight:700}}
                  />
                  <input
                    className="form-control"
                    placeholder="Narration (optional)"
                    value={bankNarr}
                    onChange={e=>setBankNarr(e.target.value)}
                    style={{flex:1,minWidth:180}}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={doBankCash}
                    disabled={banking||!bankAmount||parseFloat(bankAmount)<=0}
                    style={{background:'#d97706',border:'none',whiteSpace:'nowrap'}}
                  >
                    {banking?'Banking...':'Bank Cash →'}
                  </button>
                </div>
                {bankMsg&&(
                  <div className={`alert ${bankMsg.startsWith('Error')?'alert-error':'alert-success'}`} style={{marginTop:10,marginBottom:0}}>
                    {bankMsg}
                  </div>
                )}
              </div>
              <div style={{background:'#fef3c7',borderRadius:10,padding:'12px 16px',fontSize:12,color:'#92400e',minWidth:220}}>
                <div style={{fontWeight:700,marginBottom:6}}>Journal Entry Created:</div>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <span>Dr 1010 Main Operating</span><span style={{color:'var(--green)',fontWeight:700}}>+Amount</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between'}}>
                  <span>Cr 1000 Cash in Hand</span><span style={{color:'var(--red)',fontWeight:700}}>-Amount</span>
                </div>
              </div>
            </div>
          </div>
          <div className="card" style={{marginBottom:16}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".05em"}}>Journal Narration</div>
            <input className="form-control" placeholder="e.g. Travelling expenses for field visit - April 2026" value={jNarration} onChange={e=>setJNarration(e.target.value)} style={{fontSize:15}}/>
            <div className="form-hint">This description applies to the whole journal entry. Debits must equal Credits.</div>
          </div>
          <div className="card" style={{marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontWeight:700,fontSize:13,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".05em"}}>Journal Lines</div>
              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-ghost btn-sm" style={{color:"var(--green)",border:"1px solid var(--green)"}} onClick={()=>addLine("debit")}>+ Debit Line</button>
                <button className="btn btn-ghost btn-sm" style={{color:"var(--red)",border:"1px solid var(--red)"}} onClick={()=>addLine("credit")}>+ Credit Line</button>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th style={{width:36}}>#</th>
                  <th>Account</th>
                  <th style={{width:110,textAlign:"center"}}>Dr / Cr</th>
                  <th style={{width:160,textAlign:"right"}}>Amount (GH&#8373;)</th>
                  <th>Line Narration</th>
                  <th style={{width:36}}></th>
                </tr></thead>
                <tbody>
                  {jLines.map((line,i)=>(
                    <tr key={i} style={{background:line.entryType==="debit"?"#f0fdf4":"#fef2f2",borderBottom:"1px solid var(--border)"}}>
                      <td style={{padding:"8px 10px",fontSize:12,color:"var(--text-3)",fontWeight:700}}>{i+1}</td>
                      <td style={{padding:"6px 8px"}}>
                        <select className="form-control" style={{fontSize:13,minWidth:220}} value={line.accountCode} onChange={e=>setLine(i,"accountCode",e.target.value)}>
                          <option value="">-- Select Account --</option>
                          {TYPES.map(t=>(
                            <optgroup key={t} label={TL[t]}>
                              {accounts.filter(a=>a.type===t&&a.status==="active").map(a=>(
                                <option key={a.id} value={a.code}>{a.code} -- {a.name}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                      <td style={{padding:"6px 8px",textAlign:"center"}}>
                        <select className="form-control" style={{fontSize:13,width:100,fontWeight:700,color:line.entryType==="debit"?"var(--green)":"var(--red)"}} value={line.entryType} onChange={e=>setLine(i,"entryType",e.target.value)}>
                          <option value="debit">DEBIT</option>
                          <option value="credit">CREDIT</option>
                        </select>
                      </td>
                      <td style={{padding:"6px 8px"}}>
                        <input className="form-control font-mono" type="number" step="0.01" min="0.01" style={{textAlign:"right",fontSize:14,fontWeight:700}} placeholder="0.00" value={line.amount} onChange={e=>setLine(i,"amount",e.target.value)}/>
                      </td>
                      <td style={{padding:"6px 8px"}}>
                        <input className="form-control" style={{fontSize:13}} placeholder="Optional..." value={line.narration} onChange={e=>setLine(i,"narration",e.target.value)}/>
                      </td>
                      <td style={{padding:"6px 4px",textAlign:"center"}}>
                        {jLines.length>2&&<button className="btn btn-ghost btn-sm btn-icon" style={{color:"var(--red)"}} onClick={()=>removeLine(i)}><Trash size={13}/></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{background:"var(--surface-2)",fontWeight:800}}>
                    <td colSpan={3} style={{padding:"10px",textAlign:"right",fontSize:13}}>TOTALS</td>
                    <td style={{padding:"10px 8px",textAlign:"right"}}>
                      <div style={{fontSize:12,color:"var(--green)"}}>Dr: {GHS(jTotalDr)}</div>
                      <div style={{fontSize:12,color:"var(--red)"}}>Cr: {GHS(jTotalCr)}</div>
                    </td>
                    <td colSpan={2} style={{padding:"10px 8px"}}>
                      {jBalanced
                        ?<span style={{color:"var(--green)",fontWeight:800}}>BALANCED</span>
                        :<span style={{color:"var(--red)",fontWeight:800}}>OFF BY {GHS(Math.abs(jTotalDr-jTotalCr))}</span>}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button className="btn btn-secondary" onClick={()=>{setJLines([{...EMPTY_LINE,entryType:"debit"},{...EMPTY_LINE,entryType:"credit"}]);setJNarration("");setJError("");setJSuccess("");}}>Clear</button>
            <button className="btn btn-primary" style={{minWidth:180,fontSize:15,padding:"12px 24px"}} onClick={postJournal} disabled={jSaving||!jBalanced}>
              <PenLine size={15}/>{jSaving?"Posting...":"Post Journal Entry"}
            </button>
          </div>
        </div>
      )}
      {tab==="ledger"&&(
        <div>
          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
            <select className="form-control" style={{flex:1,minWidth:260}} value={selAccount?.id||""} onChange={e=>{const a=accounts.find(x=>x.id===e.target.value);setSelAccount(a||null);}}>
              <option value="">-- Select Account --</option>
              {TYPES.map(t=>(<optgroup key={t} label={TL[t]}>{accounts.filter(a=>a.type===t).map(a=><option key={a.id} value={a.id}>{a.code} -- {a.name}</option>)}</optgroup>))}
            </select>
            {selAccount&&<button className="btn btn-secondary btn-sm" onClick={()=>exportCSV(accEntries.map(e=>({Date:new Date(e.created_at).toLocaleString(),Journal:e.journal_ref,Narration:e.narration,Type:e.entry_type,Amount:e.amount,Source:e.source_type||"manual"})),"ledger-"+selAccount.code)}><Download size={13}/>Export</button>}
          </div>
          {selAccount?(
            <div className="card">
              <div className="card-header">
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span className="font-mono" style={{fontWeight:800,fontSize:16,color:TC[selAccount.type]}}>{selAccount.code}</span>
                    <span style={{fontWeight:700,fontSize:15}}>{selAccount.name}</span>
                    <span style={{padding:"2px 10px",borderRadius:20,background:TB[selAccount.type],color:TC[selAccount.type],fontSize:11,fontWeight:700,textTransform:"capitalize"}}>{selAccount.type}</span>
                  </div>
                  <div style={{fontSize:12,color:"var(--text-3)",marginTop:4}}>{accEntries.length} entries - Dr: {GHS(lDr)} - Cr: {GHS(lCr)}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:11,color:"var(--text-3)",fontWeight:600,textTransform:"uppercase"}}>Running Balance</div>
                  <div style={{fontSize:20,fontWeight:900,color:TC[selAccount.type]}}>{GHS(selAccount.balance)}</div>
                </div>
              </div>
              <div className="table-wrap"><table>
                <thead><tr><th>Date</th><th>Journal Ref</th><th>Narration</th><th>Source</th><th style={{textAlign:"right",color:"var(--green)"}}>Debit</th><th style={{textAlign:"right",color:"var(--red)"}}>Credit</th></tr></thead>
                <tbody>
                  {accEntries.length===0?<tr><td colSpan={6} className="table-empty">No entries in selected period</td></tr>:accEntries.map(e=>(
                    <tr key={e.id}>
                      <td style={{fontSize:12,whiteSpace:"nowrap",color:"var(--text-3)"}}>{new Date(e.created_at).toLocaleString()}</td>
                      <td className="font-mono" style={{fontSize:11}}>{e.journal_ref}</td>
                      <td style={{fontSize:12}}>{e.narration}</td>
                      <td><span style={{fontSize:11,padding:"1px 8px",borderRadius:10,background:"var(--surface-2)",color:"var(--text-3)"}}>{e.source_type||"manual"}</span></td>
                      <td className="font-mono" style={{textAlign:"right",color:"var(--green)",fontWeight:e.entry_type==="debit"?700:400}}>{e.entry_type==="debit"?GHS(e.amount):"--"}</td>
                      <td className="font-mono" style={{textAlign:"right",color:"var(--red)",fontWeight:e.entry_type==="credit"?700:400}}>{e.entry_type==="credit"?GHS(e.amount):"--"}</td>
                    </tr>
                  ))}
                  <tr style={{background:"var(--surface-2)",fontWeight:800}}>
                    <td colSpan={4} style={{textAlign:"right",fontSize:12}}>TOTALS</td>
                    <td className="font-mono" style={{textAlign:"right",color:"var(--green)"}}>{GHS(lDr)}</td>
                    <td className="font-mono" style={{textAlign:"right",color:"var(--red)"}}>{GHS(lCr)}</td>
                  </tr>
                </tbody>
              </table></div>
            </div>
          ):(
            <div className="card" style={{textAlign:"center",padding:48,color:"var(--text-3)"}}>
              <BookOpen size={40} style={{margin:"0 auto 12px",display:"block",opacity:.3}}/>
              <div style={{fontWeight:700,marginBottom:4}}>Select an account to view its ledger</div>
            </div>
          )}
        </div>
      )}
      {tab==="pnl"&&(
        <div>
          {/* KPI Summary Row */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:20}}>
            {[
              {label:"Total Revenue",value:GHS(totRev),color:"var(--green)",sub:`${revByAcc.length} income accounts`},
              {label:"Total Expenses",value:GHS(totExp),color:"var(--red)",sub:`${expByAcc.length} expense accounts`},
              {label:"Gross Profit",value:GHS(Math.abs(grossProfit)),color:grossProfit>=0?"var(--green)":"var(--red)",sub:grossProfit>=0?"Profit":"Loss"},
              {label:"Operating Profit",value:GHS(Math.abs(operatingProfit)),color:operatingProfit>=0?"var(--green)":"var(--red)",sub:operatingProfit>=0?"Profit":"Loss"},
              {label:netProfit>=0?"Net Profit":"Net Loss",value:GHS(Math.abs(netProfit)),color:netProfit>=0?"var(--green)":"var(--red)",sub:`Margin: ${profitMargin}%`},
            ].map(s=>(
              <div key={s.label} className="card" style={{padding:16,borderLeft:`4px solid ${s.color}`}}>
                <div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>{s.label}</div>
                <div style={{fontSize:18,fontWeight:900,color:s.color,marginBottom:2}}>{s.value}</div>
                <div style={{fontSize:11,color:"var(--text-3)"}}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Export buttons */}
          <div style={{display:"flex",gap:8,marginBottom:16,justifyContent:"flex-end"}}>
            <button className="btn btn-secondary btn-sm" onClick={()=>exportCSV([
              ...revByAcc.map(r=>({Section:'Revenue',Code:r.code,Account:r.name,Amount:r.total})),
              ...expByAcc.map(r=>({Section:'Expense',Code:r.code,Account:r.name,Amount:r.total})),
              {Section:'',Code:'',Account:'NET PROFIT / LOSS',Amount:netProfit},
            ],"profit-loss-"+year+(month?"-"+MONTHS[month]:""))}><Download size={13}/>CSV</button>
            <button className="btn btn-primary btn-sm" onClick={()=>exportReportPDF({
              title:"Profit & Loss Statement",
              subtitle:`Period: ${year}${month?" - "+MONTHS[month]:""} | Net ${netProfit>=0?"Profit":"Loss"}: GHC ${Math.abs(netProfit).toLocaleString("en-GH",{minimumFractionDigits:2})}`,
              columns:["Section","Code","Account","Amount (GHC)"],
              rows:[
                ...revByAcc.map(r=>["Revenue",r.code,r.name,"GHC "+r.total.toLocaleString("en-GH",{minimumFractionDigits:2})]),
                ["","","TOTAL REVENUE","GHC "+totRev.toLocaleString("en-GH",{minimumFractionDigits:2})],
                ...expByAcc.map(r=>["Expense",r.code,r.name,"GHC "+r.total.toLocaleString("en-GH",{minimumFractionDigits:2})]),
                ["","","TOTAL EXPENSES","GHC "+totExp.toLocaleString("en-GH",{minimumFractionDigits:2})],
                ["","","NET "+(netProfit>=0?"PROFIT":"LOSS"),"GHC "+Math.abs(netProfit).toLocaleString("en-GH",{minimumFractionDigits:2})],
              ],
              summary:[["Profit Margin",profitMargin+"%"],["Revenue Accounts",revByAcc.length],["Expense Accounts",expByAcc.length]],
            })}><FileText size={13}/>PDF</button>
          </div>

          {/* Income Statement Layout */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>

            {/* Revenue Section */}
            <div className="card">
              <div className="card-header">
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{width:10,height:10,borderRadius:"50%",background:"var(--green)",display:"inline-block"}}/>
                  <div className="card-title" style={{color:"var(--green)"}}>Revenue / Income</div>
                </div>
                <div style={{fontWeight:900,fontSize:16,color:"var(--green)"}}>{GHS(totRev)}</div>
              </div>
              {revByAcc.length===0?(
                <div className="table-empty">No revenue entries in this period</div>
              ):(
                <div>
                  {Object.entries(revGroups).map(([cat,grp])=>(
                    <div key={cat} style={{marginBottom:12}}>
                      <div style={{fontSize:11,fontWeight:700,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".06em",padding:"6px 16px",background:"var(--surface-2)",borderBottom:"1px solid var(--border)"}}>{grp.label}</div>
                      {grp.items.map(r=>(
                        <div key={r.code} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 16px",borderBottom:"1px solid var(--border)"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span className="font-mono" style={{fontSize:11,color:"var(--green)",fontWeight:700,minWidth:36}}>{r.code}</span>
                            <span style={{fontSize:13}}>{r.name}</span>
                          </div>
                          <span className="font-mono" style={{fontWeight:700,color:"var(--green)"}}>{GHS(r.total)}</span>
                        </div>
                      ))}
                      <div style={{display:"flex",justifyContent:"space-between",padding:"6px 16px",background:"#f0fdf4",borderBottom:"1px solid var(--border)"}}>
                        <span style={{fontSize:12,fontWeight:700,color:"var(--green)",textTransform:"uppercase"}}>Subtotal</span>
                        <span className="font-mono" style={{fontWeight:800,color:"var(--green)"}}>{GHS(grp.total)}</span>
                      </div>
                    </div>
                  ))}
                  <div style={{display:"flex",justifyContent:"space-between",padding:"12px 16px",background:"var(--green-bg)",borderTop:"2px solid var(--green)"}}>
                    <span style={{fontWeight:800,fontSize:13,color:"var(--green)"}}>TOTAL REVENUE</span>
                    <span className="font-mono" style={{fontWeight:900,fontSize:15,color:"var(--green)"}}>{GHS(totRev)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Expenses Section */}
            <div className="card">
              <div className="card-header">
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{width:10,height:10,borderRadius:"50%",background:"var(--red)",display:"inline-block"}}/>
                  <div className="card-title" style={{color:"var(--red)"}}>Expenses</div>
                </div>
                <div style={{fontWeight:900,fontSize:16,color:"var(--red)"}}>{GHS(totExp)}</div>
              </div>
              {expByAcc.length===0?(
                <div className="table-empty">No expense entries in this period</div>
              ):(
                <div>
                  {Object.entries(expGroups).map(([cat,grp])=>(
                    <div key={cat} style={{marginBottom:12}}>
                      <div style={{fontSize:11,fontWeight:700,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".06em",padding:"6px 16px",background:"var(--surface-2)",borderBottom:"1px solid var(--border)"}}>{grp.label}</div>
                      {grp.items.map(r=>(
                        <div key={r.code} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 16px",borderBottom:"1px solid var(--border)"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span className="font-mono" style={{fontSize:11,color:"var(--red)",fontWeight:700,minWidth:36}}>{r.code}</span>
                            <span style={{fontSize:13}}>{r.name}</span>
                          </div>
                          <span className="font-mono" style={{fontWeight:700,color:"var(--red)"}}>{GHS(r.total)}</span>
                        </div>
                      ))}
                      <div style={{display:"flex",justifyContent:"space-between",padding:"6px 16px",background:"#fef2f2",borderBottom:"1px solid var(--border)"}}>
                        <span style={{fontSize:12,fontWeight:700,color:"var(--red)",textTransform:"uppercase"}}>Subtotal</span>
                        <span className="font-mono" style={{fontWeight:800,color:"var(--red)"}}>{GHS(grp.total)}</span>
                      </div>
                    </div>
                  ))}
                  <div style={{display:"flex",justifyContent:"space-between",padding:"12px 16px",background:"var(--red-bg)",borderTop:"2px solid var(--red)"}}>
                    <span style={{fontWeight:800,fontSize:13,color:"var(--red)"}}>TOTAL EXPENSES</span>
                    <span className="font-mono" style={{fontWeight:900,fontSize:15,color:"var(--red)"}}>{GHS(totExp)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom summary: Gross → Operating → Net */}
          <div className="card" style={{padding:0,overflow:"hidden"}}>
            {[
              {label:"Gross Profit",desc:"Interest Income minus Interest Expense",value:grossProfit},
              {label:"Operating Profit",desc:"Revenue minus Operating & Interest Expenses",value:operatingProfit},
              {label:netProfit>=0?"NET PROFIT":"NET LOSS",desc:`Profit Margin: ${profitMargin}% · Total Revenue: ${GHS(totRev)}`,value:netProfit,big:true},
            ].map((row,i)=>(
              <div key={row.label} style={{
                display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:row.big?"20px 24px":"14px 24px",
                background:row.big?(row.value>=0?"var(--green-bg)":"var(--red-bg)"):(i%2===0?"var(--surface)":"var(--surface-2)"),
                borderBottom:i<2?"1px solid var(--border)":"none",
                borderLeft:`4px solid ${row.value>=0?"var(--green)":"var(--red)"}`,
              }}>
                <div>
                  <div style={{fontWeight:row.big?900:700,fontSize:row.big?15:13,color:row.value>=0?"var(--green)":"var(--red)"}}>{row.label}</div>
                  <div style={{fontSize:11,color:"var(--text-3)",marginTop:2}}>{row.desc}</div>
                </div>
                <div style={{fontWeight:900,fontSize:row.big?26:18,color:row.value>=0?"var(--green)":"var(--red)"}}>
                  {row.value<0&&"-"}{GHS(Math.abs(row.value))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab==="trial"&&(
        <div className="card">
          <div className="card-header">
            <div><div className="card-title">Trial Balance</div><div className="card-subtitle">{trialBal.length} accounts - {year}{month?" - "+MONTHS[month]:""}</div></div>
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-secondary btn-sm" onClick={()=>exportCSV(trialBal.map(r=>({Code:r.code,Account:r.name,Debits:r.dr,Credits:r.cr,Net:r.dr-r.cr})),"trial-balance")}><Download size={13}/>CSV</button>
              <button className="btn btn-primary btn-sm" onClick={()=>exportReportPDF({title:"Trial Balance",subtitle:"Period: "+year+(month?" - "+MONTHS[month]:""),columns:["Code","Account","Debits (GHC)","Credits (GHC)","Net (GHC)"],rows:trialBal.map(r=>[r.code,r.name,"GHC "+r.dr.toLocaleString("en-GH",{minimumFractionDigits:2}),"GHC "+r.cr.toLocaleString("en-GH",{minimumFractionDigits:2}),"GHC "+Math.abs(r.dr-r.cr).toLocaleString("en-GH",{minimumFractionDigits:2})]),summary:[["Total Debits","GHC "+tbDr.toLocaleString("en-GH",{minimumFractionDigits:2})],["Total Credits","GHC "+tbCr.toLocaleString("en-GH",{minimumFractionDigits:2})],["Balanced",Math.abs(tbDr-tbCr)<0.01?"YES":"NO"]]})}><FileText size={13}/>PDF</button>
            </div>
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th>Code</th><th>Account Name</th><th style={{textAlign:"right",color:"var(--green)"}}>Debits</th><th style={{textAlign:"right",color:"var(--red)"}}>Credits</th><th style={{textAlign:"right"}}>Net</th></tr></thead>
            <tbody>
              {trialBal.length===0?<tr><td colSpan={5} className="table-empty">No entries in selected period</td></tr>:trialBal.map(r=>{
                const net=r.dr-r.cr;
                return(<tr key={r.code}>
                  <td className="font-mono" style={{fontWeight:700}}>{r.code}</td>
                  <td style={{fontWeight:600}}>{r.name}</td>
                  <td className="font-mono" style={{textAlign:"right",color:"var(--green)"}}>{GHS(r.dr)}</td>
                  <td className="font-mono" style={{textAlign:"right",color:"var(--red)"}}>{GHS(r.cr)}</td>
                  <td className="font-mono" style={{textAlign:"right",fontWeight:700,color:net>=0?"var(--green)":"var(--red)"}}>{GHS(Math.abs(net))}</td>
                </tr>);
              })}
              <tr style={{background:"var(--surface-2)",fontWeight:800}}>
                <td colSpan={2} style={{textAlign:"right",fontSize:12}}>TOTALS</td>
                <td className="font-mono" style={{textAlign:"right",color:"var(--green)"}}>{GHS(tbDr)}</td>
                <td className="font-mono" style={{textAlign:"right",color:"var(--red)"}}>{GHS(tbCr)}</td>
                <td className="font-mono" style={{textAlign:"right",fontWeight:900,color:Math.abs(tbDr-tbCr)<0.01?"var(--green)":"var(--red)"}}>{Math.abs(tbDr-tbCr)<0.01?"BALANCED":"OFF BY "+GHS(Math.abs(tbDr-tbCr))}</td>
              </tr>
            </tbody>
          </table></div>
        </div>
      )}
      <Modal open={modal} onClose={()=>setModal(false)} title={editing?"Edit GL Account":"Add GL Account"}
        footer={<><button className="btn btn-secondary" onClick={()=>setModal(false)}>Cancel</button><button className="btn btn-primary" onClick={saveAccount} disabled={saving}>{saving?"Saving...":editing?"Save Changes":"Add Account"}</button></>}>
        <form onSubmit={saveAccount}>
          {error&&<div className="alert alert-error" style={{marginBottom:12}}>{error}</div>}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Account Code <span className="required">*</span></label>
              <input className="form-control font-mono" value={form.code} onChange={f("code")} placeholder="e.g. 5110" disabled={!!editing} required/>
              <div className="form-hint">1xxx=Asset 2xxx=Liability 3xxx=Equity 4xxx=Revenue 5xxx=Expense</div>
            </div>
            <div className="form-group">
              <label className="form-label">Type <span className="required">*</span></label>
              <select className="form-control" value={form.type} onChange={e=>{setForm(p=>({...p,type:e.target.value,category:(CATS[e.target.value]||[])[0]||""}));}}>
                {TYPES.map(t=><option key={t} value={t}>{TL[t]}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Account Name <span className="required">*</span></label>
            <input className="form-control" value={form.name} onChange={f("name")} placeholder="e.g. Travelling Expenses" required/>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-control" value={form.category} onChange={f("category")}>
                {(CATS[form.type]||[]).map(c=><option key={c} value={c}>{c.replace(/_/g," ")}</option>)}
              </select>
            </div>
            {editing&&<div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={form.status||"active"} onChange={f("status")}>
                <option value="active">Active</option><option value="inactive">Inactive</option>
              </select>
            </div>}
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <input className="form-control" value={form.description} onChange={f("description")} placeholder="Optional description"/>
          </div>
        </form>
      </Modal>
    </div>
  );
}
