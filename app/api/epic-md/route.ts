import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const JIRA_BASE_URL  = process.env.JIRA_BASE_URL  || "https://linkit360.atlassian.net";
const JIRA_EMAIL     = process.env.JIRA_EMAIL     || "";
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN || "";

function authHeaders() {
  const token = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
  return { Authorization: `Basic ${token}`, Accept: "application/json", "Content-Type": "application/json" };
}

// ── JQL search (POST, cursor-based) ──────────────────────────────────────────
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

// ── Board / sprint helpers (to derive elapsed days for throughput) ────────────
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
  points: number | null;   // story points → man-days (1 SP = 1 MD)
}

export interface EpicMD {
  key: string;
  summary: string;
  status: string;
  priority: string;
  assignee: string | null;
  duedate: string | null;
  tasks: EpicTask[];
  totalTasks: number;
  doneTasks: number;
  // man-days
  totalMD: number;
  doneMD: number;
  remainingMD: number;
  completionPct: number;
  // estimate
  estDaysToComplete: number | null;
}

export interface EpicMDReport {
  projectKeys: string[];
  sprintName: string;
  sprintElapsedDays: number;
  // totals
  totalEpics: number;
  totalMD: number;
  doneMD: number;
  remainingMD: number;
  overallPct: number;
  // team throughput
  teamDailyMD: number | null;    // MD/day based on sprint velocity
  mdUnit: "SP" | "tasks";
  // project estimate
  estDaysAllEpics: number | null;
  // per-epic rows
  epics: EpicMD[];
  fetchedAt: string;
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectsParam = searchParams.get("projects") || searchParams.get("project") || "IV";
    const projectKeys   = projectsParam.split(",").map((k) => k.trim()).filter(Boolean);

    // Fetch epics (2026) for all selected projects in parallel
    const projectClause = projectKeys.length === 1
      ? `project = "${projectKeys[0]}"`
      : `project in (${projectKeys.map((k) => `"${k}"`).join(",")})`;

    const [epicIssues, taskIssues] = await Promise.all([
      searchJQL(
        `${projectClause} AND issuetype = Epic AND created >= "2026-01-01" ORDER BY duedate ASC`,
        ["summary", "status", "priority", "assignee", "duedate"]
      ),
      searchJQL(
        `${projectClause} AND issuetype != Epic AND created >= "2026-01-01" ORDER BY parent ASC`,
        ["summary", "status", "issuetype", "assignee", "customfield_10016", "parent"]
      ),
    ]);

    // Map tasks keyed by parent epic key
    const tasksByEpic: Record<string, EpicTask[]> = {};
    for (const i of taskIssues) {
      const epicKey = i.fields.parent?.key;
      if (!epicKey) continue;
      if (!tasksByEpic[epicKey]) tasksByEpic[epicKey] = [];
      tasksByEpic[epicKey].push({
        key:       i.key,
        summary:   i.fields.summary || "",
        status:    i.fields.status?.name || "Unknown",
        issuetype: i.fields.issuetype?.name || "Task",
        assignee:  i.fields.assignee?.displayName || null,
        points:    i.fields.customfield_10016 || null,
      });
    }

    // Decide unit: use SP if at least 30% of tasks have points
    const tasksWithSP = taskIssues.filter((i: any) => i.fields.customfield_10016 > 0).length;
    const usesSP = taskIssues.length > 0 && (tasksWithSP / taskIssues.length) >= 0.3;
    const mdUnit: "SP" | "tasks" = usesSP ? "SP" : "tasks";

    function taskMD(t: EpicTask): number {
      return usesSP ? (t.points || 1) : 1;
    }

    // Sprint elapsed days for throughput calculation (use first project's board)
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

    // Build per-epic rows
    const epics: EpicMD[] = epicIssues.map((i: any) => {
      const key     = i.key;
      const tasks   = tasksByEpic[key] || [];
      const totalMD = tasks.reduce((s, t) => s + taskMD(t), 0);
      const doneMD  = tasks.filter((t) => t.status === "Done").reduce((s, t) => s + taskMD(t), 0);
      const remainingMD = totalMD - doneMD;
      const doneTasks   = tasks.filter((t) => t.status === "Done").length;
      const completionPct = totalMD > 0 ? Math.round((doneMD / totalMD) * 100) : (tasks.length === 0 ? 0 : Math.round((doneTasks / tasks.length) * 100));
      return {
        key,
        summary:   i.fields.summary || "",
        status:    i.fields.status?.name || "Unknown",
        priority:  i.fields.priority?.name || "Medium",
        assignee:  i.fields.assignee?.displayName || null,
        duedate:   i.fields.duedate || null,
        tasks,
        totalTasks: tasks.length,
        doneTasks,
        totalMD,
        doneMD,
        remainingMD,
        completionPct,
        estDaysToComplete: null, // filled below
      };
    });

    // Team throughput from sprint: total doneMD across all tasks / elapsed days
    const allDoneMD = taskIssues
      .filter((i: any) => i.fields.status?.name === "Done")
      .reduce((s: number, i: any) => s + (usesSP ? (i.fields.customfield_10016 || 1) : 1), 0);
    const teamDailyMD = sprintElapsedDays > 0 && allDoneMD > 0
      ? Math.round((allDoneMD / sprintElapsedDays) * 100) / 100
      : null;

    // Fill per-epic estimate
    for (const epic of epics) {
      if (epic.remainingMD === 0) {
        epic.estDaysToComplete = 0;
      } else if (teamDailyMD && teamDailyMD > 0) {
        epic.estDaysToComplete = Math.ceil(epic.remainingMD / teamDailyMD);
      }
    }

    // Totals
    const totalMD     = epics.reduce((s, e) => s + e.totalMD, 0);
    const doneMD      = epics.reduce((s, e) => s + e.doneMD, 0);
    const remainingMD = totalMD - doneMD;
    const overallPct  = totalMD > 0 ? Math.round((doneMD / totalMD) * 100) : 0;
    const estDaysAllEpics = teamDailyMD && teamDailyMD > 0 && remainingMD > 0
      ? Math.ceil(remainingMD / teamDailyMD)
      : remainingMD === 0 ? 0 : null;

    const payload: EpicMDReport = {
      projectKeys,
      sprintName,
      sprintElapsedDays,
      totalEpics: epics.length,
      totalMD, doneMD, remainingMD, overallPct,
      teamDailyMD, mdUnit,
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
