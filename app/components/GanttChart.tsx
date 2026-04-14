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
  "In Progress":   "#6366f1",
  "To Do":         "#64748b",
  "Delay":         "#ef4444",
  "On Hold":       "#f97316",
  "Waiting telco": "#f59e0b",
};

const TASK_STATUS_COLOR: Record<string, string> = {
  "Done":        "#10b981",
  "In Progress": "#6366f1",
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
  const filteredProjects = projects.map((p) => ({
    ...p,
    epics: statusFilter === "All" ? p.epics : p.epics.filter((e) => e.status === statusFilter),
  }));

  const allStatuses = ["All", ...Array.from(new Set(allEpics.map((e) => e.status))).sort()];

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

        {selectedKeys.length < 6 && (
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
          {allStatuses.map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
              background: statusFilter === s ? (STATUS_COLOR[s] || "var(--accent)") : "var(--surface)",
              color: statusFilter === s ? "#fff" : "var(--text-muted)",
              border: statusFilter === s ? "none" : "1px solid var(--border)",
            }}>
              {s}{s !== "All" && <span style={{ marginLeft: 5, opacity: 0.75 }}>{allEpics.filter((e) => e.status === s).length}</span>}
            </button>
          ))}
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
                          <div style={{ position: "absolute", left: `${s}%`, width: `${Math.max(e - s, 0.5)}%`, top: "50%", transform: "translateY(-50%)", height: 8, borderRadius: 4, background: `${trackColor}50`, border: `1px solid ${trackColor}80` }} />
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
                    const width  = Math.max(ep - sp, 0.4);
                    const color  = STATUS_COLOR[epic.status] || "#64748b";
                    const overdue = epic.duedate && new Date(epic.duedate) < new Date() && epic.status !== "Done";
                    const epicTasks = proj.tasks.filter((t) => t.parentKey === epic.key);
                    const isEpicExpanded = expandedEpics.has(epic.key);

                    return (
                      <div key={epic.key}>
                        <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)", minHeight: 44, background: idx % 2 === 0 ? "transparent" : `${trackColor}05` }}>
                          {/* Label */}
                          <div style={{ width: 240, flexShrink: 0, padding: "6px 12px 6px 16px", borderRight: "1px solid var(--border)", overflow: "hidden" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                              {/* Expand toggle */}
                              <button
                                onClick={() => toggleEpic(epic.key)}
                                title={isEpicExpanded ? "Collapse tasks" : `Show ${epicTasks.length} task(s)`}
                                style={{ background: "none", border: "none", padding: 0, cursor: epicTasks.length > 0 ? "pointer" : "default", color: epicTasks.length > 0 ? trackColor : "var(--border)", fontSize: 10, lineHeight: 1, flexShrink: 0, width: 12 }}
                              >
                                {epicTasks.length > 0 ? (isEpicExpanded ? "▾" : "▸") : "·"}
                              </button>
                              <span style={{ width: 7, height: 7, borderRadius: 2, background: color, flexShrink: 0 }} />
                              <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-muted)" }}>{epic.key}</span>
                              {overdue && <span style={{ fontSize: 9, color: "var(--red)", fontWeight: 800 }}>OVR</span>}
                              {epicTasks.length > 0 && (
                                <span style={{ fontSize: 9, color: "var(--text-muted)", marginLeft: "auto" }}>{epicTasks.length}t</span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text)", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", paddingLeft: 17 }}>
                              {epic.summary}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, paddingLeft: 17, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 9, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                                <span style={{ opacity: 0.6 }}>Start </span>
                                <span style={{ fontWeight: 600, color: epic.startDate ? "var(--text)" : "var(--text-muted)" }}>
                                  {fmtDate(epic.startDate)}
                                </span>
                              </span>
                              <span style={{ fontSize: 9, color: "var(--border)", flexShrink: 0 }}>→</span>
                              <span style={{ fontSize: 9, whiteSpace: "nowrap" }}>
                                <span style={{ opacity: 0.6, color: "var(--text-muted)" }}>Due </span>
                                <span style={{ fontWeight: 600, color: overdue ? "var(--red)" : epic.duedate ? "var(--text)" : "var(--text-muted)" }}>
                                  {fmtDate(epic.duedate)}
                                </span>
                              </span>
                            </div>
                          </div>

                          {/* Timeline bar */}
                          <div style={{ flex: 1, position: "relative", height: 44 }}>
                            {MONTHS.map((_, mi) => (
                              <div key={mi} style={{ position: "absolute", top: 0, bottom: 0, left: `${(mi / 12) * 100}%`, borderLeft: mi > 0 ? "1px dashed var(--border)" : "none", pointerEvents: "none" }} />
                            ))}
                            {todayP >= 0 && (
                              <div style={{ position: "absolute", top: 0, bottom: 0, left: `${todayP}%`, width: 2, background: "#f59e0b", zIndex: 10 }} />
                            )}
                            <div
                              title={`${epic.summary}\n${epic.key}\nStatus: ${epic.status}\nStart: ${fmtDate(epic.startDate)}\nDue: ${fmtDate(epic.duedate)}\nAssignee: ${epic.assignee || "Unassigned"}`}
                              style={{ position: "absolute", left: `${sp}%`, width: `${width}%`, top: "50%", transform: "translateY(-50%)", height: 26, borderRadius: 6, background: `${color}bb`, border: `1.5px solid ${color}`, display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: 7, paddingRight: 7, overflow: "hidden", cursor: "default", gap: 1 }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
                                <span style={{ fontSize: 9, color: "#fff", fontWeight: 800, whiteSpace: "nowrap", flexShrink: 0 }}>{epic.key}</span>
                                <span style={{ fontSize: 9, color: "#ffffffcc", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{epic.summary}</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                                <span style={{ fontSize: 8, color: "#ffffffcc", whiteSpace: "nowrap" }}>{fmtDate(epic.startDate)} → {fmtDate(epic.duedate)}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Task sub-rows (dropdown) */}
                        {isEpicExpanded && epicTasks.map((task) => {
                          const taskColor = TASK_STATUS_COLOR[task.status] || "#64748b";
                          const taskStart = task.startDate ? new Date(task.startDate) : new Date(`${YEAR}-01-01`);
                          const taskEnd   = task.duedate  ? new Date(task.duedate)  : new Date(`${YEAR}-12-31`);
                          const tsp = toPct(taskStart, new Date(`${YEAR}-01-01`));
                          const tep = toPct(taskEnd,   new Date(`${YEAR}-12-31`));
                          const tw  = Math.max(tep - tsp, 0.4);
                          return (
                            <div key={task.key} style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)", minHeight: 46, background: `${trackColor}08`, borderLeft: `2px solid ${trackColor}30` }}>
                              <div style={{ width: 240, flexShrink: 0, padding: "4px 10px 4px 28px", borderRight: "1px solid var(--border)", overflow: "hidden" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <span style={{ fontSize: 9, fontFamily: "monospace", color: "var(--text-muted)", flexShrink: 0 }}>{task.key}</span>
                                  <span style={{ fontSize: 9, fontWeight: 700, borderRadius: 3, padding: "1px 4px", background: `${taskColor}20`, color: taskColor, flexShrink: 0, whiteSpace: "nowrap" }}>
                                    {task.status}
                                  </span>
                                </div>
                                <div style={{ fontSize: 10, color: "var(--text)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
                                  {task.summary}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2, flexWrap: "wrap" }}>
                                  <span style={{ fontSize: 9, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                                    <span style={{ opacity: 0.6 }}>Start </span>
                                    <span style={{ fontWeight: 600, color: task.startDate ? "var(--text)" : "var(--text-muted)" }}>{fmtDate(task.startDate)}</span>
                                  </span>
                                  <span style={{ fontSize: 9, color: "var(--border)" }}>→</span>
                                  <span style={{ fontSize: 9, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                                    <span style={{ opacity: 0.6 }}>Due </span>
                                    <span style={{ fontWeight: 600, color: task.duedate ? "var(--text)" : "var(--text-muted)" }}>{fmtDate(task.duedate)}</span>
                                  </span>
                                </div>
                                {task.assignee && (
                                  <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    👤 {task.assignee}
                                  </div>
                                )}
                              </div>
                              <div style={{ flex: 1, position: "relative", height: 46 }}>
                                {MONTHS.map((_, mi) => (
                                  <div key={mi} style={{ position: "absolute", top: 0, bottom: 0, left: `${(mi / 12) * 100}%`, borderLeft: mi > 0 ? "1px dashed var(--border)" : "none", pointerEvents: "none" }} />
                                ))}
                                {todayP >= 0 && <div style={{ position: "absolute", top: 0, bottom: 0, left: `${todayP}%`, width: 1, background: "#f59e0b80", zIndex: 5 }} />}
                                {task.duedate && (
                                  <div
                                    title={`${task.summary}\n${task.key}\nStatus: ${task.status}\nDue: ${fmtDate(task.duedate)}\nAssignee: ${task.assignee || "Unassigned"}`}
                                    style={{ position: "absolute", left: `${tsp}%`, width: `${tw}%`, top: "50%", transform: "translateY(-50%)", height: 22, borderRadius: 5, background: `${taskColor}99`, border: `1px solid ${taskColor}`, cursor: "default", display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: 5, paddingRight: 5, overflow: "hidden", gap: 1 }}
                                  >
                                    <div style={{ display: "flex", alignItems: "center", gap: 3, overflow: "hidden" }}>
                                      <span style={{ fontSize: 8, color: "#fff", fontWeight: 800, whiteSpace: "nowrap", flexShrink: 0 }}>{task.key}</span>
                                      <span style={{ fontSize: 8, color: "#ffffffcc", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.summary}</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                      <span style={{ fontSize: 7, color: "#ffffffaa", whiteSpace: "nowrap", flexShrink: 0 }}>{fmtDate(task.startDate)}</span>
                                      <span style={{ fontSize: 7, color: "#ffffff60", flexShrink: 0 }}>→</span>
                                      <span style={{ fontSize: 7, color: "#ffffffaa", whiteSpace: "nowrap", flexShrink: 0 }}>{fmtDate(task.duedate)}</span>
                                    </div>
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
          <span>· Bars span from created date → due date</span>
          <span>· Click project header to collapse/expand</span>
          <span>· Click ▸ on an epic to expand its tasks</span>
        </div>
      )}
    </div>
  );
}
