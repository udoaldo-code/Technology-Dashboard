"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { JiraDashboardData, JiraEpic, JiraTask } from "@/lib/jira";

// ─── Types ─────────────────────────────────────────────────────────────────
interface Project { key: string; name: string; category: string | null; }

// ─── Status / Priority config ──────────────────────────────────────────────
const STATUS_CFG: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  "Done":          { color: "#10b981", bg: "#10b98120", border: "#10b98150", dot: "#10b981" },
  "In Progress":   { color: "#818cf8", bg: "#6366f120", border: "#6366f150", dot: "#818cf8" },
  "To Do":         { color: "#94a3b8", bg: "#94a3b815", border: "#94a3b840", dot: "#94a3b8" },
  "Delay":         { color: "#f87171", bg: "#ef444420", border: "#ef444450", dot: "#f87171" },
  "On Hold":       { color: "#fb923c", bg: "#f9731620", border: "#f9731650", dot: "#fb923c" },
  "Waiting telco": { color: "#fbbf24", bg: "#f59e0b20", border: "#f59e0b50", dot: "#fbbf24" },
};

const PRIORITY_CFG: Record<string, { color: string; icon: string }> = {
  "Highest": { color: "#dc2626", icon: "🔴" },
  "High":    { color: "#ea580c", icon: "🟠" },
  "Medium":  { color: "#d97706", icon: "🟡" },
  "Low":     { color: "#4f46e5", icon: "🔵" },
  "Lowest":  { color: "#94a3b8", icon: "⚪" },
};

function sc(status: string) {
  return STATUS_CFG[status] || { color: "#64748b", bg: "#f1f5f9", border: "#cbd5e1", dot: "#94a3b8" };
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function isOverdue(due: string | null, status: string) {
  if (!due || status === "Done") return false;
  return new Date(due) < new Date();
}

function dueDateLabel(due: string | null, status: string): { text: string; overdue: boolean } {
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
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
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
  const dueSoon = epics.filter((e) => {
    if (!e.duedate || e.status === "Done") return false;
    const diff = (new Date(e.duedate).getTime() - Date.now()) / 86400000;
    return diff >= 0 && diff <= 7;
  });

  if (critDel.length > 0) risks.push({ level: "critical", text: `${critDel.length} high-priority delayed epic${critDel.length > 1 ? "s" : ""} — SLA breach risk.` });
  if (overdueEps.length > 5) risks.push({ level: "critical", text: `${overdueEps.length} overdue epics — systemic delivery issue, capacity review needed.` });
  else if (overdueEps.length > 0) risks.push({ level: "high", text: `${overdueEps.length} overdue epic${overdueEps.length > 1 ? "s" : ""} — partner relationship at risk.` });
  if (bugs.length > 15) risks.push({ level: "critical", text: `${bugs.length} open bugs — high defect density may block production launch.` });
  else if (bugs.length > 5) risks.push({ level: "high", text: `${bugs.length} open bugs — regression risk before next release.` });
  if (waitingTelco.length > 2) risks.push({ level: "high", text: `${waitingTelco.length} epics blocked on telco — external dependency with no mitigation.` });
  if (unassigned.length > 10) risks.push({ level: "high", text: `${unassigned.length} unassigned tasks — risk of work falling through the cracks.` });
  if (dueSoon.length > 0) risks.push({ level: "medium", text: `${dueSoon.length} epic${dueSoon.length > 1 ? "s" : ""} due within 7 days — ${dueSoon.map((e) => e.key).join(", ")}.` });
  if (onHold.length > 0) risks.push({ level: "medium", text: `${onHold.length} on-hold epic${onHold.length > 1 ? "s" : ""} — may signal commercial/partner issues.` });
  return risks;
}

function generateRecs(epics: JiraEpic[], tasks: JiraTask[]) {
  const recs: string[] = [];
  const delayed = epics.filter((e) => e.status === "Delay");
  const bugs = tasks.filter((t) => t.issuetype === "Bug" && t.status !== "Done");
  const unassigned = tasks.filter((t) => !t.assignee && t.status !== "Done");
  const waitingTelco = epics.filter((e) => e.status === "Waiting telco");
  const onHold = epics.filter((e) => e.status === "On Hold");
  const done = epics.filter((e) => e.status === "Done");

  if (delayed.length > 0) recs.push(`Escalate ${delayed.length} delayed epic${delayed.length > 1 ? "s" : ""} — prioritize: ${delayed.slice(0, 2).map((e) => e.summary.replace(/^VAS Integration - /i, "").replace(/^Vas Integration - /i, "")).join(", ")}${delayed.length > 2 ? ` +${delayed.length - 2} more` : ""}.`);
  if (bugs.length > 0) recs.push(`Close ${bugs.length} open bugs before production deploy — focus on Thailand TPlus Gemezz blocking issues.`);
  if (unassigned.length > 0) recs.push(`Assign ${unassigned.length} unassigned task${unassigned.length > 1 ? "s" : ""} — enforce mandatory assignee rule (IV-960).`);
  if (waitingTelco.length > 0) recs.push(`Follow up with telco partners for ${waitingTelco.length} blocked epic${waitingTelco.length > 1 ? "s" : ""} — send escalation within 24h.`);
  if (onHold.length > 0) recs.push(`Review ${onHold.length} on-hold epic${onHold.length > 1 ? "s" : ""} — determine if blockers can be resolved or deprioritized.`);
  if (done.length > 0) recs.push(`${done.length} epics done — document lessons learned to speed up future integrations.`);
  return recs;
}

// ─── UI Atoms ───────────────────────────────────────────────────────────────
function Badge({ status }: { status: string }) {
  const s = sc(status);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
      {status}
    </span>
  );
}

function PriBadge({ priority }: { priority: string }) {
  const p = PRIORITY_CFG[priority] || { color: "#64748b", icon: "⚪" };
  return <span title={priority} style={{ fontSize: 13 }}>{p.icon}</span>;
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "var(--surface)", borderRadius: "var(--radius)",
      border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)",
      ...style,
    }}>
      {children}
    </div>
  );
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
        <div style={{ fontSize: 24, opacity: 0.7, flexShrink: 0 }}>{icon}</div>
      </div>
    </Card>
  );
}

// ─── Project Switcher ───────────────────────────────────────────────────────
function ProjectSwitcher({
  projects, current, onChange,
}: { projects: Project[]; current: string; onChange: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const currentProject = projects.find((p) => p.key === current);
  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.key.toLowerCase().includes(search.toLowerCase())
  );

  // Group by category
  const groups: Record<string, Project[]> = {};
  for (const p of filtered) {
    const cat = p.category || "Other";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(p);
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--surface)", border: "1px solid var(--border2)",
          borderRadius: "var(--radius-sm)", padding: "8px 12px",
          fontSize: 13, fontWeight: 600, color: "var(--text)", cursor: "pointer",
          boxShadow: "var(--shadow-sm)", minWidth: 0, maxWidth: 260,
        }}
      >
        <span style={{
          background: "var(--accent)", color: "#fff",
          borderRadius: 6, padding: "2px 7px", fontSize: 11, fontWeight: 700, flexShrink: 0,
        }}>
          {current}
        </span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {currentProject?.name || "Select project"}
        </span>
        <span style={{ marginLeft: "auto", color: "var(--text-muted)", flexShrink: 0, fontSize: 10 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 200,
          background: "var(--surface)", border: "1px solid var(--border2)",
          borderRadius: "var(--radius)", boxShadow: "var(--shadow-md)",
          width: 300, maxHeight: 400, display: "flex", flexDirection: "column",
        }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
            <input
              autoFocus
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%", padding: "7px 10px",
                background: "var(--bg)", border: "1px solid var(--border2)",
                borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)", outline: "none",
              }}
            />
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {Object.entries(groups).map(([cat, projs]) => (
              <div key={cat}>
                <div style={{ padding: "8px 12px 4px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
                  {cat}
                </div>
                {projs.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => { onChange(p.key); setOpen(false); setSearch(""); }}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 8,
                      padding: "8px 12px", background: p.key === current ? "var(--accent-light)" : "transparent",
                      border: "none", cursor: "pointer", fontSize: 13, color: "var(--text)", textAlign: "left",
                    }}
                  >
                    <span style={{
                      background: p.key === current ? "var(--accent)" : "var(--surface2)",
                      color: p.key === current ? "#fff" : "var(--text-muted)",
                      borderRadius: 5, padding: "1px 6px", fontSize: 10, fontWeight: 700, flexShrink: 0,
                    }}>
                      {p.key}
                    </span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  </button>
                ))}
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No projects found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData] = useState<JiraDashboardData | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState("IV");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(3600);
  const [activeTab, setActiveTab] = useState<"epics" | "tasks" | "wins">("epics");
  const [epicSearch, setEpicSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (projectKey?: string) => {
    const key = projectKey || activeProject;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jira?project=${key}`, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json: JiraDashboardData = await res.json();
      setData(json);
      setLastRefresh(new Date());
      setCountdown(3600);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [activeProject]);

  // Fetch projects list once
  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((list) => { if (Array.isArray(list)) setProjects(list); })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Countdown + hourly refresh
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { fetchData(); return 3600; }
        return c - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchData]);

  const handleProjectChange = (key: string) => {
    setActiveProject(key);
    setData(null);
    setEpicSearch("");
    setStatusFilter("All");
    setActiveTab("epics");
    fetchData(key);
  };

  if (loading && !data) return <LoadingScreen />;
  if (error && !data) return <ErrorScreen error={error} onRetry={() => fetchData()} />;
  if (!data) return null;

  const { epics, tasks } = data;
  const doneEpics = epics.filter((e) => e.status === "Done");
  const inProg = epics.filter((e) => e.status === "In Progress");
  const delayed = epics.filter((e) => e.status === "Delay");
  const blocked = epics.filter((e) => e.status === "On Hold" || e.status === "Waiting telco");
  const openBugs = tasks.filter((t) => t.issuetype === "Bug" && t.status !== "Done").length;
  const pct = epics.length > 0 ? Math.round((doneEpics.length / epics.length) * 100) : 0;

  const allStatuses = ["All", ...Array.from(new Set(epics.filter((e) => e.status !== "Done").map((e) => e.status))).sort()];
  const filteredEpics = epics.filter((e) => {
    if (e.status === "Done") return false;
    const matchSearch = !epicSearch || e.summary.toLowerCase().includes(epicSearch.toLowerCase()) || e.key.toLowerCase().includes(epicSearch.toLowerCase());
    const matchStatus = statusFilter === "All" || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const risks = generateRisks(epics, tasks);
  const recs = generateRecs(epics, tasks);

  const currentProject = projects.find((p) => p.key === activeProject);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Header */}
      <header style={{
        background: "var(--surface)", borderBottom: "1px solid var(--border)",
        padding: "12px 16px", position: "sticky", top: 0, zIndex: 100,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          {/* Top row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, flexShrink: 0,
              }}>📋</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {currentProject?.name || activeProject} Dashboard
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Executive Summary · 2026</div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {/* Project switcher */}
              {projects.length > 0 && (
                <ProjectSwitcher projects={projects} current={activeProject} onChange={handleProjectChange} />
              )}
              {/* Refresh info */}
              <div style={{ textAlign: "right", fontSize: 11, color: "var(--text-muted)", display: "none" }} className="desktop-only">
                <div>Next refresh <strong style={{ color: "var(--text)" }}>{formatCountdown(countdown)}</strong></div>
                {lastRefresh && <div>{lastRefresh.toLocaleTimeString()}</div>}
              </div>
              <button
                onClick={() => fetchData()}
                disabled={loading}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: loading ? "var(--surface2)" : "var(--accent)",
                  color: loading ? "var(--text-muted)" : "#fff",
                  border: "none", borderRadius: "var(--radius-sm)",
                  padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: loading ? "default" : "pointer",
                }}
              >
                <span className={loading ? "spin" : ""} style={{ fontSize: 13 }}>↻</span>
                {loading ? "Loading…" : "Refresh"}
              </button>
            </div>
          </div>

          {/* Refresh countdown bar */}
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${((3600 - countdown) / 3600) * 100}%`,
                background: "var(--accent)", borderRadius: 2, transition: "width 1s linear",
              }} />
            </div>
            <span style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
              {formatCountdown(countdown)} to refresh
            </span>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "16px" }}>
        {/* Stats Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
          <StatCard label="Total Epics" value={epics.length} sub={`${pct}% done`} icon="📦" />
          <StatCard label="Completed" value={doneEpics.length} sub="Wins in 2026" color="var(--green)" icon="✅" />
          <StatCard label="In Progress" value={inProg.length} sub="Active now" color="var(--accent)" icon="⚙️" />
          <StatCard label="Delayed" value={delayed.length} sub="Need action" color="var(--red)" icon="⏰" />
          <StatCard label="Blocked" value={blocked.length} sub="On hold / Telco" color="var(--orange)" icon="🚧" />
          <StatCard label="Open Bugs" value={openBugs} sub="Across tasks" color={openBugs > 10 ? "var(--red)" : "var(--yellow)"} icon="🐛" />
        </div>

        {/* Progress Bar */}
        <Card style={{ padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Overall Progress</span>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {doneEpics.length} / {epics.length} epics
            </span>
          </div>
          <div style={{ height: 10, background: "var(--bg)", borderRadius: 5, overflow: "hidden", border: "1px solid var(--border)" }}>
            <div style={{
              height: "100%", width: `${pct}%`,
              background: "linear-gradient(90deg, #4f46e5, #059669)",
              borderRadius: 5, transition: "width 0.6s ease",
            }} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 10 }}>
            {Object.entries(STATUS_CFG).map(([status, s]) => {
              const count = epics.filter((e) => e.status === status).length;
              if (!count) return null;
              return (
                <span key={status} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-muted)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: s.dot, display: "inline-block" }} />
                  {status}: <strong style={{ color: s.color }}>{count}</strong>
                </span>
              );
            })}
          </div>
        </Card>

        {/* Risk + Recommendations */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginBottom: 16 }}>
          {/* Risks */}
          <Card style={{ padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Risk Highlights</span>
              <span style={{ background: risks.filter((r) => r.level === "critical").length > 0 ? "var(--red-light)" : "var(--surface2)", color: risks.filter((r) => r.level === "critical").length > 0 ? "var(--red)" : "var(--text-muted)", borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 600 }}>
                {risks.length}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {risks.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: 12 }}>No critical risks detected 🎉</div>
              ) : risks.map((r, i) => (
                <div key={i} style={{
                  display: "flex", gap: 10, alignItems: "flex-start",
                  background: r.level === "critical" ? "#ef444415" : r.level === "high" ? "#f9731615" : "#f59e0b15",
                  border: `1px solid ${r.level === "critical" ? "#ef444440" : r.level === "high" ? "#f9731640" : "#f59e0b40"}`,
                  borderRadius: "var(--radius-sm)", padding: "10px 12px",
                }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>
                    {r.level === "critical" ? "🔴" : r.level === "high" ? "🟠" : "🟡"}
                  </span>
                  <span style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>{r.text}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Recommendations */}
          <Card style={{ padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 16 }}>💡</span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Recommendations</span>
              <span style={{ background: "var(--accent-light)", color: "var(--accent)", borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 600 }}>
                {recs.length}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {recs.map((r, i) => (
                <div key={i} style={{
                  display: "flex", gap: 10, alignItems: "flex-start",
                  background: "#6366f115", border: "1px solid #6366f140",
                  borderRadius: "var(--radius-sm)", padding: "10px 12px",
                }}>
                  <span style={{
                    background: "var(--accent)", color: "#fff",
                    borderRadius: "50%", width: 20, height: 20, display: "flex",
                    alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                  }}>{i + 1}</span>
                  <span style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>{r}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 12, overflowX: "auto", padding: "2px 0" }}>
          {([
            ["epics", `Active Epics`, filteredEpics.length],
            ["tasks", `Tasks`, tasks.length],
            ["wins", `Wins 🏆`, doneEpics.length],
          ] as const).map(([tab, label, count]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: activeTab === tab ? "var(--accent)" : "var(--surface)",
                color: activeTab === tab ? "#fff" : "var(--text-muted)",
                border: activeTab === tab ? "none" : "1px solid var(--border)",
                borderRadius: 20, padding: "7px 16px", fontSize: 13, fontWeight: 600,
                cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
              }}
            >
              {label}
              <span style={{
                background: activeTab === tab ? "rgba(255,255,255,0.25)" : "var(--surface2)",
                color: activeTab === tab ? "#fff" : "var(--text-muted)",
                borderRadius: 20, padding: "1px 7px", fontSize: 11,
              }}>{count}</span>
            </button>
          ))}
        </div>

        {/* Epics filter row */}
        {activeTab === "epics" && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="🔍 Search epic..."
              value={epicSearch}
              onChange={(e) => setEpicSearch(e.target.value)}
              style={{
                flex: "1 1 200px", minWidth: 0, padding: "9px 12px",
                background: "var(--surface)", border: "1px solid var(--border2)",
                borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)", outline: "none",
                boxShadow: "var(--shadow-sm)",
              }}
            />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {allStatuses.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  style={{
                    padding: "7px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                    cursor: "pointer", whiteSpace: "nowrap",
                    background: statusFilter === s ? (s === "All" ? "var(--text)" : sc(s).bg) : "var(--surface)",
                    color: statusFilter === s ? (s === "All" ? "#fff" : sc(s).color) : "var(--text-muted)",
                    border: statusFilter === s ? `1px solid ${s === "All" ? "var(--text)" : sc(s).border}` : "1px solid var(--border)",
                  }}
                >
                  {s === "All" ? "All" : s}
                  {s !== "All" && (
                    <span style={{ marginLeft: 5, opacity: 0.7 }}>
                      {epics.filter((e) => e.status === s).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tab Content */}
        <div className="fade-in" key={activeTab + activeProject}>
          {activeTab === "epics" && <EpicsView epics={filteredEpics} tasks={tasks} />}
          {activeTab === "tasks" && <TasksView tasks={tasks} />}
          {activeTab === "wins" && <WinsView epics={doneEpics} />}
        </div>
      </main>

      <style>{`
        @media (min-width: 640px) {
          .desktop-only { display: block !important; }
        }
        @media (min-width: 640px) {
          main > div:first-child { grid-template-columns: repeat(6, 1fr) !important; }
          main > div:nth-child(4) { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Epics View ─────────────────────────────────────────────────────────────
function EpicsView({ epics, tasks }: { epics: JiraEpic[]; tasks: JiraTask[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (epics.length === 0) {
    return (
      <Card style={{ padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
        <div style={{ color: "var(--text-muted)", fontSize: 14 }}>No epics match your filters.</div>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {epics.map((epic) => {
        const epicTasks = tasks.filter((t) => t.parentKey === epic.key || t.parent === epic.summary);
        const doneTasks = epicTasks.filter((t) => t.status === "Done").length;
        const taskPct = epicTasks.length > 0 ? Math.round((doneTasks / epicTasks.length) * 100) : 0;
        const isExp = expanded === epic.key;
        const due = dueDateLabel(epic.duedate, epic.status);
        const s = sc(epic.status);

        return (
          <Card key={epic.key} style={{ overflow: "hidden", borderLeft: `4px solid ${s.dot}` }}>
            <div
              onClick={() => setExpanded(isExp ? null : epic.key)}
              style={{ padding: "14px 14px", cursor: "pointer" }}
            >
              {/* Epic header */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                <PriBadge priority={epic.priority} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-muted)", fontWeight: 600 }}>{epic.key}</span>
                    {due.overdue && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--red)", background: "#fee2e2", borderRadius: 10, padding: "1px 7px" }}>
                        OVERDUE
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", lineHeight: 1.4 }}>{epic.summary}</div>
                </div>
                <span style={{ color: "var(--text-light)", fontSize: 12, flexShrink: 0 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {/* Epic meta row */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", alignItems: "center" }}>
                <Badge status={epic.status} />
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  color: due.overdue ? "var(--red)" : "var(--text-muted)",
                }}>
                  📅 {due.text}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  👤 {epic.assignee || <span style={{ color: "var(--red)" }}>Unassigned</span>}
                </span>
                {epicTasks.length > 0 && (
                  <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
                    {doneTasks}/{epicTasks.length} tasks
                  </span>
                )}
              </div>

              {/* Task progress bar */}
              {epicTasks.length > 0 && (
                <div style={{ marginTop: 8, height: 4, background: "var(--bg)", borderRadius: 2, overflow: "hidden", border: "1px solid var(--border)" }}>
                  <div style={{ height: "100%", width: `${taskPct}%`, background: "var(--accent)", borderRadius: 2 }} />
                </div>
              )}
            </div>

            {/* Expanded tasks */}
            {isExp && (
              <div style={{ borderTop: "1px solid var(--border)", background: "var(--bg)", padding: "10px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 8 }}>
                  Tasks ({epicTasks.length})
                </div>
                {epicTasks.length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 0" }}>No tasks linked.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {epicTasks.map((t) => {
                      const td = dueDateLabel(t.duedate, t.status);
                      return (
                        <div key={t.key} style={{
                          background: "var(--surface)", border: "1px solid var(--border)",
                          borderRadius: "var(--radius-sm)", padding: "10px 12px",
                        }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                            <PriBadge priority={t.priority} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-muted)" }}>{t.key}</span>
                                <span style={{
                                  fontSize: 10, fontWeight: 600,
                                  color: t.issuetype === "Bug" ? "var(--red)" : "var(--text-muted)",
                                  background: t.issuetype === "Bug" ? "#fee2e2" : "var(--surface2)",
                                  borderRadius: 10, padding: "1px 6px",
                                }}>
                                  {t.issuetype}
                                </span>
                              </div>
                              <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.4 }}>{t.summary}</div>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "6px 12px", flexWrap: "wrap", alignItems: "center" }}>
                            <Badge status={t.status} />
                            <span style={{ fontSize: 12, color: td.overdue ? "var(--red)" : "var(--text-muted)" }}>
                              📅 {td.text}
                            </span>
                            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                              👤 {t.assignee || <span style={{ color: "var(--red)" }}>Unassigned</span>}
                            </span>
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

// ─── Tasks View ─────────────────────────────────────────────────────────────
function TasksView({ tasks }: { tasks: JiraTask[] }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const types = ["All", ...Array.from(new Set(tasks.map((t) => t.issuetype))).sort()];
  const statuses = ["All", ...Array.from(new Set(tasks.map((t) => t.status))).sort()];

  const filtered = tasks.filter((t) => {
    const ms = !search || t.summary.toLowerCase().includes(search.toLowerCase()) || t.key.toLowerCase().includes(search.toLowerCase());
    const mt = typeFilter === "All" || t.issuetype === typeFilter;
    const mst = statusFilter === "All" || t.status === statusFilter;
    return ms && mt && mst;
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="🔍 Search tasks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: "1 1 180px", minWidth: 0, padding: "9px 12px",
            background: "var(--surface)", border: "1px solid var(--border2)",
            borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)", outline: "none",
            boxShadow: "var(--shadow-sm)",
          }}
        />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ padding: "9px 12px", background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)", cursor: "pointer", outline: "none" }}>
          {types.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: "9px 12px", background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)", cursor: "pointer", outline: "none" }}>
          {statuses.map((s) => <option key={s}>{s}</option>)}
        </select>
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
                    <span style={{
                      fontSize: 10, fontWeight: 600,
                      color: t.issuetype === "Bug" ? "var(--red)" : "var(--text-muted)",
                      background: t.issuetype === "Bug" ? "#fee2e2" : "var(--surface2)",
                      borderRadius: 10, padding: "1px 6px",
                    }}>
                      {t.issuetype}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", lineHeight: 1.4 }}>{t.summary}</div>
                  {t.parent && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      📦 {t.parent}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: "6px 12px", flexWrap: "wrap", alignItems: "center" }}>
                <Badge status={t.status} />
                <span style={{ fontSize: 12, color: due.overdue ? "var(--red)" : "var(--text-muted)" }}>
                  📅 {due.text}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  👤 {t.assignee || <span style={{ color: "var(--red)" }}>Unassigned</span>}
                </span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Wins View ──────────────────────────────────────────────────────────────
function WinsView({ epics }: { epics: JiraEpic[] }) {
  if (epics.length === 0) {
    return (
      <Card style={{ padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
        <div style={{ color: "var(--text-muted)", fontSize: 14 }}>No completed epics yet.</div>
      </Card>
    );
  }

  const byMonth: Record<string, JiraEpic[]> = {};
  for (const e of epics) {
    const month = e.updated
      ? new Date(e.updated).toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : "Unknown";
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(e);
  }
  const months = Object.keys(byMonth).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return (
    <div>
      <Card style={{ padding: "14px 16px", marginBottom: 16, background: "linear-gradient(135deg, #10b98115, #10b98108)", border: "1px solid #10b98140" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 32 }}>🏆</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--green)" }}>{epics.length} Epics Completed</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Across {Object.keys(byMonth).length} months · Great delivery!
            </div>
          </div>
        </div>
      </Card>

      {months.map((month) => (
        <div key={month} style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>{month}</span>
            <span style={{ background: "var(--green-light)", color: "var(--green)", borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>
              {byMonth[month].length} done
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {byMonth[month].map((e) => (
              <Card key={e.key} style={{ padding: "12px 14px", borderLeft: "4px solid var(--green)", background: "#10b98108" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>✅</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-muted)" }}>{e.key}</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Completed {fmtDate(e.updated)}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", lineHeight: 1.4 }}>{e.summary}</div>
                    {(e.assignee || e.duedate) && (
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                        {e.assignee && `👤 ${e.assignee}`}
                        {e.assignee && e.duedate && " · "}
                        {e.duedate && `Due ${fmtDate(e.duedate)}`}
                      </div>
                    )}
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

// ─── Loading / Error ─────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--bg)", gap: 16 }}>
      <div style={{ width: 44, height: 44, border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%" }} className="spin" />
      <div style={{ color: "var(--text-muted)", fontSize: 14 }}>Fetching live Jira data…</div>
    </div>
  );
}

function ErrorScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--bg)", gap: 16, padding: 24 }}>
      <div style={{ fontSize: 40 }}>⚠️</div>
      <div style={{ color: "var(--red)", fontSize: 16, fontWeight: 700 }}>Failed to load data</div>
      <div style={{
        color: "var(--text-muted)", fontSize: 13, maxWidth: 400, textAlign: "center", lineHeight: 1.6,
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16,
      }}>
        {error}
      </div>
      <button onClick={onRetry} style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", padding: "10px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
        Try Again
      </button>
    </div>
  );
}
