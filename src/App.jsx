import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Papa from "papaparse";
import { db, isSupabaseConfigured } from "./supabaseClient";

/* ─── ACTIVITY CONFIG ─── */
const TIERS = [
  { tier: 1, label: "Warm-Up", color: "#059669", bg: "#ECFDF5", grad: "linear-gradient(135deg,#10B981,#059669)", desc: "Low effort, high comfort",
    activities: [
      { id: "like_post", name: "Like/react to a post", points: 1, emoji: "👍" },
      { id: "comment_post", name: "Thoughtful comment", points: 2, emoji: "💬" },
      { id: "share_article", name: "Share an article", points: 2, emoji: "📎" },
      { id: "research_contact", name: "Research a contact", points: 1, emoji: "🔍" },
    ] },
  { tier: 2, label: "Main Set", color: "#D97706", bg: "#FFFBEB", grad: "linear-gradient(135deg,#F59E0B,#D97706)", desc: "Moderate effort, direct",
    activities: [
      { id: "send_dm", name: "Send a DM or message", points: 4, emoji: "✉️" },
      { id: "congrats_msg", name: "Congrats/milestone note", points: 3, emoji: "🎉" },
      { id: "intro_request", name: "Ask for or make an intro", points: 5, emoji: "🤝" },
      { id: "follow_up", name: "Follow up with a contact", points: 4, emoji: "🔄" },
    ] },
  { tier: 3, label: "PR Day", color: "#DC2626", bg: "#FEF2F2", grad: "linear-gradient(135deg,#EF4444,#DC2626)", desc: "High effort, max growth",
    activities: [
      { id: "coffee_chat", name: "1:1 coffee / virtual chat", points: 8, emoji: "☕" },
      { id: "attend_event", name: "Attend networking event", points: 10, emoji: "🎪" },
      { id: "give_talk", name: "Give a talk/presentation", points: 12, emoji: "🎤" },
      { id: "write_post", name: "Publish a thought post", points: 7, emoji: "✍️" },
    ] },
];
const ALL_ACT = TIERS.flatMap(t => t.activities.map(a => ({ ...a, tier: t.tier, tierColor: t.color })));

/* ─── SENIORITY & GYM ─── */
const SEN = [
  { id: 0, label: "Unset", emoji: "-", color: "#9CA3AF", bg: "#F3F4F6" },
  { id: 1, label: "Junior", emoji: "🌱", color: "#059669", bg: "#D1FAE5" },
  { id: 2, label: "Peer", emoji: "👤", color: "#2563EB", bg: "#DBEAFE" },
  { id: 3, label: "Senior", emoji: "📊", color: "#D97706", bg: "#FEF3C7" },
  { id: 4, label: "Executive", emoji: "👔", color: "#DC2626", bg: "#FEE2E2" },
];

const GYM = [
  { id: "peer", label: "Peer Power", muscle: "Leg Day", emoji: "🦵", color: "#2563EB", grad: "linear-gradient(135deg,#3B82F6,#1D4ED8)", light: "#EFF6FF", senFilter: [2],
    desc: "Lateral connections at your level",
    actions: ["Send a DM checking in", "Comment on their recent post", "Share a useful article", "Propose a virtual coffee"] },
  { id: "reach", label: "Reach Up", muscle: "Chest Day", emoji: "💪", color: "#D97706", grad: "linear-gradient(135deg,#F59E0B,#D97706)", light: "#FFFBEB", senFilter: [3, 4],
    desc: "Build ties with senior leaders and execs",
    actions: ["Congratulate a recent milestone", "Ask a thoughtful question", "Share something valuable (no ask)", "Request a 15-min advice chat"] },
  { id: "give", label: "Give Back", muscle: "Back Day", emoji: "🤝", color: "#059669", grad: "linear-gradient(135deg,#10B981,#059669)", light: "#ECFDF5", senFilter: [1],
    desc: "Mentor and lift up junior contacts",
    actions: ["Offer to review their work", "Make an intro that helps them", "Share career advice", "Endorse a skill on LinkedIn"] },
  { id: "reconnect", label: "Reconnect", muscle: "Cardio", emoji: "🏃", color: "#7C3AED", grad: "linear-gradient(135deg,#8B5CF6,#6D28D9)", light: "#F5F3FF", senFilter: null,
    desc: "Re-engage anyone silent 30+ days",
    actions: ["Send a thinking-of-you message", "Share a relevant article", "Ask what they are working on", "Congratulate something recent"] },
  { id: "power", label: "Power Hour", muscle: "Full Body", emoji: "🔥", color: "#DC2626", grad: "linear-gradient(135deg,#EF4444,#DC2626)", light: "#FEF2F2", senFilter: null,
    desc: "Mix of all levels",
    actions: ["Pick the action that fits each person"] },
];

function inferSen(title) {
  if (!title) return 0;
  const t = title.toLowerCase();
  if (/\b(ceo|cfo|cto|coo|cmo|cpo|chief|founder|co-founder|president|owner|partner|managing director)\b/.test(t)) return 4;
  if (/\b(vp|vice president|svp|evp|head of|director|general manager)\b/.test(t)) return 3;
  if (/\b(manager|lead|senior|principal|staff|architect)\b/.test(t)) return 2;
  if (/\b(associate|analyst|coordinator|specialist|assistant|intern|junior|entry|trainee)\b/.test(t)) return 1;
  return 0;
}

/* ─── HELPERS ─── */
function getWeekStart(d) { const x = new Date(d); const day = x.getDay(); x.setDate(x.getDate() - day + (day === 0 ? -6 : 1)); x.setHours(0,0,0,0); return x.toISOString().split("T")[0]; }
function getToday() { return new Date().toISOString().split("T")[0]; }
function getDayName(s) { return new Date(s+"T12:00:00").toLocaleDateString("en-US",{weekday:"short"}); }
function getWeekDays(ws) { const d=[]; for(let i=0;i<7;i++){const x=new Date(ws+"T12:00:00");x.setDate(x.getDate()+i);d.push(x.toISOString().split("T")[0]);} return d; }
function fmtDate(s) { return new Date(s+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}); }
function uid() { return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function daysSince(dateStr, now) { if(!dateStr) return 999; return Math.floor((new Date(now)-new Date(dateStr))/(1000*60*60*24)); }

const warmL = ["","🧊 Cold","🌤 Warm","🔥 Hot"];
const EMPTY_CF = { name:"", company:"", position:"", notes:"", followUpDate:"", warmth:1, seniority:0 };

/* ════════════════════ APP ════════════════════ */
export default function App() {
  const [view, setView] = useState("gym");
  const [log, setLog] = useState([]);
  const [contacts, setCts] = useState([]);
  const [showCM, setShowCM] = useState(false);
  const [editC, setEditC] = useState(null);
  const [cf, setCf] = useState(EMPTY_CF);
  const [goal, setGoal] = useState(25);
  const [toast, setToast] = useState(null);
  const [anim, setAnim] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [showIM, setShowIM] = useState(false);
  const [impPrev, setImpPrev] = useState([]);
  const [impSel, setImpSel] = useState(new Set());
  const [impF, setImpF] = useState("");
  const [impSync, setImpSync] = useState(false);
  const [gymPick, setGymPick] = useState(null);
  const [dismissed, setDismissed] = useState([]);
  const [ctSearch, setCtSearch] = useState("");
  const fRef = useRef(null);

  const NOW = getToday();
  const WS = getWeekStart(NOW);
  const WD = getWeekDays(WS);

  /* Load */
  useEffect(() => {
    (async () => {
      try {
        const [l, c, g] = await Promise.all([db.getActivityLog(), db.getContacts(), db.getSettings()]);
        setLog(l); setCts(c); setGoal(g);
      } catch(e) { console.warn("Load:", e); }
      setLoaded(true);
    })();
  }, []);
  useEffect(() => { if(loaded) db.setSettings(goal).catch(()=>{}); }, [goal, loaded]);

  /* Stats */
  const wkLog = useMemo(() => log.filter(l => l.date >= WS && l.date <= WD[6]), [log, WS, WD]);
  const tdLog = useMemo(() => log.filter(l => l.date === NOW), [log, NOW]);
  const wkPts = useMemo(() => wkLog.reduce((s,l) => s+l.points, 0), [wkLog]);
  const tdPts = useMemo(() => tdLog.reduce((s,l) => s+l.points, 0), [tdLog]);
  const actDays = useMemo(() => new Set(wkLog.map(l => l.date)).size, [wkLog]);

  const streak = useMemo(() => {
    let s=0;
    const d = new Date(NOW+"T12:00:00");
    if(!log.some(l => l.date===NOW)) d.setDate(d.getDate()-1);
    while(log.some(l => l.date===d.toISOString().split("T")[0])) { s++; d.setDate(d.getDate()-1); }
    return s;
  }, [log, NOW]);

  const heatmap = useMemo(() => WD.map(day => ({
    day, pts: log.filter(l => l.date===day).reduce((s,l) => s+l.points, 0), isT: day===NOW, isP: day<NOW
  })), [WD, log, NOW]);

  const trend = useMemo(() => {
    const w = [];
    for(let i=3;i>=0;i--) {
      const d=new Date(WS+"T12:00:00"); d.setDate(d.getDate()-i*7);
      const s=d.toISOString().split("T")[0], ds=getWeekDays(s);
      w.push({pts:log.filter(l => l.date>=s && l.date<=ds[6]).reduce((a,l) => a+l.points, 0), label:i===0?"This Week":i+"w ago"});
    }
    return w;
  }, [log, WS]);
  const maxTr = Math.max(...trend.map(w => w.pts), goal);

  const overdue = useMemo(() =>
    contacts.filter(c => c.followUpDate && c.followUpDate <= NOW)
      .sort((a,b) => a.followUpDate.localeCompare(b.followUpDate)),
    [contacts, NOW]);

  const suggest = useMemo(() => {
    const s = [];
    if(overdue.length>0) s.push({text:"Follow up with "+overdue[0].name, aid:"follow_up", cn:overdue[0].name});
    if(tdPts<3) { s.push({text:"Thoughtful comment on LinkedIn", aid:"comment_post"}); s.push({text:"Research someone to connect with", aid:"research_contact"}); }
    if(tdPts>=3 && tdPts<8) s.push({text:"Send a DM to someone you admire", aid:"send_dm"});
    if(actDays>=3 && wkPts<goal*0.7) s.push({text:"Schedule a coffee chat this week", aid:"coffee_chat"});
    return s.slice(0,3);
  }, [overdue, tdPts, actDays, wkPts, goal]);

  const totPts = log.reduce((s,l) => s+l.points, 0);
  const lvl = Math.floor(totPts/50)+1;
  const lvlNames = ["Wallflower","Observer","Nodder","Conversationalist","Connector","Hub","Catalyst","Influencer","Maven","Superconnector"];
  const lvlN = lvlNames[Math.min(lvl-1,9)];
  const pPct = Math.min((wkPts/goal)*100, 100);

  /* Gym */
  const autoGym = useMemo(() => GYM[[3,0,1,2,0,4,3][new Date().getDay()]], []);
  const curGym = gymPick || autoGym;

  const gymCards = useMemo(() => {
    if(contacts.length === 0) return [];
    let pool = [];
    if(curGym.id === "power") {
      [1,2,3,4].forEach(lv => {
        const g = contacts.filter(c => (c.seniority||0) === lv);
        if(g.length > 0) pool.push(g[Math.floor(Math.random()*g.length)]);
      });
    } else if(curGym.id === "reconnect") {
      pool = contacts.filter(c => daysSince(c.lastContact, NOW) >= 30);
    } else {
      pool = contacts.filter(c => curGym.senFilter && curGym.senFilter.includes(c.seniority||0));
    }
    pool = pool.filter(c => !dismissed.includes(c.id));
    pool.sort((a,b) => {
      const ao = (a.followUpDate && a.followUpDate<=NOW) ? 1 : 0;
      const bo = (b.followUpDate && b.followUpDate<=NOW) ? 1 : 0;
      if(bo!==ao) return bo-ao;
      return (a.warmth||0)-(b.warmth||0);
    });
    return pool.slice(0,5).map((c,i) => ({ ...c, sugAction: curGym.actions[i % curGym.actions.length] }));
  }, [contacts, curGym, dismissed, NOW]);

  /* Actions */
  const notify = useCallback(m => { setToast(m); setTimeout(() => setToast(null), 2500); }, []);

  async function logAct(a, cn) {
    const e = {id:uid(), activityId:a.id, name:a.name, points:a.points, tier:a.tier, date:NOW, timestamp:new Date().toISOString(), contactName:cn||null, emoji:a.emoji};
    setLog(p => [e, ...p]); setAnim(a.id); setTimeout(() => setAnim(null), 500);
    notify("+"+a.points+" pts — "+a.name);
    try { await db.addActivity(e); } catch(ex) { console.warn(ex); }
  }

  function completeCard(c) {
    const ids = {1:"send_dm",2:"send_dm",3:"coffee_chat",4:"congrats_msg"};
    const act = ALL_ACT.find(a => a.id===(ids[c.seniority||2]||"send_dm")) || ALL_ACT.find(a => a.id==="follow_up");
    if(act) logAct(act, c.name);
    const upd = { ...c, lastContact:NOW };
    setCts(p => p.map(x => x.id===c.id ? upd : x));
    db.upsertContact(upd).catch(()=>{});
    setDismissed(p => [...p, c.id]);
  }

  async function autoDetect() {
    let count = 0;
    const updated = contacts.map(c => {
      if ((c.seniority || 0) > 0) return c;
      // Check position field first, then notes
      const detected = inferSen(c.position || c.notes || "");
      if (detected > 0) { count++; return { ...c, seniority: detected }; }
      return c;
    });
    setCts(updated);
    updated.forEach(c => { if ((c.seniority || 0) > 0) db.upsertContact(c).catch(()=>{}); });
    const unset = updated.filter(c => (c.seniority || 0) === 0).length;
    notify("Detected " + count + " contacts" + (unset > 0 ? " ("+unset+" unset)" : ""));
  }

  /* Coffee Prep - smart ranking */
  const coffeePicks = useMemo(() =>
    contacts.filter(c => (c.seniority || 0) >= 3)
      .map(c => {
        let score = 0;
        if (c.followUpDate && c.followUpDate <= NOW) score += 50;
        if ((c.warmth || 1) === 1) score += 20;
        else if ((c.warmth || 1) === 2) score += 10;
        const days = daysSince(c.lastContact, NOW);
        if (days >= 90) score += 30;
        else if (days >= 60) score += 20;
        else if (days >= 30) score += 10;
        if ((c.seniority || 0) === 4) score += 5;
        return { ...c, cofScore: score };
      })
      .sort((a, b) => b.cofScore - a.cofScore)
      .slice(0, 8),
    [contacts, NOW]);

  async function saveC() {
    if(!cf.name.trim()) return;
    const c = editC
      ? { ...editC, ...cf, lastContact: NOW }
      : { ...cf, id:uid(), lastContact:NOW, created_at:new Date().toISOString() };
    if(editC) setCts(p => p.map(x => x.id===editC.id ? c : x));
    else setCts(p => [c, ...p]);
    setShowCM(false); setEditC(null);
    setCf(EMPTY_CF);
    try { await db.upsertContact(c); } catch(ex) { console.warn(ex); }
  }

  async function delC(id) {
    setCts(p => p.filter(c => c.id!==id));
    try { await db.deleteContact(id); } catch(ex) {}
  }

  async function resetAll() {
    setLog([]); setCts([]); setGoal(25); notify("Data reset");
    try { await Promise.all([db.clearActivityLog(),db.clearContacts(),db.setSettings(25)]); } catch(ex) {}
  }

  function handleCSV(e) {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      const text = evt.target.result.replace(/^\uFEFF/,"");
      Papa.parse(text, {
        header:true, skipEmptyLines:true, transformHeader: h => h.trim(),
        complete(results) {
          const hds = results.meta.fields || [];
          function find(...pats) {
            return hds.find(h => { const lh=h.toLowerCase().replace(/[^a-z]/g,""); return pats.some(p => lh===p||lh.includes(p)); }) || "";
          }
          const fnC=find("firstname","first"), lnC=find("lastname","last");
          const coC=find("company","organization"), posC=find("position","title","jobtitle");
          const emC=find("emailaddress","email"), conC=find("connectedon","connected");

          const buildEntry = (nm, co, pos, em, cn) => {
            const existing = contacts.find(c => c.name.toLowerCase()===nm.toLowerCase());
            return {
              id: existing ? existing.id : uid(),
              name: nm, company: co, position: pos, email: em, connectedOn: cn,
              notes: pos ? (pos+(co?" at "+co:"")) : (existing?.notes||""),
              warmth: existing?.warmth || 1,
              seniority: existing?.seniority || inferSen(pos),
              exists: !!existing,
              existingData: existing || null,
            };
          };

          let parsed = [];
          if(!fnC && !lnC) {
            const nameC = hds.find(h => h.toLowerCase().includes("name"));
            if(!nameC) { notify("Could not find name columns"); return; }
            parsed = results.data.map(row => {
              const nm=(row[nameC]||"").trim(); if(!nm||nm.length<2) return null;
              const co=coC?(row[coC]||"").trim():"", pos=posC?(row[posC]||"").trim():"";
              return buildEntry(nm, co, pos, "", "");
            }).filter(Boolean);
          } else {
            parsed = results.data.map(row => {
              const fn=fnC?(row[fnC]||"").trim():"", ln=lnC?(row[lnC]||"").trim():"";
              const nm=(fn+" "+ln).trim(); if(!nm||nm.length<2) return null;
              const co=coC?(row[coC]||"").trim():"", pos=posC?(row[posC]||"").trim():"";
              const em=emC?(row[emC]||"").trim():"", cn=conC?(row[conC]||"").trim():"";
              return buildEntry(nm, co, pos, em, cn);
            }).filter(Boolean);
          }

          if(parsed.length===0){notify("0 contacts found");return;}
          setImpPrev(parsed);
          // By default select new contacts only
          setImpSel(new Set(parsed.filter(p => !p.exists).slice(0,50).map(p => p.id)));
          setImpSync(false);
          setShowIM(true);
        },
        error() { notify("Error reading CSV"); },
      });
    };
    reader.readAsText(file); e.target.value="";
  }

  async function doImport() {
    const selected = impPrev.filter(p => impSel.has(p.id));
    const newContacts = selected.filter(p => !p.exists).map(p => ({
      id: p.id, name: p.name, company: p.company, position: p.position||"",
      notes: p.notes, lastContact: p.connectedOn||NOW, followUpDate:"",
      warmth: 1, seniority: p.seniority||0, created_at: new Date().toISOString(),
    }));
    const updatedContacts = impSync ? selected.filter(p => p.exists).map(p => ({
      ...p.existingData,
      company: p.company || p.existingData.company,
      position: p.position || p.existingData.position || "",
      notes: p.position
        ? (p.position+(p.company?" at "+p.company:""))
        : p.existingData.notes,
      seniority: (p.existingData.seniority||0) > 0 ? p.existingData.seniority : (p.seniority||0),
    })) : [];

    setCts(prev => {
      let next = [...prev];
      // Apply updates
      updatedContacts.forEach(upd => {
        const idx = next.findIndex(c => c.id === upd.id);
        if(idx >= 0) next[idx] = upd;
      });
      // Add new
      return [...next, ...newContacts];
    });
    setShowIM(false); setImpPrev([]); setImpSel(new Set());

    const parts = [];
    if(newContacts.length > 0) parts.push("Added "+newContacts.length);
    if(updatedContacts.length > 0) parts.push("Updated "+updatedContacts.length);
    notify(parts.join(", ")+" contacts");

    try {
      if(newContacts.length > 0) await db.importContacts(newContacts);
      for(const u of updatedContacts) await db.upsertContact(u);
    } catch(ex) { console.warn(ex); }
  }

  const filtImp = useMemo(() => {
    if(!impF) return impPrev;
    const f=impF.toLowerCase();
    return impPrev.filter(p => p.name.toLowerCase().includes(f)||p.company.toLowerCase().includes(f)||(p.position||"").toLowerCase().includes(f));
  }, [impPrev, impF]);

  // Filtered contacts for People view
  const filtContacts = useMemo(() => {
    const sorted = [...contacts].sort((a,b) => {
      if(a.followUpDate&&a.followUpDate<=NOW&&(!b.followUpDate||b.followUpDate>NOW)) return -1;
      if(b.followUpDate&&b.followUpDate<=NOW&&(!a.followUpDate||a.followUpDate>NOW)) return 1;
      return (b.warmth||0)-(a.warmth||0);
    });
    if(!ctSearch) return sorted;
    const q = ctSearch.toLowerCase();
    return sorted.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.company||"").toLowerCase().includes(q) ||
      (c.position||"").toLowerCase().includes(q) ||
      (c.notes||"").toLowerCase().includes(q)
    );
  }, [contacts, ctSearch, NOW]);

  const F = "'Plus Jakarta Sans',sans-serif";

  /* ════════════════════ RENDER ════════════════════ */
  return (
    <div style={{fontFamily:F,background:"#FFFFFF",minHeight:"100vh",color:"#111827",maxWidth:480,margin:"0 auto"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}body{background:#f8fafc}
        @keyframes su{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes si{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pop{0%{transform:scale(.92)}50%{transform:scale(1.06)}100%{transform:scale(1)}}
        @keyframes ti{from{transform:translateX(-50%) translateY(14px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}
        ::-webkit-scrollbar{display:none}
        input,textarea{font-family:${F};background:#F9FAFB;border:1.5px solid #E5E7EB;border-radius:14px;padding:12px 16px;color:#111827;font-size:15px;width:100%;outline:none;transition:border-color .2s}
        input:focus,textarea:focus{border-color:#3B82F6;box-shadow:0 0 0 3px #3B82F620}
        input[type=date]{color-scheme:light}
      `}</style>

      {/* ─── HERO BANNER ─── */}
      <div style={{background:view==="coffee"?"linear-gradient(135deg,#92400E,#78350F)":curGym.grad,padding:"22px 22px 18px",borderRadius:"0 0 28px 28px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-30,right:-30,width:120,height:120,borderRadius:"50%",background:"rgba(255,255,255,0.1)"}}/>
        <div style={{position:"absolute",bottom:-20,left:-20,width:80,height:80,borderRadius:"50%",background:"rgba(255,255,255,0.07)"}}/>
        <div style={{position:"relative",zIndex:1}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:14,fontWeight:600,color:"rgba(255,255,255,0.75)"}}>Network Reps</div>
            <div style={{background:"rgba(255,255,255,0.2)",borderRadius:20,padding:"4px 14px",fontSize:12,fontWeight:700,color:"#fff"}}>
              Lv {lvl} — {lvlN}
            </div>
          </div>
          {view==="coffee" ? (
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <span style={{fontSize:38}}>☕</span>
              <div>
                <div style={{fontSize:24,fontWeight:800,color:"#fff",letterSpacing:-0.5}}>Coffee Prep</div>
                <div style={{fontSize:14,color:"rgba(255,255,255,0.7)",fontWeight:500,marginTop:1}}>{coffeePicks.length} senior contacts to reach out to</div>
              </div>
            </div>
          ) : (
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <span style={{fontSize:38}}>{curGym.emoji}</span>
              <div>
                <div style={{fontSize:24,fontWeight:800,color:"#fff",letterSpacing:-0.5}}>{curGym.label}</div>
                <div style={{fontSize:14,color:"rgba(255,255,255,0.7)",fontWeight:500,marginTop:1}}>{curGym.muscle} — {curGym.desc}</div>
              </div>
            </div>
          )}
          {/* Quick stats row */}
          <div style={{display:"flex",gap:12,marginTop:16}}>
            {[{l:"Today",v:tdPts+" pts"},{l:"Streak",v:streak+"d"},{l:"Week",v:wkPts+"/"+goal}].map((x,i) => (
              <div key={i} style={{flex:1,background:"rgba(255,255,255,0.15)",borderRadius:14,padding:"10px 12px",textAlign:"center"}}>
                <div style={{fontSize:16,fontWeight:800,color:"#fff"}}>{x.v}</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.6)",fontWeight:500,marginTop:1}}>{x.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── TAB BAR ─── */}
      <div style={{display:"flex",padding:"10px 20px 0",gap:0,background:"#fff",borderBottom:"1px solid #F3F4F6"}}>
        {[{id:"gym",l:"🏋️ Gym"},{id:"coffee",l:"☕ Coffee"},{id:"log",l:"📝 Log"},{id:"contacts",l:"👥 People"},{id:"stats",l:"📊 Stats"}].map(t => (
          <button key={t.id} onClick={() => setView(t.id)} style={{
            flex:1,padding:"11px 0",background:"none",border:"none",
            borderBottom:view===t.id?"2.5px solid "+curGym.color:"2.5px solid transparent",
            fontSize:13,fontWeight:view===t.id?700:500,
            color:view===t.id?curGym.color:"#9CA3AF",
            fontFamily:F,cursor:"pointer",transition:"all .2s",
          }}>{t.l}</button>
        ))}
      </div>

      {!isSupabaseConfigured && loaded && (
        <div style={{margin:"10px 20px 0",padding:"8px 14px",background:"#FFFBEB",borderRadius:12,fontSize:12,color:"#D97706",fontWeight:500}}>
          Local mode — add Supabase env vars for cloud sync
        </div>
      )}

      <div style={{padding:"14px 20px 100px"}}>

        {/* ══════ GYM ══════ */}
        {view==="gym" && (
          <div style={{animation:"su .3s ease"}}>
            {/* Workout selector */}
            <div style={{display:"flex",gap:8,overflowX:"auto",margin:"6px 0 18px",paddingBottom:4}}>
              {GYM.map(g => (
                <button key={g.id} onClick={() => { setGymPick(g); setDismissed([]); }}
                  style={{flexShrink:0,padding:"9px 16px",borderRadius:24,border:"none",
                    background:curGym.id===g.id?g.grad:"#F3F4F6",
                    color:curGym.id===g.id?"#fff":"#6B7280",
                    fontFamily:F,fontSize:13,fontWeight:curGym.id===g.id?700:500,
                    cursor:"pointer",transition:"all .2s",
                    boxShadow:curGym.id===g.id?"0 4px 12px "+g.color+"30":"none",
                  }}>{g.emoji} {g.label}</button>
              ))}
            </div>

            {/* Cards */}
            {gymCards.length===0 ? (
              <div style={{textAlign:"center",padding:"40px 20px",color:"#9CA3AF"}}>
                <div style={{fontSize:40,marginBottom:10}}>{contacts.length===0?"👥":"✅"}</div>
                <div style={{fontSize:16,fontWeight:700,color:"#374151"}}>
                  {contacts.length===0 ? "Import contacts first"
                    : dismissed.length>0 ? "Workout complete! 💪"
                    : "No contacts match "+curGym.label}
                </div>
                <div style={{fontSize:14,marginTop:6,fontWeight:500}}>
                  {contacts.length===0 ? "Go to People tab to import LinkedIn CSV"
                    : dismissed.length>0 ? "Great session today"
                    : "Set seniority on contacts to enable"}
                </div>
                {dismissed.length>0 && (
                  <button onClick={() => setDismissed([])} style={{marginTop:16,padding:"10px 24px",borderRadius:24,border:"none",background:curGym.grad,color:"#fff",fontFamily:F,fontSize:14,fontWeight:700,cursor:"pointer"}}>Go Again</button>
                )}
                {contacts.length>0 && dismissed.length===0 && (
                  <button onClick={autoDetect} style={{marginTop:16,padding:"12px 24px",borderRadius:24,border:"none",background:curGym.grad,color:"#fff",fontFamily:F,fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 12px "+curGym.color+"30"}}>Auto-detect from job titles</button>
                )}
              </div>
            ) : (
              gymCards.map((c,idx) => {
                const sn = SEN[c.seniority||0];
                const od = c.followUpDate && c.followUpDate<=NOW;
                return <div key={c.id} style={{background:"#FFFFFF",borderRadius:20,marginBottom:14,border:"1.5px solid #F3F4F6",boxShadow:"0 2px 8px rgba(0,0,0,0.04)",overflow:"hidden",animation:"su "+(0.15+idx*0.08)+"s ease"}}>
                  <div style={{height:4,background:curGym.grad}}/>
                  <div style={{padding:"18px 20px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div>
                        <div style={{fontSize:18,fontWeight:700,letterSpacing:-0.3}}>{c.name}</div>
                        <div style={{fontSize:14,color:"#9CA3AF",marginTop:3,fontWeight:500}}>{c.position || c.company}</div>
                        {c.position && c.company && <div style={{fontSize:12,color:"#D1D5DB",marginTop:1,fontWeight:500}}>{c.company}</div>}
                      </div>
                      <span style={{fontSize:11,padding:"4px 10px",borderRadius:20,background:sn.bg,color:sn.color,fontWeight:700}}>{sn.emoji} {sn.label}</span>
                    </div>
                    <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
                      {c.lastContact && <span style={{fontSize:13,padding:"4px 12px",borderRadius:10,background:"#F9FAFB",color:"#6B7280",fontWeight:500}}>Last: {fmtDate(c.lastContact)}</span>}
                      <span style={{fontSize:13,padding:"4px 12px",borderRadius:10,background:"#F9FAFB",color:"#6B7280",fontWeight:500}}>{warmL[c.warmth||1]}</span>
                      {od && <span style={{fontSize:11,padding:"4px 10px",borderRadius:10,background:"#FEE2E2",color:"#DC2626",fontWeight:700}}>Overdue</span>}
                    </div>
                    <div style={{marginTop:14,padding:"14px 16px",borderRadius:14,background:curGym.light,border:"1px solid "+curGym.color+"20"}}>
                      <div style={{fontSize:10,fontWeight:800,letterSpacing:1.5,color:curGym.color,marginBottom:4,textTransform:"uppercase"}}>Suggested rep</div>
                      <div style={{fontSize:15,fontWeight:500,lineHeight:1.45,color:"#374151"}}>{c.sugAction}</div>
                    </div>
                    <div style={{display:"flex",gap:10,marginTop:14}}>
                      <button onClick={() => completeCard(c)} style={{flex:1,padding:"14px",borderRadius:14,border:"none",background:curGym.grad,color:"#fff",fontFamily:F,fontSize:15,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 12px "+curGym.color+"25"}}>Done ✓</button>
                      <button onClick={() => setDismissed(p => [...p, c.id])} style={{padding:"14px 22px",borderRadius:14,background:"#F9FAFB",border:"1.5px solid #E5E7EB",color:"#9CA3AF",fontFamily:F,fontSize:15,fontWeight:600,cursor:"pointer"}}>Skip</button>
                    </div>
                  </div>
                </div>;
              })
            )}
            {gymCards.length>0 && (
              <div style={{textAlign:"center",marginTop:4}}>
                <button onClick={() => setDismissed([])} style={{background:"none",border:"none",color:"#9CA3AF",fontFamily:F,fontSize:13,fontWeight:500,cursor:"pointer",padding:"8px 16px"}}>Reset dismissed</button>
              </div>
            )}
          </div>
        )}

        {/* ══════ COFFEE PREP ══════ */}
        {view==="coffee" && (
          <div style={{animation:"su .3s ease"}}>
            <div style={{background:"#FFFBEB",borderRadius:16,padding:"14px 16px",marginTop:6,marginBottom:16,border:"1.5px solid #FEF3C7"}}>
              <div style={{fontSize:13,fontWeight:700,color:"#92400E",marginBottom:4}}>How Coffee Prep works</div>
              <div style={{fontSize:13,color:"#A16207",fontWeight:500,lineHeight:1.6}}>
                1. Pick a contact below{"\n"}
                2. Quick-scan their LinkedIn for recent posts{"\n"}
                3. Prep a thoughtful opener based on what they shared{"\n"}
                4. Mark contacted to log 8 pts and update last contact
              </div>
            </div>

            {coffeePicks.length === 0 ? (
              <div style={{textAlign:"center",padding:"40px 20px",color:"#9CA3AF"}}>
                <div style={{fontSize:40,marginBottom:10}}>☕</div>
                <div style={{fontSize:16,fontWeight:700,color:"#374151"}}>No senior contacts yet</div>
                <div style={{fontSize:14,marginTop:6,fontWeight:500}}>Import contacts and set seniority to Senior or Executive</div>
              </div>
            ) : (
              coffeePicks.map((c, idx) => {
                const sn = SEN[c.seniority || 0];
                const days = daysSince(c.lastContact, NOW);
                const urgency = days >= 90 ? "90+ days — reconnect soon" : days >= 60 ? "60+ days since last contact" : days >= 30 ? "30+ days — good time to reach out" : "Recently connected";
                const urgColor = days >= 60 ? "#DC2626" : days >= 30 ? "#D97706" : "#059669";
                return <div key={c.id} style={{background:"#fff",borderRadius:20,marginBottom:12,border:"1.5px solid #F3F4F6",boxShadow:"0 2px 8px rgba(0,0,0,0.04)",overflow:"hidden",animation:"su "+(0.15+idx*0.06)+"s ease"}}>
                  <div style={{height:4,background:"linear-gradient(135deg,#92400E,#78350F)"}}/>
                  <div style={{padding:"16px 18px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                          <span style={{fontSize:17,fontWeight:700}}>{c.name}</span>
                          <span style={{fontSize:11,padding:"3px 9px",borderRadius:20,background:sn.bg,color:sn.color,fontWeight:700}}>{sn.emoji} {sn.label}</span>
                        </div>
                        {c.position && <div style={{fontSize:13,color:"#374151",marginTop:2,fontWeight:600}}>{c.position}</div>}
                        {c.company && <div style={{fontSize:13,color:"#9CA3AF",marginTop:1,fontWeight:500}}>{c.company}</div>}
                        {c.notes && !c.position && <div style={{fontSize:13,color:"#6B7280",marginTop:4,fontStyle:"italic"}}>{c.notes}</div>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
                      <span style={{fontSize:12,padding:"4px 10px",borderRadius:10,background:urgColor+"12",color:urgColor,fontWeight:600}}>{urgency}</span>
                      <span style={{fontSize:12,padding:"4px 10px",borderRadius:10,background:"#F9FAFB",color:"#6B7280",fontWeight:500}}>{warmL[c.warmth||1]}</span>
                    </div>
                    <button onClick={() => {
                      const act = ALL_ACT.find(a => a.id==="coffee_chat");
                      if(act) logAct(act, c.name);
                      const upd = { ...c, lastContact:NOW };
                      setCts(p => p.map(x => x.id===c.id ? upd : x));
                      db.upsertContact(upd).catch(()=>{});
                    }} style={{width:"100%",marginTop:14,padding:"13px",borderRadius:14,border:"none",background:"linear-gradient(135deg,#92400E,#78350F)",color:"#fff",fontFamily:F,fontSize:15,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 12px rgba(146,64,14,0.25)",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                      <span>☕</span> Mark contacted (+8 pts)
                    </button>
                  </div>
                </div>;
              })
            )}
          </div>
        )}

        {/* ══════ LOG ══════ */}
        {view==="log" && (
          <div style={{display:"flex",flexDirection:"column",gap:12,animation:"su .3s ease"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
              <div><div style={{fontSize:18,fontWeight:700}}>Log a Rep</div><div style={{fontSize:13,color:"#9CA3AF",fontWeight:500,marginTop:2}}>Tap to record activity</div></div>
              <div style={{background:curGym.light,padding:"6px 14px",borderRadius:20,fontSize:13,fontWeight:700,color:curGym.color}}>Today: {tdPts} pts</div>
            </div>
            {TIERS.map(tier => (
              <div key={tier.tier} style={{background:"#fff",borderRadius:20,border:"1.5px solid #F3F4F6",boxShadow:"0 1px 4px rgba(0,0,0,0.03)",padding:"18px 18px 14px"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                  <div style={{width:10,height:10,borderRadius:"50%",background:tier.grad}}/>
                  <span style={{fontSize:14,fontWeight:700,color:tier.color}}>{tier.label}</span>
                  <span style={{fontSize:13,color:"#9CA3AF",fontWeight:500}}>{tier.desc}</span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {tier.activities.map(a => (
                    <button key={a.id} onClick={() => logAct({...a,tier:tier.tier})}
                      style={{display:"flex",alignItems:"center",gap:12,width:"100%",padding:"13px 16px",background:anim===a.id?tier.bg:"#F9FAFB",border:"1.5px solid "+(anim===a.id?tier.color+"40":"#F3F4F6"),borderRadius:14,color:"#111827",cursor:"pointer",fontFamily:F,fontSize:15,fontWeight:500,transition:"all .15s",animation:anim===a.id?"pop .35s ease":"none"}}>
                      <span style={{fontSize:18}}>{a.emoji}</span>
                      <span style={{flex:1,textAlign:"left"}}>{a.name}</span>
                      <span style={{background:tier.bg,color:tier.color,padding:"3px 12px",borderRadius:20,fontSize:13,fontWeight:700}}>+{a.points}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══════ CONTACTS ══════ */}
        {view==="contacts" && (
          <div style={{display:"flex",flexDirection:"column",gap:12,animation:"su .3s ease"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
              <div style={{fontSize:18,fontWeight:700}}>Your Network <span style={{fontSize:14,color:"#9CA3AF",fontWeight:500}}>({contacts.length})</span></div>
              <div style={{display:"flex",gap:8}}>
                <input ref={fRef} type="file" accept=".csv,.xlsx,.txt" style={{display:"none"}} onChange={handleCSV}/>
                <button onClick={() => fRef.current && fRef.current.click()} style={{background:"#EFF6FF",color:"#2563EB",padding:"8px 14px",fontSize:13,fontWeight:600,borderRadius:14,border:"none",fontFamily:F,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
                  🔗 Sync LinkedIn
                </button>
                <button onClick={() => { setEditC(null); setCf(EMPTY_CF); setShowCM(true); }} style={{background:curGym.grad,color:"#fff",padding:"8px 14px",fontSize:13,fontWeight:700,borderRadius:14,border:"none",fontFamily:F,cursor:"pointer"}}>+ Add</button>
              </div>
            </div>

            {/* LinkedIn import hint */}
            <div style={{padding:"10px 14px",background:"#EFF6FF",borderRadius:14,display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:16}}>💡</span>
              <div style={{fontSize:12,color:"#2563EB",fontWeight:500,lineHeight:1.4}}>
                Export from LinkedIn: <strong>Settings → Data Privacy → Get a copy → Connections</strong>
              </div>
            </div>

            {/* Search */}
            {contacts.length > 0 && (
              <input
                placeholder="Search by name, company, or title…"
                value={ctSearch}
                onChange={e => setCtSearch(e.target.value)}
                style={{fontSize:14}}
              />
            )}

            {contacts.length===0 ? (
              <div style={{textAlign:"center",padding:"40px 20px",color:"#9CA3AF"}}>
                <div style={{fontSize:36,marginBottom:8}}>👥</div>
                <div style={{fontSize:16,fontWeight:700,color:"#374151"}}>No contacts yet</div>
                <div style={{fontSize:14,marginTop:4,fontWeight:500}}>Add manually or sync from LinkedIn CSV</div>
              </div>
            ) : filtContacts.length===0 ? (
              <div style={{textAlign:"center",padding:"24px",color:"#9CA3AF"}}>
                <div style={{fontSize:14,fontWeight:500}}>No contacts match "{ctSearch}"</div>
              </div>
            ) : (
              filtContacts.map(c => {
                const od = c.followUpDate && c.followUpDate<=NOW;
                const sn = SEN[c.seniority||0];
                return <div key={c.id} style={{background:"#fff",borderRadius:16,padding:"16px 18px",border:"1.5px solid "+(od?"#FEE2E2":"#F3F4F6"),boxShadow:"0 1px 4px rgba(0,0,0,0.03)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <span style={{fontSize:16,fontWeight:700}}>{c.name}</span>
                        <span style={{fontSize:13}}>{warmL[c.warmth||1]}</span>
                        {(c.seniority||0)>0 && <span style={{fontSize:11,padding:"2px 8px",borderRadius:10,background:sn.bg,color:sn.color,fontWeight:700}}>{sn.emoji} {sn.label}</span>}
                      </div>
                      {c.position && <div style={{fontSize:13,color:"#374151",marginTop:2,fontWeight:600}}>{c.position}</div>}
                      {c.company && <div style={{fontSize:13,color:"#9CA3AF",marginTop:1,fontWeight:500}}>{c.company}</div>}
                    </div>
                    <div style={{display:"flex",gap:6,flexShrink:0,marginLeft:8}}>
                      <button onClick={() => { setEditC(c); setCf({name:c.name,company:c.company||"",position:c.position||"",notes:c.notes||"",followUpDate:c.followUpDate||"",warmth:c.warmth||1,seniority:c.seniority||0}); setShowCM(true); }} style={{background:"#F9FAFB",border:"1px solid #E5E7EB",color:"#6B7280",padding:"5px 12px",fontSize:12,fontWeight:600,borderRadius:10,fontFamily:F,cursor:"pointer"}}>Edit</button>
                      <button onClick={() => delC(c.id)} style={{background:"#FEF2F2",border:"none",color:"#DC2626",padding:"5px 12px",fontSize:12,fontWeight:600,borderRadius:10,fontFamily:F,cursor:"pointer"}}>✕</button>
                    </div>
                  </div>
                  {c.notes && !c.position && <div style={{fontSize:13,color:"#9CA3AF",marginTop:6,fontStyle:"italic"}}>{c.notes}</div>}
                  <div style={{display:"flex",gap:12,marginTop:8,fontSize:12,color:"#D1D5DB",fontWeight:500}}>
                    {c.lastContact && <span>Last: {fmtDate(c.lastContact)}</span>}
                    {c.followUpDate && <span style={{color:od?"#DC2626":"#D1D5DB"}}>Follow up: {fmtDate(c.followUpDate)}{od?" !!":""}</span>}
                  </div>
                </div>;
              })
            )}
          </div>
        )}

        {/* ══════ STATS ══════ */}
        {view==="stats" && (
          <div style={{display:"flex",flexDirection:"column",gap:12,animation:"su .3s ease"}}>
            {/* Progress ring */}
            <div style={{background:"#fff",borderRadius:20,border:"1.5px solid #F3F4F6",padding:24,textAlign:"center",boxShadow:"0 1px 4px rgba(0,0,0,0.03)"}}>
              <div style={{position:"relative",width:130,height:130,margin:"0 auto 14px"}}>
                <svg width="130" height="130" viewBox="0 0 130 130">
                  <circle cx="65" cy="65" r="54" fill="none" stroke="#F3F4F6" strokeWidth="9"/>
                  <circle cx="65" cy="65" r="54" fill="none" stroke={curGym.color} strokeWidth="9" strokeLinecap="round" strokeDasharray={(pPct/100)*339.3+" 339.3"} transform="rotate(-90 65 65)" style={{transition:"stroke-dasharray .8s ease"}}/>
                </svg>
                <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center"}}>
                  <div style={{fontSize:30,fontWeight:800}}>{wkPts}</div>
                  <div style={{fontSize:12,color:"#9CA3AF",fontWeight:500}}>/ {goal} pts</div>
                </div>
              </div>
              <div style={{fontSize:15,fontWeight:700}}>{pPct>=100?"Goal crushed! 🎯":pPct>=60?"Strong week! 💪":"Building momentum 📈"}</div>
            </div>
            {/* Heatmap */}
            <div style={{background:"#fff",borderRadius:20,border:"1.5px solid #F3F4F6",padding:"18px 16px",boxShadow:"0 1px 4px rgba(0,0,0,0.03)"}}>
              <div style={{fontSize:12,fontWeight:700,color:"#9CA3AF",marginBottom:10,letterSpacing:0.5,textTransform:"uppercase"}}>This Week</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>
                {heatmap.map((d,i) => {
                  const int = Math.min(d.pts/10,1);
                  return <div key={i} style={{textAlign:"center"}}>
                    <div style={{fontSize:11,color:"#D1D5DB",marginBottom:5,fontWeight:500}}>{getDayName(d.day)}</div>
                    <div style={{width:34,height:34,borderRadius:10,margin:"0 auto",background:d.pts>0?curGym.color+(Math.round(25+int*55)).toString(16):d.isT?"#FFFBEB":"#F9FAFB",border:d.isT?"2px solid #F59E0B":"1.5px solid "+(d.pts>0?"transparent":"#F3F4F6"),display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:d.pts>0?"#fff":"#D1D5DB"}}>{d.pts>0?d.pts:d.isP?"-":""}</div>
                  </div>;
                })}
              </div>
            </div>
            {/* Trend */}
            <div style={{background:"#fff",borderRadius:20,border:"1.5px solid #F3F4F6",padding:"18px 16px",boxShadow:"0 1px 4px rgba(0,0,0,0.03)"}}>
              <div style={{fontSize:12,fontWeight:700,color:"#9CA3AF",marginBottom:12,letterSpacing:0.5,textTransform:"uppercase"}}>4-Week Trend</div>
              <div style={{display:"flex",alignItems:"flex-end",gap:10,height:72}}>
                {trend.map((w,i) => {
                  const h = maxTr>0?(w.pts/maxTr)*60:0;
                  return <div key={i} style={{flex:1,textAlign:"center"}}>
                    <div style={{fontSize:12,fontWeight:700,color:i===3?curGym.color:"#9CA3AF",marginBottom:4}}>{w.pts}</div>
                    <div style={{height:Math.max(h,4),borderRadius:8,background:i===3?curGym.grad:"#F3F4F6",transition:"height .5s"}}/>
                    <div style={{fontSize:11,color:"#D1D5DB",marginTop:5,fontWeight:500}}>{w.label}</div>
                  </div>;
                })}
              </div>
            </div>
            {/* Overdue */}
            {overdue.length>0 && (
              <div style={{background:"#FEF2F2",borderRadius:20,padding:"18px 18px",border:"1.5px solid #FEE2E2"}}>
                <div style={{fontSize:12,fontWeight:700,color:"#DC2626",marginBottom:10,letterSpacing:0.5,textTransform:"uppercase"}}>Overdue Follow-ups</div>
                {overdue.slice(0,3).map(c => (
                  <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #FEE2E2"}}>
                    <div>
                      <div style={{fontSize:14,fontWeight:600}}>{c.name}</div>
                      <div style={{fontSize:12,color:"#9CA3AF",fontWeight:500}}>{c.position || c.company} — Due {fmtDate(c.followUpDate)}</div>
                    </div>
                    <button onClick={() => {
                      const act = ALL_ACT.find(a => a.id==="follow_up");
                      if(act) logAct(act, c.name);
                      const u = { ...c, lastContact:NOW, followUpDate:"" };
                      setCts(p => p.map(x => x.id===c.id ? u : x));
                      db.upsertContact(u).catch(()=>{});
                    }} style={{background:"#DC2626",color:"#fff",padding:"6px 14px",fontSize:12,fontWeight:700,borderRadius:10,border:"none",fontFamily:F,cursor:"pointer"}}>Done</button>
                  </div>
                ))}
              </div>
            )}
            {/* Goal + Reset */}
            <div style={{background:"#fff",borderRadius:20,border:"1.5px solid #F3F4F6",padding:"16px 18px",boxShadow:"0 1px 4px rgba(0,0,0,0.03)"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontSize:13,color:"#9CA3AF",fontWeight:500}}>Weekly Goal</div>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginTop:6}}>
                    <button onClick={() => setGoal(g => Math.max(5,g-5))} style={{background:"#F3F4F6",border:"none",color:"#374151",width:32,height:32,fontSize:18,borderRadius:10,cursor:"pointer",fontFamily:F,fontWeight:700}}>−</button>
                    <span style={{fontSize:20,fontWeight:800,minWidth:30,textAlign:"center"}}>{goal}</span>
                    <button onClick={() => setGoal(g => g+5)} style={{background:"#F3F4F6",border:"none",color:"#374151",width:32,height:32,fontSize:18,borderRadius:10,cursor:"pointer",fontFamily:F,fontWeight:700}}>+</button>
                  </div>
                </div>
                <button onClick={resetAll} style={{background:"#FEF2F2",color:"#DC2626",padding:"8px 16px",fontSize:12,fontWeight:700,borderRadius:12,border:"none",fontFamily:F,cursor:"pointer"}}>Reset All</button>
              </div>
            </div>
            {/* History */}
            {log.length>0 && (
              <div>
                <div style={{fontSize:12,fontWeight:700,color:"#9CA3AF",marginBottom:8,letterSpacing:0.5,textTransform:"uppercase"}}>Recent Activity</div>
                {[...log].sort((a,b) => (b.timestamp||"").localeCompare(a.timestamp||"")).slice(0,8).map(e => (
                  <div key={e.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:"#fff",borderRadius:14,border:"1.5px solid #F3F4F6",marginBottom:4}}>
                    <span style={{fontSize:18}}>{e.emoji}</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:600}}>{e.name}{e.contactName && <span style={{color:"#9CA3AF"}}> — {e.contactName}</span>}</div>
                      <div style={{fontSize:12,color:"#D1D5DB",fontWeight:500}}>{fmtDate(e.date)}</div>
                    </div>
                    <div style={{fontSize:14,fontWeight:700,color:curGym.color}}>+{e.points}</div>
                  </div>
                ))}
                <div style={{textAlign:"center",padding:8,fontSize:12,color:"#D1D5DB",fontWeight:500}}>{log.length} total · {totPts} pts</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── CONTACT MODAL ─── */}
      {showCM && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.3)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20,backdropFilter:"blur(4px)"}} onClick={() => setShowCM(false)}>
          <div style={{background:"#fff",borderRadius:24,padding:26,width:"100%",maxWidth:400,border:"1.5px solid #F3F4F6",boxShadow:"0 20px 60px rgba(0,0,0,.12)",animation:"si .25s ease"}} onClick={e => e.stopPropagation()}>
            <h3 style={{fontSize:20,fontWeight:800,marginBottom:18}}>{editC?"Edit Contact":"Add Contact"}</h3>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <input placeholder="Name *" value={cf.name} onChange={e => setCf({...cf,name:e.target.value})}/>
              <input placeholder="Job Title / Position" value={cf.position} onChange={e => setCf({...cf,position:e.target.value})}/>
              <input placeholder="Company / Org" value={cf.company} onChange={e => setCf({...cf,company:e.target.value})}/>
              <textarea placeholder="Notes" value={cf.notes} onChange={e => setCf({...cf,notes:e.target.value})} rows={2}/>
              <div><label style={{fontSize:13,color:"#6B7280",display:"block",marginBottom:4,fontWeight:600}}>Follow-up Date</label><input type="date" value={cf.followUpDate} onChange={e => setCf({...cf,followUpDate:e.target.value})}/></div>
              <div><label style={{fontSize:13,color:"#6B7280",display:"block",marginBottom:4,fontWeight:600}}>Warmth</label>
                <div style={{display:"flex",gap:6}}>
                  {[1,2,3].map(w => (
                    <button key={w} onClick={() => setCf({...cf,warmth:w})} style={{flex:1,padding:10,fontSize:14,fontWeight:cf.warmth===w?700:500,background:cf.warmth===w?"#ECFDF5":"#F9FAFB",color:cf.warmth===w?"#059669":"#9CA3AF",border:"1.5px solid "+(cf.warmth===w?"#059669":"#E5E7EB"),borderRadius:12,fontFamily:F,cursor:"pointer"}}>{warmL[w]}</button>
                  ))}
                </div>
              </div>
              <div><label style={{fontSize:13,color:"#6B7280",display:"block",marginBottom:4,fontWeight:600}}>Seniority</label>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {SEN.slice(1).map(s => (
                    <button key={s.id} onClick={() => setCf({...cf,seniority:s.id})} style={{flex:1,minWidth:60,padding:"8px 4px",fontSize:13,fontWeight:cf.seniority===s.id?700:500,background:cf.seniority===s.id?s.bg:"#F9FAFB",color:cf.seniority===s.id?s.color:"#9CA3AF",border:"1.5px solid "+(cf.seniority===s.id?s.color:"#E5E7EB"),borderRadius:12,fontFamily:F,cursor:"pointer"}}>{s.emoji} {s.label}</button>
                  ))}
                </div>
              </div>
              <div style={{display:"flex",gap:8,marginTop:6}}>
                <button onClick={() => setShowCM(false)} style={{flex:1,background:"#F9FAFB",border:"1.5px solid #E5E7EB",color:"#6B7280",padding:14,borderRadius:14,fontFamily:F,fontSize:15,fontWeight:600,cursor:"pointer"}}>Cancel</button>
                <button onClick={saveC} style={{flex:1,background:curGym.grad,border:"none",color:"#fff",padding:14,borderRadius:14,fontFamily:F,fontSize:15,fontWeight:700,cursor:"pointer"}}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── IMPORT MODAL ─── */}
      {showIM && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.3)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20,backdropFilter:"blur(4px)"}} onClick={() => setShowIM(false)}>
          <div style={{background:"#fff",borderRadius:24,padding:24,width:"100%",maxWidth:460,maxHeight:"85vh",display:"flex",flexDirection:"column",border:"1.5px solid #F3F4F6",boxShadow:"0 20px 60px rgba(0,0,0,.12)",animation:"si .25s ease"}} onClick={e => e.stopPropagation()}>
            <h3 style={{fontSize:20,fontWeight:800}}>Sync LinkedIn Contacts</h3>
            <p style={{fontSize:13,color:"#9CA3AF",marginTop:3,marginBottom:12,fontWeight:500}}>
              {impPrev.filter(p => !p.exists).length} new · {impPrev.filter(p => p.exists).length} existing
            </p>

            {/* Sync mode toggle */}
            {impPrev.some(p => p.exists) && (
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:impSync?"#EFF6FF":"#F9FAFB",border:"1.5px solid "+(impSync?"#3B82F6":"#E5E7EB"),borderRadius:14,marginBottom:12,cursor:"pointer"}} onClick={() => {
                const next = !impSync;
                setImpSync(next);
                if(next) {
                  // Select all (new + existing)
                  setImpSel(new Set(filtImp.map(p => p.id)));
                } else {
                  // Select new only
                  setImpSel(new Set(filtImp.filter(p => !p.exists).map(p => p.id)));
                }
              }}>
                <div style={{width:20,height:20,borderRadius:6,background:impSync?"#3B82F6":"#fff",border:"1.5px solid "+(impSync?"#3B82F6":"#D1D5DB"),display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#fff",fontWeight:700,flexShrink:0}}>{impSync?"✓":""}</div>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:impSync?"#1D4ED8":"#374151"}}>Sync mode — update existing contacts</div>
                  <div style={{fontSize:12,color:"#9CA3AF",fontWeight:500}}>Refresh company & job title from LinkedIn</div>
                </div>
              </div>
            )}

            <input placeholder="Filter by name, company, title…" value={impF} onChange={e => setImpF(e.target.value)} style={{marginBottom:10}}/>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              <button onClick={() => setImpSel(new Set(filtImp.filter(p => impSync || !p.exists).map(p => p.id)))} style={{background:"#F3F4F6",border:"none",color:"#6B7280",padding:"6px 14px",fontSize:12,fontWeight:600,borderRadius:10,fontFamily:F,cursor:"pointer"}}>Select all</button>
              <button onClick={() => setImpSel(new Set())} style={{background:"#F3F4F6",border:"none",color:"#6B7280",padding:"6px 14px",fontSize:12,fontWeight:600,borderRadius:10,fontFamily:F,cursor:"pointer"}}>Clear</button>
            </div>
            <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:4,minHeight:0}}>
              {filtImp.map(p => {
                const canSelect = !p.exists || impSync;
                const isSelected = impSel.has(p.id);
                return <div key={p.id}
                  onClick={() => {
                    if(!canSelect) return;
                    setImpSel(prev => { const n=new Set(prev); if(n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; });
                  }}
                  style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:isSelected?"#EFF6FF":"#fff",borderRadius:12,cursor:canSelect?"pointer":"default",border:"1.5px solid "+(isSelected?"#3B82F6":"#F3F4F6"),opacity:(!canSelect&&!impSync)?0.4:1,transition:"all .12s"}}>
                  <div style={{width:20,height:20,borderRadius:6,flexShrink:0,background:p.exists&&!impSync?"#E5E7EB":isSelected?"#3B82F6":"#F9FAFB",border:"1.5px solid "+(isSelected?"#3B82F6":"#E5E7EB"),display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff",fontWeight:700}}>
                    {p.exists&&!impSync?"–":isSelected?"✓":""}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {p.name}
                      {p.exists && <span style={{marginLeft:6,fontSize:11,padding:"1px 6px",borderRadius:6,background:impSync?"#DBEAFE":"#F3F4F6",color:impSync?"#2563EB":"#9CA3AF",fontWeight:600}}>{impSync?"sync":"exists"}</span>}
                    </div>
                    <div style={{fontSize:12,color:"#9CA3AF",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:500}}>
                      {p.position}{p.position&&p.company?" · ":""}{p.company}
                    </div>
                  </div>
                </div>;
              })}
            </div>
            <div style={{display:"flex",gap:8,marginTop:14}}>
              <button onClick={() => { setShowIM(false); setImpPrev([]); setImpSel(new Set()); }} style={{flex:1,background:"#F9FAFB",border:"1.5px solid #E5E7EB",color:"#6B7280",padding:14,borderRadius:14,fontFamily:F,fontSize:15,fontWeight:600,cursor:"pointer"}}>Cancel</button>
              <button onClick={doImport} style={{flex:1,background:"linear-gradient(135deg,#3B82F6,#1D4ED8)",border:"none",color:"#fff",padding:14,borderRadius:14,fontFamily:F,fontSize:15,fontWeight:700,cursor:"pointer"}}>
                {impSync ? "Sync " : "Import "}{impSel.size}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── TOAST ─── */}
      {toast && (
        <div style={{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",background:curGym.grad,color:"#fff",padding:"10px 24px",borderRadius:24,fontSize:14,fontWeight:700,zIndex:200,animation:"ti .25s ease",boxShadow:"0 6px 24px "+curGym.color+"35",whiteSpace:"nowrap"}}>{toast}</div>
      )}
    </div>
  );
}
