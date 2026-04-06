"use client";

import { useState, useEffect } from "react";
import type { EpicMDReport, EpicMD } from "@/app/api/epic-md/route";

// ── Status colours ────────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  "Done":          { color: "#059669", bg: "#d1fae5", border: "#6ee7b7", dot: "#059669" },
  "In Progress":   { color: "#4f46e5", bg: "#ede9fe", border: "#a5b4fc", dot: "#4f46e5" },
  "To Do":         { color: "#475569", bg: "#f1f5f9", border: "#cbd5e1", dot: "#94a3b8" },
  "Delay":         { color: "#dc2626", bg: "#fee2e2", border: "#fca5a5", dot: "#dc2626" },
  "On Hold":       { color: "#ea580c", bg: "#ffedd5", border: "#fdba74", dot: "#ea580c" },
  "Waiting telco": { color: "#b45309", bg: "#fef3c7", border: "#fcd34d", dot: "#d97706" },
};
function sc(s: string) {
  return STATUS_CFG[s] || { color: "#94a3b8", bg: "#94a3b815", border: "#94a3b840", dot: "#94a3b8" };
}

function estColor(d: number | null) {
  if (d === null) return "#94a3b8";
  if (d === 0)   return "#059669";
  if (d <= 3)    return "#059669";
  if (d <= 7)    return "#d97706";
  if (d <= 14)   return "#ea580c";
  return "#dc2626";
}

function VelBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ flex: 1, height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden", border: "1px solid #e2e8f0" }}>
      <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 3, transition: "width 0.5s" }} />
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const s = sc(status);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
      {status}
    </span>
  );
}

// ── Summary bar at the top ────────────────────────────────────────────────────
function SummaryHeader({ data }: { data: EpicMDReport }) {
  const barColor = data.overallPct >= 80 ? "#10b981" : data.overallPct >= 50 ? "#4f46e5" : "#f87171";

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-sm)", padding: "16px 18px", borderLeft: "4px solid #7c3aed" }}>
      {/* Title row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#7c3aed", marginBottom: 4 }}>
            📋 Epic Man-Day Report
          </div>
          {data.sprintName && (
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Sprint: <strong style={{ color: "var(--text)" }}>{data.sprintName}</strong>
              <span style={{ marginLeft: 10 }}>· {data.sprintElapsedDays}d elapsed</span>
            </div>
          )}
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            Throughput: <strong style={{ color: "var(--text)" }}>
              {data.teamDailyMD !== null ? `${data.teamDailyMD} ${data.mdUnit}/day` : "—"}
            </strong>
            <span style={{ marginLeft: 8, fontSize: 11 }}>
              ({data.mdUnit === "SP" ? "Story Points mode" : "Task-count mode — no SP data"})
            </span>
          </div>
        </div>

        {/* KPI chips */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {[
            { v: data.totalEpics,         l: "epics",     c: "var(--text)" },
            { v: `${data.overallPct}%`,   l: "complete",  c: barColor },
            { v: data.totalMD,            l: `total ${data.mdUnit}`, c: "var(--text)" },
            { v: data.doneMD,             l: "done MD",   c: "#059669" },
            { v: data.remainingMD,        l: "remaining", c: "#dc2626" },
          ].map((s) => (
            <div key={s.l} style={{ textAlign: "center", minWidth: 44 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: s.c, lineHeight: 1 }}>{s.v}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Overall progress bar */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
          <span>Overall Man-Day Completion</span>
          <span>{data.doneMD} / {data.totalMD} {data.mdUnit}</span>
        </div>
        <div style={{ height: 10, background: "#f1f5f9", borderRadius: 5, overflow: "hidden", border: "1px solid var(--border)" }}>
          <div style={{ height: "100%", width: `${Math.min(data.overallPct, 100)}%`, background: `linear-gradient(90deg, ${barColor}, ${barColor}cc)`, borderRadius: 5, transition: "width 0.6s" }} />
        </div>
      </div>

      {/* Est. completion banner */}
      {data.estDaysAllEpics !== null && (
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12, background: data.estDaysAllEpics === 0 ? "#d1fae5" : data.estDaysAllEpics <= 7 ? "#fef3c7" : data.estDaysAllEpics <= 30 ? "#ffedd5" : "#fee2e2", border: `1px solid ${data.estDaysAllEpics === 0 ? "#6ee7b7" : data.estDaysAllEpics <= 7 ? "#fcd34d" : data.estDaysAllEpics <= 30 ? "#fdba74" : "#fca5a5"}`, borderRadius: "var(--radius-sm)", padding: "10px 14px", flexWrap: "wrap" }}>
          <span style={{ fontSize: 22 }}>{data.estDaysAllEpics === 0 ? "🎉" : data.estDaysAllEpics <= 7 ? "⚡" : data.estDaysAllEpics <= 30 ? "⏳" : "🚨"}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: estColor(data.estDaysAllEpics) }}>
              {data.estDaysAllEpics === 0
                ? "All epics complete!"
                : `~${data.estDaysAllEpics} working days to complete all epics`}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {data.estDaysAllEpics > 0 && `Based on ${data.teamDailyMD} ${data.mdUnit}/day team throughput · ${data.remainingMD} ${data.mdUnit} remaining`}
            </div>
          </div>
          {data.estDaysAllEpics > 0 && (
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Est. completion</div>
              <div style={{ fontWeight: 700, fontSize: 13, color: estColor(data.estDaysAllEpics) }}>
                {(() => {
                  const d = new Date();
                  // add business days (rough: 5/7 ratio)
                  const calDays = Math.ceil(data.estDaysAllEpics! * 7 / 5);
                  d.setDate(d.getDate() + calDays);
                  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Epic row (expandable) ─────────────────────────────────────────────────────
function EpicRow({ epic, mdUnit, rank }: { epic: EpicMD; mdUnit: string; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const s = sc(epic.status);
  const barColor = epic.completionPct >= 80 ? "#10b981" : epic.completionPct >= 50 ? "#4f46e5" : "#f87171";
  const ec = estColor(epic.estDaysToComplete);

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
      {/* Header */}
      <div onClick={() => setExpanded(!expanded)} style={{ padding: "12px 14px", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
          {/* Rank */}
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--surface2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", flexShrink: 0, marginTop: 1 }}>
            {rank}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
              <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-muted)", fontWeight: 600 }}>{epic.key}</span>
              <Badge status={epic.status} />
              {epic.duedate && (
                <span style={{ fontSize: 10, color: new Date(epic.duedate) < new Date() && epic.status !== "Done" ? "#dc2626" : "var(--text-muted)" }}>
                  📅 {new Date(epic.duedate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", lineHeight: 1.4 }}>{epic.summary}</div>
            {epic.assignee && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>👤 {epic.assignee}</div>}
          </div>
          <span style={{ color: "var(--text-muted)", fontSize: 11, flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
        </div>

        {/* Progress + MD stats */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <VelBar pct={epic.completionPct} color={barColor} />
          <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap", minWidth: 32, textAlign: "right" }}>{epic.completionPct}%</span>
        </div>

        {/* MD chips row */}
        <div style={{ display: "flex", gap: "6px 14px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Total MD: <strong style={{ color: "var(--text)" }}>{epic.totalMD} {mdUnit}</strong></span>
          <span style={{ fontSize: 12, color: "#059669" }}>Done: <strong>{epic.doneMD}</strong></span>
          <span style={{ fontSize: 12, color: "#dc2626" }}>Left: <strong>{epic.remainingMD}</strong></span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{epic.doneTasks}/{epic.totalTasks} tasks</span>
          {epic.estDaysToComplete !== null && (
            <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: ec }}>
              {epic.estDaysToComplete === 0 ? "✅ Done" : `⏱ ~${epic.estDaysToComplete}d to complete`}
            </span>
          )}
        </div>
      </div>

      {/* Expanded task list */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface2)" }}>
          <div style={{ padding: "8px 14px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
            Tasks ({epic.tasks.length})
          </div>
          {!epic.tasks.length ? (
            <div style={{ padding: "8px 14px 14px", fontSize: 13, color: "var(--text-muted)" }}>No tasks linked to this epic.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 10px 10px" }}>
              {epic.tasks
                .sort((a, b) => {
                  const order = ["In Progress", "Testing QA", "To Do", "Delay", "Waiting telco", "On Hold", "Done"];
                  return (order.indexOf(a.status) === -1 ? 99 : order.indexOf(a.status)) - (order.indexOf(b.status) === -1 ? 99 : order.indexOf(b.status));
                })
                .map((t) => {
                  const ts = sc(t.status);
                  const isDone = t.status === "Done";
                  return (
                    <div key={t.key} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "9px 12px", borderLeft: `3px solid ${ts.dot}`, opacity: isDone ? 0.7 : 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap", marginBottom: 2 }}>
                            <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-muted)", fontWeight: 600 }}>{t.key}</span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: t.issuetype === "Bug" ? "#dc2626" : "var(--text-muted)", background: t.issuetype === "Bug" ? "#fee2e2" : "var(--surface2)", borderRadius: 10, padding: "1px 6px" }}>{t.issuetype}</span>
                            {t.points && <span style={{ fontSize: 10, fontWeight: 600, color: "#7c3aed", background: "#f3e8ff", borderRadius: 10, padding: "1px 6px" }}>{t.points} {mdUnit}</span>}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.4, textDecoration: isDone ? "line-through" : "none", opacity: isDone ? 0.6 : 1 }}>{t.summary}</div>
                          {t.assignee && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>👤 {t.assignee}</div>}
                        </div>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: ts.bg, color: ts.color, border: `1px solid ${ts.border}`, borderRadius: 20, padding: "2px 8px", fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>{t.status}</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Summary table (scrollable) ────────────────────────────────────────────────
function SummaryTable({ data }: { data: EpicMDReport }) {
  const unit = data.mdUnit;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 15 }}>📊</span>
        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>Man-Day Summary Table</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 4 }}>({unit} mode)</span>
      </div>
      <div className="scroll-x">
        <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
              {["#", "Epic", "Status", `Total MD (${unit})`, `Done MD`, `Remaining`, "Progress", "Est. Days"].map((h) => (
                <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.epics.map((epic, idx) => {
              const s = sc(epic.status);
              const barColor = epic.completionPct >= 80 ? "#10b981" : epic.completionPct >= 50 ? "#4f46e5" : "#f87171";
              return (
                <tr key={epic.key} style={{ background: idx % 2 === 0 ? "var(--surface)" : "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 12px", color: "var(--text-muted)", fontSize: 11, textAlign: "center" }}>{idx + 1}</td>
                  <td style={{ padding: "10px 12px", maxWidth: 220 }}>
                    <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={epic.summary}>{epic.summary}</div>
                    <div style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-muted)" }}>{epic.key}</div>
                  </td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: 20, padding: "2px 8px", fontSize: 10, fontWeight: 600 }}>
                      <span style={{ width: 4, height: 4, borderRadius: "50%", background: s.dot }} />{epic.status}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", fontWeight: 700, color: "var(--text)", textAlign: "center" }}>{epic.totalMD}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 700, color: "#059669", textAlign: "center" }}>{epic.doneMD}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 700, color: epic.remainingMD > 0 ? "#dc2626" : "#059669", textAlign: "center" }}>{epic.remainingMD}</td>
                  <td style={{ padding: "10px 12px", minWidth: 100 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ flex: 1, height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${epic.completionPct}%`, background: barColor, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{epic.completionPct}%</span>
                    </div>
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "center", whiteSpace: "nowrap" }}>
                    {epic.estDaysToComplete === null
                      ? <span style={{ color: "#94a3b8", fontSize: 11 }}>—</span>
                      : epic.estDaysToComplete === 0
                      ? <span style={{ color: "#059669", fontWeight: 700, fontSize: 12 }}>✅ Done</span>
                      : <span style={{ fontWeight: 800, color: estColor(epic.estDaysToComplete), fontSize: 13 }}>{epic.estDaysToComplete}d</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* Totals row */}
          <tfoot>
            <tr style={{ background: "#f8fafc", borderTop: "2px solid var(--border2)" }}>
              <td colSpan={3} style={{ padding: "10px 12px", fontWeight: 800, fontSize: 13, color: "var(--text)" }}>TOTAL</td>
              <td style={{ padding: "10px 12px", fontWeight: 800, fontSize: 13, color: "var(--text)", textAlign: "center" }}>{data.totalMD}</td>
              <td style={{ padding: "10px 12px", fontWeight: 800, fontSize: 13, color: "#059669", textAlign: "center" }}>{data.doneMD}</td>
              <td style={{ padding: "10px 12px", fontWeight: 800, fontSize: 13, color: "#dc2626", textAlign: "center" }}>{data.remainingMD}</td>
              <td style={{ padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ flex: 1, height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${data.overallPct}%`, background: data.overallPct >= 80 ? "#10b981" : data.overallPct >= 50 ? "#4f46e5" : "#f87171", borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text)" }}>{data.overallPct}%</span>
                </div>
              </td>
              <td style={{ padding: "10px 12px", textAlign: "center" }}>
                {data.estDaysAllEpics !== null && (
                  <span style={{ fontWeight: 800, color: estColor(data.estDaysAllEpics), fontSize: 13 }}>
                    {data.estDaysAllEpics === 0 ? "✅" : `${data.estDaysAllEpics}d`}
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function EpicMDReportView({ projectKey, allProjects }: { projectKey: string; allProjects: { key: string; name: string }[] }) {
  const [data, setData]       = useState<EpicMDReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [search, setSearch]   = useState("");
  const [statusFilter, setStatus] = useState("All");
  const [view, setView]       = useState<"cards" | "table">("table");

  useEffect(() => {
    setLoading(true); setError(null); setData(null);
    fetch(`/api/epic-md?project=${projectKey}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.error && !d.epics?.length) setError(d.error); else setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [projectKey]);

  if (loading) return (
    <div style={{ padding: 48, textAlign: "center", background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
      <div style={{ width: 40, height: 40, border: "3px solid var(--border)", borderTopColor: "#7c3aed", borderRadius: "50%", margin: "0 auto 16px", animation: "spin 0.7s linear infinite" }} />
      <div style={{ color: "var(--text-muted)", fontSize: 14 }}>Calculating man-days…</div>
    </div>
  );

  if (error) return (
    <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "var(--radius)", padding: 24, textAlign: "center" }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
      <div style={{ fontWeight: 700, color: "#dc2626", marginBottom: 4 }}>Failed to load Epic MD data</div>
      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{error}</div>
    </div>
  );

  if (!data || !data.epics?.length) return (
    <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)", background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
      <div>No epics found for this project.</div>
    </div>
  );

  const allStatuses = ["All", ...Array.from(new Set(data.epics.map((e) => e.status))).sort()];
  const filtered = data.epics.filter((e) => {
    const ms = !search || e.summary.toLowerCase().includes(search.toLowerCase()) || e.key.toLowerCase().includes(search.toLowerCase());
    const mst = statusFilter === "All" || e.status === statusFilter;
    return ms && mst;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Summary header */}
      <SummaryHeader data={data} />

      {/* Filter + view toggle */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text" placeholder="🔍 Search epic…" value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ flex: "1 1 160px", minWidth: 0, padding: "8px 12px", background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)", outline: "none" }}
          />
          <div style={{ display: "flex", gap: 4, background: "var(--surface2)", borderRadius: 8, padding: 3 }}>
            {(["table", "cards"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} style={{ padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none", background: view === v ? "var(--surface)" : "transparent", color: view === v ? "var(--text)" : "var(--text-muted)", boxShadow: view === v ? "var(--shadow-sm)" : "none" }}>
                {v === "table" ? "📋 Table" : "🗃 Cards"}
              </button>
            ))}
          </div>
        </div>
        <div className="scroll-x" style={{ display: "flex", gap: 4 }}>
          {allStatuses.map((s) => {
            const cfg = sc(s);
            return (
              <button key={s} onClick={() => setStatus(s)} style={{ padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none", whiteSpace: "nowrap", flexShrink: 0, background: statusFilter === s ? (s === "All" ? "var(--text)" : cfg.bg) : "var(--surface)", color: statusFilter === s ? (s === "All" ? "var(--bg)" : cfg.color) : "var(--text-muted)", outline: statusFilter === s ? "none" : "1px solid var(--border)" }}>
                {s}{s !== "All" && <span style={{ marginLeft: 5, opacity: 0.7 }}>{data.epics.filter((e) => e.status === s).length}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table view */}
      {view === "table" && <SummaryTable data={{ ...data, epics: filtered }} />}

      {/* Cards view */}
      {view === "cards" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((epic, i) => (
            <EpicRow key={epic.key} epic={epic} mdUnit={data.mdUnit} rank={i + 1} />
          ))}
          {!filtered.length && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
              No epics match your filters.
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", paddingBottom: 4 }}>
        Last updated {data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString() : "—"} · 1 {data.mdUnit} = 1 man-day
      </div>
    </div>
  );
}
