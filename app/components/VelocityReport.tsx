"use client";

import { useState, useEffect, useRef } from "react";
import type { VelocityData, VelocityMember, ProjectSummary } from "@/app/api/velocity/route";

// ── Constants ─────────────────────────────────────────────────────────────────
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const YEAR = 2026;

const PERIODS = [
  { id: "sprint",    label: "Active Sprint", icon: "⚡" },
  { id: "weekly",   label: "Weekly",         icon: "📅" },
  { id: "monthly",  label: "Monthly",        icon: "🗓️" },
  { id: "quarterly",label: "Quarterly",      icon: "📆" },
] as const;
type PeriodId = typeof PERIODS[number]["id"];

// ── Status / team helpers ─────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  "Done":          { color: "#059669", bg: "#d1fae5", border: "#6ee7b7", dot: "#059669" },
  "In Progress":   { color: "#4f46e5", bg: "#ede9fe", border: "#a5b4fc", dot: "#4f46e5" },
  "To Do":         { color: "#475569", bg: "#f1f5f9", border: "#cbd5e1", dot: "#94a3b8" },
  "Delay":         { color: "#dc2626", bg: "#fee2e2", border: "#fca5a5", dot: "#dc2626" },
  "On Hold":       { color: "#ea580c", bg: "#ffedd5", border: "#fdba74", dot: "#ea580c" },
  "Waiting telco": { color: "#b45309", bg: "#fef3c7", border: "#fcd34d", dot: "#d97706" },
  "Testing QA":    { color: "#0891b2", bg: "#e0f2fe", border: "#7dd3fc", dot: "#0891b2" },
};
function sc(status: string) {
  return STATUS_CFG[status] || { color: "#94a3b8", bg: "#94a3b815", border: "#94a3b840", dot: "#94a3b8" };
}
const TEAM_COLORS: Record<string, { color: string; bg: string; icon: string }> = {
  "Developer":        { color: "#4f46e5", bg: "#ede9fe", icon: "💻" },
  "Business Analyst": { color: "#0891b2", bg: "#e0f2fe", icon: "📊" },
  "Business User":    { color: "#059669", bg: "#d1fae5", icon: "👔" },
  "QA":               { color: "#7c3aed", bg: "#f3e8ff", icon: "🔍" },
  "Unknown":          { color: "#64748b", bg: "#f1f5f9", icon: "👤" },
};
function tc(team: string) { return TEAM_COLORS[team] || TEAM_COLORS["Unknown"]; }

// ── Shared atoms ──────────────────────────────────────────────────────────────
function VelBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ flex: 1, height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden", border: "1px solid #e2e8f0" }}>
      <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 4, transition: "width 0.5s" }} />
    </div>
  );
}
function velColor(pct: number) { return pct >= 80 ? "#10b981" : pct >= 50 ? "#4f46e5" : "#f87171"; }

function StatusChip({ status, count }: { status: string; count: number }) {
  if (!count) return null;
  const s = sc(status);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot }} />
      {status} {count}
    </span>
  );
}

function EstDaysBadge({ days }: { days: number | null }) {
  if (days === null) return <span style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>—</span>;
  if (days === 0)    return <span style={{ fontSize: 13, fontWeight: 700, color: "#059669" }}>✅ Done</span>;
  const c = days <= 3 ? "#059669" : days <= 7 ? "#d97706" : days <= 14 ? "#ea580c" : "#dc2626";
  return <span style={{ fontSize: 13, fontWeight: 800, color: c }}>{days}d</span>;
}

// ── Project Multi-Select Dropdown ─────────────────────────────────────────────
interface ProjectItem { key: string; name: string; }

function ProjectMultiSelect({
  allProjects, selected, onChange,
}: { allProjects: ProjectItem[]; selected: string[]; onChange: (keys: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = allProjects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.key.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(key: string) {
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  }

  function selectAll() { onChange(allProjects.map((p) => p.key)); }
  function clearAll()  { onChange(selected.length > 0 ? [] : selected); }

  const label = selected.length === 0
    ? "All Projects"
    : selected.length === 1
    ? allProjects.find((p) => p.key === selected[0])?.name || selected[0]
    : `${selected.length} projects`;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius-sm)", padding: "7px 12px", fontSize: 13, fontWeight: 600, color: "var(--text)", cursor: "pointer", minWidth: 180, maxWidth: 260 }}
      >
        <span style={{ fontSize: 14 }}>🗂️</span>
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        {selected.length > 0 && (
          <span style={{ background: "var(--accent)", color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{selected.length}</span>
        )}
        <span style={{ color: "var(--text-muted)", fontSize: 10, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 300, background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-md)", width: 300, maxHeight: 380, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", display: "flex", gap: 6 }}>
            <input
              autoFocus type="text" placeholder="Search projects…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1, padding: "6px 10px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)", outline: "none" }}
            />
            <button onClick={clearAll} style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", cursor: "pointer", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
              {selected.length > 0 ? "Clear" : "All"}
            </button>
          </div>
          {selected.length > 0 && (
            <div style={{ padding: "6px 12px", borderBottom: "1px solid var(--border)", display: "flex", gap: 4, flexWrap: "wrap" }}>
              {selected.map((k) => (
                <span key={k} onClick={() => toggle(k)} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "var(--accent)", color: "#fff", borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  {k} ×
                </span>
              ))}
            </div>
          )}
          <div style={{ overflowY: "auto", flex: 1 }}>
            <button onClick={selectAll} style={{ width: "100%", padding: "8px 12px", background: "transparent", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "var(--accent)", textAlign: "left" }}>
              ✓ Select All ({allProjects.length})
            </button>
            {filtered.map((p) => (
              <button
                key={p.key}
                onClick={() => toggle(p.key)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: selected.includes(p.key) ? "var(--accent-light)" : "transparent", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text)", textAlign: "left" }}
              >
                <span style={{ width: 16, height: 16, border: `2px solid ${selected.includes(p.key) ? "var(--accent)" : "var(--border2)"}`, borderRadius: 4, background: selected.includes(p.key) ? "var(--accent)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {selected.includes(p.key) && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>✓</span>}
                </span>
                <span style={{ background: selected.includes(p.key) ? "var(--accent)" : "var(--surface2)", color: selected.includes(p.key) ? "#fff" : "var(--text-muted)", borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{p.key}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>{p.name}</span>
              </button>
            ))}
            {!filtered.length && <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No projects found</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Estimation Table ──────────────────────────────────────────────────────────
function EstimationTable({ members, elapsedDays }: { members: VelocityMember[]; elapsedDays: number }) {
  const devs = members.filter((m) => m.name !== "Unassigned");
  if (!devs.length) return null;
  const usesSP = devs.some((m) => m.totalPoints > 0);
  const unit = usesSP ? "SP" : "Tasks";

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 16 }}>⏱️</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>Completion Estimate</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
            Based on {elapsedDays}d elapsed throughput · {usesSP ? "Story Points" : "task count"} mode · Formula: Remaining ÷ (Done ÷ Elapsed days)
          </div>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
              {["Developer", "Assigned Tasks", `Total ${unit}`, `${unit} Done`, `${unit} Remaining`, "Est. Days to Complete"].map((h) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {devs.map((m, idx) => {
              const team     = tc(m.team);
              const totalQty = usesSP ? m.totalPoints     : m.total;
              const doneQty  = usesSP ? m.donePoints      : m.done;
              const remQty   = usesSP ? m.remainingPoints : (m.total - m.done);
              const remColor = remQty === 0 ? "#059669" : remQty > 10 ? "#dc2626" : "#ea580c";
              return (
                <tr key={m.name} style={{ background: idx % 2 === 0 ? "var(--surface)" : "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 30, height: 30, borderRadius: "50%", background: team.bg, border: `2px solid ${team.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>{team.icon}</div>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 13 }}>{m.name}</div>
                        <div style={{ fontSize: 10, color: team.color, fontWeight: 600 }}>{m.team}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>{m.total}</span>
                      <div style={{ flex: 1, minWidth: 60 }}><VelBar pct={m.velocity} color={velColor(m.velocity)} /></div>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{m.velocity}%</span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 14px", fontWeight: 700, color: "var(--text)", textAlign: "center" }}>{totalQty > 0 ? totalQty : <span style={{ color: "#94a3b8" }}>—</span>}</td>
                  <td style={{ padding: "12px 14px", textAlign: "center" }}><span style={{ fontWeight: 700, color: "#059669" }}>{doneQty}</span></td>
                  <td style={{ padding: "12px 14px", textAlign: "center" }}><span style={{ fontWeight: 700, color: remColor }}>{remQty}</span></td>
                  <td style={{ padding: "12px 14px", textAlign: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      <EstDaysBadge days={m.estDaysToComplete} />
                      {m.estDaysToComplete === null && <span style={{ fontSize: 10, color: "#94a3b8" }}>no throughput yet</span>}
                      {m.dailyThroughput !== null && m.dailyThroughput > 0 && (
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{m.dailyThroughput} {m.throughputUnit}/day</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)", background: "var(--surface2)", display: "flex", gap: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Est. days:</span>
        {[["≤3d","#059669"],["≤7d","#d97706"],["≤14d","#ea580c"],[">14d","#dc2626"]].map(([l,c]) => (
          <span key={l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
            <span style={{ color: "var(--text-muted)" }}>{l}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Project Summary Cards ─────────────────────────────────────────────────────
function ProjectSummaryRow({ projects }: { projects: ProjectSummary[] }) {
  if (projects.length <= 1) return null;
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>🗂️ Per-Project Breakdown</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
        {projects.map((p) => {
          const vc = velColor(p.velocity);
          return (
            <div key={p.key} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-sm)", padding: "12px 14px", borderTop: `3px solid ${vc}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ background: "var(--accent)", color: "#fff", borderRadius: 5, padding: "2px 7px", fontSize: 11, fontWeight: 700 }}>{p.key}</span>
                <span style={{ fontSize: 20, fontWeight: 900, color: vc, marginLeft: "auto" }}>{p.velocity}%</span>
              </div>
              <VelBar pct={p.velocity} color={vc} />
              <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "#059669" }}>✅ {p.done}</span>
                <span style={{ fontSize: 11, color: "#4f46e5" }}>⚙️ {p.inProgress}</span>
                <span style={{ fontSize: 11, color: "#dc2626" }}>🚧 {p.blocked}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>/{p.total}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Team Summary Card ─────────────────────────────────────────────────────────
function TeamSummaryCard({ team, total, done, inProgress, blocked, velocity, memberCount }: {
  team: string; total: number; done: number; inProgress: number; blocked: number; velocity: number; memberCount: number;
}) {
  const t = tc(team); const vc = velColor(velocity);
  return (
    <div style={{ background: "var(--surface)", border: `1px solid ${t.color}30`, borderRadius: "var(--radius)", boxShadow: "var(--shadow-sm)", padding: "16px", borderTop: `3px solid ${t.color}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{t.icon}</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{team}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{memberCount} member{memberCount !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: vc, lineHeight: 1 }}>{velocity}%</div>
          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>velocity</div>
        </div>
      </div>
      <VelBar pct={velocity} color={vc} />
      <div style={{ display: "flex", gap: "8px 16px", flexWrap: "wrap", marginTop: 10 }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Total: <strong style={{ color: "var(--text)" }}>{total}</strong></span>
        <span style={{ fontSize: 12, color: "#059669" }}>Done: <strong>{done}</strong></span>
        <span style={{ fontSize: 12, color: "#4f46e5" }}>In Progress: <strong>{inProgress}</strong></span>
        <span style={{ fontSize: 12, color: "#dc2626" }}>Blocked: <strong>{blocked}</strong></span>
      </div>
    </div>
  );
}

// ── Member Card ───────────────────────────────────────────────────────────────
function MemberCard({ member }: { member: VelocityMember }) {
  const [expanded, setExpanded] = useState(false);
  const vc   = velColor(member.velocity);
  const team = tc(member.team);
  const statusCounts: Record<string, number> = {};
  for (const t of member.tasks) statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ width: 38, height: 38, borderRadius: "50%", background: team.bg, border: `2px solid ${team.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{team.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>
              {member.name === "Unassigned" ? <span style={{ color: "#dc2626" }}>Unassigned</span> : member.name}
            </span>
            <span style={{ background: team.bg, color: team.color, borderRadius: 20, padding: "1px 8px", fontSize: 10, fontWeight: 700 }}>{team.icon} {member.team}</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.entries(statusCounts).map(([status, count]) => <StatusChip key={status} status={status} count={count} />)}
          </div>
        </div>
        <div style={{ textAlign: "center", minWidth: 56, flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: vc, lineHeight: 1 }}>{member.velocity}%</div>
          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{member.done}/{member.total} done</div>
        </div>
        <span style={{ color: "var(--text-muted)", fontSize: 11, flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
      </div>
      <div style={{ padding: "0 16px 10px" }}>
        <VelBar pct={member.velocity} color={vc} />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 5 }}>
          {member.totalPoints > 0 && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>SP: <strong style={{ color: "var(--text)" }}>{member.donePoints}</strong>/{member.totalPoints}</span>}
          {member.estDaysToComplete !== null && member.estDaysToComplete > 0 && (
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Est: <strong style={{ color: member.estDaysToComplete <= 3 ? "#059669" : member.estDaysToComplete <= 7 ? "#d97706" : "#dc2626" }}>{member.estDaysToComplete}d</strong></span>
          )}
        </div>
      </div>
      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface2)" }}>
          <div style={{ padding: "8px 16px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>Tasks ({member.tasks.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 12px 12px" }}>
            {member.tasks
              .sort((a, b) => {
                const order = ["In Progress","Testing QA","To Do","Delay","Waiting telco","On Hold","Done"];
                return (order.indexOf(a.status) === -1 ? 99 : order.indexOf(a.status)) - (order.indexOf(b.status) === -1 ? 99 : order.indexOf(b.status));
              })
              .map((task) => {
                const s = sc(task.status); const isDone = task.status === "Done";
                return (
                  <div key={task.key} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "10px 12px", borderLeft: `3px solid ${s.dot}`, opacity: isDone ? 0.7 : 1 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 3 }}>
                          <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-muted)", fontWeight: 600 }}>{task.key}</span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: task.issuetype === "Bug" ? "#dc2626" : "var(--text-muted)", background: task.issuetype === "Bug" ? "#fee2e2" : "var(--surface2)", borderRadius: 10, padding: "1px 6px" }}>{task.issuetype}</span>
                          {task.points && <span style={{ fontSize: 10, color: "#4f46e5", background: "#ede9fe", borderRadius: 10, padding: "1px 6px", fontWeight: 600 }}>{task.points} SP</span>}
                        </div>
                        <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.4, textDecoration: isDone ? "line-through" : "none", opacity: isDone ? 0.6 : 1 }}>{task.summary}</div>
                      </div>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: 20, padding: "2px 8px", fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>{task.status}</span>
                    </div>
                    {task.duedate && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>📅 {new Date(task.duedate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</div>}
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Toolbar (top-level component — must NOT be defined inside VelocityReport) ──
interface Project { key: string; name: string; }

interface ToolbarProps {
  period: PeriodId;
  selectedMonth: number;
  selectedQuarter: number;
  selectedWeek: number;
  currentWeek: number;
  selectedProjects: string[];
  allProjects: Project[];
  onPeriod: (p: PeriodId) => void;
  onMonth: (m: number) => void;
  onQuarter: (q: number) => void;
  onWeek: (w: number) => void;
  onProjects: (keys: string[]) => void;
}

function VelocityToolbar({
  period, selectedMonth, selectedQuarter, selectedWeek, currentWeek,
  selectedProjects, allProjects,
  onPeriod, onMonth, onQuarter, onWeek, onProjects,
}: ToolbarProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px 14px" }}>
      {/* Row 1: period tabs + project picker */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 2, background: "var(--surface2)", borderRadius: 10, padding: 3, flexWrap: "wrap" }}>
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => onPeriod(p.id)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", background: period === p.id ? "var(--accent)" : "transparent", color: period === p.id ? "#fff" : "var(--text-muted)", transition: "all 0.15s", whiteSpace: "nowrap" }}
            >
              <span>{p.icon}</span><span>{p.label}</span>
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {allProjects.length > 0 && (
          <ProjectMultiSelect
            allProjects={allProjects}
            selected={selectedProjects}
            onChange={onProjects}
          />
        )}
      </div>

      {/* Row 2: week picker */}
      {period === "weekly" && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", flexShrink: 0, marginRight: 4 }}>Week:</span>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {Array.from({ length: currentWeek }, (_, i) => i + 1).map((w) => (
              <button
                key={w}
                onClick={() => onWeek(w)}
                style={{
                  padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                  cursor: "pointer", border: "none",
                  background: selectedWeek === w ? "var(--accent)" : w === currentWeek ? "var(--accent-light)" : "var(--bg)",
                  color: selectedWeek === w ? "#fff" : w === currentWeek ? "var(--accent)" : "var(--text-muted)",
                  outline: selectedWeek === w ? "none" : "1px solid var(--border)",
                  fontStyle: w === currentWeek && selectedWeek !== w ? "italic" : "normal",
                }}
              >
                W{w}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Row 3: month picker */}
      {period === "monthly" && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", alignSelf: "center", marginRight: 4 }}>Month:</span>
          {MONTH_NAMES.map((name, i) => {
            const m = i + 1;
            const isFuture = m > new Date().getMonth() + 1;
            return (
              <button
                key={m}
                onClick={() => !isFuture && onMonth(m)}
                disabled={isFuture}
                style={{
                  padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: isFuture ? "default" : "pointer", border: "none",
                  background: selectedMonth === m ? "var(--accent)" : isFuture ? "var(--surface2)" : "var(--bg)",
                  color: selectedMonth === m ? "#fff" : isFuture ? "var(--text-light)" : "var(--text-muted)",
                  opacity: isFuture ? 0.5 : 1,
                  outline: selectedMonth === m ? "none" : "1px solid var(--border)",
                }}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}

      {/* Row 4: quarter picker */}
      {period === "quarterly" && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", alignSelf: "center", marginRight: 4 }}>Quarter:</span>
          {[1, 2, 3, 4].map((q) => {
            const currentQ = Math.floor(new Date().getMonth() / 3) + 1;
            const isFuture = q > currentQ;
            const ranges = ["Jan–Mar", "Apr–Jun", "Jul–Sep", "Oct–Dec"];
            return (
              <button
                key={q}
                onClick={() => !isFuture && onQuarter(q)}
                disabled={isFuture}
                style={{
                  padding: "6px 16px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: isFuture ? "default" : "pointer", border: "none",
                  background: selectedQuarter === q ? "var(--accent)" : isFuture ? "var(--surface2)" : "var(--bg)",
                  color: selectedQuarter === q ? "#fff" : isFuture ? "var(--text-light)" : "var(--text-muted)",
                  opacity: isFuture ? 0.5 : 1,
                  outline: selectedQuarter === q ? "none" : "1px solid var(--border)",
                }}
              >
                Q{q} <span style={{ fontSize: 10, opacity: 0.7 }}>({ranges[q - 1]})</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function VelocityReport({ projectKey, allProjects }: { projectKey: string; allProjects: Project[] }) {
  const [period, setPeriod]           = useState<PeriodId>("sprint");
  const [selectedMonth, setMonth]     = useState(() => new Date().getMonth() + 1);
  const [selectedQuarter, setQuarter] = useState(() => Math.floor(new Date().getMonth() / 3) + 1);
  const [selectedWeek, setWeek]       = useState(0); // 0 = current week (resolved by API)
  const [selectedProjects, setSelectedProjects] = useState<string[]>([projectKey]);
  const [data, setData]               = useState<VelocityData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [teamFilter, setTeamFilter]   = useState("All");
  const [memberSearch, setMemberSearch] = useState("");

  useEffect(() => { setSelectedProjects([projectKey]); }, [projectKey]);

  function buildURL(p: PeriodId, month: number, quarter: number, week: number, projects: string[]) {
    const projectsStr = projects.length > 0 ? projects.join(",") : projectKey;
    let url = `/api/velocity?projects=${projectsStr}&period=${p}`;
    if (p === "monthly")   url += `&month=${month}`;
    if (p === "quarterly") url += `&quarter=${quarter}`;
    if (p === "weekly" && week > 0) url += `&week=${week}`;
    return url;
  }

  useEffect(() => {
    setLoading(true); setError(null); setData(null);
    fetch(buildURL(period, selectedMonth, selectedQuarter, selectedWeek, selectedProjects), { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error && !d.members?.length) { setError(d.error); }
        else {
          setData(d);
          // Sync selected week from API response on first load
          if (period === "weekly" && selectedWeek === 0 && d.currentWeek) setWeek(d.currentWeek);
        }
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, selectedMonth, selectedQuarter, selectedWeek, selectedProjects]);

  function handlePeriod(p: PeriodId) { setPeriod(p); setTeamFilter("All"); setMemberSearch(""); if (p === "weekly") setWeek(0); }

  const periodCfg = PERIODS.find((p) => p.id === period)!;
  const allTeams  = data ? Array.from(new Set(data.members.map((m) => m.team))) : [];
  const filteredMembers = (data?.members || []).filter((m) => {
    const matchTeam   = teamFilter === "All" || m.team === teamFilter;
    const matchSearch = !memberSearch || m.name.toLowerCase().includes(memberSearch.toLowerCase());
    return matchTeam && matchSearch;
  });

  const currentWeek = data?.currentWeek ?? (selectedWeek > 0 ? selectedWeek : new Date().getMonth() < 0 ? 1 : 14);

  const toolbarProps: ToolbarProps = {
    period, selectedMonth, selectedQuarter,
    selectedWeek: selectedWeek > 0 ? selectedWeek : (data?.currentWeek ?? 1),
    currentWeek,
    selectedProjects, allProjects,
    onPeriod: handlePeriod, onMonth: setMonth, onQuarter: setQuarter,
    onWeek: setWeek, onProjects: setSelectedProjects,
  };

  // ── Loading / error states ─────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <VelocityToolbar {...toolbarProps} />
      <div style={{ padding: 48, textAlign: "center", background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
        <div style={{ width: 40, height: 40, border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", margin: "0 auto 16px", animation: "spin 0.7s linear infinite" }} />
        <div style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading {periodCfg.label} velocity data…</div>
      </div>
    </div>
  );
  if (error) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <VelocityToolbar {...toolbarProps} />
      <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "var(--radius)", padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
        <div style={{ fontWeight: 700, color: "#dc2626", marginBottom: 4 }}>Failed to load velocity data</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{error}</div>
      </div>
    </div>
  );
  if (!data || !data.members?.length) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <VelocityToolbar {...toolbarProps} />
      <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)", background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🏁</div>
        <div>No data found for this period / project selection.</div>
      </div>
    </div>
  );

  const hasDates    = !!data.startDate;
  const periodStart = hasDates ? data.startDate.replace(/\//g, "-") : "";
  const periodEnd   = hasDates ? data.endDate.replace(/\//g, "-")   : "";
  const fmtD = (s: string) => s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Toolbar ── */}
      <VelocityToolbar {...toolbarProps} />

      {/* ── Executive summary header ── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-sm)", padding: "16px 18px", borderLeft: "4px solid var(--accent)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--accent)", marginBottom: 4 }}>
              {periodCfg.icon} {data.periodLabel} — Velocity Report
            </div>
            {data.sprintName && <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>{data.sprintName}</div>}
            {periodStart && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
                📅 {fmtD(periodStart)} → {fmtD(periodEnd)}
              </div>
            )}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "var(--text-muted)" }}>
              <span>Elapsed: <strong style={{ color: "var(--text)" }}>{data.elapsedDays}d</strong>{data.totalPeriodDays > 0 && ` / ${data.totalPeriodDays}d`}</span>
              {data.selectedProjects.length > 1 && (
                <span>Projects: <strong style={{ color: "var(--text)" }}>{data.selectedProjects.join(", ")}</strong></span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {[
              { value: `${data.overallVelocity}%`, label: "overall velocity", color: velColor(data.overallVelocity) },
              { value: data.totalIssues,   label: "total tasks",   color: "var(--text)" },
              { value: data.totalDone,     label: "done",          color: "#059669" },
              { value: data.totalIssues - data.totalDone, label: "remaining", color: "#dc2626" },
              { value: data.members.length, label: "members",      color: "var(--text)" },
            ].map((s) => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        {data.totalPeriodDays > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
              <span>Period progress</span><span>{Math.round((data.elapsedDays / data.totalPeriodDays) * 100)}%</span>
            </div>
            <div style={{ height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden", border: "1px solid var(--border)" }}>
              <div style={{ height: "100%", width: `${Math.min((data.elapsedDays / data.totalPeriodDays) * 100, 100)}%`, background: "#cbd5e1", borderRadius: 3 }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Per-project breakdown (multi-project only) ── */}
      <ProjectSummaryRow projects={data.projectSummary} />

      {/* ── Team summary ── */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>📊 Team Summary</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
          {data.teamSummary.map((ts) => <TeamSummaryCard key={ts.team} {...ts} />)}
        </div>
      </div>

      {/* ── Estimation table ── */}
      <EstimationTable members={data.members} elapsedDays={data.elapsedDays} />

      {/* ── Per-member allocation ── */}
      <div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", flexShrink: 0 }}>👥 Developer Allocation</div>
          <div style={{ flex: 1 }} />
          <input
            type="text" placeholder="🔍 Search member…" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)}
            style={{ padding: "7px 12px", background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)", outline: "none", width: 180 }}
          />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {["All", ...allTeams].map((t) => (
              <button key={t} onClick={() => setTeamFilter(t)} style={{ padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", background: teamFilter === t ? "var(--accent)" : "var(--surface)", color: teamFilter === t ? "#fff" : "var(--text-muted)", border: teamFilter === t ? "none" : "1px solid var(--border)" }}>
                {t === "All" ? `All (${data.members.length})` : `${tc(t).icon} ${t}`}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredMembers.map((m) => <MemberCard key={m.name} member={m} />)}
          {!filteredMembers.length && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>No members match your filter.</div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", paddingBottom: 4 }}>
        Last updated {data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString() : "—"}
      </div>
    </div>
  );
}
