"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import type { JiraDashboardData, JiraEpic, JiraTask } from "@/lib/jira";

const GanttChart      = dynamic(() => import("@/app/components/GanttChart"),      { ssr: false });
const KPIReport       = dynamic(() => import("@/app/components/KPIReport"),       { ssr: false });
const VelocityReport  = dynamic(() => import("@/app/components/VelocityReport"),  { ssr: false });
const EpicMDReport    = dynamic(() => import("@/app/components/EpicMDReport"),    { ssr: false });

// ─── Types ──────────────────────────────────────────────────────────────────
interface Project { key: string; name: string; category: string | null; }
type Page = "jira" | "gantt" | "kpi" | "velocity" | "epicmd";

// ─── Status / Priority ──────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  "Done":          { color: "#059669", bg: "#d1fae5", border: "#6ee7b7", dot: "#059669" },
  "In Progress":   { color: "#4f46e5", bg: "#ede9fe", border: "#a5b4fc", dot: "#4f46e5" },
  "To Do":         { color: "#475569", bg: "#f1f5f9", border: "#cbd5e1", dot: "#94a3b8" },
  "Delay":         { color: "#dc2626", bg: "#fee2e2", border: "#fca5a5", dot: "#dc2626" },
  "On Hold":       { color: "#ea580c", bg: "#ffedd5", border: "#fdba74", dot: "#ea580c" },
  "Waiting telco": { color: "#b45309", bg: "#fef3c7", border: "#fcd34d", dot: "#d97706" },
};
const PRIORITY_CFG: Record<string, { icon: string }> = {
  "Highest": { icon: "🔴" }, "High": { icon: "🟠" },
  "Medium":  { icon: "🟡" }, "Low":  { icon: "🔵" }, "Lowest": { icon: "⚪" },
};
function sc(status: string) {
  return STATUS_CFG[status] || { color: "#94a3b8", bg: "#94a3b815", border: "#94a3b840", dot: "#94a3b8" };
}

// ─── Utils ───────────────────────────────────────────────────────────────────
function isDone(status: string) {
  const n = status.toLowerCase().replace(/\s*\/\s*/g, "/").trim();
  return n === "done" || n === "stg/ready to deploy";
}
function isOverdue(due: string | null, status: string) {
  return !!due && !isDone(status) && new Date(due) < new Date();
}
function dueDateLabel(due: string | null, status: string) {
  if (!due) return { text: "No date", overdue: false };
  const d = new Date(due);
  const diff = Math.ceil((d.getTime() - Date.now()) / 86400000);
  const overdue = diff < 0 && status !== "Done";
  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, overdue };
  if (diff === 0) return { text: "Due today", overdue: false };
  if (diff <= 7) return { text: `${diff}d left`, overdue: false };
  return { text: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), overdue: false };
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}
function formatCountdown(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function generateRisks(epics: JiraEpic[], tasks: JiraTask[]) {
  const risks: { level: "critical" | "high" | "medium"; text: string }[] = [];
  const delayed = epics.filter((e) => e.status === "Delay");
  const critDel = delayed.filter((e) => e.priority === "High" || e.priority === "Highest");
  const overdueEps = epics.filter((e) => isOverdue(e.duedate, e.status));
  const bugs = tasks.filter((t) => t.issuetype === "Bug" && t.status !== "Done");
  const unassigned = tasks.filter((t) => !t.assignee && t.status !== "Done");
  const waitingTelco = epics.filter((e) => e.status === "Waiting telco");
  const onHold = epics.filter((e) => e.status === "On Hold");
  const dueSoon = epics.filter((e) => { if (!e.duedate || isDone(e.status)) return false; const d = (new Date(e.duedate).getTime() - Date.now()) / 86400000; return d >= 0 && d <= 7; });
  if (critDel.length) risks.push({ level: "critical", text: `${critDel.length} high-priority delayed epic${critDel.length > 1 ? "s" : ""} — SLA breach risk.` });
  if (overdueEps.length > 5) risks.push({ level: "critical", text: `${overdueEps.length} overdue epics — systemic delivery issue, capacity review needed.` });
  else if (overdueEps.length) risks.push({ level: "high", text: `${overdueEps.length} overdue epic${overdueEps.length > 1 ? "s" : ""} — partner relationship at risk.` });
  if (bugs.length > 15) risks.push({ level: "critical", text: `${bugs.length} open bugs — high defect density may block production launch.` });
  else if (bugs.length > 5) risks.push({ level: "high", text: `${bugs.length} open bugs — regression risk before next release.` });
  if (waitingTelco.length > 2) risks.push({ level: "high", text: `${waitingTelco.length} epics blocked on telco partners.` });
  if (unassigned.length > 10) risks.push({ level: "high", text: `${unassigned.length} unassigned tasks — ownership gap.` });
  if (dueSoon.length) risks.push({ level: "medium", text: `${dueSoon.length} epic${dueSoon.length > 1 ? "s" : ""} due within 7 days — ${dueSoon.map((e) => e.key).join(", ")}.` });
  if (onHold.length) risks.push({ level: "medium", text: `${onHold.length} on-hold epic${onHold.length > 1 ? "s" : ""} — may signal commercial issues.` });
  return risks;
}
function generateRecs(epics: JiraEpic[], tasks: JiraTask[]) {
  const recs: string[] = [];
  const delayed = epics.filter((e) => e.status === "Delay");
  const bugs = tasks.filter((t) => t.issuetype === "Bug" && t.status !== "Done");
  const unassigned = tasks.filter((t) => !t.assignee && t.status !== "Done");
  const waitingTelco = epics.filter((e) => e.status === "Waiting telco");
  const onHold = epics.filter((e) => e.status === "On Hold");
  const done = epics.filter((e) => isDone(e.status));
  if (delayed.length) recs.push(`Escalate ${delayed.length} delayed epic${delayed.length > 1 ? "s" : ""} — prioritize: ${delayed.slice(0, 2).map((e) => e.summary.replace(/^VAS Integration - /i, "").replace(/^Vas Integration - /i, "")).join(", ")}${delayed.length > 2 ? ` +${delayed.length - 2}` : ""}.`);
  if (bugs.length) recs.push(`Close ${bugs.length} open bugs before production deploy.`);
  if (unassigned.length) recs.push(`Assign ${unassigned.length} unassigned task${unassigned.length > 1 ? "s" : ""} — enforce mandatory assignee rule.`);
  if (waitingTelco.length) recs.push(`Follow up with telco partners for ${waitingTelco.length} blocked epic${waitingTelco.length > 1 ? "s" : ""}.`);
  if (onHold.length) recs.push(`Review ${onHold.length} on-hold epic${onHold.length > 1 ? "s" : ""} — resolve or deprioritize.`);
  if (done.length) recs.push(`${done.length} epics done — document lessons learned.`);
  return recs;
}

// ─── Logo SVG ────────────────────────────────────────────────────────────────
function Linkit360Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, flexShrink: 0 }}>
      {/* Icon box */}
      <div style={{
        width: 36, height: 36, borderRadius: 9,
        background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
        boxShadow: "0 2px 8px #4f46e530",
      }}>
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path d="M5 11h3.5M13.5 11H17" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <rect x="7.5" y="7.5" width="7" height="7" rx="3.5" stroke="white" strokeWidth="1.8" fill="none" />
          <circle cx="11" cy="11" r="2" fill="white" />
        </svg>
      </div>
      {/* Text */}
      <div style={{ marginLeft: 9, lineHeight: 1.1 }}>
        <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.5px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
          <span style={{ color: "#1e3a8a" }}>LINKIT</span><span style={{ color: "#4f46e5" }}>360</span>
        </div>
        <div style={{ fontSize: 9.5, fontWeight: 600, color: "#4f46e5", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Technology
        </div>
      </div>
    </div>
  );
}

// ─── Atoms ───────────────────────────────────────────────────────────────────
function Badge({ status }: { status: string }) {
  const s = sc(status);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
      {status}
    </span>
  );
}
function PriBadge({ priority }: { priority: string }) {
  return <span title={priority} style={{ fontSize: 13 }}>{PRIORITY_CFG[priority]?.icon || "⚪"}</span>;
}
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", ...style }}>{children}</div>;
}
function StatCard({ label, value, sub, color, icon }: { label: string; value: number | string; sub?: string; color?: string; icon: string }) {
  return (
    <Card style={{ padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: color || "var(--text)", lineHeight: 1 }}>{value}</div>
          {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{sub}</div>}
        </div>
        <div style={{ fontSize: 22, opacity: 0.7, flexShrink: 0 }}>{icon}</div>
      </div>
    </Card>
  );
}

// ─── Project Switcher ────────────────────────────────────────────────────────
function ProjectSwitcher({ projects, current, onChange }: { projects: Project[]; current: string; onChange: (k: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const current_ = projects.find((p) => p.key === current);
  const filtered = projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.key.toLowerCase().includes(search.toLowerCase()));
  const groups: Record<string, Project[]> = {};
  for (const p of filtered) { const c = p.category || "Other"; if (!groups[c]) groups[c] = []; groups[c].push(p); }
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface2)", border: "1px solid var(--border2)", borderRadius: "var(--radius-sm)", padding: "7px 12px", fontSize: 13, fontWeight: 600, color: "var(--text)", cursor: "pointer", minWidth: 0, maxWidth: 240 }}>
        <span style={{ background: "var(--accent)", color: "#fff", borderRadius: 5, padding: "1px 7px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{current}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current_?.name || "Select"}</span>
        <span style={{ marginLeft: "auto", color: "var(--text-muted)", flexShrink: 0, fontSize: 10 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 300, background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-md)", width: 290, maxHeight: 380, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
            <input autoFocus type="text" placeholder="Search projects…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: "100%", padding: "7px 10px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)", outline: "none" }} />
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {Object.entries(groups).map(([cat, projs]) => (
              <div key={cat}>
                <div style={{ padding: "8px 12px 4px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>{cat}</div>
                {projs.map((p) => (
                  <button key={p.key} onClick={() => { onChange(p.key); setOpen(false); setSearch(""); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: p.key === current ? "var(--accent-light)" : "transparent", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text)", textAlign: "left" }}>
                    <span style={{ background: p.key === current ? "var(--accent)" : "var(--surface2)", color: p.key === current ? "#fff" : "var(--text-muted)", borderRadius: 5, padding: "1px 6px", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{p.key}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  </button>
                ))}
              </div>
            ))}
            {!filtered.length && <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No projects found</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [page, setPage]               = useState<Page>("jira");
  const [data, setData]               = useState<JiraDashboardData | null>(null);
  const [projects, setProjects]       = useState<Project[]>([]);
  const [activeProject, setProject]   = useState("IV");
  const [error, setError]             = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [countdown, setCountdown]     = useState(3600);
  const [activeTab, setActiveTab]     = useState<"epics" | "tasks" | "wins" | "sprint" | "todo">("epics");
  const [epicSearch, setEpicSearch]   = useState("");
  const [statusFilter, setStatus]     = useState("All");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (key?: string) => {
    const k = key || activeProject;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/jira?project=${k}`, { cache: "no-store" });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `HTTP ${res.status}`); }
      const json: JiraDashboardData = await res.json();
      setData(json); setLastRefresh(new Date()); setCountdown(3600);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [activeProject]);

  useEffect(() => {
    fetch("/api/projects").then((r) => r.json()).then((l) => { if (Array.isArray(l)) setProjects(l); }).catch(() => {});
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    timerRef.current = setInterval(() => { setCountdown((c) => { if (c <= 1) { fetchData(); return 3600; } return c - 1; }); }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchData]);

  const handleProjectChange = (k: string) => {
    setProject(k); setData(null); setEpicSearch(""); setStatus("All"); setActiveTab("epics"); fetchData(k);
  };

  const epics  = data?.epics  || [];
  const tasks  = data?.tasks  || [];
  const doneEpics  = epics.filter((e) => isDone(e.status));
  const inProg     = epics.filter((e) => e.status === "In Progress");
  const delayed    = epics.filter((e) => e.status === "Delay");
  const blocked    = epics.filter((e) => e.status === "On Hold" || e.status === "Waiting telco");
  const openBugs   = tasks.filter((t) => t.issuetype === "Bug" && t.status !== "Done").length;
  const pct        = epics.length > 0 ? Math.round((doneEpics.length / epics.length) * 100) : 0;
  const allStatuses = ["All", ...Array.from(new Set(epics.filter((e) => e.status !== "Done").map((e) => e.status))).sort()];
  const filteredEpics = epics.filter((e) => {
    if (isDone(e.status)) return false;
    const ms = !epicSearch || e.summary.toLowerCase().includes(epicSearch.toLowerCase()) || e.key.toLowerCase().includes(epicSearch.toLowerCase());
    const mst = statusFilter === "All" || e.status === statusFilter;
    return ms && mst;
  });
  const risks = generateRisks(epics, tasks);
  const recs  = generateRecs(epics, tasks);
  const currentProject = projects.find((p) => p.key === activeProject);

  const NAV_ITEMS: { id: Page; label: string; icon: string; desc: string }[] = [
    { id: "jira",     label: "Jira Dashboard",   icon: "📋", desc: "Epics, tasks & status" },
    { id: "gantt",    label: "Gantt Timeline",   icon: "📅", desc: "Delivery timeline" },
    { id: "kpi",      label: "KPI Report",       icon: "📊", desc: "Dept. performance" },
    { id: "velocity", label: "Velocity Report",  icon: "🚀", desc: "Team velocity & allocation" },
    { id: "epicmd",   label: "Epic MD Report",   icon: "📋", desc: "Man-days per epic" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* ── Navbar ── */}
      <header style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 8px rgba(0,0,0,0.08)" }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: "0 16px" }}>
          {/* Top row */}
          <div className="header-top">
            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <Linkit360Logo />
              <div style={{ width: 1, height: 28, background: "var(--border)", flexShrink: 0 }} className="hide-mobile" />
              <div className="hide-mobile">
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.02em", whiteSpace: "nowrap" }}>Executive Dashboard</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" }}>2026 Summary</div>
              </div>
            </div>

            <div style={{ flex: 1 }} />

            {/* Project switcher */}
            {(page === "jira" || page === "gantt" || page === "epicmd") && projects.length > 0 && (
              <ProjectSwitcher projects={projects} current={activeProject} onChange={handleProjectChange} />
            )}

            {/* Refresh */}
            {page !== "kpi" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div className="hide-mobile" style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <span>↻ in <strong style={{ color: "var(--text)" }}>{formatCountdown(countdown)}</strong></span>
                  {lastRefresh && <span>{lastRefresh.toLocaleTimeString()}</span>}
                </div>
                <button
                  onClick={() => fetchData()}
                  disabled={loading}
                  style={{ display: "flex", alignItems: "center", gap: 6, background: loading ? "var(--surface2)" : "var(--accent)", color: loading ? "var(--text-muted)" : "#fff", border: "none", borderRadius: "var(--radius-sm)", padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: loading ? "default" : "pointer", whiteSpace: "nowrap" }}
                >
                  <span style={{ display: "inline-block", animation: loading ? "spin 0.7s linear infinite" : "none" }}>↻</span>
                  <span className="hide-mobile">{loading ? "Loading…" : "Refresh"}</span>
                </button>
              </div>
            )}
          </div>

          {/* Nav tabs — horizontally scrollable on mobile */}
          <div className="nav-tabs">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "10px 14px",
                  background: "transparent", border: "none", cursor: "pointer",
                  color: page === item.id ? "var(--accent)" : "var(--text-muted)",
                  fontWeight: page === item.id ? 700 : 500, fontSize: 13,
                  borderBottom: page === item.id ? "2px solid var(--accent)" : "2px solid transparent",
                  marginBottom: -1, transition: "all 0.15s", whiteSpace: "nowrap", flexShrink: 0,
                }}
              >
                <span>{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </button>
            ))}
          </div>

          {/* Countdown bar */}
          {page !== "kpi" && (
            <div style={{ height: 2, background: "var(--surface2)" }}>
              <div style={{ height: "100%", width: `${((3600 - countdown) / 3600) * 100}%`, background: "var(--accent)", transition: "width 1s linear" }} />
            </div>
          )}
        </div>
      </header>

      {/* ── Page content ── */}
      <main className="main-content" style={{ maxWidth: 1300, margin: "0 auto", padding: "20px 16px" }}>

        {/* ══ KPI PAGE ══ */}
        {page === "kpi" && <KPIReport />}

        {/* ══ GANTT PAGE ══ */}
        {page === "gantt" && (
          <GanttChart defaultProject={activeProject} allProjects={projects} />
        )}

        {/* ══ VELOCITY REPORT ══ */}
        {page === "velocity" && <VelocityReport projectKey={activeProject} allProjects={projects} />}

        {/* ══ EPIC MD REPORT ══ */}
        {page === "epicmd" && <EpicMDReport projectKey={activeProject} allProjects={projects} />}

        {/* ══ JIRA DASHBOARD ══ */}
        {page === "jira" && (
          <>
            {/* Error banner */}
            {error && !data && (
              <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "var(--radius)", padding: "14px 16px", marginBottom: 16, display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <div>
                  <div style={{ fontWeight: 700, color: "#ef4444" }}>Failed to load Jira data</div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{error}</div>
                </div>
                <button onClick={() => fetchData()} style={{ marginLeft: "auto", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Retry</button>
              </div>
            )}

            {/* Project title */}
            <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ background: "var(--accent)", color: "#fff", borderRadius: 6, padding: "2px 10px", fontWeight: 800, fontSize: 13 }}>{activeProject}</span>
              <span style={{ fontWeight: 700, fontSize: 16, color: "var(--text)" }}>{currentProject?.name || activeProject}</span>
              {loading && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>· Refreshing…</span>}
            </div>

            {/* Stats */}
            <div className="stats-grid">
              <StatCard label="Total Epics" value={epics.length} sub={`${pct}% done`} icon="📦" />
              <StatCard label="Completed" value={doneEpics.length} sub="Wins in 2026" color="var(--green)" icon="✅" />
              <StatCard label="In Progress" value={inProg.length} sub="Active now" color="var(--accent)" icon="⚙️" />
              <StatCard label="Delayed" value={delayed.length} sub="Need action" color="var(--red)" icon="⏰" />
              <StatCard label="Blocked" value={blocked.length} sub="On hold / Telco" color="var(--orange)" icon="🚧" />
              <StatCard label="Open Bugs" value={openBugs} sub="Across tasks" color={openBugs > 10 ? "var(--red)" : "var(--yellow)"} icon="🐛" />
            </div>

            {/* Progress bar */}
            <Card style={{ padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Overall Progress — 2026</span>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{doneEpics.length} / {epics.length} epics</span>
              </div>
              <div style={{ height: 10, background: "var(--surface2)", borderRadius: 5, overflow: "hidden", border: "1px solid var(--border)" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#6366f1,#10b981)", borderRadius: 5, transition: "width 0.6s ease" }} />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 10 }}>
                {Object.entries(STATUS_CFG).map(([status, s]) => {
                  const count = epics.filter((e) => e.status === status).length;
                  if (!count) return null;
                  return (
                    <span key={status} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-muted)" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: s.dot }} />
                      {status}: <strong style={{ color: s.color }}>{count}</strong>
                    </span>
                  );
                })}
              </div>
            </Card>

            {/* Risks + Recs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginBottom: 16 }}>
              <Card style={{ padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 16 }}>⚠️</span>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>Risk Highlights</span>
                  <span style={{ background: risks.some((r) => r.level === "critical") ? "var(--red-light)" : "var(--surface2)", color: risks.some((r) => r.level === "critical") ? "var(--red)" : "var(--text-muted)", borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 600 }}>{risks.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {!risks.length ? (
                    <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: 12 }}>No critical risks 🎉</div>
                  ) : risks.map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: r.level === "critical" ? "#fee2e2" : r.level === "high" ? "#ffedd5" : "#fef9c3", border: `1px solid ${r.level === "critical" ? "#fca5a5" : r.level === "high" ? "#fdba74" : "#fde047"}`, borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
                      <span style={{ fontSize: 16, flexShrink: 0 }}>{r.level === "critical" ? "🔴" : r.level === "high" ? "🟠" : "🟡"}</span>
                      <span style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>{r.text}</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card style={{ padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 16 }}>💡</span>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>Recommendations</span>
                  <span style={{ background: "var(--accent-light)", color: "var(--accent)", borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 600 }}>{recs.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {recs.map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#ede9fe", border: "1px solid #c4b5fd", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
                      <span style={{ background: "var(--accent)", color: "#fff", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>{r}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Tabs */}
            <div className="sub-tabs" style={{ marginBottom: 12 }}>
              {([["epics","Active Epics",filteredEpics.length],["tasks","Tasks",tasks.length],["wins","Wins 🏆",doneEpics.length],["sprint","Sprint Week ⚡",null],["todo","To Do 📌",null]] as const).map(([tab,label,count]) => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{ display: "flex", alignItems: "center", gap: 6, background: activeTab === tab ? "var(--accent)" : "var(--surface)", color: activeTab === tab ? "#fff" : "var(--text-muted)", border: activeTab === tab ? "none" : "1px solid var(--border)", borderRadius: 20, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {label}
                  {count !== null && <span style={{ background: activeTab === tab ? "rgba(255,255,255,0.25)" : "var(--surface2)", color: activeTab === tab ? "#fff" : "var(--text-muted)", borderRadius: 20, padding: "1px 7px", fontSize: 11 }}>{count}</span>}
                </button>
              ))}
            </div>

            {/* Epics filter */}
            {activeTab === "epics" && (
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <input type="text" placeholder="🔍 Search epic…" value={epicSearch} onChange={(e) => setEpicSearch(e.target.value)} style={{ flex: "1 1 180px", minWidth: 0, padding: "9px 12px", background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)", outline: "none" }} />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {allStatuses.map((s) => (
                    <button key={s} onClick={() => setStatus(s)} style={{ padding: "7px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", background: statusFilter === s ? (s === "All" ? "var(--text)" : sc(s).bg) : "var(--surface)", color: statusFilter === s ? (s === "All" ? "var(--bg)" : sc(s).color) : "var(--text-muted)", border: statusFilter === s ? `1px solid ${s === "All" ? "var(--text)" : sc(s).border}` : "1px solid var(--border)" }}>
                      {s}{s !== "All" && <span style={{ marginLeft: 5, opacity: 0.7 }}>{epics.filter((e) => e.status === s).length}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tab content */}
            <div className="fade-in" key={activeTab + activeProject}>
              {activeTab === "epics"  && <EpicsView epics={filteredEpics} tasks={tasks} />}
              {activeTab === "tasks"  && <TasksView tasks={tasks} />}
              {activeTab === "wins"   && <WinsView  epics={doneEpics} />}
              {activeTab === "sprint" && <SprintView projectKey={activeProject} />}
              {activeTab === "todo"   && <ToDoView tasks={tasks} />}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ─── Epics View ───────────────────────────────────────────────────────────────
function EpicsView({ epics, tasks }: { epics: JiraEpic[]; tasks: JiraTask[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!epics.length) return <Card style={{ padding: 32, textAlign: "center" }}><div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div><div style={{ color: "var(--text-muted)", fontSize: 14 }}>No epics match your filters.</div></Card>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {epics.map((epic) => {
        const et = tasks.filter((t) => t.parentKey === epic.key || t.parent === epic.summary);
        const dt = et.filter((t) => isDone(t.status)).length;
        const tp = et.length > 0 ? Math.round((dt / et.length) * 100) : 0;
        const isExp = expanded === epic.key;
        const due = dueDateLabel(epic.duedate, epic.status);
        const s = sc(epic.status);
        return (
          <Card key={epic.key} style={{ overflow: "hidden", borderLeft: `4px solid ${s.dot}` }}>
            <div onClick={() => setExpanded(isExp ? null : epic.key)} style={{ padding: "14px 14px", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                <PriBadge priority={epic.priority} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-muted)", fontWeight: 600 }}>{epic.key}</span>
                    {due.overdue && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--red)", background: "var(--red-light)", borderRadius: 10, padding: "1px 7px" }}>OVERDUE</span>}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", lineHeight: 1.4 }}>{epic.summary}</div>
                </div>
                <span style={{ color: "var(--text-muted)", fontSize: 12, flexShrink: 0 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", alignItems: "center" }}>
                <Badge status={epic.status} />
                <span style={{ fontSize: 12, fontWeight: 600, color: due.overdue ? "var(--red)" : "var(--text-muted)" }}>📅 {due.text}</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>👤 {epic.assignee || <span style={{ color: "var(--red)" }}>Unassigned</span>}</span>
                {et.length > 0 && <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>{dt}/{et.length} tasks</span>}
              </div>
              {et.length > 0 && <div style={{ marginTop: 8, height: 4, background: "var(--surface2)", borderRadius: 2, overflow: "hidden", border: "1px solid var(--border)" }}><div style={{ height: "100%", width: `${tp}%`, background: "var(--accent)", borderRadius: 2 }} /></div>}
            </div>
            {isExp && (
              <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface2)", padding: "10px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 8 }}>Tasks ({et.length})</div>
                {!et.length ? <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No tasks linked.</div> : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {et.map((t) => {
                      const td = dueDateLabel(t.duedate, t.status);
                      return (
                        <div key={t.key} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                            <PriBadge priority={t.priority} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-muted)" }}>{t.key}</span>
                                <span style={{ fontSize: 10, fontWeight: 600, color: t.issuetype === "Bug" ? "var(--red)" : "var(--text-muted)", background: t.issuetype === "Bug" ? "var(--red-light)" : "var(--surface2)", borderRadius: 10, padding: "1px 6px" }}>{t.issuetype}</span>
                              </div>
                              <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.4 }}>{t.summary}</div>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "6px 12px", flexWrap: "wrap", alignItems: "center" }}>
                            <Badge status={t.status} />
                            <span style={{ fontSize: 12, color: td.overdue ? "var(--red)" : "var(--text-muted)" }}>📅 {td.text}</span>
                            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>👤 {t.assignee || <span style={{ color: "var(--red)" }}>Unassigned</span>}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ─── Tasks View ───────────────────────────────────────────────────────────────
function TasksView({ tasks }: { tasks: JiraTask[] }) {
  const [search, setSearch] = useState(""); const [typeFilter, setType] = useState("All"); const [statusFilter, setSt] = useState("All");
  const types = ["All", ...Array.from(new Set(tasks.map((t) => t.issuetype))).sort()];
  const statuses = ["All", ...Array.from(new Set(tasks.map((t) => t.status))).sort()];
  const filtered = tasks.filter((t) => (!search || t.summary.toLowerCase().includes(search.toLowerCase()) || t.key.toLowerCase().includes(search.toLowerCase())) && (typeFilter === "All" || t.issuetype === typeFilter) && (statusFilter === "All" || t.status === statusFilter));
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input type="text" placeholder="🔍 Search tasks…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: "1 1 180px", minWidth: 0, padding: "9px 12px", background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)", outline: "none" }} />
        <select value={typeFilter} onChange={(e) => setType(e.target.value)} style={{ padding: "9px 12px", background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)", cursor: "pointer", outline: "none" }}>{types.map((t) => <option key={t}>{t}</option>)}</select>
        <select value={statusFilter} onChange={(e) => setSt(e.target.value)} style={{ padding: "9px 12px", background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)", cursor: "pointer", outline: "none" }}>{statuses.map((s) => <option key={s}>{s}</option>)}</select>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>{filtered.length} tasks</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {filtered.map((t) => {
          const due = dueDateLabel(t.duedate, t.status);
          return (
            <Card key={t.key} style={{ padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                <PriBadge priority={t.priority} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 3 }}>
                    <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-muted)", fontWeight: 600 }}>{t.key}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: t.issuetype === "Bug" ? "var(--red)" : "var(--text-muted)", background: t.issuetype === "Bug" ? "var(--red-light)" : "var(--surface2)", borderRadius: 10, padding: "1px 6px" }}>{t.issuetype}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", lineHeight: 1.4 }}>{t.summary}</div>
                  {t.parent && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📦 {t.parent}</div>}
                </div>
              </div>
              <div style={{ display: "flex", gap: "6px 12px", flexWrap: "wrap", alignItems: "center" }}>
                <Badge status={t.status} />
                <span style={{ fontSize: 12, color: due.overdue ? "var(--red)" : "var(--text-muted)" }}>📅 {due.text}</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>👤 {t.assignee || <span style={{ color: "var(--red)" }}>Unassigned</span>}</span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Sprint View ──────────────────────────────────────────────────────────────
interface SprintIssue {
  key: string; summary: string; status: string; issuetype: string;
  assignee: string | null; priority: string; duedate: string | null; points: number | null;
}
interface SprintData {
  sprintId: number; sprintName: string; state: string;
  startDate: string; endDate: string; goal: string;
  issues: SprintIssue[]; fetchedAt: string; error?: string;
}

const SPRINT_STATUS_ORDER = ["In Progress", "To Do", "Testing QA", "Done", "Waiting telco", "Delay", "On Hold"];

function SprintView({ projectKey }: { projectKey: string }) {
  const [data, setData]       = useState<SprintData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<"status" | "assignee" | "type">("status");
  const [search, setSearch]   = useState("");

  useEffect(() => {
    setLoading(true); setError(null); setData(null);
    fetch(`/api/sprint?project=${projectKey}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.error && !d.sprintName) { setError(d.error); } else { setData(d); } setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [projectKey]);

  if (loading) return (
    <Card style={{ padding: 48, textAlign: "center" }}>
      <div style={{ width: 36, height: 36, border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.7s linear infinite" }} />
      <div style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading sprint data…</div>
    </Card>
  );

  if (error) return (
    <Card style={{ padding: 32, textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
      <div style={{ color: "var(--red)", fontWeight: 700, marginBottom: 6 }}>Could not load sprint</div>
      <div style={{ color: "var(--text-muted)", fontSize: 13 }}>{error}</div>
    </Card>
  );

  if (!data || !data.sprintName) return (
    <Card style={{ padding: 32, textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>🏁</div>
      <div style={{ color: "var(--text-muted)", fontSize: 14 }}>No active sprint found for this project.</div>
    </Card>
  );

  const issues = data.issues || [];
  const filtered = issues.filter((i) =>
    !search || i.summary.toLowerCase().includes(search.toLowerCase()) || i.key.toLowerCase().includes(search.toLowerCase())
  );

  // Stats
  const total     = issues.length;
  const done      = issues.filter((i) => isDone(i.status)).length;
  const inProg    = issues.filter((i) => i.status === "In Progress").length;
  const blocked   = issues.filter((i) => i.status === "Waiting telco" || i.status === "On Hold").length;
  const delayed   = issues.filter((i) => i.status === "Delay").length;
  const bugs      = issues.filter((i) => i.issuetype === "Bug").length;
  const velocity  = total > 0 ? Math.round((done / total) * 100) : 0;

  // Sprint dates
  const start   = new Date(data.startDate);
  const end     = new Date(data.endDate);
  const now     = new Date();
  const totalMs = end.getTime() - start.getTime();
  const elapsedMs = Math.min(now.getTime() - start.getTime(), totalMs);
  const timeProgress = totalMs > 0 ? Math.round((elapsedMs / totalMs) * 100) : 0;
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
  const isOvertime = now > end;

  function fmtSprint(d: Date) {
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  // Grouping
  function groupIssues(): Record<string, SprintIssue[]> {
    const groups: Record<string, SprintIssue[]> = {};
    for (const issue of filtered) {
      let key = "";
      if (groupBy === "status")   key = issue.status;
      if (groupBy === "assignee") key = issue.assignee || "Unassigned";
      if (groupBy === "type")     key = issue.issuetype;
      if (!groups[key]) groups[key] = [];
      groups[key].push(issue);
    }
    return groups;
  }

  const groups = groupIssues();
  const groupKeys = Object.keys(groups).sort((a, b) => {
    if (groupBy === "status") {
      return (SPRINT_STATUS_ORDER.indexOf(a) ?? 99) - (SPRINT_STATUS_ORDER.indexOf(b) ?? 99);
    }
    return a.localeCompare(b);
  });

  // Per-assignee stats for velocity table
  const assigneeStats: Record<string, { total: number; done: number; inprog: number; blocked: number }> = {};
  for (const issue of issues) {
    const name = issue.assignee || "Unassigned";
    if (!assigneeStats[name]) assigneeStats[name] = { total: 0, done: 0, inprog: 0, blocked: 0 };
    assigneeStats[name].total++;
    if (isDone(issue.status)) assigneeStats[name].done++;
    else if (issue.status === "In Progress" || issue.status === "Testing QA") assigneeStats[name].inprog++;
    else if (issue.status === "Waiting telco" || issue.status === "On Hold" || issue.status === "Delay") assigneeStats[name].blocked++;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Sprint Header Card */}
      <Card style={{ padding: "16px 18px", borderLeft: "4px solid var(--accent)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--accent)" }}>
                ⚡ Active Sprint
              </span>
              {isOvertime && (
                <span style={{ background: "#fee2e2", color: "#dc2626", borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>
                  Overtime
                </span>
              )}
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>{data.sprintName}</div>
            {data.goal && <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>🎯 {data.goal}</div>}
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
              📅 {fmtSprint(start)} → {fmtSprint(end)}
              <span style={{ marginLeft: 12, fontWeight: 600, color: isOvertime ? "#dc2626" : daysLeft <= 1 ? "#d97706" : "var(--text-muted)" }}>
                {isOvertime ? "Sprint ended" : daysLeft === 0 ? "Ends today" : `${daysLeft}d remaining`}
              </span>
            </div>
          </div>
          {/* Completion ring */}
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: velocity >= 80 ? "var(--green)" : velocity >= 50 ? "var(--accent)" : "var(--red)", lineHeight: 1 }}>
              {velocity}%
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>completion</div>
          </div>
        </div>

        {/* Dual progress bars */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
            <span>Task completion</span><span>{done}/{total}</span>
          </div>
          <div style={{ height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden", border: "1px solid var(--border)", marginBottom: 8 }}>
            <div style={{ height: "100%", width: `${velocity}%`, background: "linear-gradient(90deg,#4f46e5,#10b981)", borderRadius: 4, transition: "width 0.5s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
            <span>Time elapsed</span>
            <span style={{ color: timeProgress > velocity + 20 ? "#dc2626" : "var(--text-muted)" }}>
              {timeProgress}%{timeProgress > velocity + 20 ? " ⚠️ behind schedule" : ""}
            </span>
          </div>
          <div style={{ height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden", border: "1px solid var(--border)" }}>
            <div style={{ height: "100%", width: `${timeProgress}%`, background: timeProgress > velocity + 20 ? "#fca5a5" : "#cbd5e1", borderRadius: 4, transition: "width 0.5s" }} />
          </div>
        </div>
      </Card>

      {/* Stat chips */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {[
          { label: "Total Issues", value: total,   color: "var(--text)",   icon: "📋" },
          { label: "Done",         value: done,    color: "var(--green)",  icon: "✅" },
          { label: "In Progress",  value: inProg,  color: "var(--accent)", icon: "⚙️" },
          { label: "Delayed",      value: delayed, color: "var(--red)",    icon: "⏰" },
          { label: "Blocked",      value: blocked, color: "var(--orange)", icon: "🚧" },
          { label: "Bugs",         value: bugs,    color: bugs > 0 ? "var(--red)" : "var(--green)", icon: "🐛" },
        ].map((s) => (
          <Card key={s.label} style={{ padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.icon} {s.value}</div>
          </Card>
        ))}
      </div>

      {/* Assignee velocity table */}
      <Card style={{ padding: "14px 16px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>👥 Team Velocity</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {Object.entries(assigneeStats)
            .sort((a, b) => b[1].total - a[1].total)
            .map(([name, s]) => {
              const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
              return (
                <div key={name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 120, fontSize: 12, color: "var(--text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>
                    {name === "Unassigned" ? <span style={{ color: "var(--red)" }}>Unassigned</span> : name.split(" ").slice(0, 2).join(" ")}
                  </div>
                  <div style={{ flex: 1, height: 14, background: "#f1f5f9", borderRadius: 7, overflow: "hidden", border: "1px solid var(--border)", position: "relative" }}>
                    <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: pct >= 80 ? "#10b981" : pct >= 50 ? "#4f46e5" : "#f87171", borderRadius: 7 }} />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap", minWidth: 80, textAlign: "right" }}>
                    <strong style={{ color: "var(--text)" }}>{s.done}</strong>/{s.total} done · {pct}%
                  </div>
                </div>
              );
            })}
        </div>
      </Card>

      {/* Issue list */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="text" placeholder="🔍 Search issues…" value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ flex: "1 1 160px", minWidth: 0, padding: "8px 12px", background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)", outline: "none" }}
        />
        <div style={{ display: "flex", gap: 4 }}>
          {(["status","assignee","type"] as const).map((g) => (
            <button key={g} onClick={() => setGroupBy(g)} style={{
              padding: "7px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
              background: groupBy === g ? "var(--accent)" : "var(--surface)",
              color: groupBy === g ? "#fff" : "var(--text-muted)",
              border: groupBy === g ? "none" : "1px solid var(--border)",
            }}>
              {g === "status" ? "By Status" : g === "assignee" ? "By Assignee" : "By Type"}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{filtered.length} issues</span>
      </div>

      {groupKeys.map((group) => {
        const groupIssueList = groups[group];
        const s = sc(group);
        const doneInGroup = groupIssueList.filter((i) => isDone(i.status)).length;
        return (
          <div key={group}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: s.dot, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{group}</span>
              <span style={{ background: "var(--surface2)", color: "var(--text-muted)", borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 600 }}>
                {groupIssueList.length}
                {groupBy !== "status" && doneInGroup > 0 && ` · ${doneInGroup} done`}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 }}>
              {groupIssueList.map((issue) => {
                const due = dueDateLabel(issue.duedate, issue.status);
                const issDone = isDone(issue.status);
                return (
                  <Card key={issue.key} style={{ padding: "10px 14px", opacity: issDone ? 0.75 : 1, borderLeft: `3px solid ${sc(issue.status).dot}` }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <PriBadge priority={issue.priority} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 3 }}>
                          <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-muted)", fontWeight: 600 }}>{issue.key}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 600, borderRadius: 10, padding: "1px 6px",
                            background: issue.issuetype === "Bug" ? "#fee2e2" : issue.issuetype === "Epic" ? "#ede9fe" : "var(--surface2)",
                            color: issue.issuetype === "Bug" ? "#dc2626" : issue.issuetype === "Epic" ? "#4f46e5" : "var(--text-muted)",
                          }}>{issue.issuetype}</span>
                        </div>
                        <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.4, textDecoration: issDone ? "line-through" : "none", opacity: issDone ? 0.6 : 1 }}>
                          {issue.summary}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "6px 12px", flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
                      <Badge status={issue.status} />
                      <span style={{ fontSize: 12, color: due.overdue ? "var(--red)" : "var(--text-muted)" }}>📅 {due.text}</span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        👤 {issue.assignee || <span style={{ color: "var(--red)" }}>Unassigned</span>}
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}

      <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", paddingBottom: 4 }}>
        Last updated {data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString() : "—"}
      </div>
    </div>
  );
}

// ─── To Do View ───────────────────────────────────────────────────────────────
function ToDoView({ tasks }: { tasks: JiraTask[] }) {
  const [filter, setFilter] = useState<"week" | "month">("week");
  const now = new Date();

  // Current week: Mon–Sun
  const dow = now.getDay() === 0 ? 7 : now.getDay();
  const weekStart = new Date(now); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(now.getDate() - dow + 1);
  const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23, 59, 59, 999);

  // Current month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  function within24h(due: string | null) {
    if (!due) return false;
    const d = new Date(due).getTime();
    const diff = d - now.getTime();
    return diff >= 0 && diff <= 86_400_000;
  }
  function hoursLeft(due: string) {
    return Math.ceil((new Date(due).getTime() - now.getTime()) / 3_600_000);
  }

  const overdueTasks = tasks.filter((t) => t.duedate && t.status !== "Done" && new Date(t.duedate) < now);

  const dueTasks = tasks
    .filter((t) => {
      if (!t.duedate || isDone(t.status)) return false;
      const d = new Date(t.duedate);
      return filter === "week" ? d >= weekStart && d <= weekEnd : d >= monthStart && d <= monthEnd;
    })
    .sort((a, b) => new Date(a.duedate!).getTime() - new Date(b.duedate!).getTime());

  const urgentCount = dueTasks.filter((t) => within24h(t.duedate)).length;

  function renderTask(t: JiraTask, alert?: boolean) {
    const due = dueDateLabel(t.duedate, t.status);
    const urgent = within24h(t.duedate);
    const s = sc(t.status);
    return (
      <Card key={t.key} style={{ padding: "12px 14px", borderLeft: `3px solid ${urgent ? "#dc2626" : s.dot}`, background: urgent ? "#fff5f5" : "var(--surface)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
          <PriBadge priority={t.priority} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 3 }}>
              <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-muted)", fontWeight: 600 }}>{t.key}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: t.issuetype === "Bug" ? "var(--red)" : "var(--text-muted)", background: t.issuetype === "Bug" ? "var(--red-light)" : "var(--surface2)", borderRadius: 10, padding: "1px 6px" }}>{t.issuetype}</span>
              {urgent && (
                <span style={{ fontSize: 10, fontWeight: 700, background: "#dc2626", color: "#fff", borderRadius: 20, padding: "1px 8px", animation: "pulse 1.5s ease-in-out infinite" }}>
                  🔴 Due in {hoursLeft(t.duedate!)}h
                </span>
              )}
              {alert && !urgent && (
                <span style={{ fontSize: 10, fontWeight: 700, background: "#fef3c7", color: "#b45309", borderRadius: 20, padding: "1px 8px" }}>
                  ⚠️ Overdue
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", lineHeight: 1.4 }}>{t.summary}</div>
            {t.parent && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📦 {t.parent}</div>}
          </div>
        </div>
        <div style={{ display: "flex", gap: "6px 12px", flexWrap: "wrap", alignItems: "center" }}>
          <Badge status={t.status} />
          <span style={{ fontSize: 12, color: due.overdue ? "var(--red)" : urgent ? "#dc2626" : "var(--text-muted)", fontWeight: urgent ? 700 : 400 }}>📅 {due.text}</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>👤 {t.assignee || <span style={{ color: "var(--red)" }}>Unassigned</span>}</span>
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header + filter */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>📌 Task To-Do List</div>
        {urgentCount > 0 && (
          <span style={{ background: "#dc2626", color: "#fff", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700, animation: "pulse 1.5s ease-in-out infinite" }}>
            🔴 {urgentCount} due within 24h!
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {(["week", "month"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", background: filter === f ? "var(--accent)" : "var(--surface)", color: filter === f ? "#fff" : "var(--text-muted)", border: filter === f ? "none" : "1px solid var(--border)" }}>
              {f === "week" ? "This Week" : "This Month"}
            </button>
          ))}
        </div>
      </div>

      {/* Overdue alert banner */}
      {overdueTasks.length > 0 && (
        <Card style={{ padding: "12px 16px", background: "#fff5f5", border: "1px solid #fca5a5" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>🚨</span>
            <div>
              <div style={{ fontWeight: 700, color: "#dc2626", fontSize: 13 }}>{overdueTasks.length} overdue task{overdueTasks.length > 1 ? "s" : ""} need attention</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {overdueTasks.slice(0, 3).map((t) => t.key).join(", ")}{overdueTasks.length > 3 ? ` +${overdueTasks.length - 3} more` : ""}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Due within 24h section */}
      {dueTasks.filter((t) => within24h(t.duedate)).length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#dc2626", marginBottom: 8 }}>
            🔴 Due within 24 hours
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {dueTasks.filter((t) => within24h(t.duedate)).map((t) => renderTask(t))}
          </div>
        </div>
      )}

      {/* Upcoming tasks */}
      {dueTasks.filter((t) => !within24h(t.duedate)).length > 0 ? (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 8 }}>
            📅 Upcoming — {filter === "week" ? "This Week" : "This Month"} ({dueTasks.filter((t) => !within24h(t.duedate)).length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {dueTasks.filter((t) => !within24h(t.duedate)).map((t) => renderTask(t))}
          </div>
        </div>
      ) : dueTasks.filter((t) => within24h(t.duedate)).length === 0 && (
        <Card style={{ padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
          <div style={{ color: "var(--text-muted)", fontSize: 14 }}>No tasks due {filter === "week" ? "this week" : "this month"}.</div>
        </Card>
      )}
    </div>
  );
}

// ─── Wins View ────────────────────────────────────────────────────────────────
function WinsView({ epics }: { epics: JiraEpic[] }) {
  if (!epics.length) return <Card style={{ padding: 32, textAlign: "center" }}><div style={{ fontSize: 32, marginBottom: 8 }}>📭</div><div style={{ color: "var(--text-muted)", fontSize: 14 }}>No completed epics yet.</div></Card>;
  const byMonth: Record<string, JiraEpic[]> = {};
  for (const e of epics) { const m = e.updated ? new Date(e.updated).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "Unknown"; if (!byMonth[m]) byMonth[m] = []; byMonth[m].push(e); }
  const months = Object.keys(byMonth).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  return (
    <div>
      <Card style={{ padding: "14px 16px", marginBottom: 16, background: "linear-gradient(135deg,#d1fae5,#ecfdf5)", border: "1px solid #6ee7b7" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 32 }}>🏆</span>
          <div><div style={{ fontSize: 18, fontWeight: 800, color: "var(--green)" }}>{epics.length} Epics Completed</div><div style={{ fontSize: 13, color: "var(--text-muted)" }}>Across {Object.keys(byMonth).length} months · Great delivery!</div></div>
        </div>
      </Card>
      {months.map((month) => (
        <div key={month} style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>{month}</span>
            <span style={{ background: "var(--green-light)", color: "var(--green)", borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{byMonth[month].length} done</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {byMonth[month].map((e) => (
              <Card key={e.key} style={{ padding: "12px 14px", borderLeft: "4px solid var(--green)", background: "#f0fdf4" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>✅</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-muted)" }}>{e.key}</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Completed {fmtDate(e.updated)}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", lineHeight: 1.4 }}>{e.summary}</div>
                    {(e.assignee || e.duedate) && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{e.assignee && `👤 ${e.assignee}`}{e.assignee && e.duedate && " · "}{e.duedate && `Due ${fmtDate(e.duedate)}`}</div>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
