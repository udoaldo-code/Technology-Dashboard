"use client";

import { useState, useEffect, useMemo } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ServiceRow {
  country: string; operator: string; service: string;
  looker: boolean; notes: string;
}
interface CountrySummary {
  country: string; total: number; ready: number;
  completionRate: number; comments: string; estTime: string;
}
interface OverallStats { avgCompletionRate: number; dataGap: number; }

interface MoRow {
  country: string; operator: string; service: string;
  moReport: string; moSource: string;
  differences: string; diffPct: string;
  revenue: string; db: string;
  picDb: string; ba: string;
  status: string; notes: string;
}
interface MoCountrySummary {
  country: string; revenue: string;
  avgMoDiff: string;
  statusDone: number; statusNotDone: number;
  completionPct: number; pic: string;
}

interface ReportData {
  serviceRows: ServiceRow[];
  countrySummary: CountrySummary[];
  overallStats: OverallStats;
  moRows: MoRow[];
  moSummary: MoCountrySummary[];
  fetchedAt: string;
}

// ─── Atom helpers ─────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", ...style }}>
      {children}
    </div>
  );
}

function StatusBadge({ ready, notes }: { ready: boolean; notes?: string }) {
  const label  = ready ? "Ready" : "Data Gap";
  const color  = ready ? "#059669" : "#dc2626";
  const bg     = ready ? "#d1fae5" : "#fee2e2";
  const border = ready ? "#6ee7b7" : "#fca5a5";
  return (
    <span title={notes || undefined} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: bg, color, border: `1px solid ${border}`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ height: 8, background: "var(--surface2)", borderRadius: 4, overflow: "hidden", border: "1px solid var(--border)" }}>
      <div style={{ height: "100%", width: `${Math.min(100, value)}%`, background: color, borderRadius: 4, transition: "width 0.6s ease" }} />
    </div>
  );
}

function rateColor(rate: number): string {
  if (rate >= 90) return "#059669";
  if (rate >= 70) return "#4f46e5";
  if (rate >= 50) return "#d97706";
  return "#dc2626";
}

function completionGrade(rate: number): { label: string; color: string; bg: string } {
  if (rate === 100) return { label: "Complete",  color: "#059669", bg: "#d1fae5" };
  if (rate >= 75)  return { label: "Good",       color: "#4f46e5", bg: "#ede9fe" };
  if (rate >= 50)  return { label: "Partial",    color: "#d97706", bg: "#fef3c7" };
  if (rate > 0)    return { label: "Low",        color: "#ea580c", bg: "#ffedd5" };
  return              { label: "No Data",     color: "#dc2626", bg: "#fee2e2" };
}

// ─── Country summary card ─────────────────────────────────────────────────────
function CountryCard({
  summary, services, onDrillDown,
}: {
  summary: CountrySummary;
  services: ServiceRow[];
  onDrillDown: (country: string) => void;
}) {
  const grade   = completionGrade(summary.completionRate);
  const color   = rateColor(summary.completionRate);
  const operators = Array.from(new Set(services.map((s) => s.operator))).sort();
  const gapRows = services.filter((s) => !s.looker);

  return (
    <Card style={{ padding: "14px 16px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: "var(--text)" }}>{summary.country}</span>
            <span style={{ background: grade.bg, color: grade.color, border: `1px solid ${grade.color}30`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{grade.label}</span>
            {gapRows.length > 0 && (
              <span style={{ background: "#fee2e2", color: "#dc2626", borderRadius: 20, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>⚠ {gapRows.length} gap{gapRows.length > 1 ? "s" : ""}</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
            {summary.ready} / {summary.total} services ready
            {summary.estTime && <span style={{ marginLeft: 8, background: "var(--surface2)", borderRadius: 10, padding: "1px 8px", fontSize: 11 }}>⏱ {summary.estTime}</span>}
          </div>
          <ProgressBar value={summary.completionRate} color={color} />
          <div style={{ fontSize: 13, fontWeight: 700, color, marginTop: 4 }}>{summary.completionRate.toFixed(1)}%</div>
        </div>
      </div>

      {/* Operators row */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: summary.comments ? 10 : 0 }}>
        {operators.map((op) => {
          const opServices = services.filter((s) => s.operator === op);
          const opReady    = opServices.filter((s) => s.looker).length;
          const allReady   = opReady === opServices.length;
          return (
            <button
              key={op}
              onClick={() => onDrillDown(summary.country)}
              title={`${op}: ${opReady}/${opServices.length} ready`}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: allReady ? "#d1fae5" : "#fee2e2",
                color: allReady ? "#059669" : "#dc2626",
                border: `1px solid ${allReady ? "#6ee7b7" : "#fca5a5"}`,
                borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
              }}
            >
              {op}
              <span style={{
                background: allReady ? "#059669" : "#dc2626", color: "#fff",
                borderRadius: 10, padding: "0px 5px", fontSize: 10,
              }}>
                {opReady}/{opServices.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Comments */}
      {summary.comments && (
        <div style={{ marginTop: 8, background: "#fef9c3", border: "1px solid #fde047", borderRadius: 6, padding: "8px 10px", fontSize: 12, color: "#713f12", lineHeight: 1.5 }}>
          💬 {summary.comments}
        </div>
      )}
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DataReportVsSource() {
  const [data, setData]           = useState<ReportData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  // Filters
  const [countryFilter, setCountry]   = useState("All");
  const [operatorFilter, setOperator] = useState("All");
  const [statusFilter, setStatusF]    = useState<"All" | "Ready" | "Gap">("All");
  const [search, setSearch]           = useState("");

  // Sub-view
  type SubView = "summary" | "detail" | "mo-report";
  const [subView, setSubView] = useState<SubView>("summary");

  // Drill-down from country card
  const [drillCountry, setDrillCountry] = useState<string | null>(null);

  // MO report filters
  const [moCountry,  setMoCountry]  = useState("All");
  const [moOperator, setMoOperator] = useState("All");
  const [moStatus,   setMoStatus]   = useState<"All" | "Done" | "Pending">("All");
  const [moSearch,   setMoSearch]   = useState("");

  useEffect(() => {
    setLoading(true); setError(null);
    fetch("/api/data-report", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: ReportData & { error?: string }) => {
        if (d.error) { setError(d.error); } else { setData(d); }
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  // ── Derived options ──────────────────────────────────────────────────────────
  const countries = useMemo(() => {
    if (!data) return ["All"];
    return ["All", ...Array.from(new Set(data.serviceRows.map((r) => r.country))).sort()];
  }, [data]);

  const operators = useMemo(() => {
    if (!data) return ["All"];
    const base = data.serviceRows.filter((r) =>
      countryFilter === "All" || r.country === countryFilter
    );
    return ["All", ...Array.from(new Set(base.map((r) => r.operator))).sort()];
  }, [data, countryFilter]);

  // ── Filtered rows ────────────────────────────────────────────────────────────
  const filteredRows = useMemo<ServiceRow[]>(() => {
    if (!data) return [];
    const effCountry  = drillCountry || (countryFilter  !== "All" ? countryFilter  : null);
    return data.serviceRows.filter((r) => {
      if (effCountry            && r.country  !== effCountry)           return false;
      if (operatorFilter !== "All" && r.operator !== operatorFilter)    return false;
      if (statusFilter === "Ready" && !r.looker)                        return false;
      if (statusFilter === "Gap"   &&  r.looker)                        return false;
      if (search && ![r.country, r.operator, r.service, r.notes]
        .some((v) => v.toLowerCase().includes(search.toLowerCase())))   return false;
      return true;
    });
  }, [data, countryFilter, operatorFilter, statusFilter, search, drillCountry]);

  // ── Country summaries filtered ───────────────────────────────────────────────
  const filteredSummaries = useMemo<CountrySummary[]>(() => {
    if (!data) return [];
    const effCountry = drillCountry || (countryFilter !== "All" ? countryFilter : null);
    return data.countrySummary.filter((s) => !effCountry || s.country === effCountry);
  }, [data, countryFilter, drillCountry]);

  function clearFilters() {
    setCountry("All"); setOperator("All"); setStatusF("All"); setSearch(""); setDrillCountry(null);
  }

  // ── MO report derived data ───────────────────────────────────────────────────
  const moCountries = useMemo(() => {
    if (!data) return ["All"];
    return ["All", ...Array.from(new Set((data.moRows || []).map((r) => r.country))).sort()];
  }, [data]);

  const moOperators = useMemo(() => {
    if (!data) return ["All"];
    const base = (data.moRows || []).filter((r) => moCountry === "All" || r.country === moCountry);
    return ["All", ...Array.from(new Set(base.map((r) => r.operator))).sort()];
  }, [data, moCountry]);

  const filteredMoRows = useMemo<MoRow[]>(() => {
    if (!data) return [];
    return (data.moRows || []).filter((r) => {
      if (moCountry  !== "All" && r.country  !== moCountry)  return false;
      if (moOperator !== "All" && r.operator !== moOperator) return false;
      if (moStatus === "Done"    && r.status.toUpperCase() !== "DONE")  return false;
      if (moStatus === "Pending" && r.status.toUpperCase() === "DONE")  return false;
      if (moSearch && ![r.country, r.operator, r.service, r.notes, r.picDb, r.ba]
        .some((v) => v.toLowerCase().includes(moSearch.toLowerCase()))) return false;
      return true;
    });
  }, [data, moCountry, moOperator, moStatus, moSearch]);

  function clearMoFilters() {
    setMoCountry("All"); setMoOperator("All"); setMoStatus("All"); setMoSearch("");
  }

  // ── Loading / error ──────────────────────────────────────────────────────────
  if (loading) return (
    <Card style={{ padding: 48, textAlign: "center" }}>
      <div style={{ width: 36, height: 36, border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.7s linear infinite" }} />
      <div style={{ color: "var(--text-muted)", fontSize: 14 }}>Fetching data from Google Sheets…</div>
    </Card>
  );

  if (error) return (
    <Card style={{ padding: 32, textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
      <div style={{ fontWeight: 700, color: "#ef4444", marginBottom: 6 }}>Failed to load sheet data</div>
      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{error}</div>
    </Card>
  );

  if (!data) return null;

  const { overallStats } = data;
  const totalServices  = filteredRows.length;
  const readyServices  = filteredRows.filter((r) => r.looker).length;
  const gapServices    = filteredRows.filter((r) => !r.looker).length;
  const uniqueCountries = new Set(filteredRows.map((r) => r.country)).size;
  const uniqueOperators = new Set(filteredRows.map((r) => r.operator)).size;

  const effCountryActive = drillCountry || (countryFilter !== "All" ? countryFilter : null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Page header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 20 }}>📈</span>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text)" }}>Data Report vs Source</h3>
            <a
              href={`https://docs.google.com/spreadsheets/d/1qYmd6wfX62OUjiJedPlmpUuuTaYScCescQjJV23Jk2E/edit`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none", background: "var(--accent-light)", borderRadius: 10, padding: "2px 8px", fontWeight: 600 }}
            >
              ↗ Source Sheet
            </a>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Looker Dashboard readiness per country & operator
            {data.fetchedAt && ` · fetched ${new Date(data.fetchedAt).toLocaleTimeString()}`}
          </div>
        </div>
      </div>

      {/* ── Overall stats banner ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10 }}>
        {/* Avg Completion */}
        <Card style={{ padding: "14px 16px", borderTop: `3px solid ${rateColor(overallStats.avgCompletionRate)}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 4 }}>Avg Completion</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: rateColor(overallStats.avgCompletionRate) }}>{overallStats.avgCompletionRate.toFixed(1)}%</div>
          <ProgressBar value={overallStats.avgCompletionRate} color={rateColor(overallStats.avgCompletionRate)} />
        </Card>
        {/* Data Gap */}
        <Card style={{ padding: "14px 16px", borderTop: "3px solid #dc2626" }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 4 }}>Data Gap</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#dc2626" }}>{overallStats.dataGap.toFixed(1)}%</div>
          <ProgressBar value={overallStats.dataGap} color="#dc2626" />
        </Card>
        {/* Totals */}
        <Card style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 4 }}>Services</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text)" }}>{totalServices}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            <span style={{ color: "#059669", fontWeight: 600 }}>{readyServices} ready</span>
            {" · "}
            <span style={{ color: "#dc2626", fontWeight: 600 }}>{gapServices} gap</span>
          </div>
        </Card>
        <Card style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 4 }}>Countries</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text)" }}>{uniqueCountries}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{uniqueOperators} operators</div>
        </Card>
      </div>

      {/* ── Filters ── */}
      <Card style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Filter:</span>

          {/* Country */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>🌍</span>
            <select
              value={drillCountry || countryFilter}
              onChange={(e) => { setDrillCountry(null); setCountry(e.target.value); setOperator("All"); }}
              style={{ padding: "7px 10px", background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)", cursor: "pointer", outline: "none", minWidth: 140 }}
            >
              {countries.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>

          {/* Operator */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>📡</span>
            <select
              value={operatorFilter}
              onChange={(e) => setOperator(e.target.value)}
              style={{ padding: "7px 10px", background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)", cursor: "pointer", outline: "none", minWidth: 140 }}
            >
              {operators.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>

          {/* Status */}
          <div style={{ display: "flex", gap: 4 }}>
            {(["All", "Ready", "Gap"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusF(s)}
                style={{
                  padding: "7px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                  background: statusFilter === s
                    ? (s === "Ready" ? "#059669" : s === "Gap" ? "#dc2626" : "var(--text)")
                    : "var(--surface)",
                  color: statusFilter === s ? "#fff" : "var(--text-muted)",
                  border: statusFilter === s ? "none" : "1px solid var(--border)",
                }}
              >
                {s === "Ready" ? "✓ Ready" : s === "Gap" ? "⚠ Gap" : "All"}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            type="text" placeholder="🔍 Search…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: "1 1 160px", minWidth: 0, padding: "7px 10px", background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)", outline: "none" }}
          />

          {/* Clear */}
          {(effCountryActive || operatorFilter !== "All" || statusFilter !== "All" || search) && (
            <button onClick={clearFilters} style={{ padding: "7px 12px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--text-muted)", cursor: "pointer", whiteSpace: "nowrap" }}>
              ✕ Clear
            </button>
          )}
        </div>

        {/* Drill-down active notice */}
        {effCountryActive && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--accent-light)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>
            <span>Showing:</span>
            <span style={{ background: "var(--accent)", color: "#fff", borderRadius: 10, padding: "1px 8px" }}>{effCountryActive}</span>
            {operatorFilter !== "All" && <span style={{ background: "var(--accent)", color: "#fff", borderRadius: 10, padding: "1px 8px" }}>{operatorFilter}</span>}
            <button onClick={clearFilters} style={{ marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer", fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>Clear ✕</button>
          </div>
        )}
      </Card>

      {/* ── Sub-view tabs ── */}
      <div style={{ display: "flex", gap: 6 }}>
        {([
          { id: "summary",   label: "Summary by Country",  icon: "🌍" },
          { id: "detail",    label: "Full Detail Table",   icon: "🔍" },
          { id: "mo-report", label: "MO Full Report",      icon: "📊" },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setSubView(t.id)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
              background: subView === t.id ? "var(--accent)" : "var(--surface)",
              color: subView === t.id ? "#fff" : "var(--text-muted)",
              border: subView === t.id ? "none" : "1px solid var(--border)",
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Summary view: country cards ── */}
      {subView === "summary" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredSummaries.length === 0 && (
            <Card style={{ padding: 32, textAlign: "center" }}>
              <div style={{ color: "var(--text-muted)", fontSize: 13 }}>No data matches the current filters.</div>
            </Card>
          )}
          {filteredSummaries
            .sort((a, b) => a.completionRate - b.completionRate)
            .map((summary) => {
              const svcForCountry = filteredRows.filter((r) => r.country === summary.country);
              return (
                <CountryCard
                  key={summary.country}
                  summary={summary}
                  services={svcForCountry}
                  onDrillDown={(c) => { setDrillCountry(c); setSubView("detail"); }}
                />
              );
            })}

          {/* Countries with services but no summary row */}
          {Array.from(new Set(filteredRows.map((r) => r.country)))
            .filter((c) => !filteredSummaries.find((s) => s.country === c))
            .map((country) => {
              const svcForCountry = filteredRows.filter((r) => r.country === country);
              const ready = svcForCountry.filter((r) => r.looker).length;
              const rate  = svcForCountry.length > 0 ? Math.round((ready / svcForCountry.length) * 100) : 0;
              const fakeSummary: CountrySummary = {
                country, total: svcForCountry.length, ready, completionRate: rate, comments: "", estTime: "",
              };
              return (
                <CountryCard
                  key={country}
                  summary={fakeSummary}
                  services={svcForCountry}
                  onDrillDown={(c) => { setDrillCountry(c); setSubView("detail"); }}
                />
              );
            })}
        </div>
      )}

      {/* ── Detail view: full table ── */}
      {subView === "detail" && (
        <Card style={{ overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Service Detail</span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{filteredRows.length} rows</span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 8, fontSize: 12 }}>
              <span style={{ color: "#059669", fontWeight: 600 }}>✓ {readyServices} ready</span>
              <span style={{ color: "#dc2626", fontWeight: 600 }}>⚠ {gapServices} gap</span>
            </span>
          </div>

          {filteredRows.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No rows match the current filters.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
                    {["Country","Operator","Service","Looker Status","Notes"].map((h) => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, i) => (
                    <tr
                      key={`${row.country}-${row.operator}-${row.service}-${i}`}
                      style={{ borderBottom: "1px solid var(--border)", background: row.looker ? "transparent" : "#fff5f5" }}
                    >
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <span style={{ background: "#ede9fe", color: "#4f46e5", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                          {row.country}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <span style={{ background: "#dbeafe", color: "#1d4ed8", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                          {row.operator}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", fontWeight: 600, fontSize: 13, color: "var(--text)", whiteSpace: "nowrap" }}>
                        {row.service}
                      </td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <StatusBadge ready={row.looker} notes={row.notes || undefined} />
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 12, color: "var(--text-muted)", maxWidth: 280, lineHeight: 1.4 }}>
                        {row.notes
                          ? <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{row.notes}</span>
                          : <span style={{ color: "var(--border2)" }}>—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ── Gap services callout (Looker views only) ── */}
      {subView !== "mo-report" && statusFilter !== "Ready" && gapServices > 0 && (
        <Card style={{ padding: "14px 16px", borderLeft: "4px solid #dc2626" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontWeight: 700, fontSize: 13 }}>
            <span>⚠️</span>
            <span>Services with Data Gaps ({gapServices})</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filteredRows.filter((r) => !r.looker).slice(0, 10).map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#fff5f5", border: "1px solid #fca5a5", borderRadius: 6, padding: "8px 12px" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#dc2626", flexShrink: 0 }}>⚠</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: r.notes ? 4 : 0 }}>
                    <span style={{ background: "#ede9fe", color: "#4f46e5", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>{r.country}</span>
                    <span style={{ background: "#dbeafe", color: "#1d4ed8", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>{r.operator}</span>
                    <span style={{ fontWeight: 600, fontSize: 12, color: "var(--text)" }}>{r.service}</span>
                  </div>
                  {r.notes && <div style={{ fontSize: 12, color: "#7f1d1d", lineHeight: 1.4 }}>{r.notes}</div>}
                </div>
              </div>
            ))}
            {filteredRows.filter((r) => !r.looker).length > 10 && (
              <button
                onClick={() => { setStatusF("Gap"); setSubView("detail"); }}
                style={{ padding: "8px 14px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--text-muted)", cursor: "pointer", textAlign: "center" }}
              >
                View all {filteredRows.filter((r) => !r.looker).length} gap services →
              </button>
            )}
          </div>
        </Card>
      )}

      {/* ══ MO Full Report view ══ */}
      {subView === "mo-report" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* MO summary stats */}
          {(() => {
            const moSummary   = data.moSummary || [];
            const totalDone   = moSummary.reduce((s, c) => s + c.statusDone,    0);
            const totalPending = moSummary.reduce((s, c) => s + c.statusNotDone, 0);
            const overallPct  = (totalDone + totalPending) > 0
              ? Math.round((totalDone / (totalDone + totalPending)) * 100) : 0;

            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10 }}>
                <Card style={{ padding: "14px 16px", borderTop: "3px solid #4f46e5" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 4 }}>MO Completion</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: overallPct >= 80 ? "#059669" : overallPct >= 50 ? "#d97706" : "#dc2626" }}>{overallPct}%</div>
                  <div style={{ height: 6, background: "var(--surface2)", borderRadius: 3, overflow: "hidden", marginTop: 4, border: "1px solid var(--border)" }}>
                    <div style={{ height: "100%", width: `${overallPct}%`, background: overallPct >= 80 ? "#059669" : "#d97706", borderRadius: 3 }} />
                  </div>
                </Card>
                <Card style={{ padding: "14px 16px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 4 }}>Total Services</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text)" }}>{filteredMoRows.length}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{new Set(filteredMoRows.map((r) => r.country)).size} countries</div>
                </Card>
                <Card style={{ padding: "14px 16px", borderTop: "3px solid #059669" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 4 }}>Done</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: "#059669" }}>{filteredMoRows.filter((r) => r.status.toUpperCase() === "DONE").length}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>reconciled</div>
                </Card>
                <Card style={{ padding: "14px 16px", borderTop: "3px solid #dc2626" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 4 }}>Pending</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: "#dc2626" }}>{filteredMoRows.filter((r) => r.status.toUpperCase() !== "DONE").length}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>needs review</div>
                </Card>
              </div>
            );
          })()}

          {/* MO Filters */}
          <Card style={{ padding: "12px 16px" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Filter:</span>

              {/* Country */}
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>🌍</span>
                <select
                  value={moCountry}
                  onChange={(e) => { setMoCountry(e.target.value); setMoOperator("All"); }}
                  style={{ padding: "7px 10px", background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)", cursor: "pointer", outline: "none", minWidth: 140 }}
                >
                  {moCountries.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>

              {/* Operator */}
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>📡</span>
                <select
                  value={moOperator}
                  onChange={(e) => setMoOperator(e.target.value)}
                  style={{ padding: "7px 10px", background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)", cursor: "pointer", outline: "none", minWidth: 140 }}
                >
                  {moOperators.map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>

              {/* Status */}
              <div style={{ display: "flex", gap: 4 }}>
                {(["All", "Done", "Pending"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setMoStatus(s)}
                    style={{
                      padding: "7px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                      background: moStatus === s
                        ? (s === "Done" ? "#059669" : s === "Pending" ? "#dc2626" : "var(--text)")
                        : "var(--surface)",
                      color: moStatus === s ? "#fff" : "var(--text-muted)",
                      border: moStatus === s ? "none" : "1px solid var(--border)",
                    }}
                  >
                    {s === "Done" ? "✓ Done" : s === "Pending" ? "⏳ Pending" : "All"}
                  </button>
                ))}
              </div>

              {/* Search */}
              <input
                type="text" placeholder="🔍 Search country, operator, service…"
                value={moSearch} onChange={(e) => setMoSearch(e.target.value)}
                style={{ flex: "1 1 200px", minWidth: 0, padding: "7px 10px", background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)", outline: "none" }}
              />

              {(moCountry !== "All" || moOperator !== "All" || moStatus !== "All" || moSearch) && (
                <button onClick={clearMoFilters} style={{ padding: "7px 12px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--text-muted)", cursor: "pointer", whiteSpace: "nowrap" }}>
                  ✕ Clear
                </button>
              )}
            </div>
          </Card>

          {/* Country summary cards */}
          {moCountry === "All" && moOperator === "All" && moStatus === "All" && !moSearch && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Country Overview</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 8 }}>
                {(data.moSummary || []).sort((a, b) => a.completionPct - b.completionPct).map((s) => {
                  const pctColor = s.completionPct >= 90 ? "#059669" : s.completionPct >= 60 ? "#d97706" : "#dc2626";
                  return (
                    <Card key={s.country} style={{ padding: "12px 14px", cursor: "pointer" }} >
                      <div
                        onClick={() => { setMoCountry(s.country); }}
                        style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}
                      >
                        <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", flex: 1 }}>{s.country}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: pctColor }}>{s.completionPct.toFixed(0)}%</span>
                        {s.pic && <span style={{ fontSize: 10, color: "var(--text-muted)", background: "var(--surface2)", borderRadius: 10, padding: "1px 6px" }}>{s.pic}</span>}
                      </div>
                      <div style={{ height: 6, background: "var(--surface2)", borderRadius: 3, overflow: "hidden", marginBottom: 6, border: "1px solid var(--border)" }}>
                        <div style={{ height: "100%", width: `${s.completionPct}%`, background: pctColor, borderRadius: 3 }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)" }}>
                        <span>
                          <span style={{ color: "#059669", fontWeight: 600 }}>✓ {s.statusDone}</span>
                          {" · "}
                          <span style={{ color: "#dc2626", fontWeight: 600 }}>⏳ {s.statusNotDone}</span>
                        </span>
                        <span style={{ fontWeight: 600, color: "var(--text)" }}>{s.revenue}</span>
                      </div>
                      {s.avgMoDiff && (
                        <div style={{ marginTop: 4, fontSize: 10, color: Math.abs(parseFloat(s.avgMoDiff)) > 10 ? "#dc2626" : "var(--text-muted)" }}>
                          Avg MO diff: {s.avgMoDiff}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Full MO data table */}
          <Card style={{ overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>MO Reconciliation Table</span>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{filteredMoRows.length} rows</span>
              <span style={{ marginLeft: "auto", display: "flex", gap: 10, fontSize: 12 }}>
                <span style={{ color: "#059669", fontWeight: 600 }}>✓ {filteredMoRows.filter((r) => r.status.toUpperCase() === "DONE").length} done</span>
                <span style={{ color: "#dc2626", fontWeight: 600 }}>⏳ {filteredMoRows.filter((r) => r.status.toUpperCase() !== "DONE").length} pending</span>
              </span>
            </div>

            {filteredMoRows.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No rows match the current filters.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)", position: "sticky", top: 0 }}>
                      {["#","Country","Operator","Service","MO Report","MO Source","Diff","Diff %","Revenue","DB","PIC DB","BA","Status","Notes"].map((h) => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMoRows.map((row, idx) => {
                      const isDone    = row.status.toUpperCase() === "DONE";
                      const diffNum   = parseFloat((row.diffPct || "0").replace(/%/g, "").trim()) || 0;
                      const absDiff   = Math.abs(diffNum);
                      const diffColor = absDiff === 0 ? "#059669" : absDiff <= 5 ? "#4f46e5" : absDiff <= 20 ? "#d97706" : "#dc2626";
                      const rowBg     = isDone ? "transparent" : "#fffbf0";

                      return (
                        <tr key={idx} style={{ borderBottom: "1px solid var(--border)", background: rowBg }}>
                          <td style={{ padding: "9px 12px", fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{idx + 1}</td>
                          <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
                            <span style={{ background: "#ede9fe", color: "#4f46e5", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{row.country}</span>
                          </td>
                          <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
                            <span style={{ background: "#dbeafe", color: "#1d4ed8", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{row.operator}</span>
                          </td>
                          <td style={{ padding: "9px 12px", fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>{row.service}</td>
                          <td style={{ padding: "9px 12px", color: "var(--text)", whiteSpace: "nowrap", textAlign: "right", fontFamily: "monospace" }}>{row.moReport || "—"}</td>
                          <td style={{ padding: "9px 12px", color: "var(--text)", whiteSpace: "nowrap", textAlign: "right", fontFamily: "monospace" }}>{row.moSource || "—"}</td>
                          <td style={{ padding: "9px 12px", whiteSpace: "nowrap", textAlign: "right", fontFamily: "monospace", color: row.differences && row.differences !== "0" ? "#dc2626" : "#059669", fontWeight: row.differences && row.differences !== "0" ? 700 : 400 }}>
                            {row.differences || "0"}
                          </td>
                          <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
                            <span style={{ background: diffColor + "18", color: diffColor, border: `1px solid ${diffColor}40`, borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                              {row.diffPct || "0%"}
                            </span>
                          </td>
                          <td style={{ padding: "9px 12px", color: "var(--text)", whiteSpace: "nowrap", fontWeight: 600 }}>{row.revenue || "—"}</td>
                          <td style={{ padding: "9px 12px", fontSize: 11, color: "var(--text-muted)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.db}>{row.db || "—"}</td>
                          <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
                            {row.picDb
                              ? <span style={{ background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0", borderRadius: 10, padding: "2px 7px", fontSize: 11, fontWeight: 600 }}>{row.picDb}</span>
                              : <span style={{ color: "var(--border2)" }}>—</span>
                            }
                          </td>
                          <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
                            {row.ba
                              ? <span style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: 10, padding: "2px 7px", fontSize: 11, fontWeight: 600 }}>{row.ba}</span>
                              : <span style={{ color: "var(--border2)" }}>—</span>
                            }
                          </td>
                          <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
                            {isDone
                              ? <span style={{ background: "#d1fae5", color: "#059669", border: "1px solid #6ee7b7", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>✓ Done</span>
                              : <span style={{ background: "#fff7ed", color: "#ea580c", border: "1px solid #fdba74", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>⏳ Pending</span>
                            }
                          </td>
                          <td style={{ padding: "9px 12px", fontSize: 11, color: "var(--text-muted)", maxWidth: 220, lineHeight: 1.4 }}>
                            {row.notes
                              ? <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }} title={row.notes}>{row.notes}</span>
                              : <span style={{ color: "var(--border2)" }}>—</span>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
