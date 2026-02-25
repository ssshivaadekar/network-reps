import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Papa from "papaparse";
import { db, isSupabaseConfigured } from "./supabaseClient";

// ─── CONFIG ──────────────────────────────────────────────────
const ACTIVITY_TIERS = [
  {
    tier: 1, label: "Warm-Up", color: "#7BAE8A", bg: "#EEF6F0",
    description: "Low effort, high comfort",
    activities: [
      { id: "like_post", name: "Like/react to a post", points: 1, emoji: "👍" },
      { id: "comment_post", name: "Leave a thoughtful comment", points: 2, emoji: "💬" },
      { id: "share_article", name: "Share an article with someone", points: 2, emoji: "📎" },
      { id: "research_contact", name: "Research a new contact", points: 1, emoji: "🔍" },
    ],
  },
  {
    tier: 2, label: "Main Set", color: "#D4943F", bg: "#FDF3E7",
    description: "Moderate effort, direct engagement",
    activities: [
      { id: "send_dm", name: "Send a DM or message", points: 4, emoji: "✉️" },
      { id: "congrats_msg", name: "Send a congrats/milestone note", points: 3, emoji: "🎉" },
      { id: "intro_request", name: "Ask for or make an intro", points: 5, emoji: "🤝" },
      { id: "follow_up", name: "Follow up with a contact", points: 4, emoji: "🔄" },
    ],
  },
  {
    tier: 3, label: "PR Day", color: "#C46B5A", bg: "#FCEEE9",
    description: "High effort, maximum growth",
    activities: [
      { id: "coffee_chat", name: "1:1 coffee / virtual chat", points: 8, emoji: "☕" },
      { id: "attend_event", name: "Attend a networking event", points: 10, emoji: "🎪" },
      { id: "give_talk", name: "Give a talk or presentation", points: 12, emoji: "🎤" },
      { id: "write_post", name: "Publish a thought leadership post", points: 7, emoji: "✍️" },
    ],
  },
];

const ALL_ACTIVITIES = ACTIVITY_TIERS.flatMap((t) =>
  t.activities.map((a) => ({ ...a, tier: t.tier, tierLabel: t.label, tierColor: t.color }))
);

const DEFAULT_GOAL = 25;

// ─── HELPERS ─────────────────────────────────────────────────
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split("T")[0];
}
function getToday() { return new Date().toISOString().split("T")[0]; }
function getDayName(s) { return new Date(s + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" }); }
function getWeekDays(ws) {
  const days = [];
  for (let i = 0; i < 7; i++) { const d = new Date(ws + "T12:00:00"); d.setDate(d.getDate() + i); days.push(d.toISOString().split("T")[0]); }
  return days;
}
function fmtDate(s) { return new Date(s + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

// ─── MAIN APP ────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("dashboard");
  const [activityLog, setActivityLog] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [showContactModal, setShowContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [contactForm, setContactForm] = useState({ name: "", company: "", notes: "", followUpDate: "", warmth: 1 });
  const [weeklyGoal, setWeeklyGoal] = useState(DEFAULT_GOAL);
  const [toast, setToast] = useState(null);
  const [logAnim, setLogAnim] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState([]);
  const [importSelected, setImportSelected] = useState(new Set());
  const [importFilter, setImportFilter] = useState("");
  const fileRef = useRef(null);

  // ─── Load data ────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [log, cts, goal] = await Promise.all([db.getActivityLog(), db.getContacts(), db.getSettings()]);
        setActivityLog(log);
        setContacts(cts);
        setWeeklyGoal(goal);
      } catch (e) { console.warn("Load error:", e); }
      setLoaded(true);
    })();
  }, []);

  // ─── Auto-save goal ───────────────────────────────────────
  useEffect(() => { if (loaded) db.setSettings(weeklyGoal).catch(() => {}); }, [weeklyGoal, loaded]);

  // ─── Computed ─────────────────────────────────────────────
  const today = getToday();
  const weekStart = getWeekStart(today);
  const weekDays = getWeekDays(weekStart);

  const thisWeekLogs = useMemo(() => activityLog.filter(l => l.date >= weekStart && l.date <= weekDays[6]), [activityLog, weekStart, weekDays]);
  const todayLogs = useMemo(() => activityLog.filter(l => l.date === today), [activityLog, today]);
  const weeklyPoints = useMemo(() => thisWeekLogs.reduce((s, l) => s + l.points, 0), [thisWeekLogs]);
  const todayPoints = useMemo(() => todayLogs.reduce((s, l) => s + l.points, 0), [todayLogs]);
  const activeDays = useMemo(() => new Set(thisWeekLogs.map(l => l.date)).size, [thisWeekLogs]);

  const streak = useMemo(() => {
    let s = 0, d = new Date(today + "T12:00:00");
    if (!activityLog.some(l => l.date === today)) d.setDate(d.getDate() - 1);
    while (activityLog.some(l => l.date === d.toISOString().split("T")[0])) { s++; d.setDate(d.getDate() - 1); }
    return s;
  }, [activityLog, today]);

  const weekHeatmap = useMemo(() => weekDays.map(day => {
    const pts = activityLog.filter(l => l.date === day).reduce((s, l) => s + l.points, 0);
    return { day, points: pts, isToday: day === today, isPast: day < today };
  }), [weekDays, activityLog, today]);

  const weeklyTrend = useMemo(() => {
    const weeks = [];
    for (let w = 3; w >= 0; w--) {
      const d = new Date(weekStart + "T12:00:00"); d.setDate(d.getDate() - w * 7);
      const ws = d.toISOString().split("T")[0]; const wd = getWeekDays(ws);
      const pts = activityLog.filter(l => l.date >= ws && l.date <= wd[6]).reduce((s, l) => s + l.points, 0);
      weeks.push({ weekStart: ws, points: pts, label: w === 0 ? "This Week" : `${w}w ago` });
    }
    return weeks;
  }, [activityLog, weekStart]);
  const maxTrend = Math.max(...weeklyTrend.map(w => w.points), weeklyGoal);

  const overdueContacts = useMemo(
    () => contacts.filter(c => c.followUpDate && c.followUpDate <= today).sort((a, b) => a.followUpDate.localeCompare(b.followUpDate)),
    [contacts, today]
  );

  const suggestedWorkout = useMemo(() => {
    const s = [];
    if (overdueContacts.length > 0) s.push({ text: `Follow up with ${overdueContacts[0].name}`, activityId: "follow_up", contact: overdueContacts[0].name });
    if (todayPoints < 3) { s.push({ text: "Leave a thoughtful comment on LinkedIn", activityId: "comment_post" }); s.push({ text: "Research someone you'd like to connect with", activityId: "research_contact" }); }
    if (todayPoints >= 3 && todayPoints < 8) s.push({ text: "Send a quick DM to someone you admire", activityId: "send_dm" });
    if (activeDays >= 3 && weeklyPoints < weeklyGoal * 0.7) s.push({ text: "Schedule a coffee chat this week", activityId: "coffee_chat" });
    return s.slice(0, 3);
  }, [overdueContacts, todayPoints, activeDays, weeklyPoints, weeklyGoal]);

  const totalPoints = activityLog.reduce((s, l) => s + l.points, 0);
  const level = Math.floor(totalPoints / 50) + 1;
  const levelProg = ((totalPoints % 50) / 50) * 100;
  const levelNames = ["Wallflower", "Observer", "Nodder", "Conversationalist", "Connector", "Hub", "Catalyst", "Influencer", "Maven", "Superconnector"];
  const levelName = levelNames[Math.min(level - 1, levelNames.length - 1)];
  const progressPct = Math.min((weeklyPoints / weeklyGoal) * 100, 100);
  const warmthLabels = ["", "🧊 Cold", "🌤 Warm", "🔥 Hot"];

  // ─── Actions ──────────────────────────────────────────────
  const notify = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); }, []);

  async function logActivity(activity, contactName) {
    const entry = { id: uid(), activityId: activity.id, name: activity.name, points: activity.points, tier: activity.tier, date: today, timestamp: new Date().toISOString(), contactName: contactName || null, emoji: activity.emoji };
    setActivityLog(prev => [entry, ...prev]);
    setLogAnim(activity.id);
    setTimeout(() => setLogAnim(null), 500);
    notify(`+${activity.points} pts — ${activity.name}`);
    try { await db.addActivity(entry); } catch (e) { console.warn(e); }
  }

  async function saveContact() {
    if (!contactForm.name.trim()) return;
    const contact = editingContact
      ? { ...editingContact, ...contactForm, lastContact: today }
      : { ...contactForm, id: uid(), lastContact: today, created_at: new Date().toISOString() };
    if (editingContact) {
      setContacts(prev => prev.map(c => c.id === editingContact.id ? contact : c));
    } else {
      setContacts(prev => [contact, ...prev]);
    }
    setShowContactModal(false); setEditingContact(null);
    setContactForm({ name: "", company: "", notes: "", followUpDate: "", warmth: 1 });
    try { await db.upsertContact(contact); } catch (e) { console.warn(e); }
  }

  async function deleteContact(id) {
    setContacts(prev => prev.filter(c => c.id !== id));
    try { await db.deleteContact(id); } catch (e) { console.warn(e); }
  }

  async function resetData() {
    setActivityLog([]); setContacts([]); setWeeklyGoal(DEFAULT_GOAL);
    notify("Data reset");
    try { await Promise.all([db.clearActivityLog(), db.clearContacts(), db.setSettings(DEFAULT_GOAL)]); } catch (e) { console.warn(e); }
  }

  function handleCSV(e) {
    const file = e.target.files[0]; if (!file) return;
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (results) => {
        const parsed = results.data.map(row => {
          const fn = row["First Name"] || row["first_name"] || "";
          const ln = row["Last Name"] || row["last_name"] || "";
          const name = `${fn} ${ln}`.trim();
          const company = row["Company"] || row["company"] || row["Organization"] || "";
          const position = row["Position"] || row["position"] || row["Title"] || "";
          const email = row["Email Address"] || row["email"] || "";
          const connOn = row["Connected On"] || "";
          if (!name || name.length < 2) return null;
          const exists = contacts.some(c => c.name.toLowerCase() === name.toLowerCase());
          return { id: uid(), name, company, position, email, connectedOn: connOn, notes: position ? `${position}${company ? " at " + company : ""}` : "", warmth: 1, exists };
        }).filter(Boolean);
        setImportPreview(parsed);
        setImportSelected(new Set(parsed.filter(p => !p.exists).slice(0, 50).map(p => p.id)));
        setShowImportModal(true);
      },
      error: () => notify("Error reading CSV"),
    });
    e.target.value = "";
  }

  async function importSelected2() {
    const toImport = importPreview.filter(p => importSelected.has(p.id)).map(p => ({
      id: p.id, name: p.name, company: p.company, notes: p.notes, lastContact: p.connectedOn || today, followUpDate: "", warmth: 1, created_at: new Date().toISOString(),
    }));
    setContacts(prev => [...prev, ...toImport]);
    setShowImportModal(false); setImportPreview([]); setImportSelected(new Set());
    notify(`Imported ${toImport.length} contacts`);
    try { await db.importContacts(toImport); } catch (e) { console.warn(e); }
  }

  const filteredImport = useMemo(() => {
    if (!importFilter) return importPreview;
    const f = importFilter.toLowerCase();
    return importPreview.filter(p => p.name.toLowerCase().includes(f) || p.company.toLowerCase().includes(f) || (p.position || "").toLowerCase().includes(f));
  }, [importPreview, importFilter]);

  // ─── THEME ────────────────────────────────────────────────
  const T = {
    bg: "#F8F7F4",
    card: "#FFFFFF",
    cardBorder: "#EDEDEB",
    cardShadow: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
    text: "#2D2D2D",
    textMuted: "#8E8E8E",
    textLight: "#B5B5B5",
    primary: "#7BAE8A",
    primaryBg: "#EEF6F0",
    primaryDark: "#5A8C68",
    accent: "#D4943F",
    accentBg: "#FDF3E7",
    danger: "#C46B5A",
    dangerBg: "#FCEEE9",
    blue: "#7E9FBF",
    blueBg: "#EDF2F7",
    divider: "#F0EFEC",
  };

  return (
    <div style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: T.bg, minHeight: "100vh", color: T.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Source+Serif+4:wght@400;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${T.bg}; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pop { 0% { transform: scale(0.9); } 50% { transform: scale(1.08); } 100% { transform: scale(1); } }
        @keyframes toastIn { from { transform: translateX(-50%) translateY(16px); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }
        .card { background: ${T.card}; border: 1px solid ${T.cardBorder}; border-radius: 16px; padding: 20px; box-shadow: ${T.cardShadow}; transition: box-shadow 0.2s; }
        .card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
        .btn { border: none; cursor: pointer; border-radius: 10px; font-family: inherit; font-weight: 500; transition: all 0.15s; }
        .btn:hover { transform: translateY(-1px); filter: brightness(0.97); }
        .btn:active { transform: scale(0.97); }
        .act-btn { display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px 14px; background: ${T.bg}; border: 1px solid ${T.cardBorder}; border-radius: 12px; color: ${T.text}; cursor: pointer; font-family: inherit; font-size: 13.5px; transition: all 0.15s; }
        .act-btn:hover { background: #F0EFE9; border-color: #D8D8D4; transform: translateX(2px); }
        .act-btn.pop { animation: pop 0.35s ease; }
        .tab { background: transparent; color: ${T.textMuted}; border: none; padding: 10px 16px; cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 500; border-radius: 8px 8px 0 0; transition: all 0.15s; border-bottom: 2px solid transparent; }
        .tab:hover { color: ${T.text}; }
        .tab.on { color: ${T.text}; border-bottom-color: ${T.primary}; }
        input, textarea, select { font-family: inherit; background: ${T.bg}; border: 1px solid ${T.cardBorder}; border-radius: 10px; padding: 10px 14px; color: ${T.text}; font-size: 14px; width: 100%; outline: none; transition: border-color 0.2s; }
        input:focus, textarea:focus { border-color: ${T.primary}; box-shadow: 0 0 0 3px ${T.primaryBg}; }
        input[type="date"] { color-scheme: light; }
        ::placeholder { color: ${T.textLight}; }
        ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #ddd; border-radius: 3px; }
      `}</style>

      {/* ─── HEADER ──────────────────────────────────── */}
      <div style={{ padding: "28px 24px 0", maxWidth: 560, margin: "0 auto", animation: "fadeUp 0.4s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 24, fontWeight: 700, color: T.text, letterSpacing: "-0.3px" }}>
              Network Reps
            </h1>
            <p style={{ fontSize: 13, color: T.textMuted, fontWeight: 400, marginTop: 2 }}>
              Your networking fitness tracker
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: T.textMuted }}>Level {level}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.primary }}>{levelName}</div>
            <div style={{ width: 72, height: 3, background: T.divider, borderRadius: 2, marginTop: 5 }}>
              <div style={{ width: `${levelProg}%`, height: "100%", background: `linear-gradient(90deg, ${T.primary}, ${T.primaryDark})`, borderRadius: 2, transition: "width 0.5s" }} />
            </div>
            <div style={{ fontSize: 10, color: T.textLight, marginTop: 2 }}>{totalPoints} / {level * 50} XP</div>
          </div>
        </div>

        {!isSupabaseConfigured && loaded && (
          <div style={{ marginTop: 12, padding: "8px 12px", background: T.accentBg, borderRadius: 10, fontSize: 11, color: T.accent }}>
            Running in local mode. Add Supabase env vars for cloud sync.
          </div>
        )}

        <div style={{ display: "flex", gap: 2, marginTop: 18, borderBottom: `1px solid ${T.divider}` }}>
          {["dashboard", "log", "contacts", "history"].map(id => (
            <button key={id} className={`tab ${view === id ? "on" : ""}`} onClick={() => setView(id)}>
              {id === "dashboard" ? "Dashboard" : id === "log" ? "Log Activity" : id === "contacts" ? "Contacts" : "History"}
            </button>
          ))}
        </div>
      </div>

      {/* ─── CONTENT ─────────────────────────────────── */}
      <div style={{ padding: "20px 24px 100px", maxWidth: 560, margin: "0 auto" }}>

        {/* ═══ DASHBOARD ═══ */}
        {view === "dashboard" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, animation: "fadeUp 0.35s ease" }}>

            {/* Progress Ring */}
            <div className="card" style={{ textAlign: "center", padding: 28 }}>
              <div style={{ position: "relative", width: 130, height: 130, margin: "0 auto 14px" }}>
                <svg width="130" height="130" viewBox="0 0 130 130">
                  <circle cx="65" cy="65" r="55" fill="none" stroke={T.divider} strokeWidth="9" />
                  <circle cx="65" cy="65" r="55" fill="none"
                    stroke={progressPct >= 100 ? T.primary : T.accent}
                    strokeWidth="9" strokeLinecap="round"
                    strokeDasharray={`${(progressPct / 100) * 345.6} 345.6`}
                    transform="rotate(-90 65 65)"
                    style={{ transition: "stroke-dasharray 0.8s ease" }} />
                </svg>
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
                  <div style={{ fontSize: 30, fontWeight: 700, fontFamily: "'Source Serif 4', serif", color: T.text }}>{weeklyPoints}</div>
                  <div style={{ fontSize: 11, color: T.textMuted }}>/ {weeklyGoal} pts</div>
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, color: T.text }}>
                {progressPct >= 100 ? "🎯 Weekly goal crushed!" : progressPct >= 60 ? "💪 Strong week — keep going!" : "📈 Building momentum..."}
              </div>
              <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>
                {weeklyGoal - weeklyPoints > 0 ? `${weeklyGoal - weeklyPoints} pts to go` : `${weeklyPoints - weeklyGoal} pts over goal`}
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {[
                { label: "Today", val: todayPoints, sub: "pts", c: T.primary },
                { label: "Streak", val: streak, sub: streak === 1 ? "day" : "days", c: T.accent },
                { label: "Active Days", val: activeDays, sub: "/ 7", c: T.blue },
              ].map((s, i) => (
                <div key={i} className="card" style={{ textAlign: "center", padding: "14px 8px" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: s.c, fontFamily: "'Source Serif 4', serif" }}>{s.val}</div>
                  <div style={{ fontSize: 10, color: T.textLight }}>{s.sub}</div>
                  <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Week Heatmap */}
            <div className="card">
              <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.6 }}>This Week</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
                {weekHeatmap.map((d, i) => {
                  const int = Math.min(d.points / 10, 1);
                  return (
                    <div key={i} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: T.textLight, marginBottom: 5 }}>{getDayName(d.day)}</div>
                      <div style={{
                        width: 34, height: 34, borderRadius: 10, margin: "0 auto",
                        background: d.points > 0 ? `rgba(123,174,138,${0.15 + int * 0.55})` : d.isToday ? T.accentBg : T.bg,
                        border: d.isToday ? `2px solid ${T.accent}` : `1px solid ${d.points > 0 ? "transparent" : T.cardBorder}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 600, color: d.points > 0 ? T.primaryDark : T.textLight,
                        transition: "all 0.3s",
                      }}>
                        {d.points > 0 ? d.points : d.isPast ? "—" : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4-Week Trend */}
            <div className="card">
              <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>4-Week Trend</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 72 }}>
                {weeklyTrend.map((w, i) => {
                  const h = maxTrend > 0 ? (w.points / maxTrend) * 62 : 0;
                  return (
                    <div key={i} style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: i === 3 ? T.primary : T.textMuted, marginBottom: 4 }}>{w.points}</div>
                      <div style={{
                        height: Math.max(h, 4), borderRadius: 6,
                        background: i === 3 ? `linear-gradient(180deg, ${T.primary}, ${T.primaryDark})` : T.divider,
                        transition: "height 0.5s",
                      }} />
                      <div style={{ fontSize: 10, color: T.textLight, marginTop: 5 }}>{w.label}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ flex: 1, height: 1, borderTop: `1px dashed ${T.cardBorder}` }} />
                <span style={{ fontSize: 10, color: T.textLight }}>Goal: {weeklyGoal}</span>
              </div>
            </div>

            {/* Suggested Workout */}
            {suggestedWorkout.length > 0 && (
              <div className="card" style={{ borderColor: T.primary, borderLeftWidth: 3 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.primary, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.6 }}>
                  🏋️ Today's Workout
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {suggestedWorkout.map((s, i) => {
                    const act = ALL_ACTIVITIES.find(a => a.id === s.activityId);
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: T.primaryBg, borderRadius: 10 }}>
                        <span style={{ fontSize: 13, color: T.text }}>{s.text}</span>
                        {act && <button className="btn" onClick={() => logActivity(act, s.contact)}
                          style={{ background: T.primary, color: "#fff", padding: "5px 12px", fontSize: 11 }}>+{act.points} ✓</button>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Overdue */}
            {overdueContacts.length > 0 && (
              <div className="card" style={{ borderColor: T.danger, borderLeftWidth: 3 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.danger, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.6 }}>⏰ Overdue Follow-ups</div>
                {overdueContacts.slice(0, 3).map(c => (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.divider}` }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: T.textMuted }}>{c.company} · Due {fmtDate(c.followUpDate)}</div>
                    </div>
                    <button className="btn" onClick={() => {
                      const act = ALL_ACTIVITIES.find(a => a.id === "follow_up");
                      logActivity(act, c.name);
                      const updated = { ...c, lastContact: today, followUpDate: "" };
                      setContacts(prev => prev.map(pc => pc.id === c.id ? updated : pc));
                      db.upsertContact(updated).catch(() => {});
                    }} style={{ background: T.dangerBg, color: T.danger, padding: "5px 12px", fontSize: 11 }}>Done ✓</button>
                  </div>
                ))}
              </div>
            )}

            {/* Settings */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 12, color: T.textMuted }}>Weekly Goal</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                    <button className="btn" onClick={() => setWeeklyGoal(g => Math.max(5, g - 5))} style={{ background: T.bg, border: `1px solid ${T.cardBorder}`, color: T.text, width: 28, height: 28, fontSize: 16, padding: 0 }}>−</button>
                    <span style={{ fontSize: 17, fontWeight: 600, minWidth: 28, textAlign: "center" }}>{weeklyGoal}</span>
                    <button className="btn" onClick={() => setWeeklyGoal(g => g + 5)} style={{ background: T.bg, border: `1px solid ${T.cardBorder}`, color: T.text, width: 28, height: 28, fontSize: 16, padding: 0 }}>+</button>
                  </div>
                </div>
                <button className="btn" onClick={resetData} style={{ background: T.dangerBg, color: T.danger, padding: "6px 14px", fontSize: 11 }}>Reset Data</button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ LOG ACTIVITY ═══ */}
        {view === "log" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, animation: "fadeUp 0.35s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Log a Rep</div>
                <div style={{ fontSize: 12, color: T.textMuted }}>Tap to log — easiest at top</div>
              </div>
              <div style={{ background: T.primaryBg, padding: "5px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, color: T.primary }}>
                Today: {todayPoints} pts
              </div>
            </div>
            {ACTIVITY_TIERS.map(tier => (
              <div key={tier.tier} className="card">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: tier.color }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: tier.color }}>{tier.label}</span>
                  <span style={{ fontSize: 11, color: T.textLight }}>· {tier.description}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {tier.activities.map(a => (
                    <button key={a.id} className={`act-btn ${logAnim === a.id ? "pop" : ""}`} onClick={() => logActivity({ ...a, tier: tier.tier })}>
                      <span style={{ fontSize: 17 }}>{a.emoji}</span>
                      <span style={{ flex: 1, textAlign: "left" }}>{a.name}</span>
                      <span style={{ background: tier.bg, color: tier.color, padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>+{a.points}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ CONTACTS ═══ */}
        {view === "contacts" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, animation: "fadeUp 0.35s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Your Network</div>
              <div style={{ display: "flex", gap: 6 }}>
                <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleCSV} />
                <button className="btn" onClick={() => fileRef.current?.click()}
                  style={{ background: T.blueBg, color: T.blue, padding: "7px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>in</span> Import CSV
                </button>
                <button className="btn" onClick={() => { setEditingContact(null); setContactForm({ name: "", company: "", notes: "", followUpDate: "", warmth: 1 }); setShowContactModal(true); }}
                  style={{ background: T.primaryBg, color: T.primary, padding: "7px 14px", fontSize: 12 }}>+ Add</button>
              </div>
            </div>

            <div className="card" style={{ padding: 12, background: T.blueBg, borderColor: "transparent" }}>
              <div style={{ fontSize: 11.5, color: T.blue }}>
                <strong>Import from LinkedIn:</strong> Settings → Data Privacy → Get a copy of your data → "Connections" → Download CSV → Upload here
              </div>
            </div>

            {contacts.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 40, color: T.textLight }}>
                <div style={{ fontSize: 30, marginBottom: 8 }}>👥</div>
                Add your first contact to start tracking
              </div>
            ) : (
              [...contacts].sort((a, b) => {
                if (a.followUpDate && a.followUpDate <= today && (!b.followUpDate || b.followUpDate > today)) return -1;
                if (b.followUpDate && b.followUpDate <= today && (!a.followUpDate || a.followUpDate > today)) return 1;
                return (b.warmth || 0) - (a.warmth || 0);
              }).map(c => {
                const overdue = c.followUpDate && c.followUpDate <= today;
                return (
                  <div key={c.id} className="card" style={{ borderColor: overdue ? T.danger : undefined }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</span>
                          <span style={{ fontSize: 12 }}>{warmthLabels[c.warmth || 1]}</span>
                        </div>
                        {c.company && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 1 }}>{c.company}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button className="btn" onClick={() => {
                          setEditingContact(c);
                          setContactForm({ name: c.name, company: c.company || "", notes: c.notes || "", followUpDate: c.followUpDate || "", warmth: c.warmth || 1 });
                          setShowContactModal(true);
                        }} style={{ background: T.bg, border: `1px solid ${T.cardBorder}`, color: T.textMuted, padding: "3px 10px", fontSize: 11 }}>Edit</button>
                        <button className="btn" onClick={() => deleteContact(c.id)}
                          style={{ background: T.dangerBg, color: T.danger, padding: "3px 10px", fontSize: 11 }}>×</button>
                      </div>
                    </div>
                    {c.notes && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 7, fontStyle: "italic" }}>{c.notes}</div>}
                    <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 11, color: T.textLight }}>
                      {c.lastContact && <span>Last: {fmtDate(c.lastContact)}</span>}
                      {c.followUpDate && <span style={{ color: overdue ? T.danger : T.textLight }}>Follow up: {fmtDate(c.followUpDate)} {overdue ? "⚠️" : ""}</span>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ═══ HISTORY ═══ */}
        {view === "history" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, animation: "fadeUp 0.35s ease" }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Activity History</div>
            {activityLog.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 40, color: T.textLight }}>
                <div style={{ fontSize: 30, marginBottom: 8 }}>📋</div>
                No activities yet. Start with a warm-up!
              </div>
            ) : (
              [...activityLog].sort((a, b) => b.timestamp?.localeCompare(a.timestamp)).map(entry => (
                <div key={entry.id} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
                  background: T.card, borderRadius: 12, border: `1px solid ${T.cardBorder}`,
                }}>
                  <span style={{ fontSize: 18 }}>{entry.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {entry.name}
                      {entry.contactName && <span style={{ color: T.textMuted }}> · {entry.contactName}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: T.textLight }}>{fmtDate(entry.date)}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.primary }}>+{entry.points}</div>
                </div>
              ))
            )}
            {activityLog.length > 0 && (
              <div style={{ textAlign: "center", padding: 14, fontSize: 12, color: T.textLight }}>
                {activityLog.length} activities · {totalPoints} lifetime points
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── CONTACT MODAL ───────────────────────────── */}
      {showContactModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20, backdropFilter: "blur(4px)" }}
          onClick={() => setShowContactModal(false)}>
          <div style={{ background: T.card, borderRadius: 20, padding: 28, width: "100%", maxWidth: 400, border: `1px solid ${T.cardBorder}`, boxShadow: "0 20px 60px rgba(0,0,0,0.12)", animation: "slideIn 0.25s ease" }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 18, fontFamily: "'Source Serif 4', serif" }}>
              {editingContact ? "Edit Contact" : "Add Contact"}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input placeholder="Name *" value={contactForm.name} onChange={e => setContactForm({ ...contactForm, name: e.target.value })} />
              <input placeholder="Company / Org" value={contactForm.company} onChange={e => setContactForm({ ...contactForm, company: e.target.value })} />
              <textarea placeholder="Notes (how you met, interests...)" value={contactForm.notes} onChange={e => setContactForm({ ...contactForm, notes: e.target.value })} rows={2} />
              <div>
                <label style={{ fontSize: 12, color: T.textMuted, display: "block", marginBottom: 3 }}>Follow-up Date</label>
                <input type="date" value={contactForm.followUpDate} onChange={e => setContactForm({ ...contactForm, followUpDate: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: T.textMuted, display: "block", marginBottom: 3 }}>Warmth</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {[1, 2, 3].map(w => (
                    <button key={w} className="btn" onClick={() => setContactForm({ ...contactForm, warmth: w })}
                      style={{
                        flex: 1, padding: 8, fontSize: 13,
                        background: contactForm.warmth === w ? T.primaryBg : T.bg,
                        color: contactForm.warmth === w ? T.primary : T.textMuted,
                        border: `1px solid ${contactForm.warmth === w ? T.primary : T.cardBorder}`,
                      }}>{warmthLabels[w]}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button className="btn" onClick={() => setShowContactModal(false)} style={{ flex: 1, background: T.bg, border: `1px solid ${T.cardBorder}`, color: T.textMuted, padding: 12 }}>Cancel</button>
                <button className="btn" onClick={saveContact} style={{ flex: 1, background: T.primary, color: "#fff", padding: 12 }}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── IMPORT MODAL ────────────────────────────── */}
      {showImportModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20, backdropFilter: "blur(4px)" }}
          onClick={() => setShowImportModal(false)}>
          <div style={{ background: T.card, borderRadius: 20, padding: 24, width: "100%", maxWidth: 480, maxHeight: "80vh", display: "flex", flexDirection: "column", border: `1px solid ${T.cardBorder}`, boxShadow: "0 20px 60px rgba(0,0,0,0.12)", animation: "slideIn 0.25s ease" }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 17, fontWeight: 600, fontFamily: "'Source Serif 4', serif" }}>Import LinkedIn Contacts</h3>
            <p style={{ fontSize: 12, color: T.textMuted, marginTop: 3, marginBottom: 14 }}>
              {importPreview.length} found · {importSelected.size} selected · {importPreview.filter(p => p.exists).length} already added
            </p>
            <input placeholder="Filter by name, company, or title..." value={importFilter} onChange={e => setImportFilter(e.target.value)} style={{ marginBottom: 10, fontSize: 13 }} />
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button className="btn" onClick={() => setImportSelected(new Set(filteredImport.filter(p => !p.exists).map(p => p.id)))}
                style={{ background: T.bg, border: `1px solid ${T.cardBorder}`, color: T.textMuted, padding: "5px 10px", fontSize: 11 }}>Select all</button>
              <button className="btn" onClick={() => setImportSelected(new Set())}
                style={{ background: T.bg, border: `1px solid ${T.cardBorder}`, color: T.textMuted, padding: "5px 10px", fontSize: 11 }}>Clear</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3, minHeight: 0 }}>
              {filteredImport.map(p => (
                <div key={p.id} onClick={() => { if (p.exists) return; setImportSelected(prev => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; }); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "9px 10px",
                    background: p.exists ? T.bg : importSelected.has(p.id) ? T.primaryBg : T.card,
                    borderRadius: 10, cursor: p.exists ? "default" : "pointer",
                    border: `1px solid ${importSelected.has(p.id) ? T.primary : T.cardBorder}`,
                    opacity: p.exists ? 0.45 : 1, transition: "all 0.12s",
                  }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                    background: p.exists ? T.divider : importSelected.has(p.id) ? T.primary : T.bg,
                    border: `1px solid ${importSelected.has(p.id) ? T.primary : T.cardBorder}`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fff",
                  }}>{p.exists ? "—" : importSelected.has(p.id) ? "✓" : ""}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.name}{p.exists && <span style={{ fontSize: 10, color: T.textLight, marginLeft: 5 }}>already added</span>}
                    </div>
                    <div style={{ fontSize: 11, color: T.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.position}{p.position && p.company ? " · " : ""}{p.company}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="btn" onClick={() => { setShowImportModal(false); setImportPreview([]); setImportSelected(new Set()); }}
                style={{ flex: 1, background: T.bg, border: `1px solid ${T.cardBorder}`, color: T.textMuted, padding: 12 }}>Cancel</button>
              <button className="btn" onClick={importSelected2}
                style={{ flex: 1, background: T.blue, color: "#fff", padding: 12, fontWeight: 600 }}>Import {importSelected.size}</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── TOAST ────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: T.primary, color: "#fff", padding: "9px 22px",
          borderRadius: 24, fontSize: 13, fontWeight: 600, zIndex: 200,
          animation: "toastIn 0.25s ease", boxShadow: "0 6px 24px rgba(123,174,138,0.35)",
        }}>{toast}</div>
      )}
    </div>
  );
}
