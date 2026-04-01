import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export interface KPIRow {
  name: string;
  target: string;
  weeks: Array<{ week: string; result: string; status: string; desc: string }>;
  latestResult: string;
  latestStatus: string;
  latestWeek: string;
}

export interface WeeklyHighlight {
  week: string; // e.g. "W1"
  wins: string[];
  issues: string[];
  priorities: string[];
}

function splitCSVRow(row: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { result.push(current); current = ""; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

// Parse the Highlights / Lowlights / Priorities section (left columns of sheet)
function parseHighlights(lines: string[]): WeeklyHighlight[] {
  // Row 0 = section title row: "🔝Highlights (Wins)" at col 0
  // Row 1 = header row: NO,W1,W2,...,W9,NO,,W1,...W9,...,NO,...W9
  // Row 2 = sub-header (empty for these sections)
  // Row 3..8 = data rows (row numbers 1-6)

  // Find header row with "NO" at col 0 and "W1" at col 1
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const cells = splitCSVRow(lines[i]);
    if (cells[0]?.trim() === "NO" && cells[1]?.trim() === "W1") {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const header = splitCSVRow(lines[headerIdx]);

  // Find column ranges for each section by locating "NO" markers
  // Highlights: cols 1-9 (after first NO at col 0)
  // Lowlights:  find second NO, then its W1-W9
  // Priorities: find third NO, then its W columns
  const noPositions: number[] = [];
  for (let c = 0; c < header.length; c++) {
    if (header[c]?.trim() === "NO") noPositions.push(c);
  }

  // Section boundaries: [start_of_W_cols, end_exclusive]
  // Highlights: noPositions[0] + 1 to noPositions[1]
  // Lowlights:  noPositions[1] + 2 to noPositions[2] (there's an empty col after NO)
  // Priorities: noPositions[2] + 1 to noPositions[3] (or header end)
  const hlStart  = noPositions[0] !== undefined ? noPositions[0] + 1 : 1;
  const hlEnd    = noPositions[1] !== undefined ? noPositions[1]     : 10;
  const llStart  = noPositions[1] !== undefined ? noPositions[1] + 2 : 12; // skip NO + empty col
  const llEnd    = noPositions[2] !== undefined ? noPositions[2]     : 21;
  const prStart  = noPositions[2] !== undefined ? noPositions[2] + 1 : 23;
  const prEnd    = noPositions[3] !== undefined ? noPositions[3]     : header.length;

  // Week labels for highlights (col hlStart to hlEnd-1)
  const weekLabels = header.slice(hlStart, hlEnd).map((h) => h.trim()).filter(Boolean);

  // Data rows start at headerIdx + 2 (skip sub-header)
  const dataStart = headerIdx + 2;
  const maxRows = 9; // at most 9 data rows

  // Collect per-week items across all data rows
  const winsMap: Record<string, string[]>     = {};
  const issuesMap: Record<string, string[]>   = {};
  const priMap: Record<string, string[]>      = {};

  for (let i = dataStart; i < Math.min(dataStart + maxRows, lines.length); i++) {
    const cells = splitCSVRow(lines[i]);
    const rowNum = cells[0]?.trim();
    if (!rowNum || !/^\d+$/.test(rowNum)) continue; // stop if no row number

    // Highlights (wins)
    for (let c = hlStart; c < hlEnd && c < cells.length; c++) {
      const weekLabel = weekLabels[c - hlStart];
      if (!weekLabel) continue;
      const val = cells[c]?.trim();
      if (val) {
        if (!winsMap[weekLabel]) winsMap[weekLabel] = [];
        winsMap[weekLabel].push(val);
      }
    }

    // Lowlights (issues)
    for (let c = llStart; c < llEnd && c < cells.length; c++) {
      const wIdx = c - llStart;
      const weekLabel = weekLabels[wIdx];
      if (!weekLabel) continue;
      const val = cells[c]?.trim();
      if (val) {
        if (!issuesMap[weekLabel]) issuesMap[weekLabel] = [];
        issuesMap[weekLabel].push(val);
      }
    }

    // Priorities — header has W1,,W2,,W3,... (non-empty label marks a week start)
    let wk = -1;
    for (let c = prStart; c < prEnd && c < cells.length; c++) {
      const hLabel = header[c]?.trim();
      if (hLabel && /^W\d+$/.test(hLabel)) wk++;
      const weekLabel = weekLabels[wk];
      if (!weekLabel) continue;
      const val = cells[c]?.trim();
      if (val) {
        if (!priMap[weekLabel]) priMap[weekLabel] = [];
        priMap[weekLabel].push(val);
      }
    }
  }

  return weekLabels.map((week) => ({
    week,
    wins:       winsMap[week]   || [],
    issues:     issuesMap[week] || [],
    priorities: priMap[week]    || [],
  })).filter((w) => w.wins.length || w.issues.length || w.priorities.length);
}

function parseKPICSV(csv: string): { kpis: KPIRow[]; highlights: WeeklyHighlight[] } {
  const lines = csv.split("\n").map((l) => l.trimEnd());

  // ── KPI section ──
  let headerRowIdx = -1;
  let kpiColStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const cells = splitCSVRow(lines[i]);
    const idx = cells.findIndex((c) => c.trim() === "KPI Name");
    if (idx !== -1) { headerRowIdx = i; kpiColStart = idx; break; }
  }

  const kpis: KPIRow[] = [];
  if (headerRowIdx !== -1) {
    const headerCells = splitCSVRow(lines[headerRowIdx]);
    const weekLabels: string[] = [];
    for (let c = kpiColStart + 2; c < headerCells.length; c += 3) {
      const label = headerCells[c].trim();
      if (label) weekLabels.push(label);
      else if (weekLabels.length > 0) weekLabels.push(`W${weekLabels.length + 1}`);
    }

    const dataStart = headerRowIdx + 2;
    for (let i = dataStart; i < lines.length; i++) {
      const cells = splitCSVRow(lines[i]);
      const name = cells[kpiColStart]?.trim();
      if (!name || name === "KPI Name") continue;

      const target = cells[kpiColStart + 1]?.trim() || "";
      const weeks: KPIRow["weeks"] = [];
      for (let w = 0; w < weekLabels.length; w++) {
        const base = kpiColStart + 2 + w * 3;
        weeks.push({
          week:   weekLabels[w],
          result: cells[base]?.trim()     || "",
          status: cells[base + 1]?.trim() || "",
          desc:   cells[base + 2]?.trim() || "",
        });
      }

      let latestResult = "", latestStatus = "", latestWeek = "";
      for (let w = weeks.length - 1; w >= 0; w--) {
        if (weeks[w].result && weeks[w].result !== "#ERROR!" && weeks[w].result !== "↑/↓") {
          latestResult = weeks[w].result;
          latestStatus = weeks[w].status;
          latestWeek   = weeks[w].week;
          break;
        }
      }
      kpis.push({ name, target, weeks, latestResult, latestStatus, latestWeek });
    }
  }

  // ── Highlights section ──
  const highlights = parseHighlights(lines);

  return { kpis, highlights };
}

export async function GET() {
  try {
    const sheetId = "1ZdkkVUyr1B8xoFkNwx0eOzRMR6xgGJo8u7GtiG0eccM";
    const gid     = "955189073";
    const url     = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`Google Sheets fetch failed: ${res.status}`);
    const csv = await res.text();
    const { kpis, highlights } = parseKPICSV(csv);

    return NextResponse.json({ kpis, highlights, fetchedAt: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, kpis: [], highlights: [] }, { status: 500 });
  }
}
