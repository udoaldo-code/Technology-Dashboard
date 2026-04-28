"use client";

import { useState, useEffect } from "react";

interface KPIRow {
  name: string; target: string;
  weeks: Array<{ week: string; result: string; status: string; desc: string }>;
  latestResult: string; latestStatus: string; latestWeek: string;
}
interface WeeklyHighlight { week: string; wins: string[]; issues: string[]; priorities: string[]; }
interface KPIData { kpis: KPIRow[]; highlights: WeeklyHighlight[]; fetchedAt: string; error?: string; }

const CATEGORY_MAP: Record<string, string[]> = {
  "Delivery":        ["On-Time Delivery VAS","On-Time Delivery Product","On-Time Delivery RnD","Delay Delivery","Change Failure Rate"],
  "Quality":         ["UAT Defect Density","Bugs","Code Smells","Vulnerabilities","Security Hotspots","Duplications","Overall Quality Rating","Revamp Architecture"],
  "Operations":      ["Incidents","Data Gap","Budget Adherence","Utilization","Satisfaction"],
};

function getCategory(name: string): string {
  for (const [cat, keys] of Object.entries(CATEGORY_MAP)) {
    if (keys.some((k) => name.toLowerCase().includes(k.toLowerCase()))) return cat;
  }
  return "Other";
}

function statusStyle(s: string) {
  const sl = s.toLowerCase();
  if (sl.includes("achieved") && !sl.includes("not")) return { text: "#059669", bg: "#d1fae5", border: "#6ee7b7" };
  if (sl.includes("on track"))    return { text: "#b45309", bg: "#fef3c7", border: "#fcd34d" };
  if (sl.includes("not achieved"))return { text: "#dc2626", bg: "#fee2e2", border: "#fca5a5" };
  return { text: "#64748b", bg: "#64748b10", border: "#64748b30" };
}
function statusIcon(s: string) {
  const sl = s.toLowerCase();
  if (sl.includes("achieved") && !sl.includes("not")) return "✅";
  if (sl.includes("on track"))     return "🟡";
  if (sl.includes("not achieved")) return "❌";
  if (sl.includes("holiday"))      return "🏖️";
  return "—";
}

// ── Sparkline ────────────────────────────────────────────────────────────────
function SparkLine({ weeks }: { weeks: KPIRow["weeks"] }) {
  const points = weeks
    .map((w) => parseFloat(w.result.replace("%","").replace(",",".")))
    .filter((v) => !isNaN(v));
  if (points.length < 2) return null;
  const min = Math.min(...points), max = Math.max(...points), range = max - min || 1;
  const W = 80, H = 28;
  const coords = points.map((v, i) => `${((i / (points.length - 1)) * W).toFixed(1)},${(H - ((v - min) / range) * H).toFixed(1)}`);
  const last = points[points.length - 1], prev = points[points.length - 2];
  const trend = last > prev ? "↑" : last < prev ? "↓" : "→";
  const trendColor = last > prev ? "#10b981" : last < prev ? "#ef4444" : "#94a3b8";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <svg width={W} height={H} style={{ overflow: "visible" }}>
        <polyline points={coords.join(" ")} fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinejoin="round" />
        {coords.map((c, i) => { const [x, y] = c.split(",").map(Number); return <circle key={i} cx={x} cy={y} r={2} fill="#6366f1" />; })}
      </svg>
      <span style={{ fontSize: 14, color: trendColor, fontWeight: 700 }}>{trend}</span>
    </div>
  );
}

// ── Weekly Highlights Section ─────────────────────────────────────────────────
function WeeklyHighlightsView({ highlights }: { highlights: WeeklyHighlight[] }) {
  const [activeWeek, setActiveWeek] = useState<string>("");

  // Default to last week with data
  useEffect(() => {
    if (highlights.length && !activeWeek) {
      setActiveWeek(highlights[highlights.length - 1].week);
    }
  }, [highlights]);

  if (!highlights.length) return (
    <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
      No weekly highlights data available.
    </div>
  );

  const current = highlights.find((h) => h.week === activeWeek) || highlights[highlights.length - 1];

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
      {/* Header */}
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 18 }}>📰</span>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Weekly Highlights Report</span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>· from Google Sheets</span>
      </div>

      {/* Week selector */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", display: "flex", gap: 6, overflowX: "auto" }}>
        {highlights.map((h) => (
          <button key={h.week} onClick={() => setActiveWeek(h.week)} style={{
            padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
            background: activeWeek === h.week ? "var(--accent)" : "var(--surface2)",
            color:      activeWeek === h.week ? "#fff" : "var(--text-muted)",
            border:     activeWeek === h.week ? "none" : "1px solid var(--border)",
          }}>
            {h.week}
            {activeWeek === h.week && <span style={{ marginLeft: 5, opacity: 0.7 }}>{h.wins.length + h.issues.length}</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      {current && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 0 }}>
          {/* Wins */}
          {current.wins.length > 0 && (
            <div style={{ padding: "14px 16px", borderBottom: current.issues.length || current.priorities.length ? "1px solid var(--border)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 16 }}>🏆</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: "#10b981" }}>Highlights / Wins</span>
                <span style={{ background: "#10b98120", color: "#10b981", borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 600 }}>{current.wins.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {current.wins.map((win, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "var(--radius-sm)", padding: "8px 12px" }}>
                    <span style={{ color: "#10b981", fontWeight: 800, flexShrink: 0, marginTop: 1 }}>✓</span>
                    <span style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>{win}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Issues / Lowlights */}
          {current.issues.length > 0 && (
            <div style={{ padding: "14px 16px", borderBottom: current.priorities.length ? "1px solid var(--border)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 16 }}>🚦</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: "#ef4444" }}>Issues / Lowlights</span>
                <span style={{ background: "#ef444420", color: "#ef4444", borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 600 }}>{current.issues.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {current.issues.map((issue, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "var(--radius-sm)", padding: "8px 12px" }}>
                    <span style={{ color: "#ef4444", fontWeight: 800, flexShrink: 0, marginTop: 1 }}>!</span>
                    <span style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>{issue}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Priorities */}
          {current.priorities.length > 0 && (
            <div style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 16 }}>🎯</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: "#6366f1" }}>Top Priorities</span>
                <span style={{ background: "#e0f7ff", color: "#0693e3", borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 600 }}>{current.priorities.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {current.priorities.map((pri, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#e0f7ff", border: "1px solid #7dd3fc", borderRadius: "var(--radius-sm)", padding: "8px 12px" }}>
                    <span style={{ background: "#6366f1", color: "#fff", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>{pri}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KPICard({ kpi }: { kpi: KPIRow }) {
  const [expanded, setExpanded] = useState(false);
  const ss = statusStyle(kpi.latestStatus);
  const hasResult = kpi.latestResult && kpi.latestResult !== "#ERROR!";
  const achieved    = kpi.weeks.filter((w) => w.status.toLowerCase().includes("achieved") && !w.status.toLowerCase().includes("not")).length;
  const notAchieved = kpi.weeks.filter((w) => w.status.toLowerCase().includes("not achieved")).length;
  const total       = kpi.weeks.filter((w) => w.result && w.result !== "#ERROR!" && w.result !== "↑/↓").length;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", boxShadow: "var(--shadow-sm)", borderLeft: `4px solid ${ss.text}` }}>
      <div onClick={() => setExpanded(!expanded)} style={{ padding: "14px 16px", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 4, lineHeight: 1.4 }}>{kpi.name}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Target: <strong style={{ color: "var(--text)" }}>{kpi.target}</strong>
              {kpi.latestWeek && <span style={{ marginLeft: 8 }}>· {kpi.latestWeek}</span>}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <SparkLine weeks={kpi.weeks} />
            {hasResult && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: ss.text, lineHeight: 1 }}>{kpi.latestResult}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>current</div>
              </div>
            )}
            <span style={{ background: ss.bg, color: ss.text, border: `1px solid ${ss.border}`, borderRadius: 20, padding: "4px 10px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
              {statusIcon(kpi.latestStatus)} {kpi.latestStatus || "No data"}
            </span>
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{expanded ? "▲" : "▼"}</span>
          </div>
        </div>
        {total > 0 && (
          <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "#10b981" }}>✅ {achieved}/{total}</span>
            <span style={{ fontSize: 12, color: "#ef4444" }}>❌ {notAchieved}/{total}</span>
          </div>
        )}
      </div>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface2)", padding: "12px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 10 }}>Weekly Breakdown</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 6 }}>
            {kpi.weeks.map((w, i) => {
              if (!w.result || w.result === "#ERROR!" || w.result === "↑/↓") return (
                <div key={i} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "8px 10px", opacity: 0.45 }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, marginBottom: 3 }}>{w.week}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>—</div>
                </div>
              );
              const wss = statusStyle(w.status);
              return (
                <div key={i} style={{ background: wss.bg, border: `1px solid ${wss.border}`, borderRadius: "var(--radius-sm)", padding: "8px 10px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 3 }}>{w.week}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: wss.text }}>{w.result}</div>
                  <div style={{ fontSize: 10, color: wss.text, marginTop: 2 }}>{statusIcon(w.status)}</div>
                  {w.desc && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.3 }}>{w.desc}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main KPI Page ─────────────────────────────────────────────────────────────
export default function KPIReport() {
  const [data, setData]         = useState<KPIData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [section, setSection]   = useState<"highlights" | "metrics">("highlights");
  const [activeCategory, setCat] = useState("All");

  useEffect(() => {
    fetch("/api/kpi", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div style={{ textAlign: "center", padding: 64, color: "var(--text-muted)" }}>
      <div style={{ width: 36, height: 36, border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.7s linear infinite" }} />
      Loading from Google Sheets…
    </div>
  );

  if (error || !data?.kpis?.length) return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 32, textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
      <div style={{ color: "var(--red)", fontWeight: 700, marginBottom: 8 }}>Could not load KPI data</div>
      <div style={{ color: "var(--text-muted)", fontSize: 13 }}>{error || "Make sure the Google Sheet is publicly accessible (share → Anyone with link)."}</div>
    </div>
  );

  const { kpis, highlights } = data;

  const grouped: Record<string, KPIRow[]> = { All: kpis };
  for (const kpi of kpis) { const c = getCategory(kpi.name); if (!grouped[c]) grouped[c] = []; grouped[c].push(kpi); }
  const categories = ["All", ...Object.keys(grouped).filter((c) => c !== "All")];
  const visible = activeCategory === "All" ? kpis : (grouped[activeCategory] || []);

  const achieved    = kpis.filter((k) => k.latestStatus.toLowerCase().includes("achieved") && !k.latestStatus.toLowerCase().includes("not")).length;
  const notAchieved = kpis.filter((k) => k.latestStatus.toLowerCase().includes("not achieved")).length;
  const onTrack     = kpis.filter((k) => k.latestStatus.toLowerCase().includes("on track")).length;
  const noData      = kpis.length - achieved - notAchieved - onTrack;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Page header */}
      <div>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text)" }}>Technology Department KPI</h2>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
          Live · Google Sheets · {kpis.length} KPIs · Updated {new Date(data.fetchedAt).toLocaleTimeString()}
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
        {[
          { label: "Achieved",     value: achieved,    color: "#10b981", icon: "✅" },
          { label: "On Track",     value: onTrack,     color: "#f59e0b", icon: "🟡" },
          { label: "Not Achieved", value: notAchieved, color: "#ef4444", icon: "❌" },
          { label: "No Data Yet",  value: noData,      color: "#64748b", icon: "—" },
        ].map((s) => (
          <div key={s.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px 14px", boxShadow: "var(--shadow-sm)" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.icon} {s.value}</div>
          </div>
        ))}
      </div>

      {/* Section tabs */}
      <div style={{ display: "flex", gap: 4 }}>
        {([
          ["highlights", "📰 Weekly Highlights", highlights?.length || 0],
          ["metrics",    "📊 KPI Metrics",        kpis.length],
        ] as const).map(([id, label, count]) => (
          <button key={id} onClick={() => setSection(id)} style={{
            display: "flex", alignItems: "center", gap: 6,
            background: section === id ? "var(--accent)" : "var(--surface)",
            color:      section === id ? "#fff" : "var(--text-muted)",
            border:     section === id ? "none" : "1px solid var(--border)",
            borderRadius: 20, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
          }}>
            {label}
            <span style={{ background: section === id ? "rgba(255,255,255,0.25)" : "var(--surface2)", color: section === id ? "#fff" : "var(--text-muted)", borderRadius: 20, padding: "1px 7px", fontSize: 11 }}>{count}</span>
          </button>
        ))}
      </div>

      {/* Highlights section */}
      {section === "highlights" && <WeeklyHighlightsView highlights={highlights || []} />}

      {/* KPI Metrics section */}
      {section === "metrics" && (
        <>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "2px 0" }}>
            {categories.map((cat) => (
              <button key={cat} onClick={() => setCat(cat)} style={{
                padding: "7px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                background: activeCategory === cat ? "var(--accent)" : "var(--surface)",
                color:      activeCategory === cat ? "#fff" : "var(--text-muted)",
                border:     activeCategory === cat ? "none" : "1px solid var(--border)",
              }}>
                {cat} <span style={{ opacity: 0.7 }}>{cat === "All" ? kpis.length : grouped[cat]?.length || 0}</span>
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {visible.map((kpi, i) => <KPICard key={i} kpi={kpi} />)}
          </div>
        </>
      )}

      <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", paddingBottom: 8 }}>
        Source: Technology Department Weekly Report 2026
      </div>
    </div>
  );
}
