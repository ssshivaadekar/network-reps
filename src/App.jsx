import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Papa from "papaparse";
import { db, isSupabaseConfigured } from "./supabaseClient";

/* ─── ACTIVITY CONFIG ─── */
var TIERS = [
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
var ALL_ACT = TIERS.flatMap(function(t) { return t.activities.map(function(a) { return Object.assign({}, a, { tier: t.tier, tierColor: t.color }); }); });

/* ─── SENIORITY & GYM ─── */
var SEN = [
  { id: 0, label: "Unset", emoji: "-", color: "#9CA3AF", bg: "#F3F4F6" },
  { id: 1, label: "Junior", emoji: "🌱", color: "#059669", bg: "#D1FAE5" },
  { id: 2, label: "Peer", emoji: "👤", color: "#2563EB", bg: "#DBEAFE" },
  { id: 3, label: "Senior", emoji: "📊", color: "#D97706", bg: "#FEF3C7" },
  { id: 4, label: "Executive", emoji: "👔", color: "#DC2626", bg: "#FEE2E2" },
];

var GYM = [
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
  var t = title.toLowerCase();
  if (/\b(ceo|cfo|cto|coo|cmo|cpo|chief|founder|co-founder|president|owner|partner|managing director)\b/.test(t)) return 4;
  if (/\b(vp|vice president|svp|evp|head of|director|general manager)\b/.test(t)) return 3;
  if (/\b(manager|lead|senior|principal|staff|architect)\b/.test(t)) return 2;
  if (/\b(associate|analyst|coordinator|specialist|assistant|intern|junior|entry|trainee)\b/.test(t)) return 1;
  return 0;
}

/* ─── HELPERS ─── */
function getWeekStart(d) { var x = new Date(d); var day = x.getDay(); x.setDate(x.getDate() - day + (day === 0 ? -6 : 1)); x.setHours(0,0,0,0); return x.toISOString().split("T")[0]; }
function getToday() { return new Date().toISOString().split("T")[0]; }
function getDayName(s) { return new Date(s+"T12:00:00").toLocaleDateString("en-US",{weekday:"short"}); }
function getWeekDays(ws) { var d=[]; for(var i=0;i<7;i++){var x=new Date(ws+"T12:00:00");x.setDate(x.getDate()+i);d.push(x.toISOString().split("T")[0]);} return d; }
function fmtDate(s) { return new Date(s+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}); }
function uid() { return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function daysSince(dateStr, now) { if(!dateStr) return 999; return Math.floor((new Date(now)-new Date(dateStr))/(1000*60*60*24)); }

var warmL = ["","🧊 Cold","🌤 Warm","🔥 Hot"];

/* ════════════════════ APP ════════════════════ */
export default function App() {
  var _a = useState("gym"), view = _a[0], setView = _a[1];
  var _b = useState([]), log = _b[0], setLog = _b[1];
  var _c = useState([]), contacts = _c[0], setCts = _c[1];
  var _d = useState(false), showCM = _d[0], setShowCM = _d[1];
  var _e = useState(null), editC = _e[0], setEditC = _e[1];
  var _f = useState({ name:"", company:"", notes:"", followUpDate:"", warmth:1, seniority:0 }), cf = _f[0], setCf = _f[1];
  var _g = useState(25), goal = _g[0], setGoal = _g[1];
  var _h = useState(null), toast = _h[0], setToast = _h[1];
  var _i = useState(null), anim = _i[0], setAnim = _i[1];
  var _j = useState(false), loaded = _j[0], setLoaded = _j[1];
  var _k = useState(false), showIM = _k[0], setShowIM = _k[1];
  var _l = useState([]), impPrev = _l[0], setImpPrev = _l[1];
  var _m = useState(new Set()), impSel = _m[0], setImpSel = _m[1];
  var _n = useState(""), impF = _n[0], setImpF = _n[1];
  var _o = useState(null), gymPick = _o[0], setGymPick = _o[1];
  var _p = useState([]), dismissed = _p[0], setDismissed = _p[1];
  var fRef = useRef(null);

  var NOW = getToday();
  var WS = getWeekStart(NOW);
  var WD = getWeekDays(WS);

  /* Load */
  useEffect(function() {
    (async function() {
      try {
        var r = await Promise.all([db.getActivityLog(), db.getContacts(), db.getSettings()]);
        setLog(r[0]); setCts(r[1]); setGoal(r[2]);
      } catch(e) { console.warn("Load:", e); }
      setLoaded(true);
    })();
  }, []);
  useEffect(function() { if(loaded) db.setSettings(goal).catch(function(){}); }, [goal, loaded]);

  /* Stats */
  var wkLog = useMemo(function() { return log.filter(function(l) { return l.date >= WS && l.date <= WD[6]; }); }, [log, WS, WD]);
  var tdLog = useMemo(function() { return log.filter(function(l) { return l.date === NOW; }); }, [log, NOW]);
  var wkPts = useMemo(function() { return wkLog.reduce(function(s,l) { return s+l.points; }, 0); }, [wkLog]);
  var tdPts = useMemo(function() { return tdLog.reduce(function(s,l) { return s+l.points; }, 0); }, [tdLog]);
  var actDays = useMemo(function() { return new Set(wkLog.map(function(l) { return l.date; })).size; }, [wkLog]);

  var streak = useMemo(function() {
    var s=0, d=new Date(NOW+"T12:00:00");
    if(!log.some(function(l) { return l.date===NOW; })) d.setDate(d.getDate()-1);
    while(log.some(function(l) { return l.date===d.toISOString().split("T")[0]; })) { s++; d.setDate(d.getDate()-1); }
    return s;
  }, [log, NOW]);

  var heatmap = useMemo(function() {
    return WD.map(function(day) {
      return { day: day, pts: log.filter(function(l) { return l.date===day; }).reduce(function(s,l) { return s+l.points; }, 0), isT: day===NOW, isP: day<NOW };
    });
  }, [WD, log, NOW]);

  var trend = useMemo(function() {
    var w = [];
    for(var i=3;i>=0;i--) {
      var d=new Date(WS+"T12:00:00"); d.setDate(d.getDate()-i*7);
      var s=d.toISOString().split("T")[0], ds=getWeekDays(s);
      w.push({pts:log.filter(function(l) { return l.date>=s && l.date<=ds[6]; }).reduce(function(a,l) { return a+l.points; },0), label:i===0?"This Week":i+"w ago"});
    }
    return w;
  }, [log, WS]);
  var maxTr = Math.max.apply(null, trend.map(function(w) { return w.pts; }).concat([goal]));

  var overdue = useMemo(function() {
    return contacts.filter(function(c) { return c.followUpDate && c.followUpDate <= NOW; }).sort(function(a,b) { return a.followUpDate.localeCompare(b.followUpDate); });
  }, [contacts, NOW]);

  var suggest = useMemo(function() {
    var s = [];
    if(overdue.length>0) s.push({text:"Follow up with "+overdue[0].name, aid:"follow_up", cn:overdue[0].name});
    if(tdPts<3) { s.push({text:"Thoughtful comment on LinkedIn", aid:"comment_post"}); s.push({text:"Research someone to connect with", aid:"research_contact"}); }
    if(tdPts>=3 && tdPts<8) s.push({text:"Send a DM to someone you admire", aid:"send_dm"});
    if(actDays>=3 && wkPts<goal*0.7) s.push({text:"Schedule a coffee chat this week", aid:"coffee_chat"});
    return s.slice(0,3);
  }, [overdue, tdPts, actDays, wkPts, goal]);

  var totPts = log.reduce(function(s,l) { return s+l.points; },0);
  var lvl = Math.floor(totPts/50)+1;
  var lvlP = ((totPts%50)/50)*100;
  var lvlNames = ["Wallflower","Observer","Nodder","Conversationalist","Connector","Hub","Catalyst","Influencer","Maven","Superconnector"];
  var lvlN = lvlNames[Math.min(lvl-1,9)];
  var pPct = Math.min((wkPts/goal)*100, 100);

  /* Gym */
  var autoGym = useMemo(function() { return GYM[[3,0,1,2,0,4,3][new Date().getDay()]]; }, []);
  var curGym = gymPick || autoGym;

  var gymCards = useMemo(function() {
    if(contacts.length === 0) return [];
    var pool = [];
    if(curGym.id === "power") {
      [1,2,3,4].forEach(function(lv) {
        var g = contacts.filter(function(c) { return (c.seniority||0) === lv; });
        if(g.length > 0) pool.push(g[Math.floor(Math.random()*g.length)]);
      });
    } else if(curGym.id === "reconnect") {
      pool = contacts.filter(function(c) { return daysSince(c.lastContact, NOW) >= 30; });
    } else {
      pool = contacts.filter(function(c) { return curGym.senFilter && curGym.senFilter.indexOf(c.seniority||0) >= 0; });
    }
    pool = pool.filter(function(c) { return dismissed.indexOf(c.id) < 0; });
    pool.sort(function(a,b) {
      var ao = (a.followUpDate && a.followUpDate<=NOW)?1:0;
      var bo = (b.followUpDate && b.followUpDate<=NOW)?1:0;
      if(bo!==ao) return bo-ao;
      return (a.warmth||0)-(b.warmth||0);
    });
    return pool.slice(0,5).map(function(c,i) {
      return Object.assign({}, c, { sugAction: curGym.actions[i % curGym.actions.length] });
    });
  }, [contacts, curGym, dismissed, NOW]);

  /* Actions */
  var notify = useCallback(function(m) { setToast(m); setTimeout(function() { setToast(null); }, 2500); }, []);

  async function logAct(a, cn) {
    var e = {id:uid(), activityId:a.id, name:a.name, points:a.points, tier:a.tier, date:NOW, timestamp:new Date().toISOString(), contactName:cn||null, emoji:a.emoji};
    setLog(function(p) { return [e].concat(p); }); setAnim(a.id); setTimeout(function() { setAnim(null); }, 500);
    notify("+"+a.points+" pts - "+a.name);
    try { await db.addActivity(e); } catch(ex) { console.warn(ex); }
  }

  function completeCard(c) {
    var ids = {1:"send_dm",2:"send_dm",3:"coffee_chat",4:"congrats_msg"};
    var act = ALL_ACT.find(function(a) { return a.id===(ids[c.seniority||2]||"send_dm"); }) || ALL_ACT.find(function(a) { return a.id==="follow_up"; });
    if(act) logAct(act, c.name);
    var upd = Object.assign({}, c, { lastContact:NOW });
    setCts(function(p) { return p.map(function(x) { return x.id===c.id ? upd : x; }); });
    db.upsertContact(upd).catch(function(){});
    setDismissed(function(p) { return p.concat([c.id]); });
  }

  async function autoDetect() {
    var count = 0;
    var updated = contacts.map(function(c) {
      if ((c.seniority || 0) > 0) return c;
      var detected = inferSen(c.notes || "");
      if (detected > 0) { count++; return Object.assign({}, c, { seniority: detected }); }
      return c;
    });
    setCts(updated);
    updated.forEach(function(c) { if ((c.seniority || 0) > 0) db.upsertContact(c).catch(function(){}); });
    var unset = updated.filter(function(c) { return (c.seniority || 0) === 0; }).length;
    notify("Detected " + count + " contacts" + (unset > 0 ? " (" + unset + " unset)" : ""));
  }

  /* Coffee Prep - smart ranking */
  var coffeePicks = useMemo(function() {
    return contacts.filter(function(c) { return (c.seniority || 0) >= 3; })
      .map(function(c) {
        var score = 0;
        // Overdue follow-up = highest priority
        if (c.followUpDate && c.followUpDate <= NOW) score += 50;
        // Coldest contacts need warming up
        if ((c.warmth || 1) === 1) score += 20;
        else if ((c.warmth || 1) === 2) score += 10;
        // Haven't talked in a while
        var days = daysSince(c.lastContact, NOW);
        if (days >= 90) score += 30;
        else if (days >= 60) score += 20;
        else if (days >= 30) score += 10;
        // Executives get slight boost
        if ((c.seniority || 0) === 4) score += 5;
        return Object.assign({}, c, { cofScore: score });
      })
      .sort(function(a, b) { return b.cofScore - a.cofScore; })
      .slice(0, 8);
  }, [contacts, NOW]);

  async function saveC() {
    if(!cf.name.trim()) return;
    var c = editC ? Object.assign({}, editC, cf, {lastContact:NOW}) : Object.assign({}, cf, {id:uid(), lastContact:NOW, created_at:new Date().toISOString()});
    if(editC) setCts(function(p) { return p.map(function(x) { return x.id===editC.id?c:x; }); });
    else setCts(function(p) { return [c].concat(p); });
    setShowCM(false); setEditC(null);
    setCf({name:"",company:"",notes:"",followUpDate:"",warmth:1,seniority:0});
    try { await db.upsertContact(c); } catch(ex) { console.warn(ex); }
  }

  async function delC(id) {
    setCts(function(p) { return p.filter(function(c) { return c.id!==id; }); });
    try { await db.deleteContact(id); } catch(ex) {}
  }

  async function resetAll() {
    setLog([]); setCts([]); setGoal(25); notify("Data reset");
    try { await Promise.all([db.clearActivityLog(),db.clearContacts(),db.setSettings(25)]); } catch(ex) {}
  }

  function handleCSV(e) {
    var file = e.target.files[0]; if(!file) return;
    var reader = new FileReader();
    reader.onload = function(evt) {
      var text = evt.target.result.replace(/^\uFEFF/,"");
      Papa.parse(text, {
        header:true, skipEmptyLines:true, transformHeader:function(h) { return h.trim(); },
        complete:function(results) {
          var hds = results.meta.fields || [];
          function find() {
            var pats = Array.prototype.slice.call(arguments);
            return hds.find(function(h) { var lh=h.toLowerCase().replace(/[^a-z]/g,""); return pats.some(function(p) { return lh===p||lh.indexOf(p)>=0; }); }) || "";
          }
          var fnC=find("firstname","first"), lnC=find("lastname","last");
          var coC=find("company","organization"), posC=find("position","title","jobtitle");
          var emC=find("emailaddress","email"), conC=find("connectedon","connected");
          if(!fnC && !lnC) {
            var nameC = hds.find(function(h) { return h.toLowerCase().indexOf("name")>=0; });
            if(nameC) {
              var parsed = results.data.map(function(row) {
                var nm=(row[nameC]||"").trim(); if(!nm||nm.length<2) return null;
                var co=coC?(row[coC]||"").trim():"", pos=posC?(row[posC]||"").trim():"";
                var ex=contacts.some(function(c) { return c.name.toLowerCase()===nm.toLowerCase(); });
                return {id:uid(),name:nm,company:co,position:pos,email:"",connectedOn:"",notes:pos?(pos+(co?" at "+co:"")):"",warmth:1,seniority:inferSen(pos),exists:ex};
              }).filter(Boolean);
              if(parsed.length>0){setImpPrev(parsed);setImpSel(new Set(parsed.filter(function(p){return !p.exists;}).slice(0,50).map(function(p){return p.id;})));setShowIM(true);return;}
            }
            notify("Could not find name columns"); return;
          }
          var parsed2 = results.data.map(function(row) {
            var fn=fnC?(row[fnC]||"").trim():"", ln=lnC?(row[lnC]||"").trim():"";
            var nm=(fn+" "+ln).trim(); if(!nm||nm.length<2) return null;
            var co=coC?(row[coC]||"").trim():"", pos=posC?(row[posC]||"").trim():"";
            var em=emC?(row[emC]||"").trim():"", cn=conC?(row[conC]||"").trim():"";
            var ex=contacts.some(function(c) { return c.name.toLowerCase()===nm.toLowerCase(); });
            return {id:uid(),name:nm,company:co,position:pos,email:em,connectedOn:cn,notes:pos?(pos+(co?" at "+co:"")):"",warmth:1,seniority:inferSen(pos),exists:ex};
          }).filter(Boolean);
          if(parsed2.length===0){notify("0 contacts found");return;}
          setImpPrev(parsed2);setImpSel(new Set(parsed2.filter(function(p){return !p.exists;}).slice(0,50).map(function(p){return p.id;})));setShowIM(true);
        },
        error:function() { notify("Error reading CSV"); },
      });
    };
    reader.readAsText(file); e.target.value="";
  }

  async function doImport() {
    var imp = impPrev.filter(function(p){return impSel.has(p.id);}).map(function(p){return {id:p.id,name:p.name,company:p.company,notes:p.notes,lastContact:p.connectedOn||NOW,followUpDate:"",warmth:1,seniority:p.seniority||0,created_at:new Date().toISOString()};});
    setCts(function(p){return p.concat(imp);}); setShowIM(false); setImpPrev([]); setImpSel(new Set());
    notify("Imported "+imp.length+" contacts");
    try{await db.importContacts(imp);}catch(ex){}
  }

  var filtImp = useMemo(function() {
    if(!impF) return impPrev; var f=impF.toLowerCase();
    return impPrev.filter(function(p){return p.name.toLowerCase().indexOf(f)>=0||p.company.toLowerCase().indexOf(f)>=0||(p.position||"").toLowerCase().indexOf(f)>=0;});
  }, [impPrev, impF]);

  var F = "'Google Sans','Product Sans','Plus Jakarta Sans',sans-serif";

  /* ════════════════════ RENDER ════════════════════ */
  return (
    <div style={{fontFamily:F,background:"#FFFFFF",minHeight:"100vh",color:"#111827",maxWidth:480,margin:"0 auto"}}>
      <style>{"\
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');\
        *{box-sizing:border-box;margin:0;padding:0}body{background:#fff}\
        @keyframes su{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}\
        @keyframes si{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}\
        @keyframes pop{0%{transform:scale(.92)}50%{transform:scale(1.06)}100%{transform:scale(1)}}\
        @keyframes ti{from{transform:translateX(-50%) translateY(14px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}\
        ::-webkit-scrollbar{display:none}\
        input,textarea{font-family:"+F+";background:#F9FAFB;border:1.5px solid #E5E7EB;border-radius:14px;padding:12px 16px;color:#111827;font-size:15px;width:100%;outline:none;transition:border-color .2s}\
        input:focus,textarea:focus{border-color:#3B82F6;box-shadow:0 0 0 3px #3B82F620}\
        input[type=date]{color-scheme:light}\
      "}</style>

      {/* ─── HERO BANNER ─── */}
      <div style={{background:view==="coffee"?"linear-gradient(135deg,#92400E,#78350F)":curGym.grad,padding:"22px 22px 18px",borderRadius:"0 0 28px 28px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-30,right:-30,width:120,height:120,borderRadius:"50%",background:"rgba(255,255,255,0.1)"}}/>
        <div style={{position:"absolute",bottom:-20,left:-20,width:80,height:80,borderRadius:"50%",background:"rgba(255,255,255,0.07)"}}/>
        <div style={{position:"relative",zIndex:1}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:14,fontWeight:600,color:"rgba(255,255,255,0.75)"}}>Network Reps</div>
            <div style={{background:"rgba(255,255,255,0.2)",borderRadius:20,padding:"4px 14px",fontSize:12,fontWeight:700,color:"#fff"}}>
              Lv {lvl} - {lvlN}
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
                <div style={{fontSize:14,color:"rgba(255,255,255,0.7)",fontWeight:500,marginTop:1}}>{curGym.muscle} - {curGym.desc}</div>
              </div>
            </div>
          )}
          {/* Quick stats row */}
          <div style={{display:"flex",gap:12,marginTop:16}}>
            {[{l:"Today",v:tdPts+" pts"},{l:"Streak",v:streak+"d"},{l:"Week",v:wkPts+"/"+goal}].map(function(x,i) {
              return <div key={i} style={{flex:1,background:"rgba(255,255,255,0.15)",borderRadius:14,padding:"10px 12px",textAlign:"center"}}>
                <div style={{fontSize:16,fontWeight:800,color:"#fff"}}>{x.v}</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.6)",fontWeight:500,marginTop:1}}>{x.l}</div>
              </div>;
            })}
          </div>
        </div>
      </div>

      {/* ─── TAB BAR ─── */}
      <div style={{display:"flex",padding:"10px 20px 0",gap:0}}>
        {[{id:"gym",l:"🏋️ Gym"},{id:"coffee",l:"☕ Coffee"},{id:"log",l:"📝 Log"},{id:"contacts",l:"👥 People"},{id:"stats",l:"📊 Stats"}].map(function(t) {
          return <button key={t.id} onClick={function(){setView(t.id);}} style={{
            flex:1,padding:"11px 0",background:"none",border:"none",
            borderBottom:view===t.id?"2.5px solid "+curGym.color:"2.5px solid #F3F4F6",
            fontSize:13,fontWeight:view===t.id?700:500,
            color:view===t.id?curGym.color:"#9CA3AF",
            fontFamily:F,cursor:"pointer",transition:"all .2s",
          }}>{t.l}</button>;
        })}
      </div>

      {!isSupabaseConfigured && loaded && (
        <div style={{margin:"10px 20px 0",padding:"8px 14px",background:"#FFFBEB",borderRadius:12,fontSize:12,color:"#D97706",fontWeight:500}}>
          Local mode - add Supabase env vars for cloud sync
        </div>
      )}

      <div style={{padding:"14px 20px 100px"}}>

        {/* ══════ GYM ══════ */}
        {view==="gym" && (
          <div style={{animation:"su .3s ease"}}>
            {/* Workout selector */}
            <div style={{display:"flex",gap:8,overflowX:"auto",margin:"6px 0 18px",paddingBottom:4}}>
              {GYM.map(function(g) {
                return <button key={g.id} onClick={function(){setGymPick(g);setDismissed([]);}}
                  style={{flexShrink:0,padding:"9px 16px",borderRadius:24,border:"none",
                    background:curGym.id===g.id?g.grad:"#F3F4F6",
                    color:curGym.id===g.id?"#fff":"#6B7280",
                    fontFamily:F,fontSize:13,fontWeight:curGym.id===g.id?700:500,
                    cursor:"pointer",transition:"all .2s",
                    boxShadow:curGym.id===g.id?"0 4px 12px "+g.color+"30":"none",
                  }}>{g.emoji} {g.label}</button>;
              })}
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
                  <button onClick={function(){setDismissed([]);}} style={{marginTop:16,padding:"10px 24px",borderRadius:24,border:"none",background:curGym.grad,color:"#fff",fontFamily:F,fontSize:14,fontWeight:700,cursor:"pointer"}}>Go Again</button>
                )}
                {contacts.length>0 && dismissed.length===0 && (
                  <button onClick={autoDetect} style={{marginTop:16,padding:"12px 24px",borderRadius:24,border:"none",background:curGym.grad,color:"#fff",fontFamily:F,fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 12px "+curGym.color+"30"}}>Auto-detect from job titles</button>
                )}
              </div>
            ) : (
              gymCards.map(function(c,idx) {
                var sn = SEN[c.seniority||0];
                var od = c.followUpDate && c.followUpDate<=NOW;
                return <div key={c.id} style={{background:"#FFFFFF",borderRadius:20,marginBottom:14,border:"1.5px solid #F3F4F6",boxShadow:"0 2px 8px rgba(0,0,0,0.04)",overflow:"hidden",animation:"su "+(0.15+idx*0.08)+"s ease"}}>
                  <div style={{height:4,background:curGym.grad}}/>
                  <div style={{padding:"18px 20px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div>
                        <div style={{fontSize:18,fontWeight:700,letterSpacing:-0.3}}>{c.name}</div>
                        <div style={{fontSize:14,color:"#9CA3AF",marginTop:3,fontWeight:500}}>{c.company}</div>
                      </div>
                      <span style={{fontSize:11,padding:"4px 10px",borderRadius:20,background:sn.bg,color:sn.color,fontWeight:700}}>{sn.emoji} {sn.label}</span>
                    </div>
                    <div style={{display:"flex",gap:8,marginTop:12}}>
                      {c.lastContact && <span style={{fontSize:13,padding:"4px 12px",borderRadius:10,background:"#F9FAFB",color:"#6B7280",fontWeight:500}}>Last: {fmtDate(c.lastContact)}</span>}
                      <span style={{fontSize:13,padding:"4px 12px",borderRadius:10,background:"#F9FAFB",color:"#6B7280",fontWeight:500}}>{warmL[c.warmth||1]}</span>
                      {od && <span style={{fontSize:11,padding:"4px 10px",borderRadius:10,background:"#FEE2E2",color:"#DC2626",fontWeight:700}}>Overdue</span>}
                    </div>
                    <div style={{marginTop:14,padding:"14px 16px",borderRadius:14,background:curGym.light,border:"1px solid "+curGym.color+"20"}}>
                      <div style={{fontSize:10,fontWeight:800,letterSpacing:1.5,color:curGym.color,marginBottom:4,textTransform:"uppercase"}}>Suggested rep</div>
                      <div style={{fontSize:15,fontWeight:500,lineHeight:1.45,color:"#374151"}}>{c.sugAction}</div>
                    </div>
                    <div style={{display:"flex",gap:10,marginTop:14}}>
                      <button onClick={function(){completeCard(c);}} style={{flex:1,padding:"14px",borderRadius:14,border:"none",background:curGym.grad,color:"#fff",fontFamily:F,fontSize:15,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 12px "+curGym.color+"25"}}>Done</button>
                      <button onClick={function(){setDismissed(function(p){return p.concat([c.id]);});}} style={{padding:"14px 22px",borderRadius:14,background:"#F9FAFB",border:"1.5px solid #E5E7EB",color:"#9CA3AF",fontFamily:F,fontSize:15,fontWeight:600,cursor:"pointer"}}>Skip</button>
                    </div>
                  </div>
                </div>;
              })
            )}
            {gymCards.length>0 && (
              <div style={{textAlign:"center",marginTop:4}}>
                <button onClick={function(){setDismissed([]);}} style={{background:"none",border:"none",color:"#9CA3AF",fontFamily:F,fontSize:13,fontWeight:500,cursor:"pointer",padding:"8px 16px"}}>Reset dismissed</button>
              </div>
            )}
          </div>
        )}

        {/* ══════ COFFEE PREP ══════ */}
        {view==="coffee" && (
          <div style={{animation:"su .3s ease"}}>
            {/* How it works */}
            <div style={{background:"#FFFBEB",borderRadius:16,padding:"14px 16px",marginTop:6,marginBottom:16,border:"1.5px solid #FEF3C7"}}>
              <div style={{fontSize:13,fontWeight:700,color:"#92400E",marginBottom:4}}>How Coffee Prep works</div>
              <div style={{fontSize:13,color:"#A16207",fontWeight:500,lineHeight:1.5}}>
                1. Pick a contact below{"\n"}
                2. Quick-scan their LinkedIn for recent posts{"\n"}
                3. Paste a note about what they shared{"\n"}
                4. AI generates personalized icebreakers
              </div>
            </div>

            {/* Picks list */}
            {coffeePicks.length === 0 ? (
              <div style={{textAlign:"center",padding:"40px 20px",color:"#9CA3AF"}}>
                <div style={{fontSize:40,marginBottom:10}}>☕</div>
                <div style={{fontSize:16,fontWeight:700,color:"#374151"}}>No senior contacts yet</div>
                <div style={{fontSize:14,marginTop:6,fontWeight:500}}>Import contacts and set seniority to Senior or Executive</div>
              </div>
            ) : (
              coffeePicks.map(function(c, idx) {
                var sn = SEN[c.seniority || 0];
                var days = daysSince(c.lastContact, NOW);
                var urgency = days >= 90 ? "Haven't connected in 90+ days" : days >= 60 ? "60+ days since last contact" : days >= 30 ? "30+ days - good time to reconnect" : "Recently connected";
                var urgColor = days >= 60 ? "#DC2626" : days >= 30 ? "#D97706" : "#059669";
                return <div key={c.id} style={{background:"#fff",borderRadius:20,marginBottom:12,border:"1.5px solid #F3F4F6",boxShadow:"0 2px 8px rgba(0,0,0,0.04)",overflow:"hidden",animation:"su "+(0.15+idx*0.06)+"s ease"}}>
                  <div style={{height:4,background:"linear-gradient(135deg,#92400E,#78350F)"}}/>
                  <div style={{padding:"16px 18px"}}>
                    {/* Header */}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                          <span style={{fontSize:17,fontWeight:700}}>{c.name}</span>
                          <span style={{fontSize:11,padding:"3px 9px",borderRadius:20,background:sn.bg,color:sn.color,fontWeight:700}}>{sn.emoji} {sn.label}</span>
                        </div>
                        {c.company && <div style={{fontSize:14,color:"#9CA3AF",marginTop:2,fontWeight:500}}>{c.company}</div>}
                        {c.notes && <div style={{fontSize:13,color:"#6B7280",marginTop:4,fontStyle:"italic"}}>{c.notes}</div>}
                      </div>
                    </div>

                    {/* Urgency + meta */}
                    <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
                      <span style={{fontSize:12,padding:"4px 10px",borderRadius:10,background:urgColor+"12",color:urgColor,fontWeight:600}}>{urgency}</span>
                      <span style={{fontSize:12,padding:"4px 10px",borderRadius:10,background:"#F9FAFB",color:"#6B7280",fontWeight:500}}>{warmL[c.warmth||1]}</span>
                    </div>

                    {/* Prep button */}
                    <button onClick={function(){
                      var act = ALL_ACT.find(function(a){return a.id==="coffee_chat";});
                      if(act) logAct(act, c.name);
                      var upd = Object.assign({}, c, {lastContact:NOW});
                      setCts(function(p){return p.map(function(x){return x.id===c.id?upd:x;});});
                      db.upsertContact(upd).catch(function(){});
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
              <div><div style={{fontSize:18,fontWeight:700}}>Log a Rep</div><div style={{fontSize:13,color:"#9CA3AF",fontWeight:500,marginTop:2}}>Tap to record</div></div>
              <div style={{background:curGym.light,padding:"6px 14px",borderRadius:20,fontSize:13,fontWeight:700,color:curGym.color}}>Today: {tdPts} pts</div>
            </div>
            {TIERS.map(function(tier) {
              return <div key={tier.tier} style={{background:"#fff",borderRadius:20,border:"1.5px solid #F3F4F6",boxShadow:"0 1px 4px rgba(0,0,0,0.03)",padding:"18px 18px 14px"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                  <div style={{width:10,height:10,borderRadius:"50%",background:tier.grad}}/><span style={{fontSize:14,fontWeight:700,color:tier.color}}>{tier.label}</span><span style={{fontSize:13,color:"#9CA3AF",fontWeight:500}}>{tier.desc}</span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {tier.activities.map(function(a) {
                    return <button key={a.id} onClick={function(){logAct(Object.assign({},a,{tier:tier.tier}));}}
                      style={{display:"flex",alignItems:"center",gap:12,width:"100%",padding:"13px 16px",background:anim===a.id?tier.bg:"#F9FAFB",border:"1.5px solid "+(anim===a.id?tier.color+"40":"#F3F4F6"),borderRadius:14,color:"#111827",cursor:"pointer",fontFamily:F,fontSize:15,fontWeight:500,transition:"all .15s",animation:anim===a.id?"pop .35s ease":"none"}}>
                      <span style={{fontSize:18}}>{a.emoji}</span><span style={{flex:1,textAlign:"left"}}>{a.name}</span>
                      <span style={{background:tier.bg,color:tier.color,padding:"3px 12px",borderRadius:20,fontSize:13,fontWeight:700}}>+{a.points}</span>
                    </button>;
                  })}
                </div>
              </div>;
            })}
          </div>
        )}

        {/* ══════ CONTACTS ══════ */}
        {view==="contacts" && (
          <div style={{display:"flex",flexDirection:"column",gap:12,animation:"su .3s ease"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
              <div style={{fontSize:18,fontWeight:700}}>Your Network</div>
              <div style={{display:"flex",gap:8}}>
                <input ref={fRef} type="file" accept=".csv,.xlsx,.txt" style={{display:"none"}} onChange={handleCSV}/>
                <button onClick={function(){fRef.current && fRef.current.click();}} style={{background:"#EFF6FF",color:"#2563EB",padding:"8px 14px",fontSize:13,fontWeight:600,borderRadius:14,border:"none",fontFamily:F,cursor:"pointer"}}>Import CSV</button>
                <button onClick={function(){setEditC(null);setCf({name:"",company:"",notes:"",followUpDate:"",warmth:1,seniority:0});setShowCM(true);}} style={{background:curGym.grad,color:"#fff",padding:"8px 14px",fontSize:13,fontWeight:700,borderRadius:14,border:"none",fontFamily:F,cursor:"pointer"}}>+ Add</button>
              </div>
            </div>
            <div style={{padding:"10px 14px",background:"#EFF6FF",borderRadius:14}}>
              <div style={{fontSize:13,color:"#2563EB",fontWeight:500}}>LinkedIn: Settings - Data Privacy - Get a copy - Connections</div>
            </div>
            {contacts.length===0 ? (
              <div style={{textAlign:"center",padding:"40px 20px",color:"#9CA3AF"}}>
                <div style={{fontSize:36,marginBottom:8}}>👥</div>
                <div style={{fontSize:16,fontWeight:700,color:"#374151"}}>No contacts yet</div>
                <div style={{fontSize:14,marginTop:4,fontWeight:500}}>Add manually or import from LinkedIn</div>
              </div>
            ) : (
              [].concat(contacts).sort(function(a,b){
                if(a.followUpDate&&a.followUpDate<=NOW&&(!b.followUpDate||b.followUpDate>NOW))return -1;
                if(b.followUpDate&&b.followUpDate<=NOW&&(!a.followUpDate||a.followUpDate>NOW))return 1;
                return(b.warmth||0)-(a.warmth||0);
              }).map(function(c) {
                var od=c.followUpDate&&c.followUpDate<=NOW;
                var sn=SEN[c.seniority||0];
                return <div key={c.id} style={{background:"#fff",borderRadius:16,padding:"16px 18px",border:"1.5px solid "+(od?"#FEE2E2":"#F3F4F6"),boxShadow:"0 1px 4px rgba(0,0,0,0.03)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <span style={{fontSize:16,fontWeight:700}}>{c.name}</span>
                        <span style={{fontSize:13}}>{warmL[c.warmth||1]}</span>
                        {(c.seniority||0)>0 && <span style={{fontSize:11,padding:"2px 8px",borderRadius:10,background:sn.bg,color:sn.color,fontWeight:700}}>{sn.emoji} {sn.label}</span>}
                      </div>
                      {c.company && <div style={{fontSize:13,color:"#9CA3AF",marginTop:2,fontWeight:500}}>{c.company}</div>}
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={function(){setEditC(c);setCf({name:c.name,company:c.company||"",notes:c.notes||"",followUpDate:c.followUpDate||"",warmth:c.warmth||1,seniority:c.seniority||0});setShowCM(true);}} style={{background:"#F9FAFB",border:"1px solid #E5E7EB",color:"#6B7280",padding:"5px 12px",fontSize:12,fontWeight:600,borderRadius:10,fontFamily:F,cursor:"pointer"}}>Edit</button>
                      <button onClick={function(){delC(c.id);}} style={{background:"#FEF2F2",border:"none",color:"#DC2626",padding:"5px 12px",fontSize:12,fontWeight:600,borderRadius:10,fontFamily:F,cursor:"pointer"}}>x</button>
                    </div>
                  </div>
                  {c.notes && <div style={{fontSize:13,color:"#9CA3AF",marginTop:6,fontStyle:"italic"}}>{c.notes}</div>}
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
                {heatmap.map(function(d,i) {
                  var int = Math.min(d.pts/10,1);
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
                {trend.map(function(w,i) {
                  var h=maxTr>0?(w.pts/maxTr)*60:0;
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
                {overdue.slice(0,3).map(function(c) {
                  return <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #FEE2E2"}}>
                    <div><div style={{fontSize:14,fontWeight:600}}>{c.name}</div><div style={{fontSize:12,color:"#9CA3AF",fontWeight:500}}>{c.company} - Due {fmtDate(c.followUpDate)}</div></div>
                    <button onClick={function(){var act=ALL_ACT.find(function(a){return a.id==="follow_up";}); if(act) logAct(act,c.name); var u=Object.assign({},c,{lastContact:NOW,followUpDate:""}); setCts(function(p){return p.map(function(x){return x.id===c.id?u:x;});}); db.upsertContact(u).catch(function(){});}} style={{background:"#DC2626",color:"#fff",padding:"6px 14px",fontSize:12,fontWeight:700,borderRadius:10,border:"none",fontFamily:F,cursor:"pointer"}}>Done</button>
                  </div>;
                })}
              </div>
            )}
            {/* Goal + Reset */}
            <div style={{background:"#fff",borderRadius:20,border:"1.5px solid #F3F4F6",padding:"16px 18px",boxShadow:"0 1px 4px rgba(0,0,0,0.03)"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontSize:13,color:"#9CA3AF",fontWeight:500}}>Weekly Goal</div>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginTop:6}}>
                    <button onClick={function(){setGoal(function(g){return Math.max(5,g-5);});}} style={{background:"#F3F4F6",border:"none",color:"#374151",width:32,height:32,fontSize:18,borderRadius:10,cursor:"pointer",fontFamily:F,fontWeight:700}}>-</button>
                    <span style={{fontSize:20,fontWeight:800,minWidth:30,textAlign:"center"}}>{goal}</span>
                    <button onClick={function(){setGoal(function(g){return g+5;});}} style={{background:"#F3F4F6",border:"none",color:"#374151",width:32,height:32,fontSize:18,borderRadius:10,cursor:"pointer",fontFamily:F,fontWeight:700}}>+</button>
                  </div>
                </div>
                <button onClick={resetAll} style={{background:"#FEF2F2",color:"#DC2626",padding:"8px 16px",fontSize:12,fontWeight:700,borderRadius:12,border:"none",fontFamily:F,cursor:"pointer"}}>Reset All</button>
              </div>
            </div>
            {/* History preview */}
            {log.length>0 && (
              <div>
                <div style={{fontSize:12,fontWeight:700,color:"#9CA3AF",marginBottom:8,letterSpacing:0.5,textTransform:"uppercase"}}>Recent Activity</div>
                {[].concat(log).sort(function(a,b){return (b.timestamp||"").localeCompare(a.timestamp||"");}).slice(0,8).map(function(e) {
                  return <div key={e.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:"#fff",borderRadius:14,border:"1.5px solid #F3F4F6",marginBottom:4}}>
                    <span style={{fontSize:18}}>{e.emoji}</span>
                    <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600}}>{e.name}{e.contactName && <span style={{color:"#9CA3AF"}}> - {e.contactName}</span>}</div><div style={{fontSize:12,color:"#D1D5DB",fontWeight:500}}>{fmtDate(e.date)}</div></div>
                    <div style={{fontSize:14,fontWeight:700,color:curGym.color}}>+{e.points}</div>
                  </div>;
                })}
                <div style={{textAlign:"center",padding:8,fontSize:12,color:"#D1D5DB",fontWeight:500}}>{log.length} total - {totPts} pts</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── CONTACT MODAL ─── */}
      {showCM && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.3)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20,backdropFilter:"blur(4px)"}} onClick={function(){setShowCM(false);}}>
          <div style={{background:"#fff",borderRadius:24,padding:26,width:"100%",maxWidth:400,border:"1.5px solid #F3F4F6",boxShadow:"0 20px 60px rgba(0,0,0,.12)",animation:"si .25s ease"}} onClick={function(e){e.stopPropagation();}}>
            <h3 style={{fontSize:20,fontWeight:800,marginBottom:18}}>{editC?"Edit Contact":"Add Contact"}</h3>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <input placeholder="Name *" value={cf.name} onChange={function(e){setCf(Object.assign({},cf,{name:e.target.value}));}}/>
              <input placeholder="Company / Org" value={cf.company} onChange={function(e){setCf(Object.assign({},cf,{company:e.target.value}));}}/>
              <textarea placeholder="Notes" value={cf.notes} onChange={function(e){setCf(Object.assign({},cf,{notes:e.target.value}));}} rows={2}/>
              <div><label style={{fontSize:13,color:"#6B7280",display:"block",marginBottom:4,fontWeight:600}}>Follow-up Date</label><input type="date" value={cf.followUpDate} onChange={function(e){setCf(Object.assign({},cf,{followUpDate:e.target.value}));}}/></div>
              <div><label style={{fontSize:13,color:"#6B7280",display:"block",marginBottom:4,fontWeight:600}}>Warmth</label>
                <div style={{display:"flex",gap:6}}>{[1,2,3].map(function(w) {
                  return <button key={w} onClick={function(){setCf(Object.assign({},cf,{warmth:w}));}} style={{flex:1,padding:10,fontSize:14,fontWeight:cf.warmth===w?700:500,background:cf.warmth===w?"#ECFDF5":"#F9FAFB",color:cf.warmth===w?"#059669":"#9CA3AF",border:"1.5px solid "+(cf.warmth===w?"#059669":"#E5E7EB"),borderRadius:12,fontFamily:F,cursor:"pointer"}}>{warmL[w]}</button>;
                })}</div>
              </div>
              <div><label style={{fontSize:13,color:"#6B7280",display:"block",marginBottom:4,fontWeight:600}}>Seniority</label>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{SEN.slice(1).map(function(s) {
                  return <button key={s.id} onClick={function(){setCf(Object.assign({},cf,{seniority:s.id}));}} style={{flex:1,minWidth:60,padding:"8px 4px",fontSize:13,fontWeight:cf.seniority===s.id?700:500,background:cf.seniority===s.id?s.bg:"#F9FAFB",color:cf.seniority===s.id?s.color:"#9CA3AF",border:"1.5px solid "+(cf.seniority===s.id?s.color:"#E5E7EB"),borderRadius:12,fontFamily:F,cursor:"pointer"}}>{s.emoji} {s.label}</button>;
                })}</div>
              </div>
              <div style={{display:"flex",gap:8,marginTop:6}}>
                <button onClick={function(){setShowCM(false);}} style={{flex:1,background:"#F9FAFB",border:"1.5px solid #E5E7EB",color:"#6B7280",padding:14,borderRadius:14,fontFamily:F,fontSize:15,fontWeight:600,cursor:"pointer"}}>Cancel</button>
                <button onClick={saveC} style={{flex:1,background:curGym.grad,border:"none",color:"#fff",padding:14,borderRadius:14,fontFamily:F,fontSize:15,fontWeight:700,cursor:"pointer"}}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── IMPORT MODAL ─── */}
      {showIM && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.3)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20,backdropFilter:"blur(4px)"}} onClick={function(){setShowIM(false);}}>
          <div style={{background:"#fff",borderRadius:24,padding:24,width:"100%",maxWidth:460,maxHeight:"80vh",display:"flex",flexDirection:"column",border:"1.5px solid #F3F4F6",boxShadow:"0 20px 60px rgba(0,0,0,.12)",animation:"si .25s ease"}} onClick={function(e){e.stopPropagation();}}>
            <h3 style={{fontSize:20,fontWeight:800}}>Import Contacts</h3>
            <p style={{fontSize:13,color:"#9CA3AF",marginTop:3,marginBottom:14,fontWeight:500}}>{impPrev.length} found - {impSel.size} selected</p>
            <input placeholder="Filter by name, company, title..." value={impF} onChange={function(e){setImpF(e.target.value);}} style={{marginBottom:10}}/>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              <button onClick={function(){setImpSel(new Set(filtImp.filter(function(p){return !p.exists;}).map(function(p){return p.id;})));}} style={{background:"#F3F4F6",border:"none",color:"#6B7280",padding:"6px 14px",fontSize:12,fontWeight:600,borderRadius:10,fontFamily:F,cursor:"pointer"}}>Select all</button>
              <button onClick={function(){setImpSel(new Set());}} style={{background:"#F3F4F6",border:"none",color:"#6B7280",padding:"6px 14px",fontSize:12,fontWeight:600,borderRadius:10,fontFamily:F,cursor:"pointer"}}>Clear</button>
            </div>
            <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:4,minHeight:0}}>
              {filtImp.map(function(p) {
                return <div key={p.id} onClick={function(){if(p.exists)return;setImpSel(function(prev){var n=new Set(prev);if(n.has(p.id))n.delete(p.id);else n.add(p.id);return n;});}}
                  style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:p.exists?"#F9FAFB":impSel.has(p.id)?"#EFF6FF":"#fff",borderRadius:12,cursor:p.exists?"default":"pointer",border:"1.5px solid "+(impSel.has(p.id)?"#3B82F6":"#F3F4F6"),opacity:p.exists?0.45:1,transition:"all .12s"}}>
                  <div style={{width:20,height:20,borderRadius:6,flexShrink:0,background:p.exists?"#E5E7EB":impSel.has(p.id)?"#3B82F6":"#F9FAFB",border:"1.5px solid "+(impSel.has(p.id)?"#3B82F6":"#E5E7EB"),display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff",fontWeight:700}}>{p.exists?"-":impSel.has(p.id)?"v":""}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                    <div style={{fontSize:12,color:"#9CA3AF",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:500}}>{p.position}{p.position&&p.company?" - ":""}{p.company}</div>
                  </div>
                </div>;
              })}
            </div>
            <div style={{display:"flex",gap:8,marginTop:14}}>
              <button onClick={function(){setShowIM(false);setImpPrev([]);setImpSel(new Set());}} style={{flex:1,background:"#F9FAFB",border:"1.5px solid #E5E7EB",color:"#6B7280",padding:14,borderRadius:14,fontFamily:F,fontSize:15,fontWeight:600,cursor:"pointer"}}>Cancel</button>
              <button onClick={doImport} style={{flex:1,background:"linear-gradient(135deg,#3B82F6,#1D4ED8)",border:"none",color:"#fff",padding:14,borderRadius:14,fontFamily:F,fontSize:15,fontWeight:700,cursor:"pointer"}}>Import {impSel.size}</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── TOAST ─── */}
      {toast && (
        <div style={{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",background:curGym.grad,color:"#fff",padding:"10px 24px",borderRadius:24,fontSize:14,fontWeight:700,zIndex:200,animation:"ti .25s ease",boxShadow:"0 6px 24px "+curGym.color+"35"}}>{toast}</div>
      )}
    </div>
  );
}
