"use client";

import { useState, useEffect, useRef } from "react";
import type { JiraEpic, JiraTask } from "@/lib/jira";

interface Project { key: string; name: string; category: string | null; }
interface GanttProject { key: string; name: string; epics: JiraEpic[]; tasks: JiraTask[]; }
interface GanttData { projects: GanttProject[]; fetchedAt: string; }

interface GanttChartProps {
  defaultProject: string;
  allProjects: Project[];
}

// ── Colors for each project track ──────────────────────────────────────────
const TRACK_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#3b82f6",
];

const STATUS_COLOR: Record<string, string> = {
  "Done":          "#10b981",
  "In Progress":   "#00adef",
  "To Do":         "#64748b",
  "Delay":         "#ef4444",
  "On Hold":       "#f97316",
  "Waiting telco": "#d97706",
};

const TASK_STATUS_COLOR: Record<string, string> = {
  "Done":        "#10b981",
  "In Progress": "#00adef",
  "To Do":       "#64748b",
  "In Review":   "#8b5cf6",
  "Blocked":     "#ef4444",
  "On Hold":     "#f97316",
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const YEAR = 2026;
const YEAR_START = new Date(`${YEAR}-01-01`).getTime();
const YEAR_END   = new Date(`${YEAR}-12-31`).getTime();
const YEAR_SPAN  = YEAR_END - YEAR_START;

function toPct(date: Date | null, fallback: Date): number {
  const t = (date ?? fallback).getTime();
  return ((Math.max(YEAR_START, Math.min(YEAR_END, t)) - YEAR_START) / YEAR_SPAN) * 100;
}
function todayPct(): number {
  const t = Date.now();
  if (t < YEAR_START || t > YEAR_END) return -1;
  return ((t - YEAR_START) / YEAR_SPAN) * 100;
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

// ── Project Picker (add/remove from Gantt) ──────────────────────────────────
function AddProjectPicker({
  allProjects, selectedKeys, onAdd,
}: { allProjects: Project[]; selectedKeys: string[]; onAdd: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const available = allProjects.filter(
    (p) => !selectedKeys.includes(p.key) &&
           (p.name.toLowerCase().includes(search.toLowerCase()) || p.key.toLowerCase().includes(search.toLowerCase()))
  );
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--surface2)", border: "1px solid var(--border2)", borderRadius: "var(--radius-sm)", padding: "7px 12px", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", cursor: "pointer" }}
      >
        + Add Project
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 200, background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-md)", width: 260, maxHeight: 320, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
            <input autoFocus type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", padding: "6px 10px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--text)", outline: "none" }} />
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {available.length === 0 ? (
              <div style={{ padding: 12, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>No more projects</div>
            ) : available.map((p) => (
              <button key={p.key} onClick={() => { onAdd(p.key); setOpen(false); setSearch(""); }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "transparent", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text)", textAlign: "left" }}>
                <span style={{ background: "var(--surface2)", color: "var(--text-muted)", borderRadius: 4, padding: "1px 5px", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{p.key}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Gantt Component ────────────────────────────────────────────────────
export default function GanttChart({ defaultProject, allProjects }: GanttChartProps) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([defaultProject]);
  const [data, setData]       = useState<GanttData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState("All");

  const fetchGantt = async (keys: string[]) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/gantt?projects=${keys.join(",")}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: GanttData = await res.json();
      setData(json);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchGantt(selectedKeys); }, []);

  // When defaultProject changes from parent switcher
  useEffect(() => {
    if (!selectedKeys.includes(defaultProject)) {
      const next = [defaultProject];
      setSelectedKeys(next);
      fetchGantt(next);
    }
  }, [defaultProject]);

  const addProject = (key: string) => {
    const next = [...selectedKeys, key];
    setSelectedKeys(next);
    fetchGantt(next);
  };
  const removeProject = (key: string) => {
    const next = selectedKeys.filter((k) => k !== key);
    setSelectedKeys(next);
    if (data) setData({ ...data, projects: data.projects.filter((p) => p.key !== key) });
  };
  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };
  const toggleEpic = (key: string) => {
    setExpandedEpics((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };

  const todayP = todayPct();
  const projects = data?.projects || [];

  // All epics flat (for summary)
  const allEpics = projects.flatMap((p) => p.epics);
  const INACTIVE_STATUSES = new Set(["Done", "Dropped"]);
  const filteredProjects = projects.map((p) => ({
    ...p,
    epics: statusFilter === "All"    ? p.epics
         : statusFilter === "Active" ? p.epics.filter((e) => !INACTIVE_STATUSES.has(e.status))
         :                             p.epics.filter((e) => e.status === statusFilter),
  }));

  const activeCount = allEpics.filter((e) => !INACTIVE_STATUSES.has(e.status)).length;
  const allStatuses = ["All", "Active", ...Array.from(new Set(allEpics.map((e) => e.status))).sort()];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Header controls */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {/* Active project chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {selectedKeys.map((key, i) => {
            const proj = allProjects.find((p) => p.key === key);
            return (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--surface)", border: `1px solid ${TRACK_COLORS[i % TRACK_COLORS.length]}40`, borderLeft: `3px solid ${TRACK_COLORS[i % TRACK_COLORS.length]}`, borderRadius: "var(--radius-sm)", padding: "5px 10px", fontSize: 12, fontWeight: 600 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: TRACK_COLORS[i % TRACK_COLORS.length], flexShrink: 0 }} />
                <span style={{ color: "var(--text)" }}>{proj?.name || key}</span>
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>({key})</span>
                {selectedKeys.length > 1 && (
                  <button onClick={() => removeProject(key)} style={{ marginLeft: 4, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                )}
              </div>
            );
          })}
        </div>

        {selectedKeys.length < 30 && (
          <AddProjectPicker allProjects={allProjects} selectedKeys={selectedKeys} onAdd={addProject} />
        )}

        <button onClick={() => fetchGantt(selectedKeys)} disabled={loading}
          style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "7px 12px", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", cursor: loading ? "default" : "pointer" }}>
          <span style={{ display: "inline-block", animation: loading ? "spin 0.7s linear infinite" : "none" }}>↻</span>
          Refresh
        </button>
      </div>

      {/* Summary stats */}
      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
          {[
            { label: "Total Epics", value: allEpics.length, color: "var(--text)", icon: "📦" },
            { label: "Completed", value: allEpics.filter((e) => e.status === "Done").length, color: "var(--green)", icon: "✅" },
            { label: "Overdue", value: allEpics.filter((e) => e.duedate && e.status !== "Done" && new Date(e.duedate) < new Date()).length, color: "var(--red)", icon: "⏰" },
          ].map((s) => (
            <div key={s.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px 14px", boxShadow: "var(--shadow-sm)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.icon} {s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Status filter pills */}
      {!loading && allStatuses.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {allStatuses.map((s) => {
            const isActive = statusFilter === s;
            const activeBg = s === "Active" ? "#0891b2" : (STATUS_COLOR[s] || "var(--accent)");
            const count = s === "All" ? null : s === "Active" ? activeCount : allEpics.filter((e) => e.status === s).length;
            return (
              <button key={s} onClick={() => setStatusFilter(s)} style={{
                padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                background: isActive ? activeBg : "var(--surface)",
                color: isActive ? "#fff" : "var(--text-muted)",
                border: isActive ? "none" : "1px solid var(--border)",
              }}>
                {s === "Active" ? "⚡ Active" : s}
                {count !== null && <span style={{ marginLeft: 5, opacity: 0.75 }}>{count}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Status legend */}
      {!loading && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
          {Object.entries(STATUS_COLOR).map(([s, c]) => (
            <span key={s} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-muted)" }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: c }} />
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "var(--radius)", padding: 14, color: "#dc2626", fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 48, textAlign: "center", color: "var(--text-muted)" }}>
          <div style={{ width: 36, height: 36, border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.7s linear infinite" }} />
          Loading Gantt data for {selectedKeys.join(", ")}…
        </div>
      )}

      {/* ── Gantt Grid ── */}
      {!loading && data && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
          {/* Month header */}
          <div style={{ display: "flex", borderBottom: "2px solid var(--border)", background: "var(--surface2)", position: "sticky", top: 0, zIndex: 10 }}>
            <div style={{ width: 240, flexShrink: 0, padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", borderRight: "1px solid var(--border)" }}>
              Project / Epic
            </div>
            <div style={{ flex: 1, display: "flex" }}>
              {MONTHS.map((m, i) => (
                <div key={m} style={{ flex: 1, padding: "10px 0", textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", borderRight: i < 11 ? "1px solid var(--border)" : "none" }}>
                  {m}
                </div>
              ))}
            </div>
          </div>

          {/* Rows */}
          <div style={{ maxHeight: 560, overflowY: "auto", overflowX: "auto" }}>
            {filteredProjects.map((proj, pi) => {
              const trackColor = TRACK_COLORS[pi % TRACK_COLORS.length];
              const isCollapsed = collapsed.has(proj.key);
              const sorted = [...proj.epics].sort((a, b) =>
                (a.created ? new Date(a.created).getTime() : 0) - (b.created ? new Date(b.created).getTime() : 0)
              );
              const doneCount = proj.epics.filter((e) => e.status === "Done").length;

              return (
                <div key={proj.key}>
                  {/* Project group header */}
                  <div
                    onClick={() => toggleCollapse(proj.key)}
                    style={{ display: "flex", alignItems: "center", background: `${trackColor}12`, borderBottom: "1px solid var(--border)", borderLeft: `4px solid ${trackColor}`, cursor: "pointer", userSelect: "none" }}
                  >
                    <div style={{ width: 236, flexShrink: 0, padding: "10px 12px", borderRight: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, color: trackColor }}>{isCollapsed ? "▶" : "▼"}</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)" }}>{proj.name}</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
                          <span style={{ background: `${trackColor}30`, color: trackColor, borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>{proj.key}</span>
                          <span style={{ marginLeft: 6 }}>{proj.epics.length} epics · {doneCount} done</span>
                        </div>
                      </div>
                    </div>
                    {/* Project summary bar in timeline */}
                    <div style={{ flex: 1, position: "relative", height: 40 }}>
                      {MONTHS.map((_, mi) => (
                        <div key={mi} style={{ position: "absolute", top: 0, bottom: 0, left: `${(mi / 12) * 100}%`, borderLeft: mi > 0 ? "1px dashed var(--border)" : "none", pointerEvents: "none" }} />
                      ))}
                      {todayP >= 0 && <div style={{ position: "absolute", top: 0, bottom: 0, left: `${todayP}%`, width: 2, background: "#f59e0b80", zIndex: 5 }} />}
                      {/* Span bar from first to last epic */}
                      {proj.epics.length > 0 && (() => {
                        const starts = proj.epics.map((e) => e.startDate ? new Date(e.startDate).getTime() : YEAR_START);
                        const ends   = proj.epics.map((e) => e.duedate   ? new Date(e.duedate).getTime()   : YEAR_END);
                        const s = toPct(new Date(Math.min(...starts)), new Date(`${YEAR}-01-01`));
                        const e = toPct(new Date(Math.max(...ends)),   new Date(`${YEAR}-12-31`));
                        return (
                          <div style={{ position: "absolute", left: `${s}%`, width: `${Math.max(e - s, 0.5)}%`, top: "50%", transform: "translateY(-50%)", height: 10, borderRadius: 5, background: `${trackColor}40`, border: `1.5px solid ${trackColor}` }} />
                        );
                      })()}
                    </div>
                  </div>

                  {/* Epic rows */}
                  {!isCollapsed && sorted.map((epic, idx) => {
                    const start  = epic.startDate ? new Date(epic.startDate) : new Date(`${YEAR}-01-01`);
                    const end    = epic.duedate   ? new Date(epic.duedate)   : new Date(`${YEAR}-12-31`);
                    const sp     = toPct(start, new Date(`${YEAR}-01-01`));
                    const ep     = toPct(end,   new Date(`${YEAR}-12-31`));
                    const width  = Math.max(ep - sp, 0.5);
                    const color  = STATUS_COLOR[epic.status] || "#64748b";
                    const overdue = epic.duedate && new Date(epic.duedate) < new Date() && epic.status !== "Done";
                    const epicTasks = proj.tasks.filter((t) => t.parentKey === epic.key && t.status !== "Done" && t.status !== "Dropped");
                    const isEpicExpanded = expandedEpics.has(epic.key);
                    const hasNewDates = !!(epic.newStartDate || epic.newDueDate);
                    const newStart = epic.newStartDate ? new Date(epic.newStartDate) : start;
                    const newEnd   = epic.newDueDate   ? new Date(epic.newDueDate)   : end;
                    const nsp = toPct(newStart, new Date(`${YEAR}-01-01`));
                    const nep = toPct(newEnd,   new Date(`${YEAR}-12-31`));
                    const nWidth = Math.max(nep - nsp, 0.5);
                    const rowH = hasNewDates ? 54 : 36;

                    return (
                      <div key={epic.key}>
                        {/* ── Epic row ── */}
                        <div style={{ display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--border)", minHeight: rowH, background: idx % 2 === 0 ? "transparent" : `${trackColor}06` }}>

                          {/* Left label — single compact line, click whole area to expand */}
                          <div
                            onClick={() => epicTasks.length > 0 && toggleEpic(epic.key)}
                            style={{ width: 240, flexShrink: 0, padding: "0 10px 0 14px", borderRight: "1px solid var(--border)", overflow: "hidden", display: "flex", alignItems: "center", gap: 5, cursor: epicTasks.length > 0 ? "pointer" : "default", userSelect: "none" }}
                          >
                            {/* Collapse toggle */}
                            <span style={{ fontSize: 10, color: epicTasks.length > 0 ? trackColor : "var(--border)", flexShrink: 0, width: 10, lineHeight: 1 }}>
                              {epicTasks.length > 0 ? (isEpicExpanded ? "▾" : "▸") : "·"}
                            </span>
                            {/* Status dot */}
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0, boxShadow: `0 0 0 2px ${color}30` }} />
                            {/* Key */}
                            <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-muted)", flexShrink: 0, letterSpacing: "-0.2px" }}>{epic.key}</span>
                            {/* Title */}
                            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{epic.summary}</span>
                            {/* Badges */}
                            <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                              {overdue && <span style={{ fontSize: 8, color: "#fff", background: "var(--red)", borderRadius: 3, padding: "1px 4px", fontWeight: 700 }}>OVR</span>}
                              {hasNewDates && <span style={{ fontSize: 8, color: "#fff", background: "#f97316", borderRadius: 3, padding: "1px 4px", fontWeight: 700 }}>NEW</span>}
                              {epicTasks.length > 0 && <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{epicTasks.length}</span>}
                            </div>
                          </div>

                          {/* Timeline */}
                          <div style={{ flex: 1, position: "relative" }}>
                            {MONTHS.map((_, mi) => (
                              <div key={mi} style={{ position: "absolute", top: 0, bottom: 0, left: `${(mi / 12) * 100}%`, borderLeft: mi > 0 ? "1px solid var(--border)" : "none", opacity: 0.5, pointerEvents: "none" }} />
                            ))}
                            {todayP >= 0 && <div style={{ position: "absolute", top: 0, bottom: 0, left: `${todayP}%`, width: 2, background: "#f59e0b", zIndex: 10 }} />}

                            {/* Bar — color block only */}
                            <div
                              title={`${epic.key} · ${epic.status}\n${epic.summary}\nStart: ${fmtDate(epic.startDate)}  Due: ${fmtDate(epic.duedate)}${hasNewDates ? `\nNew Start: ${fmtDate(epic.newStartDate)}  New Due: ${fmtDate(epic.newDueDate)}` : ""}\nAssignee: ${epic.assignee || "—"}`}
                              style={{ position: "absolute", left: `${sp}%`, width: `${width}%`, top: hasNewDates ? "28%" : "50%", transform: "translateY(-50%)", height: 24, borderRadius: 5, background: color, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25), 0 1px 3px ${color}50`, cursor: "default", zIndex: 2 }}
                            />
                            {/* Label — inside bar if wide enough, outside to right if narrow */}
                            <div style={{ position: "absolute", left: width >= 5 ? `${sp}%` : `calc(${sp + width}% + 5px)`, top: hasNewDates ? "28%" : "50%", transform: "translateY(-50%)", height: 24, display: "flex", alignItems: "center", gap: 6, paddingLeft: width >= 5 ? 8 : 0, paddingRight: width >= 5 ? 6 : 0, maxWidth: width >= 5 ? `${width}%` : "35%", overflow: "hidden", pointerEvents: "none", zIndex: 3 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, color: width >= 5 ? "#fff" : "var(--text)" }}>{epic.summary}</span>
                              {width >= 14 && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", whiteSpace: "nowrap", flexShrink: 0 }}>{fmtDate(epic.startDate)} → {fmtDate(epic.duedate)}</span>}
                            </div>

                            {/* New-dates bar */}
                            {hasNewDates && (
                              <div
                                title={`Revised dates\nNew Start: ${fmtDate(epic.newStartDate)}\nNew Due: ${fmtDate(epic.newDueDate)}`}
                                style={{ position: "absolute", left: `${nsp}%`, width: `${nWidth}%`, top: "74%", transform: "translateY(-50%)", height: 14, borderRadius: 3, background: "#f9731622", border: "1.5px dashed #f97316", display: "flex", alignItems: "center", paddingLeft: 5, overflow: "hidden", cursor: "default", gap: 4 }}
                              >
                                <span style={{ fontSize: 9, color: "#f97316", fontWeight: 700, whiteSpace: "nowrap" }}>↻ {fmtDate(epic.newStartDate)} → {fmtDate(epic.newDueDate)}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ── Task sub-rows ── */}
                        {isEpicExpanded && epicTasks.map((task) => {
                          const taskColor = TASK_STATUS_COLOR[task.status] || "#64748b";
                          const taskStart = task.startDate ? new Date(task.startDate) : new Date(`${YEAR}-01-01`);
                          const taskEnd   = task.duedate  ? new Date(task.duedate)  : new Date(`${YEAR}-12-31`);
                          const tsp = toPct(taskStart, new Date(`${YEAR}-01-01`));
                          const tep = toPct(taskEnd,   new Date(`${YEAR}-12-31`));
                          const tw  = Math.max(tep - tsp, 0.5);
                          const taskHasNew = !!(task.newStartDate || task.newDueDate);
                          const tnStart = task.newStartDate ? new Date(task.newStartDate) : taskStart;
                          const tnEnd   = task.newDueDate   ? new Date(task.newDueDate)   : taskEnd;
                          const tnsp = toPct(tnStart, new Date(`${YEAR}-01-01`));
                          const tnep = toPct(tnEnd,   new Date(`${YEAR}-12-31`));
                          const tnw  = Math.max(tnep - tnsp, 0.5);
                          const taskRowH = taskHasNew ? 48 : 30;
                          return (
                            <div key={task.key} style={{ display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--border)", minHeight: taskRowH, background: `${trackColor}05`, borderLeft: `3px solid ${color}40` }}>
                              {/* Task label */}
                              <div style={{ width: 240, flexShrink: 0, padding: "0 10px 0 28px", borderRight: "1px solid var(--border)", overflow: "hidden", display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: taskColor, flexShrink: 0 }} />
                                <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-muted)", flexShrink: 0 }}>{task.key}</span>
                                <span style={{ fontSize: 10, fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{task.summary}</span>
                                {taskHasNew && <span style={{ fontSize: 8, color: "#fff", background: "#f97316", borderRadius: 3, padding: "1px 3px", fontWeight: 700, flexShrink: 0 }}>NEW</span>}
                              </div>
                              {/* Task timeline */}
                              <div style={{ flex: 1, position: "relative" }}>
                                {MONTHS.map((_, mi) => (
                                  <div key={mi} style={{ position: "absolute", top: 0, bottom: 0, left: `${(mi / 12) * 100}%`, borderLeft: mi > 0 ? "1px solid var(--border)" : "none", opacity: 0.5, pointerEvents: "none" }} />
                                ))}
                                {todayP >= 0 && <div style={{ position: "absolute", top: 0, bottom: 0, left: `${todayP}%`, width: 1, background: "#f59e0b", zIndex: 5 }} />}
                                {(task.startDate || task.duedate) && (<>
                                  {/* Task bar — color block only */}
                                  <div
                                    title={`${task.key} · ${task.status}\n${task.summary}\nStart: ${fmtDate(task.startDate)}  Due: ${fmtDate(task.duedate)}${taskHasNew ? `\nNew Start: ${fmtDate(task.newStartDate)}  New Due: ${fmtDate(task.newDueDate)}` : ""}\nAssignee: ${task.assignee || "—"}`}
                                    style={{ position: "absolute", left: `${tsp}%`, width: `${tw}%`, top: taskHasNew ? "30%" : "50%", transform: "translateY(-50%)", height: 20, borderRadius: 4, background: taskColor, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.2), 0 1px 2px ${taskColor}40`, cursor: "default", zIndex: 2 }}
                                  />
                                  {/* Task label — inside if wide, outside if narrow */}
                                  <div style={{ position: "absolute", left: tw >= 5 ? `${tsp}%` : `calc(${tsp + tw}% + 4px)`, top: taskHasNew ? "30%" : "50%", transform: "translateY(-50%)", height: 20, display: "flex", alignItems: "center", gap: 5, paddingLeft: tw >= 5 ? 6 : 0, paddingRight: tw >= 5 ? 4 : 0, maxWidth: tw >= 5 ? `${tw}%` : "35%", overflow: "hidden", pointerEvents: "none", zIndex: 3 }}>
                                    <span style={{ fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, color: tw >= 5 ? "#fff" : "var(--text)" }}>{task.summary}</span>
                                    {tw >= 12 && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.65)", whiteSpace: "nowrap", flexShrink: 0 }}>{fmtDate(task.duedate)}</span>}
                                  </div>
                                </>)}
                                {taskHasNew && (
                                  <div
                                    title={`Revised dates\nNew Start: ${fmtDate(task.newStartDate)}\nNew Due: ${fmtDate(task.newDueDate)}`}
                                    style={{ position: "absolute", left: `${tnsp}%`, width: `${tnw}%`, top: "74%", transform: "translateY(-50%)", height: 12, borderRadius: 3, background: "#f9731622", border: "1.5px dashed #f97316", display: "flex", alignItems: "center", paddingLeft: 4, overflow: "hidden", cursor: "default" }}
                                  >
                                    <span style={{ fontSize: 8, color: "#f97316", fontWeight: 700, whiteSpace: "nowrap" }}>↻ {fmtDate(task.newStartDate)} → {fmtDate(task.newDueDate)}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {filteredProjects.every((p) => p.epics.length === 0) && !loading && (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
                No epics found. Try changing the status filter.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend row */}
      {!loading && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 16px", fontSize: 12, color: "var(--text-muted)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 18, height: 3, background: "#f59e0b", borderRadius: 2 }} />
            Today ({new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })})
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 18, height: 8, borderRadius: 2, background: "#f9731630", border: "1.5px dashed #f97316" }} />
            New dates (revised)
          </span>
          <span>· Click project header to collapse/expand</span>
          <span>· Click ▸ on an epic to expand its tasks</span>
        </div>
      )}
    </div>
  );
}
