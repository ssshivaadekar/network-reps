import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Papa from "papaparse";
import { db, isSupabaseConfigured } from "./supabaseClient";

/* ───────────────── ACTIVITY CONFIG ───────────────── */
const TIERS = [
  { tier: 1, label: "Warm-Up", color: "#7BAE8A", bg: "#EEF6F0", desc: "Low effort, high comfort",
    activities: [
      { id: "like_post", name: "Like/react to a post", points: 1, emoji: "👍" },
      { id: "comment_post", name: "Thoughtful comment", points: 2, emoji: "💬" },
      { id: "share_article", name: "Share an article", points: 2, emoji: "📎" },
      { id: "research_contact", name: "Research a contact", points: 1, emoji: "🔍" },
    ] },
  { tier: 2, label: "Main Set", color: "#D4943F", bg: "#FDF3E7", desc: "Moderate effort, direct",
    activities: [
      { id: "send_dm", name: "Send a DM or message", points: 4, emoji: "✉️" },
      { id: "congrats_msg", name: "Congrats/milestone note", points: 3, emoji: "🎉" },
      { id: "intro_request", name: "Ask for or make an intro", points: 5, emoji: "🤝" },
      { id: "follow_up", name: "Follow up with a contact", points: 4, emoji: "🔄" },
    ] },
  { tier: 3, label: "PR Day", color: "#C46B5A", bg: "#FCEEE9", desc: "High effort, max growth",
    activities: [
      { id: "coffee_chat", name: "1:1 coffee / virtual chat", points: 8, emoji: "☕" },
      { id: "attend_event", name: "Attend networking event", points: 10, emoji: "🎪" },
      { id: "give_talk", name: "Give a talk/presentation", points: 12, emoji: "🎤" },
      { id: "write_post", name: "Publish a thought post", points: 7, emoji: "✍️" },
    ] },
];
const ALL_ACT = TIERS.flatMap(t => t.activities.map(a => ({ ...a, tier: t.tier, tierColor: t.color })));

/* ───────────────── SENIORITY & GYM ───────────────── */
const SEN = [
  { id: 0, label: "Unset", emoji: "-", color: "#999" },
  { id: 1, label: "Junior", emoji: "🌱", color: "#7BAE8A" },
  { id: 2, label: "Peer", emoji: "👤", color: "#7E9FBF" },
  { id: 3, label: "Senior", emoji: "📊", color: "#D4943F" },
  { id: 4, label: "Executive", emoji: "👔", color: "#C46B5A" },
];

const GYM = [
  { id: "peer", label: "Peer Power", muscle: "Leg Day", emoji: "🦵", color: "#7E9FBF", bg: "#EDF2F7",
    desc: "Lateral connections at your level", senFilter: [2],
    actions: ["Send a DM checking in", "Comment on their recent post", "Share a useful article", "Propose a virtual coffee"] },
  { id: "reach", label: "Reach Up", muscle: "Chest Day", emoji: "💪", color: "#D4943F", bg: "#FDF3E7",
    desc: "Build ties with senior leaders and execs", senFilter: [3, 4],
    actions: ["Congratulate a recent milestone", "Ask a thoughtful question", "Share something valuable (no ask)", "Request a 15-min advice chat"] },
  { id: "give", label: "Give Back", muscle: "Back Day", emoji: "🤝", color: "#7BAE8A", bg: "#EEF6F0",
    desc: "Mentor and lift up junior contacts", senFilter: [1],
    actions: ["Offer to review their work", "Make an intro that helps them", "Share career advice", "Endorse a skill on LinkedIn"] },
  { id: "reconnect", label: "Reconnect", muscle: "Cardio", emoji: "🏃", color: "#9B7EC4", bg: "#F3EFF9",
    desc: "Re-engage anyone silent 30+ days", senFilter: null,
    actions: ["Send a thinking-of-you message", "Share a relevant article", "Ask what they are working on", "Congratulate something recent"] },
  { id: "power", label: "Power Hour", muscle: "Full Body", emoji: "🔥", color: "#C46B5A", bg: "#FCEEE9",
    desc: "Mix of all levels", senFilter: null,
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

/* ───────────────── HELPERS ───────────────── */
function getWeekStart(d) { var x = new Date(d); var day = x.getDay(); x.setDate(x.getDate() - day + (day === 0 ? -6 : 1)); x.setHours(0,0,0,0); return x.toISOString().split("T")[0]; }
function getToday() { return new Date().toISOString().split("T")[0]; }
function getDayName(s) { return new Date(s+"T12:00:00").toLocaleDateString("en-US",{weekday:"short"}); }
function getWeekDays(ws) { var d=[]; for(var i=0;i<7;i++){var x=new Date(ws+"T12:00:00");x.setDate(x.getDate()+i);d.push(x.toISOString().split("T")[0]);} return d; }
function fmtDate(s) { return new Date(s+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}); }
function uid() { return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function daysSince(dateStr, now) { if(!dateStr) return 999; return Math.floor((new Date(now)-new Date(dateStr))/(1000*60*60*24)); }

/* ───────────────── THEME ───────────────── */
var T = {
  bg:"#F8F7F4", card:"#FFFFFF", cb:"#EDEDEB", cs:"0 1px 3px rgba(0,0,0,0.04)",
  txt:"#2D2D2D", tm:"#8E8E8E", tl:"#B5B5B5",
  p:"#7BAE8A", pb:"#EEF6F0", pd:"#5A8C68",
  a:"#D4943F", ab:"#FDF3E7", d:"#C46B5A", db:"#FCEEE9",
  bl:"#7E9FBF", blb:"#EDF2F7", dv:"#F0EFEC",
};
var warmL = ["","🧊 Cold","🌤 Warm","🔥 Hot"];

/* ════════════════════ MAIN APP ════════════════════ */
export default function App() {
  var _a = useState("dashboard"), view = _a[0], setView = _a[1];
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

  useEffect(function() {
    (async function() {
      try {
        var results = await Promise.all([db.getActivityLog(), db.getContacts(), db.getSettings()]);
        setLog(results[0]); setCts(results[1]); setGoal(results[2]);
      } catch(e) { console.warn("Load:", e); }
      setLoaded(true);
    })();
  }, []);
  useEffect(function() { if(loaded) db.setSettings(goal).catch(function(){}); }, [goal, loaded]);

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
    if(tdPts<3) { s.push({text:"Leave a thoughtful comment on LinkedIn", aid:"comment_post"}); s.push({text:"Research someone to connect with", aid:"research_contact"}); }
    if(tdPts>=3 && tdPts<8) s.push({text:"Send a quick DM to someone you admire", aid:"send_dm"});
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
      [1,2,3,4].forEach(function(lvl) {
        var g = contacts.filter(function(c) { return (c.seniority||0) === lvl; });
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
            notify("Could not find name columns in CSV"); return;
          }

          var parsed2 = results.data.map(function(row) {
            var fn=fnC?(row[fnC]||"").trim():"", ln=lnC?(row[lnC]||"").trim():"";
            var nm=(fn+" "+ln).trim(); if(!nm||nm.length<2) return null;
            var co=coC?(row[coC]||"").trim():"", pos=posC?(row[posC]||"").trim():"";
            var em=emC?(row[emC]||"").trim():"", cn=conC?(row[conC]||"").trim():"";
            var ex=contacts.some(function(c) { return c.name.toLowerCase()===nm.toLowerCase(); });
            return {id:uid(),name:nm,company:co,position:pos,email:em,connectedOn:cn,notes:pos?(pos+(co?" at "+co:"")):"",warmth:1,seniority:inferSen(pos),exists:ex};
          }).filter(Boolean);
          if(parsed2.length===0){notify("0 contacts found in CSV");return;}
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

  /* ════════════════════ RENDER ════════════════════ */
  return (
    <div style={{fontFamily:"'DM Sans',-apple-system,sans-serif",background:T.bg,minHeight:"100vh",color:T.txt}}>
      <style>{"\
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Source+Serif+4:wght@400;600;700&display=swap');\
        *{box-sizing:border-box;margin:0;padding:0}body{background:"+T.bg+"}\
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}\
        @keyframes slideIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}\
        @keyframes pop{0%{transform:scale(.9)}50%{transform:scale(1.08)}100%{transform:scale(1)}}\
        @keyframes toastIn{from{transform:translateX(-50%) translateY(16px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}\
        .crd{background:"+T.card+";border:1px solid "+T.cb+";border-radius:16px;padding:20px;box-shadow:"+T.cs+";transition:box-shadow .2s}\
        .crd:hover{box-shadow:0 2px 8px rgba(0,0,0,.06)}\
        .btn{border:none;cursor:pointer;border-radius:10px;font-family:inherit;font-weight:500;transition:all .15s}\
        .btn:hover{transform:translateY(-1px)}.btn:active{transform:scale(.97)}\
        .ab{display:flex;align-items:center;gap:10px;width:100%;padding:12px 14px;background:"+T.bg+";border:1px solid "+T.cb+";border-radius:12px;color:"+T.txt+";cursor:pointer;font-family:inherit;font-size:13.5px;transition:all .15s}\
        .ab:hover{background:#F0EFE9;transform:translateX(2px)}.ab.pop{animation:pop .35s ease}\
        .tab{background:transparent;color:"+T.tm+";border:none;padding:10px 14px;cursor:pointer;font-family:inherit;font-size:12.5px;font-weight:500;border-radius:8px 8px 0 0;transition:all .15s;border-bottom:2px solid transparent;white-space:nowrap}\
        .tab:hover{color:"+T.txt+"}.tab.on{color:"+T.txt+";border-bottom-color:"+T.p+"}\
        input,textarea{font-family:inherit;background:"+T.bg+";border:1px solid "+T.cb+";border-radius:10px;padding:10px 14px;color:"+T.txt+";font-size:14px;width:100%;outline:none;transition:border-color .2s}\
        input:focus,textarea:focus{border-color:"+T.p+";box-shadow:0 0 0 3px "+T.pb+"}\
        input[type=date]{color-scheme:light}\
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:#ddd;border-radius:3px}\
      "}</style>

      {/* HEADER */}
      <div style={{padding:"24px 20px 0",maxWidth:560,margin:"0 auto",animation:"fadeUp .4s ease"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <h1 style={{fontFamily:"'Source Serif 4',Georgia,serif",fontSize:23,fontWeight:700,letterSpacing:"-.3px"}}>Network Reps</h1>
            <p style={{fontSize:12.5,color:T.tm,marginTop:2}}>Your networking fitness tracker</p>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:11,color:T.tm}}>Level {lvl}</div>
            <div style={{fontSize:14,fontWeight:600,color:T.p}}>{lvlN}</div>
            <div style={{width:68,height:3,background:T.dv,borderRadius:2,marginTop:4}}>
              <div style={{width:lvlP+"%",height:"100%",background:T.p,borderRadius:2,transition:"width .5s"}}/>
            </div>
            <div style={{fontSize:10,color:T.tl,marginTop:2}}>{totPts}/{lvl*50} XP</div>
          </div>
        </div>
        {!isSupabaseConfigured && loaded && (
          <div style={{marginTop:10,padding:"7px 12px",background:T.ab,borderRadius:10,fontSize:11,color:T.a}}>
            Running in local mode. Add Supabase env vars for cloud sync.
          </div>
        )}
        <div style={{display:"flex",gap:1,marginTop:16,borderBottom:"1px solid "+T.dv,overflowX:"auto"}}>
          {["dashboard","gym","log","contacts","history"].map(function(id) {
            var labels = {dashboard:"Dashboard",gym:"🏋️ Gym",log:"Log Activity",contacts:"Contacts",history:"History"};
            return <button key={id} className={"tab"+(view===id?" on":"")} onClick={function(){setView(id);}}>{labels[id]}</button>;
          })}
        </div>
      </div>

      <div style={{padding:"16px 20px 100px",maxWidth:560,margin:"0 auto"}}>

        {/* DASHBOARD */}
        {view==="dashboard" && (
          <div style={{display:"flex",flexDirection:"column",gap:12,animation:"fadeUp .35s ease"}}>
            <div className="crd" style={{textAlign:"center",padding:24}}>
              <div style={{position:"relative",width:124,height:124,margin:"0 auto 12px"}}>
                <svg width="124" height="124" viewBox="0 0 124 124">
                  <circle cx="62" cy="62" r="52" fill="none" stroke={T.dv} strokeWidth="8"/>
                  <circle cx="62" cy="62" r="52" fill="none" stroke={pPct>=100?T.p:T.a} strokeWidth="8" strokeLinecap="round" strokeDasharray={(pPct/100)*326.7+" 326.7"} transform="rotate(-90 62 62)" style={{transition:"stroke-dasharray .8s ease"}}/>
                </svg>
                <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center"}}>
                  <div style={{fontSize:28,fontWeight:700,fontFamily:"'Source Serif 4',serif"}}>{wkPts}</div>
                  <div style={{fontSize:11,color:T.tm}}>/ {goal} pts</div>
                </div>
              </div>
              <div style={{fontSize:13,fontWeight:500}}>{pPct>=100?"🎯 Goal crushed!":pPct>=60?"💪 Strong week!":"📈 Building momentum..."}</div>
              <div style={{fontSize:12,color:T.tm,marginTop:2}}>{goal-wkPts>0?(goal-wkPts)+" pts to go":(wkPts-goal)+" over goal"}</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              {[{l:"Today",v:tdPts,s:"pts",c:T.p},{l:"Streak",v:streak,s:streak===1?"day":"days",c:T.a},{l:"Active",v:actDays,s:"/7",c:T.bl}].map(function(x,i) {
                return <div key={i} className="crd" style={{textAlign:"center",padding:"12px 6px"}}>
                  <div style={{fontSize:20,fontWeight:700,color:x.c,fontFamily:"'Source Serif 4',serif"}}>{x.v}</div>
                  <div style={{fontSize:10,color:T.tl}}>{x.s}</div>
                  <div style={{fontSize:11,color:T.tm,marginTop:2}}>{x.l}</div>
                </div>;
              })}
            </div>
            <div className="crd">
              <div style={{fontSize:11,fontWeight:600,color:T.tm,marginBottom:8,textTransform:"uppercase",letterSpacing:0.5}}>This Week</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5}}>
                {heatmap.map(function(d,i) {
                  var int = Math.min(d.pts/10,1);
                  return <div key={i} style={{textAlign:"center"}}>
                    <div style={{fontSize:10,color:T.tl,marginBottom:4}}>{getDayName(d.day)}</div>
                    <div style={{width:32,height:32,borderRadius:9,margin:"0 auto",background:d.pts>0?"rgba(123,174,138,"+(0.15+int*0.55)+")":d.isT?T.ab:T.bg,border:d.isT?"2px solid "+T.a:"1px solid "+(d.pts>0?"transparent":T.cb),display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:600,color:d.pts>0?T.pd:T.tl}}>{d.pts>0?d.pts:d.isP?"-":""}</div>
                  </div>;
                })}
              </div>
            </div>
            <div className="crd">
              <div style={{fontSize:11,fontWeight:600,color:T.tm,marginBottom:10,textTransform:"uppercase",letterSpacing:0.5}}>4-Week Trend</div>
              <div style={{display:"flex",alignItems:"flex-end",gap:8,height:68}}>
                {trend.map(function(w,i) {
                  var h = maxTr>0?(w.pts/maxTr)*58:0;
                  return <div key={i} style={{flex:1,textAlign:"center"}}>
                    <div style={{fontSize:11,fontWeight:600,color:i===3?T.p:T.tm,marginBottom:3}}>{w.pts}</div>
                    <div style={{height:Math.max(h,4),borderRadius:6,background:i===3?T.p:T.dv,transition:"height .5s"}}/>
                    <div style={{fontSize:10,color:T.tl,marginTop:4}}>{w.label}</div>
                  </div>;
                })}
              </div>
            </div>
            {suggest.length>0 && (
              <div className="crd" style={{borderLeft:"3px solid "+T.p}}>
                <div style={{fontSize:11,fontWeight:600,color:T.p,marginBottom:8,textTransform:"uppercase"}}>🏋️ Suggested</div>
                {suggest.map(function(s,i) {
                  var act=ALL_ACT.find(function(a){return a.id===s.aid;});
                  return <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 10px",background:T.pb,borderRadius:9,marginBottom:4}}>
                    <span style={{fontSize:12.5}}>{s.text}</span>
                    {act && <button className="btn" onClick={function(){logAct(act,s.cn);}} style={{background:T.p,color:"#fff",padding:"4px 10px",fontSize:11}}>+{act.points} Done</button>}
                  </div>;
                })}
              </div>
            )}
            {overdue.length>0 && (
              <div className="crd" style={{borderLeft:"3px solid "+T.d}}>
                <div style={{fontSize:11,fontWeight:600,color:T.d,marginBottom:8,textTransform:"uppercase"}}>Overdue Follow-ups</div>
                {overdue.slice(0,3).map(function(c) {
                  return <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid "+T.dv}}>
                    <div><div style={{fontSize:13,fontWeight:500}}>{c.name}</div><div style={{fontSize:11,color:T.tm}}>{c.company} - Due {fmtDate(c.followUpDate)}</div></div>
                    <button className="btn" onClick={function(){var act=ALL_ACT.find(function(a){return a.id==="follow_up";}); if(act) logAct(act,c.name); var u=Object.assign({},c,{lastContact:NOW,followUpDate:""}); setCts(function(p){return p.map(function(x){return x.id===c.id?u:x;});}); db.upsertContact(u).catch(function(){});}} style={{background:T.db,color:T.d,padding:"4px 10px",fontSize:11}}>Done</button>
                  </div>;
                })}
              </div>
            )}
            <div className="crd" style={{padding:14}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontSize:12,color:T.tm}}>Weekly Goal</div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4}}>
                    <button className="btn" onClick={function(){setGoal(function(g){return Math.max(5,g-5);});}} style={{background:T.bg,border:"1px solid "+T.cb,color:T.txt,width:26,height:26,fontSize:15,padding:0}}>-</button>
                    <span style={{fontSize:16,fontWeight:600,minWidth:26,textAlign:"center"}}>{goal}</span>
                    <button className="btn" onClick={function(){setGoal(function(g){return g+5;});}} style={{background:T.bg,border:"1px solid "+T.cb,color:T.txt,width:26,height:26,fontSize:15,padding:0}}>+</button>
                  </div>
                </div>
                <button className="btn" onClick={resetAll} style={{background:T.db,color:T.d,padding:"5px 12px",fontSize:11}}>Reset</button>
              </div>
            </div>
          </div>
        )}

        {/* GYM */}
        {view==="gym" && (
          <div style={{display:"flex",flexDirection:"column",gap:12,animation:"fadeUp .35s ease"}}>
            <div>
              <div style={{fontSize:16,fontWeight:600,marginBottom:3}}>Today's Workout</div>
              <div style={{fontSize:12,color:T.tm,marginBottom:10}}>Pick a muscle group or use today's suggestion</div>
              <div style={{display:"flex",gap:5,overflowX:"auto",paddingBottom:4}}>
                {GYM.map(function(g) {
                  return <button key={g.id} className="btn" onClick={function(){setGymPick(g);setDismissed([]);}}
                    style={{flexShrink:0,padding:"7px 12px",fontSize:11.5,background:curGym.id===g.id?g.bg:T.bg,color:curGym.id===g.id?g.color:T.tm,border:"1.5px solid "+(curGym.id===g.id?g.color:T.cb),fontWeight:curGym.id===g.id?600:400}}>
                    {g.emoji} {g.label}
                  </button>;
                })}
              </div>
            </div>
            <div className="crd" style={{borderLeft:"4px solid "+curGym.color,background:curGym.bg}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:26}}>{curGym.emoji}</span>
                <div>
                  <div style={{fontSize:14,fontWeight:600,color:curGym.color}}>{curGym.label}</div>
                  <div style={{fontSize:11,color:T.tm}}>{curGym.muscle} - {curGym.desc}</div>
                </div>
              </div>
            </div>
            {gymCards.length===0 ? (
              <div className="crd" style={{textAlign:"center",padding:28,color:T.tl}}>
                <div style={{fontSize:26,marginBottom:6}}>{contacts.length===0?"👥":"✅"}</div>
                <div style={{fontSize:13}}>
                  {contacts.length===0 ? "Import contacts first to generate workouts"
                    : dismissed.length>0 ? "All done for this workout! 💪"
                    : "No contacts match "+curGym.label+". Set seniority on contacts to enable."}
                </div>
                {dismissed.length>0 && (
                  <button className="btn" onClick={function(){setDismissed([]);}} style={{marginTop:10,background:curGym.bg,color:curGym.color,padding:"5px 14px",fontSize:11,border:"1px solid "+curGym.color}}>Reset Cards</button>
                )}
              </div>
            ) : (
              gymCards.map(function(c,idx) {
                var sn = SEN[c.seniority||0];
                var od = c.followUpDate && c.followUpDate<=NOW;
                return <div key={c.id} className="crd" style={{padding:0,overflow:"hidden",animation:"fadeUp "+(0.2+idx*0.07)+"s ease"}}>
                  <div style={{height:3,background:curGym.color}}/>
                  <div style={{padding:"14px 16px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                      <div>
                        <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                          <span style={{fontSize:14,fontWeight:600}}>{c.name}</span>
                          <span style={{fontSize:10,padding:"2px 7px",borderRadius:10,background:sn.color+"18",color:sn.color,fontWeight:600}}>{sn.emoji} {sn.label}</span>
                        </div>
                        {c.company && <div style={{fontSize:12,color:T.tm,marginTop:2}}>{c.company}</div>}
                      </div>
                      {od && <span style={{fontSize:10,padding:"2px 7px",borderRadius:10,background:T.db,color:T.d,fontWeight:600}}>Overdue</span>}
                    </div>
                    <div style={{fontSize:11,color:T.tl,marginBottom:8,display:"flex",gap:10}}>
                      {c.lastContact && <span>Last: {fmtDate(c.lastContact)}</span>}
                      <span>{warmL[c.warmth||1]}</span>
                    </div>
                    <div style={{padding:"8px 12px",background:curGym.bg,borderRadius:9,marginBottom:10,borderLeft:"3px solid "+curGym.color}}>
                      <div style={{fontSize:10,color:T.tm,marginBottom:1}}>SUGGESTED REP</div>
                      <div style={{fontSize:12.5,fontWeight:500}}>{c.sugAction}</div>
                    </div>
                    <div style={{display:"flex",gap:7}}>
                      <button className="btn" onClick={function(){completeCard(c);}} style={{flex:1,background:curGym.color,color:"#fff",padding:"9px",fontSize:12.5}}>Done</button>
                      <button className="btn" onClick={function(){setDismissed(function(p){return p.concat([c.id]);});}} style={{padding:"9px 14px",background:T.bg,border:"1px solid "+T.cb,color:T.tm,fontSize:12.5}}>Skip</button>
                    </div>
                  </div>
                </div>;
              })
            )}
            {gymCards.length>0 && (
              <div style={{textAlign:"center"}}>
                <button className="btn" onClick={function(){setDismissed([]);}} style={{background:T.bg,border:"1px solid "+T.cb,color:T.tm,padding:"5px 14px",fontSize:11}}>Reset dismissed</button>
              </div>
            )}
          </div>
        )}

        {/* LOG */}
        {view==="log" && (
          <div style={{display:"flex",flexDirection:"column",gap:12,animation:"fadeUp .35s ease"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><div style={{fontSize:16,fontWeight:600}}>Log a Rep</div><div style={{fontSize:12,color:T.tm}}>Tap to log</div></div>
              <div style={{background:T.pb,padding:"4px 12px",borderRadius:20,fontSize:12.5,fontWeight:600,color:T.p}}>Today: {tdPts} pts</div>
            </div>
            {TIERS.map(function(tier) {
              return <div key={tier.tier} className="crd">
                <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:10}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:tier.color}}/><span style={{fontSize:12.5,fontWeight:600,color:tier.color}}>{tier.label}</span><span style={{fontSize:11,color:T.tl}}>- {tier.desc}</span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {tier.activities.map(function(a) {
                    return <button key={a.id} className={"ab"+(anim===a.id?" pop":"")} onClick={function(){logAct(Object.assign({},a,{tier:tier.tier}));}}>
                      <span style={{fontSize:16}}>{a.emoji}</span><span style={{flex:1,textAlign:"left"}}>{a.name}</span>
                      <span style={{background:tier.bg,color:tier.color,padding:"2px 9px",borderRadius:20,fontSize:11.5,fontWeight:600}}>+{a.points}</span>
                    </button>;
                  })}
                </div>
              </div>;
            })}
          </div>
        )}

        {/* CONTACTS */}
        {view==="contacts" && (
          <div style={{display:"flex",flexDirection:"column",gap:12,animation:"fadeUp .35s ease"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:16,fontWeight:600}}>Your Network</div>
              <div style={{display:"flex",gap:5}}>
                <input ref={fRef} type="file" accept=".csv" style={{display:"none"}} onChange={handleCSV}/>
                <button className="btn" onClick={function(){fRef.current && fRef.current.click();}} style={{background:T.blb,color:T.bl,padding:"6px 10px",fontSize:11.5,display:"flex",alignItems:"center",gap:4}}><span style={{fontWeight:700,fontSize:13}}>in</span> Import</button>
                <button className="btn" onClick={function(){setEditC(null);setCf({name:"",company:"",notes:"",followUpDate:"",warmth:1,seniority:0});setShowCM(true);}} style={{background:T.pb,color:T.p,padding:"6px 12px",fontSize:11.5}}>+ Add</button>
              </div>
            </div>
            <div className="crd" style={{padding:10,background:T.blb,borderColor:"transparent"}}>
              <div style={{fontSize:11,color:T.bl}}><strong>LinkedIn CSV:</strong> Settings - Data Privacy - Get a copy - Connections - Upload here</div>
            </div>
            {contacts.length===0 ? (
              <div className="crd" style={{textAlign:"center",padding:36,color:T.tl}}><div style={{fontSize:28,marginBottom:6}}>👥</div>Add contacts to start</div>
            ) : (
              [].concat(contacts).sort(function(a,b){
                if(a.followUpDate&&a.followUpDate<=NOW&&(!b.followUpDate||b.followUpDate>NOW))return -1;
                if(b.followUpDate&&b.followUpDate<=NOW&&(!a.followUpDate||a.followUpDate>NOW))return 1;
                return(b.warmth||0)-(a.warmth||0);
              }).map(function(c) {
                var od=c.followUpDate&&c.followUpDate<=NOW;
                var sn=SEN[c.seniority||0];
                return <div key={c.id} className="crd" style={{borderColor:od?T.d:undefined}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                        <span style={{fontSize:13.5,fontWeight:600}}>{c.name}</span>
                        <span style={{fontSize:11.5}}>{warmL[c.warmth||1]}</span>
                        {(c.seniority||0)>0 && <span style={{fontSize:10,padding:"1px 6px",borderRadius:10,background:sn.color+"15",color:sn.color,fontWeight:600}}>{sn.emoji} {sn.label}</span>}
                      </div>
                      {c.company && <div style={{fontSize:11.5,color:T.tm,marginTop:1}}>{c.company}</div>}
                    </div>
                    <div style={{display:"flex",gap:4}}>
                      <button className="btn" onClick={function(){setEditC(c);setCf({name:c.name,company:c.company||"",notes:c.notes||"",followUpDate:c.followUpDate||"",warmth:c.warmth||1,seniority:c.seniority||0});setShowCM(true);}} style={{background:T.bg,border:"1px solid "+T.cb,color:T.tm,padding:"3px 9px",fontSize:10.5}}>Edit</button>
                      <button className="btn" onClick={function(){delC(c.id);}} style={{background:T.db,color:T.d,padding:"3px 9px",fontSize:10.5}}>x</button>
                    </div>
                  </div>
                  {c.notes && <div style={{fontSize:11.5,color:T.tm,marginTop:5,fontStyle:"italic"}}>{c.notes}</div>}
                  <div style={{display:"flex",gap:12,marginTop:6,fontSize:10.5,color:T.tl}}>
                    {c.lastContact && <span>Last: {fmtDate(c.lastContact)}</span>}
                    {c.followUpDate && <span style={{color:od?T.d:T.tl}}>Follow up: {fmtDate(c.followUpDate)}{od?" !!":""}</span>}
                  </div>
                </div>;
              })
            )}
          </div>
        )}

        {/* HISTORY */}
        {view==="history" && (
          <div style={{display:"flex",flexDirection:"column",gap:5,animation:"fadeUp .35s ease"}}>
            <div style={{fontSize:16,fontWeight:600,marginBottom:4}}>Activity History</div>
            {log.length===0 ? (
              <div className="crd" style={{textAlign:"center",padding:36,color:T.tl}}><div style={{fontSize:28,marginBottom:6}}>📋</div>No activities yet</div>
            ) : (
              [].concat(log).sort(function(a,b){return (b.timestamp||"").localeCompare(a.timestamp||"");}).map(function(e) {
                return <div key={e.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:T.card,borderRadius:11,border:"1px solid "+T.cb}}>
                  <span style={{fontSize:17}}>{e.emoji}</span>
                  <div style={{flex:1}}><div style={{fontSize:12.5,fontWeight:500}}>{e.name}{e.contactName && <span style={{color:T.tm}}> - {e.contactName}</span>}</div><div style={{fontSize:10.5,color:T.tl}}>{fmtDate(e.date)}</div></div>
                  <div style={{fontSize:12.5,fontWeight:600,color:T.p}}>+{e.points}</div>
                </div>;
              })
            )}
            {log.length>0 && <div style={{textAlign:"center",padding:12,fontSize:11.5,color:T.tl}}>{log.length} activities - {totPts} pts</div>}
          </div>
        )}
      </div>

      {/* CONTACT MODAL */}
      {showCM && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.25)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20,backdropFilter:"blur(4px)"}} onClick={function(){setShowCM(false);}}>
          <div style={{background:T.card,borderRadius:18,padding:24,width:"100%",maxWidth:380,border:"1px solid "+T.cb,boxShadow:"0 16px 48px rgba(0,0,0,.1)",animation:"slideIn .25s ease"}} onClick={function(e){e.stopPropagation();}}>
            <h3 style={{fontSize:16,fontWeight:600,marginBottom:16,fontFamily:"'Source Serif 4',serif"}}>{editC?"Edit Contact":"Add Contact"}</h3>
            <div style={{display:"flex",flexDirection:"column",gap:9}}>
              <input placeholder="Name *" value={cf.name} onChange={function(e){setCf(Object.assign({},cf,{name:e.target.value}));}}/>
              <input placeholder="Company / Org" value={cf.company} onChange={function(e){setCf(Object.assign({},cf,{company:e.target.value}));}}/>
              <textarea placeholder="Notes" value={cf.notes} onChange={function(e){setCf(Object.assign({},cf,{notes:e.target.value}));}} rows={2}/>
              <div><label style={{fontSize:11.5,color:T.tm,display:"block",marginBottom:3}}>Follow-up Date</label><input type="date" value={cf.followUpDate} onChange={function(e){setCf(Object.assign({},cf,{followUpDate:e.target.value}));}}/></div>
              <div><label style={{fontSize:11.5,color:T.tm,display:"block",marginBottom:3}}>Warmth</label>
                <div style={{display:"flex",gap:5}}>{[1,2,3].map(function(w) {
                  return <button key={w} className="btn" onClick={function(){setCf(Object.assign({},cf,{warmth:w}));}} style={{flex:1,padding:7,fontSize:12.5,background:cf.warmth===w?T.pb:T.bg,color:cf.warmth===w?T.p:T.tm,border:"1px solid "+(cf.warmth===w?T.p:T.cb)}}>{warmL[w]}</button>;
                })}</div>
              </div>
              <div><label style={{fontSize:11.5,color:T.tm,display:"block",marginBottom:3}}>Seniority (for Gym)</label>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{SEN.slice(1).map(function(s) {
                  return <button key={s.id} className="btn" onClick={function(){setCf(Object.assign({},cf,{seniority:s.id}));}} style={{flex:1,minWidth:55,padding:"6px 3px",fontSize:11.5,background:cf.seniority===s.id?s.color+"18":T.bg,color:cf.seniority===s.id?s.color:T.tm,border:"1px solid "+(cf.seniority===s.id?s.color:T.cb)}}>{s.emoji} {s.label}</button>;
                })}</div>
              </div>
              <div style={{display:"flex",gap:7,marginTop:4}}>
                <button className="btn" onClick={function(){setShowCM(false);}} style={{flex:1,background:T.bg,border:"1px solid "+T.cb,color:T.tm,padding:11}}>Cancel</button>
                <button className="btn" onClick={saveC} style={{flex:1,background:T.p,color:"#fff",padding:11}}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT MODAL */}
      {showIM && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.3)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20,backdropFilter:"blur(4px)"}} onClick={function(){setShowIM(false);}}>
          <div style={{background:T.card,borderRadius:18,padding:22,width:"100%",maxWidth:460,maxHeight:"80vh",display:"flex",flexDirection:"column",border:"1px solid "+T.cb,boxShadow:"0 16px 48px rgba(0,0,0,.1)",animation:"slideIn .25s ease"}} onClick={function(e){e.stopPropagation();}}>
            <h3 style={{fontSize:16,fontWeight:600,fontFamily:"'Source Serif 4',serif"}}>Import LinkedIn Contacts</h3>
            <p style={{fontSize:11.5,color:T.tm,marginTop:2,marginBottom:12}}>{impPrev.length} found - {impSel.size} selected</p>
            <input placeholder="Filter..." value={impF} onChange={function(e){setImpF(e.target.value);}} style={{marginBottom:8,fontSize:12.5}}/>
            <div style={{display:"flex",gap:7,marginBottom:8}}>
              <button className="btn" onClick={function(){setImpSel(new Set(filtImp.filter(function(p){return !p.exists;}).map(function(p){return p.id;})));}} style={{background:T.bg,border:"1px solid "+T.cb,color:T.tm,padding:"4px 9px",fontSize:10.5}}>Select all</button>
              <button className="btn" onClick={function(){setImpSel(new Set());}} style={{background:T.bg,border:"1px solid "+T.cb,color:T.tm,padding:"4px 9px",fontSize:10.5}}>Clear</button>
            </div>
            <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:3,minHeight:0}}>
              {filtImp.map(function(p) {
                return <div key={p.id} onClick={function(){if(p.exists)return;setImpSel(function(prev){var n=new Set(prev);if(n.has(p.id))n.delete(p.id);else n.add(p.id);return n;});}}
                  style={{display:"flex",alignItems:"center",gap:9,padding:"8px 9px",background:p.exists?T.bg:impSel.has(p.id)?T.pb:T.card,borderRadius:9,cursor:p.exists?"default":"pointer",border:"1px solid "+(impSel.has(p.id)?T.p:T.cb),opacity:p.exists?0.45:1,transition:"all .12s"}}>
                  <div style={{width:17,height:17,borderRadius:4,flexShrink:0,background:p.exists?T.dv:impSel.has(p.id)?T.p:T.bg,border:"1px solid "+(impSel.has(p.id)?T.p:T.cb),display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff"}}>{p.exists?"-":impSel.has(p.id)?"v":""}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12.5,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                    <div style={{fontSize:10.5,color:T.tm,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.position}{p.position&&p.company?" - ":""}{p.company}</div>
                  </div>
                </div>;
              })}
            </div>
            <div style={{display:"flex",gap:7,marginTop:12}}>
              <button className="btn" onClick={function(){setShowIM(false);setImpPrev([]);setImpSel(new Set());}} style={{flex:1,background:T.bg,border:"1px solid "+T.cb,color:T.tm,padding:11}}>Cancel</button>
              <button className="btn" onClick={doImport} style={{flex:1,background:T.bl,color:"#fff",padding:11,fontWeight:600}}>Import {impSel.size}</button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:T.p,color:"#fff",padding:"8px 20px",borderRadius:22,fontSize:12.5,fontWeight:600,zIndex:200,animation:"toastIn .25s ease",boxShadow:"0 4px 20px rgba(123,174,138,.35)"}}>{toast}</div>
      )}
    </div>
  );
}
