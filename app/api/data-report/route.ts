import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 1800; // 30 min cache

const SHEET_ID      = "1qYmd6wfX62OUjiJedPlmpUuuTaYScCescQjJV23Jk2E";
const CSV_URL_S1    = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
const CSV_URL_S2    = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=64462507`;

// ─── Robust CSV parser (handles quoted / multi-line fields) ───────────────────
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch   = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"')            { inQuotes = false; }
      else                            { field += ch; }
    } else {
      if (ch === '"')                 { inQuotes = true; }
      else if (ch === ",")            { row.push(field.trim()); field = ""; }
      else if (ch === "\r" && next === "\n") {
        i++;
        row.push(field.trim()); field = "";
        rows.push(row); row = [];
      } else if (ch === "\n") {
        row.push(field.trim()); field = "";
        rows.push(row); row = [];
      } else { field += ch; }
    }
  }
  if (field || row.length > 0) { row.push(field.trim()); rows.push(row); }
  return rows;
}

function pct(s: string): number {
  return parseFloat((s || "").replace(/%/g, "").trim()) || 0;
}

// ─── Sheet 1 parser (Looker dashboard readiness) ──────────────────────────────
function parseSheet1(rows: string[][]) {
  const serviceRows: {
    country: string; operator: string; service: string;
    looker: boolean; notes: string;
  }[] = [];
  const summaryMap: Record<string, {
    country: string; total: number; ready: number;
    completionRate: number; comments: string; estTime: string;
  }> = {};
  let avgCompletionRate = 0;
  let dataGap           = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r[0]?.trim()) {
      serviceRows.push({
        country:  r[0].trim().toUpperCase(),
        operator: (r[1] || "").trim().toUpperCase(),
        service:  (r[2] || "").trim().toUpperCase(),
        looker:   (r[3] || "").trim().toUpperCase() === "TRUE",
        notes:    (r[4] || "").trim(),
      });
    }
    if (r[8]?.trim()) {
      const country = r[8].trim().toUpperCase();
      summaryMap[country] = {
        country,
        total:          parseInt(r[9]  || "0", 10) || 0,
        ready:          parseInt(r[10] || "0", 10) || 0,
        completionRate: pct(r[11] || "0"),
        comments:       (r[12] || "").trim(),
        estTime:        (r[13] || "").trim(),
      };
    }
  }

  const countrySummary = Object.values(summaryMap).filter((s) => s.country);

  // Completion rate = average of all country completion rates
  // Data gap = 100 - completion rate
  if (countrySummary.length > 0) {
    avgCompletionRate = countrySummary.reduce((sum, c) => sum + c.completionRate, 0) / countrySummary.length;
    dataGap           = 100 - avgCompletionRate;
  }

  return {
    serviceRows,
    countrySummary: countrySummary.sort((a, b) => a.completionRate - b.completionRate),
    overallStats: { avgCompletionRate, dataGap },
  };
}

// ─── Sheet 2 parser (MO reconciliation report) ───────────────────────────────
export interface MoRow {
  country: string; operator: string; service: string;
  moReport: string; moSource: string;
  differences: string; diffPct: string;
  revenue: string; db: string;
  picDb: string; ba: string;
  status: string; notes: string;
}
export interface MoCountrySummary {
  country: string; revenue: string;
  avgMoDiff: string;
  statusDone: number; statusNotDone: number;
  completionPct: number; pic: string;
}

function parseSheet2(rows: string[][]): { moRows: MoRow[]; moSummary: MoCountrySummary[] } {
  const moRows: MoRow[] = [];
  const summaryMap: Record<string, MoCountrySummary> = {};
  let currentCountry = "";

  for (let i = 0; i < rows.length; i++) {
    const r    = rows[i];
    const col0 = (r[0] || "").trim();

    // ── Right section: columns 14-20 (country MO summary) ─────────────────
    const rCol14 = (r[14] || "").trim();
    if (rCol14 && rCol14 !== "Country") {
      summaryMap[rCol14.toUpperCase()] = {
        country:       rCol14.toUpperCase(),
        revenue:       (r[15] || "").trim(),
        avgMoDiff:     (r[16] || "").trim(),
        statusDone:    parseInt(r[17] || "0", 10) || 0,
        statusNotDone: parseInt(r[18] || "0", 10) || 0,
        completionPct: pct(r[19] || "0"),
        pic:           (r[20] || "").trim(),
      };
    }

    // ── Left section state machine ─────────────────────────────────────────
    if (!col0) continue;

    // Column header rows — identify by checking if col0 is "Operator"
    if (col0 === "Operator") continue;

    // Total rows
    if (col0.toLowerCase() === "total") continue;

    // Country section header: col0 has value, col1 & col2 & col3 are all empty
    const col1 = (r[1] || "").trim();
    const col2 = (r[2] || "").trim();
    const col3 = (r[3] || "").trim();
    if (col0 && !col1 && !col2 && !col3) {
      currentCountry = col0.toUpperCase();
      continue;
    }

    // Data rows
    if (currentCountry) {
      moRows.push({
        country:     currentCountry,
        operator:    col0,
        service:     col1,
        moReport:    col2,
        moSource:    col3,
        differences: (r[4] || "").trim(),
        diffPct:     (r[5] || "").trim(),
        revenue:     (r[6] || "").trim(),
        db:          (r[7] || "").trim(),
        picDb:       (r[8] || "").trim(),
        ba:          (r[9] || "").trim(),
        status:      (r[10] || "").trim(),
        notes:       (r[11] || "").trim(),
      });
    }
  }

  return {
    moRows,
    moSummary: Object.values(summaryMap).sort((a, b) => a.completionPct - b.completionPct),
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const [res1, res2] = await Promise.all([
      fetch(CSV_URL_S1, { redirect: "follow", next: { revalidate: 1800 } }),
      fetch(CSV_URL_S2, { redirect: "follow", next: { revalidate: 1800 } }),
    ]);
    if (!res1.ok) throw new Error(`Sheet 1 fetch error ${res1.status}`);
    if (!res2.ok) throw new Error(`Sheet 2 fetch error ${res2.status}`);

    const [text1, text2] = await Promise.all([res1.text(), res2.text()]);

    const { serviceRows, countrySummary, overallStats } = parseSheet1(parseCSV(text1));
    const { moRows, moSummary }                         = parseSheet2(parseCSV(text2));

    return NextResponse.json({
      serviceRows, countrySummary, overallStats,
      moRows, moSummary,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
