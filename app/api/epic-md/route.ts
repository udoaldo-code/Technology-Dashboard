import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const JIRA_BASE_URL  = process.env.JIRA_BASE_URL  || "https://linkit360.atlassian.net";
const JIRA_EMAIL     = process.env.JIRA_EMAIL     || "";
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN || "";

// Custom field IDs (discovered via /rest/api/3/field)
const CF_MANDAYS      = "customfield_10434"; // Mandays (number)
const CF_WORKING_DAYS = "customfield_10048"; // Working Days (number)
const CF_START_DATE   = "customfield_10015"; // Start date
const CF_NEW_START    = "customfield_10578"; // New Start Date
const CF_TARGET_START = "customfield_10028"; // Target start

function authHeaders() {
  const token = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
  return { Authorization: `Basic ${token}`, Accept: "application/json", "Content-Type": "application/json" };
}

// ── Working-days calculation (Mon–Fri, no public-holiday awareness) ───────────
function workingDaysBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso);
  const end   = new Date(endIso);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  // Ensure start ≤ end
  if (start > end) return 0;
  let count = 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const fin = new Date(end);
  fin.setHours(0, 0, 0, 0);
  while (cur <= fin) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++; // Mon–Fri
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(count, 1); // at least 1 day
}

// ── Resolve man-days for a raw Jira issue ─────────────────────────────────────
type MDSource = "mandays_field" | "working_days_field" | "date_range" | "default";

function resolveTaskMD(fields: any): { md: number; source: MDSource; startDate: string | null; duedate: string | null } {
  // Priority 1: explicit Mandays field
  if (fields[CF_MANDAYS] != null && Number(fields[CF_MANDAYS]) > 0) {
    return { md: Number(fields[CF_MANDAYS]), source: "mandays_field", startDate: fields[CF_START_DATE] || fields[CF_NEW_START] || fields[CF_TARGET_START] || null, duedate: fields.duedate || null };
  }
  // Priority 2: Working Days field
  if (fields[CF_WORKING_DAYS] != null && Number(fields[CF_WORKING_DAYS]) > 0) {
    return { md: Number(fields[CF_WORKING_DAYS]), source: "working_days_field", startDate: fields[CF_START_DATE] || fields[CF_NEW_START] || fields[CF_TARGET_START] || null, duedate: fields.duedate || null };
  }
  // Priority 3: calculate from start → due date
  const startDate = fields[CF_START_DATE] || fields[CF_NEW_START] || fields[CF_TARGET_START] || null;
  const duedate   = fields.duedate || null;
  if (startDate && duedate) {
    return { md: workingDaysBetween(startDate, duedate), source: "date_range", startDate, duedate };
  }
  // Priority 4: just due date – today
  if (duedate) {
    const today = new Date().toISOString().slice(0, 10);
    return { md: workingDaysBetween(today, duedate), source: "date_range", startDate: today, duedate };
  }
  return { md: 0, source: "default", startDate: null, duedate: null };
}

// ── JQL search ────────────────────────────────────────────────────────────────
async function searchJQL(jql: string, fields: string[]): Promise<any[]> {
  const url = `${JIRA_BASE_URL}/rest/api/3/search/jql`;
  const all: any[] = [];
  let nextPageToken: string | undefined;
  let page = 0;
  do {
    const body: Record<string, any> = { jql, maxResults: 200, fields };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const res = await fetch(url, { method: "POST", headers: authHeaders(), body: JSON.stringify(body), next: { revalidate: 0 } });
    if (!res.ok) throw new Error(`JQL error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    all.push(...(data.issues || []));
    nextPageToken = data.nextPageToken;
    page++;
  } while (nextPageToken && page < 15);
  return all;
}

// ── Jira group membership ─────────────────────────────────────────────────────
async function getGroupMembers(groupName: string): Promise<Set<string>> {
  const names = new Set<string>();
  let startAt = 0;
  const maxResults = 50;
  while (true) {
    const res = await fetch(
      `${JIRA_BASE_URL}/rest/api/3/group/member?groupname=${encodeURIComponent(groupName)}&maxResults=${maxResults}&startAt=${startAt}`,
      { headers: authHeaders(), next: { revalidate: 0 } }
    );
    if (!res.ok) break;
    const data = await res.json();
    for (const m of data.values ?? []) {
      if (m.displayName) names.add(m.displayName);
    }
    if (data.isLast || (data.values?.length ?? 0) < maxResults) break;
    startAt += maxResults;
  }
  return names;
}

// ── Board / sprint helpers ────────────────────────────────────────────────────
async function getBoardId(projectKey: string): Promise<number | null> {
  const res = await fetch(
    `${JIRA_BASE_URL}/rest/agile/1.0/board?projectKeyOrId=${projectKey}&maxResults=5`,
    { headers: authHeaders(), next: { revalidate: 0 } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.values?.[0]?.id ?? null;
}

async function getActiveSprint(boardId: number): Promise<{ startDate: string; endDate: string; name: string } | null> {
  const res = await fetch(
    `${JIRA_BASE_URL}/rest/agile/1.0/board/${boardId}/sprint?state=active&maxResults=1`,
    { headers: authHeaders(), next: { revalidate: 0 } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.values?.[0] ?? null;
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface EpicTask {
  key: string;
  summary: string;
  status: string;
  issuetype: string;
  assignee: string | null;
  startDate: string | null;
  duedate: string | null;
  manDays: number;
  mdSource: "mandays_field" | "working_days_field" | "date_range" | "default";
}

// ── Hour-based velocity constants ─────────────────────────────────────────────
export const HOURS_PER_MD          = 8;    // 1 MD = 8 hours
export const EFFECTIVE_HOURS_PER_DAY = 5.6; // 8h × 0.7 availability factor

export interface EpicMD {
  key: string;
  summary: string;
  status: string;
  priority: string;
  assignee: string | null;
  duedate: string | null;
  startDate: string | null;
  epicManDays: number;            // MD from the epic-level field (if any)
  epicMDSource: "mandays_field" | "working_days_field" | "date_range" | "default";
  tasks: EpicTask[];
  totalTasks: number;
  doneTasks: number;
  totalMD: number;                // sum of task MDs (preferred) or epic MD
  totalHours: number;             // totalMD × 8
  doneMD: number;
  remainingMD: number;
  remainingHours: number;         // remainingMD × 8
  devCount: number;               // unique assignees in this epic (display only)
  assignees: string[];            // list of unique assignee names in this epic
  completionPct: number;
  estDaysToComplete: number | null; // remainingHours / (5.6 × totalDevCount)
}

export interface EpicMDSummary {
  projectKeys: string[];
  sprintName: string;
  sprintElapsedDays: number;
  totalEpics: number;
  totalMD: number;
  doneMD: number;
  remainingMD: number;
  remainingHours: number;         // remainingMD × 8 — basis for all est. days
  allAssignees: string[];         // sorted unique developer names across all epics
  totalDevCount: number;
  overallPct: number;
  estDaysAllEpics: number | null; // remainingHours / (5.6 × totalDevCount)
  epics: EpicMD[];
  fetchedAt: string;
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectsParam = searchParams.get("projects") || searchParams.get("project") || "IV";
    const projectKeys   = projectsParam.split(",").map((k) => k.trim()).filter(Boolean);

    const projectClause = projectKeys.length === 1
      ? `project = "${projectKeys[0]}"`
      : `project in (${projectKeys.map((k) => `"${k}"`).join(",")})`;

    const taskFields = [
      "summary", "status", "issuetype", "assignee", "parent", "duedate",
      CF_MANDAYS, CF_WORKING_DAYS, CF_START_DATE, CF_NEW_START, CF_TARGET_START,
    ];

    const epicFields = [
      "summary", "status", "priority", "assignee", "duedate",
      CF_MANDAYS, CF_WORKING_DAYS, CF_START_DATE, CF_NEW_START, CF_TARGET_START,
    ];

    const [epicIssues, taskIssues, developerGroup] = await Promise.all([
      searchJQL(
        `${projectClause} AND issuetype = Epic AND status != "Dropped" AND created >= "2026-01-01" ORDER BY duedate ASC`,
        epicFields
      ),
      searchJQL(
        `${projectClause} AND issuetype != Epic AND created >= "2026-01-01" ORDER BY parent ASC`,
        taskFields
      ),
      getGroupMembers("developer"),
    ]);

    // Sprint elapsed days
    let sprintName = "";
    let sprintElapsedDays = 0;
    try {
      const boardId = await getBoardId(projectKeys[0]);
      if (boardId) {
        const sprint = await getActiveSprint(boardId);
        if (sprint) {
          sprintName = sprint.name;
          const now   = new Date();
          const start = new Date(sprint.startDate);
          const end   = new Date(sprint.endDate);
          const totalSprintDays = Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
          sprintElapsedDays = Math.max(1, Math.min(
            Math.ceil((now.getTime() - start.getTime()) / 86_400_000),
            totalSprintDays
          ));
        }
      }
    } catch (_) { /* non-critical */ }
    if (sprintElapsedDays === 0) sprintElapsedDays = 1;

    // Map tasks by parent epic key
    const tasksByEpic: Record<string, EpicTask[]> = {};
    for (const i of taskIssues) {
      const epicKey = i.fields.parent?.key;
      if (!epicKey) continue;
      if (!tasksByEpic[epicKey]) tasksByEpic[epicKey] = [];
      const { md, source, startDate, duedate } = resolveTaskMD(i.fields);
      tasksByEpic[epicKey].push({
        key:       i.key,
        summary:   i.fields.summary || "",
        status:    i.fields.status?.name || "Unknown",
        issuetype: i.fields.issuetype?.name || "Task",
        assignee:  i.fields.assignee?.displayName || null,
        startDate,
        duedate,
        manDays: md,
        mdSource: source,
      });
    }

    // Pre-compute global unique assignees filtered to "developer" group members only
    const allAssigneesRaw = Array.from(
      new Set(taskIssues.map((i: any) => i.fields.assignee?.displayName).filter(Boolean))
    ) as string[];
    // Only count assignees who are in the Jira "developer" group
    const allAssignees = allAssigneesRaw
      .filter((name) => developerGroup.size === 0 || developerGroup.has(name))
      .sort();
    const totalDevCount = Math.max(allAssignees.length, 1);

    // Build per-epic rows
    const epics: EpicMD[] = epicIssues.map((i: any) => {
      const key   = i.key;
      const tasks = tasksByEpic[key] || [];

      // Epic-level man-days (used as fallback if no tasks)
      const { md: epicMD, source: epicMDSource, startDate: epicStart } = resolveTaskMD(i.fields);

      // Prefer sum of task MDs; fall back to epic-level MD
      const totalMD = tasks.length > 0
        ? tasks.reduce((s, t) => s + t.manDays, 0)
        : epicMD;
      const doneMD  = tasks.filter((t) => t.status === "Done").reduce((s, t) => s + t.manDays, 0);
      const remainingMD = totalMD - doneMD;
      const doneTasks   = tasks.filter((t) => t.status === "Done").length;
      const completionPct = totalMD > 0
        ? Math.round((doneMD / totalMD) * 100)
        : tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0;

      const assignees = Array.from(
        new Set(tasks.map((t) => t.assignee).filter(Boolean))
      )
        .filter((name) => developerGroup.size === 0 || developerGroup.has(name as string))
        .sort() as string[];
      const devCount = assignees.length;

      const totalHours    = Math.round(totalMD * HOURS_PER_MD * 10) / 10;
      const remainingHours = Math.round(remainingMD * HOURS_PER_MD * 10) / 10;
      // estDays uses global totalDevCount (full team capacity)
      const estDaysToComplete = remainingMD === 0
        ? 0
        : Math.ceil(remainingHours / (EFFECTIVE_HOURS_PER_DAY * totalDevCount));

      return {
        key,
        summary:   i.fields.summary || "",
        status:    i.fields.status?.name || "Unknown",
        priority:  i.fields.priority?.name || "Medium",
        assignee:  i.fields.assignee?.displayName || null,
        duedate:   i.fields.duedate || null,
        startDate: epicStart || i.fields[CF_START_DATE] || i.fields[CF_NEW_START] || null,
        epicManDays: epicMD,
        epicMDSource,
        tasks,
        totalTasks: tasks.length,
        doneTasks,
        totalMD,
        totalHours,
        doneMD,
        remainingMD,
        remainingHours,
        devCount,
        assignees,
        completionPct,
        estDaysToComplete,
      };
    });

    const totalMD        = epics.reduce((s, e) => s + e.totalMD, 0);
    const doneMD         = epics.reduce((s, e) => s + e.doneMD, 0);
    const remainingMD    = totalMD - doneMD;
    // Only remaining (undone) hours drive the estimation — done tasks are excluded
    const remainingHours = Math.round(remainingMD * HOURS_PER_MD * 10) / 10;
    const overallPct     = totalMD > 0 ? Math.round((doneMD / totalMD) * 100) : 0;

    // Est. days = remaining hours / (effective hours per day × total developers)
    const estDaysAllEpics = remainingMD === 0
      ? 0
      : Math.ceil(remainingHours / (EFFECTIVE_HOURS_PER_DAY * totalDevCount));

    const payload: EpicMDSummary = {
      projectKeys, sprintName, sprintElapsedDays,
      totalEpics: epics.length,
      totalMD, doneMD, remainingMD, remainingHours,
      allAssignees, totalDevCount, overallPct,
      estDaysAllEpics,
      epics,
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("Epic MD error:", error);
    return NextResponse.json({ error: error.message, epics: [] }, { status: 500 });
  }
}
