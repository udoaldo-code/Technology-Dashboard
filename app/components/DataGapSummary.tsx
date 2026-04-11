"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
const DataReportVsSource = dynamic(() => import("@/app/components/DataReportVsSource"), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────
interface GapEpic {
  key: string; summary: string; status: string; priority: string;
  duedate: string | null; assignee: string | null;
  created: string; updated: string;
  labels: string[]; components: string[];
  country: string; operator: string;
}
interface GapTask {
  key: string; summary: string; status: string; issuetype: string; priority: string;
  duedate: string | null; assignee: string | null; parent: string | null; parentKey: string | null;
  created: string; updated: string;
  labels: string[]; components: string[];
  country: string; operator: string;
}

// ─── Known telecom countries & operators ─────────────────────────────────────
const KNOWN_COUNTRIES = [
  "Nigeria","Kenya","Ghana","Tanzania","Uganda","Rwanda","Senegal","Cameroon",
  "Ethiopia","South Africa","Zimbabwe","Mozambique","Madagascar","Zambia","Malawi",
  "Ivory Coast","Cote d'Ivoire","Côte d'Ivoire","Niger","Mali","Burkina Faso",
  "Guinea","Sierra Leone","Liberia","Togo","Benin","Congo","DRC","Angola",
  "Sudan","Somalia","Eritrea","Djibouti","Mauritius","Seychelles",
  "Indonesia","Bangladesh","Pakistan","India","Philippines","Myanmar",
  "Thailand","Cambodia","Vietnam","Laos","Malaysia","Sri Lanka",
];

const KNOWN_OPERATORS = [
  "MTN","Airtel","Vodacom","Safaricom","Orange","Tigo","Glo","9mobile",
  "Telkom","Econet","Halotel","Vodafone","Etisalat","Zain","Celtel",
  "Djezzy","Ooredoo","Maroc Telecom","Telma","Moov","Unitel","Africell",
  "Smile","Liquid","Faiba","YTL","Ncell","Grameenphone","Banglalink",
  "Robi","Telenor","Jazz","Ufone","Zong","Warid","Dialog","Mobitel",
  "Hutch","Globe","Smart","Sun","DITO","AIS","DTAC","True Move","CAT",
  "Indosat","XL Axiata","Telkomsel","Smartfren","Viettel","Vinaphone",
  "Mobifone","Gmobile","Celcom","Maxis","Digi","U Mobile",
];

// ─── Extract country & operator from a Jira issue ────────────────────────────
function extractCountryOperator(
  summary: string,
  labels: string[],
  components: string[]
): { country: string; operator: string } {
  const allText = [summary, ...labels, ...components].join(" ");
  const lower = allText.toLowerCase();

  let country = "Unknown";
  let operator = "Unknown";

  for (const c of KNOWN_COUNTRIES) {
    if (lower.includes(c.toLowerCase())) { country = c; break; }
  }
  for (const o of KNOWN_OPERATORS) {
    if (lower.includes(o.toLowerCase())) { operator = o; break; }
  }

  // Fallback: if labels contain single-word tokens that look like country/operator codes
  if (country === "Unknown" || operator === "Unknown") {
    for (const label of labels) {
      const parts = label.replace(/[-_]/g, " ").split(" ");
      for (const part of parts) {
        if (part.length < 2) continue;
        const p = part.toLowerCase();
        if (country === "Unknown") {
          const match = KNOWN_COUNTRIES.find((c) => c.toLowerCase() === p);
          if (match) country = match;
        }
        if (operator === "Unknown") {
          const match = KNOWN_OPERATORS.find((o) => o.toLowerCase() === p);
          if (match) operator = match;
        }
      }
    }
  }

  return { country, operator };
}

// ─── Status helpers ───────────────────────────────────────────────────────────
function isDone(s: string) {
  return s.toLowerCase() === "done" || s.toLowerCase() === "stg/ready to deploy";
}
function sc(status: string): { color: string; bg: string; border: string; dot: string } {
  const MAP: Record<string, { color: string; bg: string; border: string; dot: string }> = {
    "Done":          { color: "#059669", bg: "#d1fae5", border: "#6ee7b7", dot: "#059669" },
    "In Progress":   { color: "#4f46e5", bg: "#ede9fe", border: "#a5b4fc", dot: "#4f46e5" },
    "To Do":         { color: "#475569", bg: "#f1f5f9", border: "#cbd5e1", dot: "#94a3b8" },
    "Delay":         { color: "#dc2626", bg: "#fee2e2", border: "#fca5a5", dot: "#dc2626" },
    "On Hold":       { color: "#ea580c", bg: "#ffedd5", border: "#fdba74", dot: "#ea580c" },
    "Waiting telco": { color: "#b45309", bg: "#fef3c7", border: "#fcd34d", dot: "#d97706" },
  };
  return MAP[status] || { color: "#94a3b8", bg: "#94a3b815", border: "#94a3b840", dot: "#94a3b8" };
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}
function gapScore(epics: GapEpic[]): number {
  // Weighted: missing due date, unassigned, delay, on-hold
  let score = 0;
  for (const e of epics) {
    if (!e.duedate) score += 2;
    if (!e.assignee) score += 2;
    if (e.status === "Delay") score += 3;
    if (e.status === "On Hold" || e.status === "Waiting telco") score += 1;
  }
  return score;
}
function gapLabel(score: number, total: number): { label: string; color: string; bg: string } {
  if (total === 0) return { label: "No Data", color: "#94a3b8", bg: "#94a3b815" };
  const ratio = score / (total * 8); // max 8 pts per epic
  if (ratio >= 0.5) return { label: "Critical", color: "#dc2626", bg: "#fee2e2" };
  if (ratio >= 0.3) return { label: "High",     color: "#ea580c", bg: "#ffedd5" };
  if (ratio >= 0.15) return { label: "Medium",  color: "#b45309", bg: "#fef3c7" };
  return { label: "Low",   color: "#059669", bg: "#d1fae5" };
}

// ─── Atom components ──────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", ...style }}>{children}</div>;
}
function Badge({ status }: { status: string }) {
  const s = sc(status);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot }} />{status}
    </span>
  );
}
function Pill({ children, active, onClick, color }: { children: React.ReactNode; active?: boolean; onClick?: () => void; color?: string }) {
  return (
    <button onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", background: active ? (color || "var(--accent)") : "var(--surface)", color: active ? "#fff" : "var(--text-muted)", border: active ? "none" : "1px solid var(--border)", transition: "all 0.15s" }}>
      {children}
    </button>
  );
}

// ─── Sheet summary card ───────────────────────────────────────────────────────
function SheetCard({
  icon, label, total, sub1, sub1Color, sub2, sub2Color,
}: {
  icon: string; label: string; total: number;
  sub1?: { label: string; value: number }; sub1Color?: string;
  sub2?: { label: string; value: number }; sub2Color?: string;
}) {
  return (
    <Card style={{ padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
        <span style={{ fontSize: 18, opacity: 0.7 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text)", lineHeight: 1, marginBottom: 8 }}>{total}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {sub1 && sub1.value > 0 && (
          <span style={{ fontSize: 11, color: sub1Color || "var(--text-muted)", background: sub1Color ? sub1Color + "18" : "var(--surface2)", borderRadius: 10, padding: "2px 8px", fontWeight: 600 }}>
            {sub1.value} {sub1.label}
          </span>
        )}
        {sub2 && sub2.value > 0 && (
          <span style={{ fontSize: 11, color: sub2Color || "var(--text-muted)", background: sub2Color ? sub2Color + "18" : "var(--surface2)", borderRadius: 10, padding: "2px 8px", fontWeight: 600 }}>
            {sub2.value} {sub2.label}
          </span>
        )}
      </div>
    </Card>
  );
}

// ─── Country × Operator matrix cell ──────────────────────────────────────────
function MatrixCell({ epics, onClick }: { epics: GapEpic[]; onClick: () => void }) {
  if (epics.length === 0) return (
    <td style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, color: "#cbd5e1", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)" }}>—</td>
  );
  const score = gapScore(epics);
  const { label, color, bg } = gapLabel(score, epics.length);
  const done = epics.filter((e) => isDone(e.status)).length;
  return (
    <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)" }}>
      <button onClick={onClick} style={{ width: "100%", background: bg, border: `1px solid ${color}30`, borderRadius: 6, padding: "6px 8px", cursor: "pointer", textAlign: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color }}>{label}</div>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{done}/{epics.length} done</div>
      </button>
    </td>
  );
}

// ─── Epic row in detail table ─────────────────────────────────────────────────
function EpicRow({ epic }: { epic: GapEpic }) {
  const s = sc(epic.status);
  const missingDue = !epic.duedate;
  const missingAssignee = !epic.assignee;
  const gaps: string[] = [];
  if (missingDue) gaps.push("No due date");
  if (missingAssignee) gaps.push("Unassigned");
  if (epic.status === "Delay") gaps.push("Delayed");
  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td style={{ padding: "10px 12px", fontSize: 11, fontFamily: "monospace", color: "var(--text-muted)", fontWeight: 600, whiteSpace: "nowrap" }}>{epic.key}</td>
      <td style={{ padding: "10px 12px", fontSize: 13, color: "var(--text)", maxWidth: 260 }}>
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{epic.summary}</div>
      </td>
      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
        <span style={{ background: "#ede9fe", color: "#4f46e5", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{epic.country}</span>
      </td>
      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
        <span style={{ background: "#dbeafe", color: "#1d4ed8", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{epic.operator}</span>
      </td>
      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}><Badge status={epic.status} /></td>
      <td style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmtDate(epic.duedate)}</td>
      <td style={{ padding: "10px 12px", fontSize: 12, color: epic.assignee ? "var(--text-muted)" : "var(--red)", whiteSpace: "nowrap" }}>{epic.assignee || "—"}</td>
      <td style={{ padding: "10px 12px" }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {gaps.map((g) => (
            <span key={g} style={{ background: "#fee2e2", color: "#dc2626", borderRadius: 10, padding: "2px 8px", fontSize: 10, fontWeight: 600, whiteSpace: "nowrap" }}>{g}</span>
          ))}
          {gaps.length === 0 && <span style={{ color: "#059669", fontSize: 11 }}>✓ OK</span>}
        </div>
      </td>
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props { projectKey: string; allProjects: { key: string; name: string; category: string | null }[] }

export default function DataGapSummary({ projectKey }: Props) {
  const [epics, setEpics]         = useState<GapEpic[]>([]);
  const [tasks, setTasks]         = useState<GapTask[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  // Filters
  const [countryFilter, setCountry]   = useState("All");
  const [operatorFilter, setOperator] = useState("All");
  const [statusFilter, setStatusF]    = useState("All");
  const [search, setSearch]           = useState("");

  // View tab
  type View = "overview" | "by-country" | "by-operator" | "detail" | "data-report";
  const [view, setView] = useState<View>("overview");

  // Detail drill-down (from matrix click)
  const [drillCountry, setDrillCountry]   = useState<string | null>(null);
  const [drillOperator, setDrillOperator] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setError(null);
    fetch(`/api/datagap?project=${projectKey}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); setLoading(false); return; }

        const rawEpics: GapEpic[] = (d.epics || []).map((e: any) => ({
          ...e,
          ...extractCountryOperator(e.summary, e.labels, e.components),
        }));
        const rawTasks: GapTask[] = (d.tasks || []).map((t: any) => ({
          ...t,
          ...extractCountryOperator(t.summary, t.labels, t.components),
        }));

        setEpics(rawEpics);
        setTasks(rawTasks);
        setFetchedAt(d.fetchedAt);
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [projectKey]);

  if (loading) return (
    <Card style={{ padding: 48, textAlign: "center" }}>
      <div style={{ width: 36, height: 36, border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.7s linear infinite" }} />
      <div style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading data gap analysis…</div>
    </Card>
  );

  if (error) return (
    <Card style={{ padding: 32, textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
      <div style={{ fontWeight: 700, color: "#ef4444", marginBottom: 6 }}>Failed to load</div>
      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{error}</div>
    </Card>
  );

  // ── Derived lists ────────────────────────────────────────────────────────────
  const countries  = ["All", ...Array.from(new Set(epics.map((e) => e.country))).filter(Boolean).sort()];
  const operators  = ["All", ...Array.from(new Set(epics.map((e) => e.operator))).filter(Boolean).sort()];
  const statuses   = ["All", ...Array.from(new Set(epics.map((e) => e.status))).sort()];

  // Effective filters (drill-down overrides selectors)
  const effCountry  = drillCountry  || (countryFilter  !== "All" ? countryFilter  : null);
  const effOperator = drillOperator || (operatorFilter !== "All" ? operatorFilter : null);

  const filteredEpics = epics.filter((e) => {
    if (effCountry  && e.country  !== effCountry)  return false;
    if (effOperator && e.operator !== effOperator) return false;
    if (statusFilter !== "All" && e.status !== statusFilter) return false;
    if (search && !e.summary.toLowerCase().includes(search.toLowerCase()) && !e.key.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const filteredTasks = tasks.filter((t) => {
    if (effCountry  && t.country  !== effCountry)  return false;
    if (effOperator && t.operator !== effOperator) return false;
    return true;
  });

  // ── Summary stats ────────────────────────────────────────────────────────────
  const totalEpics      = filteredEpics.length;
  const doneEpics       = filteredEpics.filter((e) => isDone(e.status));
  const inProgEpics     = filteredEpics.filter((e) => e.status === "In Progress");
  const delayedEpics    = filteredEpics.filter((e) => e.status === "Delay");
  const blockedEpics    = filteredEpics.filter((e) => e.status === "On Hold" || e.status === "Waiting telco");
  const missingDueDate  = filteredEpics.filter((e) => !e.duedate);
  const missingAssignee = filteredEpics.filter((e) => !e.assignee);
  const openBugs        = filteredTasks.filter((t) => t.issuetype === "Bug" && !isDone(t.status));
  const todoTasks       = filteredTasks.filter((t) => t.status === "To Do");
  const uniqueCountries = new Set(filteredEpics.map((e) => e.country).filter((c) => c !== "Unknown")).size;
  const uniqueOperators = new Set(filteredEpics.map((e) => e.operator).filter((o) => o !== "Unknown")).size;
  const totalGapItems   = missingDueDate.length + missingAssignee.length + delayedEpics.length;

  // ── Matrix data ───────────────────────────────────────────────────────────────
  const matrixCountries = countries.filter((c) => c !== "All" && c !== "Unknown");
  const matrixOperators = operators.filter((o) => o !== "All" && o !== "Unknown");

  // ── By-country grouped ────────────────────────────────────────────────────────
  const byCountry: Record<string, GapEpic[]> = {};
  for (const e of filteredEpics) {
    if (!byCountry[e.country]) byCountry[e.country] = [];
    byCountry[e.country].push(e);
  }
  // ── By-operator grouped ───────────────────────────────────────────────────────
  const byOperator: Record<string, GapEpic[]> = {};
  for (const e of filteredEpics) {
    if (!byOperator[e.operator]) byOperator[e.operator] = [];
    byOperator[e.operator].push(e);
  }

  function clearDrill() { setDrillCountry(null); setDrillOperator(null); }

  const VIEW_TABS: { id: View; label: string; icon: string }[] = [
    { id: "overview",     label: "Overview",             icon: "📊" },
    { id: "by-country",   label: "By Country",           icon: "🌍" },
    { id: "by-operator",  label: "By Operator",          icon: "📡" },
    { id: "detail",       label: "Detail",               icon: "🔍" },
    { id: "data-report",  label: "Data Report vs Source", icon: "📈" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ background: "var(--accent)", color: "#fff", borderRadius: 6, padding: "2px 10px", fontWeight: 800, fontSize: 13 }}>{projectKey}</span>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "var(--text)" }}>Data Gap Summary</h2>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Coverage analysis across all epics & tasks{fetchedAt ? ` · fetched ${new Date(fetchedAt).toLocaleTimeString()}` : ""}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          {totalGapItems > 0 && (
            <span style={{ background: "#fee2e2", color: "#dc2626", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>
              ⚠ {totalGapItems} gaps detected
            </span>
          )}
          {totalGapItems === 0 && totalEpics > 0 && (
            <span style={{ background: "#d1fae5", color: "#059669", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>
              ✓ No gaps
            </span>
          )}
        </div>
      </div>

      {/* ── Filters ── */}
      <Card style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Filter by:</span>

          {/* Country */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>🌍 Country</span>
            <select
              value={drillCountry || countryFilter}
              onChange={(e) => { clearDrill(); setCountry(e.target.value); }}
              style={{ padding: "7px 10px", background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)", cursor: "pointer", outline: "none", minWidth: 130 }}
            >
              {countries.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Operator */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>📡 Operator</span>
            <select
              value={drillOperator || operatorFilter}
              onChange={(e) => { clearDrill(); setOperator(e.target.value); }}
              style={{ padding: "7px 10px", background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)", cursor: "pointer", outline: "none", minWidth: 130 }}
            >
              {operators.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          {/* Status */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusF(e.target.value)}
              style={{ padding: "7px 10px", background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)", cursor: "pointer", outline: "none", minWidth: 130 }}
            >
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Search */}
          <input
            type="text" placeholder="🔍 Search…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: "1 1 160px", minWidth: 0, padding: "7px 10px", background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)", outline: "none" }}
          />

          {/* Clear */}
          {(effCountry || effOperator || statusFilter !== "All" || search) && (
            <button
              onClick={() => { clearDrill(); setCountry("All"); setOperator("All"); setStatusF("All"); setSearch(""); }}
              style={{ padding: "7px 12px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--text-muted)", cursor: "pointer", whiteSpace: "nowrap" }}
            >
              ✕ Clear
            </button>
          )}
        </div>

        {/* Active drill-down notice */}
        {(drillCountry || drillOperator) && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--accent-light)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>
            <span>Drilling into:</span>
            {drillCountry  && <span style={{ background: "var(--accent)", color: "#fff", borderRadius: 10, padding: "1px 8px" }}>{drillCountry}</span>}
            {drillOperator && <span style={{ background: "var(--accent)", color: "#fff", borderRadius: 10, padding: "1px 8px" }}>{drillOperator}</span>}
            <button onClick={clearDrill} style={{ marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer", fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>Clear ✕</button>
          </div>
        )}
      </Card>

      {/* ── Summary cards (sheet overview) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 10 }}>
        <SheetCard
          icon="📦" label="Active Epics" total={totalEpics - doneEpics.length}
          sub1={{ label: "delayed", value: delayedEpics.length }} sub1Color="#dc2626"
          sub2={{ label: "blocked", value: blockedEpics.length }} sub2Color="#ea580c"
        />
        <SheetCard
          icon="✅" label="Wins (Done)" total={doneEpics.length}
          sub1={{ label: "countries", value: uniqueCountries }}
          sub2={{ label: "operators", value: uniqueOperators }}
        />
        <SheetCard
          icon="📋" label="Tasks" total={filteredTasks.length}
          sub1={{ label: "open bugs", value: openBugs.length }} sub1Color="#dc2626"
          sub2={{ label: "to do",     value: todoTasks.length }}
        />
        <SheetCard
          icon="⚠️" label="Missing Due Date" total={missingDueDate.length}
          sub1={missingDueDate.length > 0 ? { label: "epics", value: missingDueDate.length } : undefined} sub1Color="#ea580c"
        />
        <SheetCard
          icon="👤" label="Unassigned Epics" total={missingAssignee.length}
          sub1={missingAssignee.length > 0 ? { label: "no owner", value: missingAssignee.length } : undefined} sub1Color="#dc2626"
        />
        <SheetCard
          icon="⏰" label="Gap Score" total={totalGapItems}
          sub1={{ label: "critical items", value: delayedEpics.length + missingAssignee.filter((e) => e.status === "Delay").length }}
          sub1Color="#dc2626"
        />
      </div>

      {/* ── View tabs ── */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {VIEW_TABS.map((t) => (
          <Pill key={t.id} active={view === t.id} onClick={() => setView(t.id)}>
            {t.icon} {t.label}
          </Pill>
        ))}
      </div>

      {/* ── View: Overview ── */}
      {view === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Gap breakdown */}
          <Card style={{ padding: "16px" }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <span>📊</span> Gap Breakdown
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "Missing Due Date", count: missingDueDate.length, total: totalEpics, color: "#ea580c" },
                { label: "Unassigned",       count: missingAssignee.length, total: totalEpics, color: "#dc2626" },
                { label: "Delayed",          count: delayedEpics.length,   total: totalEpics, color: "#dc2626" },
                { label: "Blocked / On Hold",count: blockedEpics.length,   total: totalEpics, color: "#b45309" },
                { label: "In Progress",      count: inProgEpics.length,    total: totalEpics, color: "#4f46e5" },
                { label: "Completed",        count: doneEpics.length,      total: totalEpics, color: "#059669" },
              ].filter((r) => r.count > 0).map((row) => {
                const pct = totalEpics > 0 ? Math.round((row.count / totalEpics) * 100) : 0;
                return (
                  <div key={row.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: "var(--text)", fontWeight: 600 }}>{row.label}</span>
                      <span style={{ color: "var(--text-muted)" }}>{row.count} <span style={{ opacity: 0.6 }}>({pct}%)</span></span>
                    </div>
                    <div style={{ height: 8, background: "var(--surface2)", borderRadius: 4, overflow: "hidden", border: "1px solid var(--border)" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: row.color, borderRadius: 4, transition: "width 0.5s ease" }} />
                    </div>
                  </div>
                );
              })}
              {totalEpics === 0 && <div style={{ color: "var(--text-muted)", textAlign: "center", padding: 16, fontSize: 13 }}>No epics match the current filters.</div>}
            </div>
          </Card>

          {/* Matrix preview (top 5 countries × top 5 operators) */}
          {matrixCountries.length > 0 && matrixOperators.length > 0 && (
            <Card style={{ padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
                <span>🗺️</span> Country × Operator Matrix
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)" }}>— click a cell to drill down</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                Gap severity: <span style={{ color: "#dc2626", fontWeight: 600 }}>Critical</span> · <span style={{ color: "#ea580c", fontWeight: 600 }}>High</span> · <span style={{ color: "#b45309", fontWeight: 600 }}>Medium</span> · <span style={{ color: "#059669", fontWeight: 600 }}>Low</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ padding: "8px 12px", background: "var(--surface2)", border: "1px solid var(--border)", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Country \ Operator</th>
                      {matrixOperators.slice(0, 8).map((op) => (
                        <th key={op} style={{ padding: "8px 10px", background: "var(--surface2)", border: "1px solid var(--border)", textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", whiteSpace: "nowrap", minWidth: 80 }}>{op}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrixCountries.slice(0, 10).map((country) => (
                      <tr key={country}>
                        <td style={{ padding: "8px 12px", background: "var(--surface2)", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", fontWeight: 700, fontSize: 12, color: "var(--text)", whiteSpace: "nowrap" }}>{country}</td>
                        {matrixOperators.slice(0, 8).map((operator) => {
                          const cell = epics.filter((e) => e.country === country && e.operator === operator);
                          return (
                            <MatrixCell key={operator} epics={cell} onClick={() => {
                              setDrillCountry(country); setDrillOperator(operator);
                              setView("detail");
                            }} />
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(matrixCountries.length > 10 || matrixOperators.length > 8) && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
                  Showing {Math.min(10, matrixCountries.length)} of {matrixCountries.length} countries · {Math.min(8, matrixOperators.length)} of {matrixOperators.length} operators. Use By Country / By Operator tabs for full view.
                </div>
              )}
            </Card>
          )}

          {/* Unknown distribution notice */}
          {epics.some((e) => e.country === "Unknown" || e.operator === "Unknown") && (
            <Card style={{ padding: "12px 16px", borderLeft: "4px solid #f59e0b" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontSize: 18 }}>ℹ️</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Some epics have unknown country/operator</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                    {epics.filter((e) => e.country === "Unknown").length} epics with unknown country ·{" "}
                    {epics.filter((e) => e.operator === "Unknown").length} epics with unknown operator.<br />
                    Add Jira labels like <code style={{ background: "var(--surface2)", padding: "1px 5px", borderRadius: 3 }}>Nigeria</code> or <code style={{ background: "var(--surface2)", padding: "1px 5px", borderRadius: 3 }}>MTN</code> to your epics, or include them in the epic summary for automatic detection.
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── View: By Country ── */}
      {view === "by-country" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {Object.keys(byCountry).length === 0 && (
            <Card style={{ padding: 32, textAlign: "center" }}><div style={{ color: "var(--text-muted)", fontSize: 13 }}>No data for current filters.</div></Card>
          )}
          {Object.entries(byCountry)
            .sort((a, b) => b[1].length - a[1].length)
            .map(([country, ces]) => {
              const score = gapScore(ces);
              const { label, color, bg } = gapLabel(score, ces.length);
              const done = ces.filter((e) => isDone(e.status)).length;
              const ops = Array.from(new Set(ces.map((e) => e.operator))).filter(Boolean);
              return (
                <Card key={country} style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                    <span style={{ fontSize: 16 }}>🌍</span>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{country}</span>
                    <span style={{ background: bg, color, border: `1px solid ${color}40`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{label}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" }}>{done}/{ces.length} done</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                    {ops.map((op) => {
                      const opEpics = ces.filter((e) => e.operator === op);
                      return (
                        <button
                          key={op}
                          onClick={() => { setDrillCountry(country); setDrillOperator(op); setView("detail"); }}
                          style={{ display: "flex", alignItems: "center", gap: 5, background: "#dbeafe", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: 20, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                        >
                          📡 {op}
                          <span style={{ background: "#1d4ed8", color: "#fff", borderRadius: 10, padding: "0px 5px", fontSize: 10 }}>{opEpics.length}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: "6px 16px", flexWrap: "wrap", fontSize: 12, color: "var(--text-muted)" }}>
                    {ces.filter((e) => !e.duedate).length  > 0 && <span style={{ color: "#ea580c" }}>⚠ {ces.filter((e) => !e.duedate).length} missing due date</span>}
                    {ces.filter((e) => !e.assignee).length > 0 && <span style={{ color: "#dc2626" }}>⚠ {ces.filter((e) => !e.assignee).length} unassigned</span>}
                    {ces.filter((e) => e.status === "Delay").length > 0 && <span style={{ color: "#dc2626" }}>⏰ {ces.filter((e) => e.status === "Delay").length} delayed</span>}
                  </div>
                </Card>
              );
            })}
        </div>
      )}

      {/* ── View: By Operator ── */}
      {view === "by-operator" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {Object.keys(byOperator).length === 0 && (
            <Card style={{ padding: 32, textAlign: "center" }}><div style={{ color: "var(--text-muted)", fontSize: 13 }}>No data for current filters.</div></Card>
          )}
          {Object.entries(byOperator)
            .sort((a, b) => b[1].length - a[1].length)
            .map(([operator, oes]) => {
              const score = gapScore(oes);
              const { label, color, bg } = gapLabel(score, oes.length);
              const done = oes.filter((e) => isDone(e.status)).length;
              const ctrs = Array.from(new Set(oes.map((e) => e.country))).filter(Boolean);
              return (
                <Card key={operator} style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                    <span style={{ fontSize: 16 }}>📡</span>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{operator}</span>
                    <span style={{ background: bg, color, border: `1px solid ${color}40`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{label}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" }}>{done}/{oes.length} done</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                    {ctrs.map((ctr) => {
                      const ctrEpics = oes.filter((e) => e.country === ctr);
                      return (
                        <button
                          key={ctr}
                          onClick={() => { setDrillCountry(ctr); setDrillOperator(operator); setView("detail"); }}
                          style={{ display: "flex", alignItems: "center", gap: 5, background: "#ede9fe", color: "#4f46e5", border: "1px solid #c4b5fd", borderRadius: 20, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                        >
                          🌍 {ctr}
                          <span style={{ background: "#4f46e5", color: "#fff", borderRadius: 10, padding: "0px 5px", fontSize: 10 }}>{ctrEpics.length}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: "6px 16px", flexWrap: "wrap", fontSize: 12, color: "var(--text-muted)" }}>
                    {oes.filter((e) => !e.duedate).length  > 0 && <span style={{ color: "#ea580c" }}>⚠ {oes.filter((e) => !e.duedate).length} missing due date</span>}
                    {oes.filter((e) => !e.assignee).length > 0 && <span style={{ color: "#dc2626" }}>⚠ {oes.filter((e) => !e.assignee).length} unassigned</span>}
                    {oes.filter((e) => e.status === "Delay").length > 0 && <span style={{ color: "#dc2626" }}>⏰ {oes.filter((e) => e.status === "Delay").length} delayed</span>}
                  </div>
                </Card>
              );
            })}
        </div>
      )}

      {/* ── View: Detail table ── */}
      {view === "detail" && (
        <Card style={{ overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Epic Detail</span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{filteredEpics.length} epics</span>
            {(drillCountry || drillOperator) && (
              <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>
                {drillCountry && `· ${drillCountry}`}{drillOperator && ` · ${drillOperator}`}
              </span>
            )}
          </div>
          {filteredEpics.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No epics match the current filters.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                    {["Key","Epic Summary","Country","Operator","Status","Due Date","Assignee","Gaps"].map((h) => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredEpics.map((epic) => <EpicRow key={epic.key} epic={epic} />)}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ── View: Data Report vs Source ── */}
      {view === "data-report" && <DataReportVsSource />}
    </div>
  );
}
