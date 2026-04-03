import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const JIRA_BASE_URL  = process.env.JIRA_BASE_URL  || "https://linkit360.atlassian.net";
const JIRA_EMAIL     = process.env.JIRA_EMAIL     || "";
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN || "";

function authHeaders() {
  const token = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
  return { Authorization: `Basic ${token}`, Accept: "application/json" };
}

// ── Team classification ───────────────────────────────────────────────────────
const TEAM_MAP: Record<string, string> = {
  "ilham.nadhif":     "Business Analyst",
  "Safira Ramadhani": "Business Analyst",
  "indrapati":        "QA",
};
function getTeam(name: string): string {
  return TEAM_MAP[name] || "Developer";
}

// ── Raw issue ─────────────────────────────────────────────────────────────────
interface RawIssue {
  key: string;
  summary: string;
  status: string;
  issuetype: string;
  assignee: string | null;
  priority: string;
  duedate: string | null;
  points: number | null;
  projectKey: string;
}

function mapIssue(i: any, projectKey = ""): RawIssue {
  return {
    key:        i.key,
    summary:    i.fields.summary            || "",
    status:     i.fields.status?.name       || "Unknown",
    issuetype:  i.fields.issuetype?.name    || "Task",
    assignee:   i.fields.assignee?.displayName || null,
    priority:   i.fields.priority?.name     || "Medium",
    duedate:    i.fields.duedate            || null,
    points:     i.fields.customfield_10016  || null,
    projectKey: i.key.split("-")[0]         || projectKey,
  };
}

// ── Agile helpers ─────────────────────────────────────────────────────────────
async function getBoardId(projectKey: string): Promise<number> {
  const res = await fetch(
    `${JIRA_BASE_URL}/rest/agile/1.0/board?projectKeyOrId=${projectKey}&maxResults=5`,
    { headers: authHeaders(), next: { revalidate: 0 } }
  );
  if (!res.ok) throw new Error(`Board fetch failed for ${projectKey}: ${res.status}`);
  const data = await res.json();
  const board = data.values?.[0];
  if (!board) throw new Error(`No board found for ${projectKey}`);
  return board.id;
}

async function getActiveSprint(boardId: number) {
  const res = await fetch(
    `${JIRA_BASE_URL}/rest/agile/1.0/board/${boardId}/sprint?state=active&maxResults=5`,
    { headers: authHeaders(), next: { revalidate: 0 } }
  );
  if (!res.ok) throw new Error(`Sprint fetch failed: ${res.status}`);
  const data = await res.json();
  return data.values?.[0] || null;
}

async function getSprintIssues(sprintId: number): Promise<RawIssue[]> {
  const fields = "summary,status,issuetype,assignee,priority,customfield_10016,duedate";
  const res = await fetch(
    `${JIRA_BASE_URL}/rest/agile/1.0/sprint/${sprintId}/issue?maxResults=500&fields=${fields}`,
    { headers: authHeaders(), next: { revalidate: 0 } }
  );
  if (!res.ok) throw new Error(`Sprint issues fetch failed: ${res.status}`);
  const data = await res.json();
  return (data.issues || []).map((i: any) => mapIssue(i));
}

// ── JQL fetch (supports multiple projects via "project in (...)") ─────────────
async function fetchByJQL(projectKeys: string[], dateJQL: string): Promise<RawIssue[]> {
  const fields = "summary,status,issuetype,assignee,priority,customfield_10016,duedate";
  const projectClause = projectKeys.length === 1
    ? `project = "${projectKeys[0]}"`
    : `project in (${projectKeys.map((k) => `"${k}"`).join(",")})`;
  const jql = encodeURIComponent(
    `${projectClause} AND assignee is not EMPTY AND ${dateJQL} ORDER BY assignee ASC`
  );
  const issues: RawIssue[] = [];
  let nextPageToken: string | undefined;
  do {
    const url = `${JIRA_BASE_URL}/rest/api/3/search/jql?jql=${jql}&fields=${fields}&maxResults=200${nextPageToken ? `&nextPageToken=${nextPageToken}` : ""}`;
    const res = await fetch(url, { headers: authHeaders(), next: { revalidate: 0 } });
    if (!res.ok) throw new Error(`JQL fetch failed: ${res.status}`);
    const data = await res.json();
    issues.push(...(data.issues || []).map((i: any) => mapIssue(i)));
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);
  return issues;
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function isoDate(d: Date) {
  return d.toISOString().slice(0, 10).replace(/-/g, "/");
}

interface PeriodMeta {
  label: string;
  elapsedDays: number;
  totalDays: number;
  dateJQL: string;
  startDate: string;
  endDate: string;
}

function monthMeta(year: number, month: number /* 1-12 */): PeriodMeta {
  const now = new Date();
  const mStart = new Date(year, month - 1, 1);
  const mEnd   = new Date(year, month, 0); // last day of month
  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const label = `${MONTH_NAMES[month - 1]} ${year}`;
  const isCurrent = now.getFullYear() === year && now.getMonth() + 1 === month;
  const isPast    = mEnd < now;
  const daysInMonth = mEnd.getDate();
  return {
    label,
    elapsedDays: isCurrent ? now.getDate() : isPast ? daysInMonth : 0,
    totalDays:   daysInMonth,
    dateJQL:     `updated >= "${isoDate(mStart)}" AND updated <= "${isoDate(mEnd)}"`,
    startDate:   isoDate(mStart),
    endDate:     isoDate(mEnd),
  };
}

function quarterMeta(year: number, quarter: number /* 1-4 */): PeriodMeta {
  const now    = new Date();
  const qStart = new Date(year, (quarter - 1) * 3, 1);
  const qEnd   = new Date(year, quarter * 3, 0);
  const label  = `Q${quarter} ${year}`;
  const isCurrent = now >= qStart && now <= qEnd;
  const isPast    = qEnd < now;
  const totalDays = Math.ceil((qEnd.getTime() - qStart.getTime()) / 86_400_000);
  const elapsed   = isCurrent
    ? Math.max(1, Math.ceil((now.getTime() - qStart.getTime()) / 86_400_000))
    : isPast ? totalDays : 0;
  return {
    label,
    elapsedDays: elapsed,
    totalDays,
    dateJQL:   `updated >= "${isoDate(qStart)}" AND updated <= "${isoDate(qEnd)}"`,
    startDate: isoDate(qStart),
    endDate:   isoDate(qEnd),
  };
}

// ISO week helpers — week 1 is the week containing the first Thursday of the year
function isoWeek1Start(year: number): Date {
  // Jan 4 is always in ISO week 1
  const jan4 = new Date(year, 0, 4);
  const dow   = jan4.getDay() || 7; // Mon=1 … Sun=7
  const start = new Date(jan4);
  start.setDate(jan4.getDate() - dow + 1);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function currentISOWeek(year: number): number {
  const now   = new Date();
  const w1    = isoWeek1Start(year);
  const diff  = now.getTime() - w1.getTime();
  if (diff < 0) return 1;
  return Math.min(Math.ceil(diff / (7 * 86_400_000)), 52);
}

function weeklyMeta(year: number, week: number): PeriodMeta {
  const now    = new Date();
  const w1     = isoWeek1Start(year);
  const wStart = new Date(w1);
  wStart.setDate(w1.getDate() + (week - 1) * 7);
  const wEnd   = new Date(wStart);
  wEnd.setDate(wStart.getDate() + 6);
  wEnd.setHours(23, 59, 59, 999);

  const isCurrent = now >= wStart && now <= wEnd;
  const isPast    = wEnd < now;
  const dow       = now.getDay() === 0 ? 7 : now.getDay();
  return {
    label:       `W${week} ${year}`,
    elapsedDays: isCurrent ? Math.max(1, dow) : isPast ? 7 : 0,
    totalDays:   7,
    dateJQL:     `updated >= "${isoDate(wStart)}" AND updated <= "${isoDate(wEnd)}"`,
    startDate:   isoDate(wStart),
    endDate:     isoDate(wEnd),
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface VelocityTask {
  key: string; summary: string; status: string; issuetype: string;
  priority: string; duedate: string | null; points: number | null;
}

export interface VelocityMember {
  name: string; team: string; tasks: VelocityTask[];
  total: number; done: number; inProgress: number; blocked: number; toDo: number;
  velocity: number;
  totalPoints: number; donePoints: number; remainingPoints: number;
  dailyThroughput: number | null;
  throughputUnit: "SP" | "tasks";
  estDaysToComplete: number | null;
}

export interface TeamSummary {
  team: string; total: number; done: number; inProgress: number; blocked: number;
  velocity: number; memberCount: number;
}

export interface ProjectSummary {
  key: string; total: number; done: number; inProgress: number; blocked: number; velocity: number;
}

export interface VelocityData {
  period: string; periodLabel: string;
  elapsedDays: number; totalPeriodDays: number;
  startDate: string; endDate: string; sprintName: string;
  selectedProjects: string[];
  currentWeek: number;
  members: VelocityMember[];
  teamSummary: TeamSummary[];
  projectSummary: ProjectSummary[];
  totalIssues: number; totalDone: number; overallVelocity: number;
  fetchedAt: string;
}

// ── Build member stats ────────────────────────────────────────────────────────
function buildMembers(issues: RawIssue[], elapsedDays: number): VelocityMember[] {
  const memberMap: Record<string, { tasks: RawIssue[]; team: string }> = {};
  for (const issue of issues) {
    const name = issue.assignee || "Unassigned";
    if (!memberMap[name]) memberMap[name] = { tasks: [], team: getTeam(name) };
    memberMap[name].tasks.push(issue);
  }

  return Object.entries(memberMap)
    .map(([name, { tasks, team }]) => {
      const total      = tasks.length;
      const done       = tasks.filter((t) => t.status === "Done").length;
      const inProgress = tasks.filter((t) => ["In Progress", "Testing QA"].includes(t.status)).length;
      const blocked    = tasks.filter((t) => ["Waiting telco", "On Hold", "Delay"].includes(t.status)).length;
      const toDo       = tasks.filter((t) => t.status === "To Do").length;
      const velocity   = total > 0 ? Math.round((done / total) * 100) : 0;

      const totalPoints     = tasks.reduce((s, t) => s + (t.points || 0), 0);
      const donePoints      = tasks.filter((t) => t.status === "Done").reduce((s, t) => s + (t.points || 0), 0);
      const remainingPoints = totalPoints - donePoints;

      const usesSP       = totalPoints > 0;
      const doneQty      = usesSP ? donePoints      : done;
      const remainingQty = usesSP ? remainingPoints : (total - done);

      let dailyThroughput: number | null = null;
      let estDaysToComplete: number | null = null;
      if (elapsedDays > 0 && doneQty > 0) {
        dailyThroughput   = doneQty / elapsedDays;
        estDaysToComplete = remainingQty > 0 ? Math.ceil(remainingQty / dailyThroughput) : 0;
      } else if (doneQty === 0 && remainingQty > 0) {
        dailyThroughput   = 0;
        estDaysToComplete = null;
      } else if (remainingQty === 0) {
        estDaysToComplete = 0;
      }

      return {
        name, team,
        tasks: tasks as VelocityTask[],
        total, done, inProgress, blocked, toDo, velocity,
        totalPoints, donePoints, remainingPoints,
        dailyThroughput: dailyThroughput !== null ? Math.round(dailyThroughput * 100) / 100 : null,
        throughputUnit: (usesSP ? "SP" : "tasks") as "SP" | "tasks",
        estDaysToComplete,
      };
    })
    .sort((a, b) => b.total - a.total);
}

function buildProjectSummary(issues: RawIssue[], projectKeys: string[]): ProjectSummary[] {
  return projectKeys.map((key) => {
    const pIssues = issues.filter((i) => i.projectKey === key);
    const total      = pIssues.length;
    const done       = pIssues.filter((i) => i.status === "Done").length;
    const inProgress = pIssues.filter((i) => ["In Progress", "Testing QA"].includes(i.status)).length;
    const blocked    = pIssues.filter((i) => ["Waiting telco", "On Hold", "Delay"].includes(i.status)).length;
    return { key, total, done, inProgress, blocked, velocity: total > 0 ? Math.round((done / total) * 100) : 0 };
  }).filter((p) => p.total > 0);
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    // Support both single `project` and multi `projects` params
    const projectsParam = searchParams.get("projects") || searchParams.get("project") || "IV";
    const projectKeys   = projectsParam.split(",").map((k) => k.trim()).filter(Boolean);
    const period        = searchParams.get("period")  || "sprint";
    const monthParam    = parseInt(searchParams.get("month")   || "0");
    const quarterParam  = parseInt(searchParams.get("quarter") || "0");
    const weekParam     = parseInt(searchParams.get("week")    || "0");
    const YEAR          = 2026;

    let issues:         RawIssue[] = [];
    let sprintName      = "";
    let startDate       = "";
    let endDate         = "";
    let elapsedDays     = 0;
    let totalPeriodDays = 0;
    let periodLabel     = "";

    if (period === "sprint") {
      // For sprint mode: fetch each project's board in parallel, collect all active sprint issues
      const sprintResults = await Promise.allSettled(
        projectKeys.map(async (key) => {
          const boardId = await getBoardId(key);
          const sprint  = await getActiveSprint(boardId);
          if (!sprint) return { issues: [] as RawIssue[], sprint: null };
          const spIssues = await getSprintIssues(sprint.id);
          return { issues: spIssues, sprint };
        })
      );

      let firstSprint: any = null;
      for (const r of sprintResults) {
        if (r.status === "fulfilled" && r.value.issues.length > 0) {
          issues.push(...r.value.issues);
          if (!firstSprint && r.value.sprint) firstSprint = r.value.sprint;
        }
      }

      if (!firstSprint && issues.length === 0) {
        return NextResponse.json(
          { error: "No active sprint found", members: [], teamSummary: [], projectSummary: [], period, periodLabel: "Active Sprint", selectedProjects: projectKeys },
          { status: 200 }
        );
      }

      if (firstSprint) {
        sprintName  = firstSprint.name;
        startDate   = firstSprint.startDate;
        endDate     = firstSprint.endDate;
        periodLabel = projectKeys.length > 1 ? `Active Sprints (${projectKeys.length} projects)` : "Active Sprint";
        const start = new Date(firstSprint.startDate);
        const end   = new Date(firstSprint.endDate);
        const now   = new Date();
        totalPeriodDays = Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
        elapsedDays     = Math.max(1, Math.min(Math.ceil((now.getTime() - start.getTime()) / 86_400_000), totalPeriodDays));
      }

    } else if (period === "monthly") {
      const now     = new Date();
      const month   = monthParam >= 1 && monthParam <= 12 ? monthParam : now.getMonth() + 1;
      const meta    = monthMeta(YEAR, month);
      issues        = await fetchByJQL(projectKeys, meta.dateJQL);
      periodLabel   = meta.label;
      elapsedDays   = meta.elapsedDays;
      totalPeriodDays = meta.totalDays;
      startDate     = meta.startDate;
      endDate       = meta.endDate;

    } else if (period === "quarterly") {
      const now     = new Date();
      const currentQ = Math.floor(now.getMonth() / 3) + 1;
      const quarter  = quarterParam >= 1 && quarterParam <= 4 ? quarterParam : currentQ;
      const meta     = quarterMeta(YEAR, quarter);
      issues         = await fetchByJQL(projectKeys, meta.dateJQL);
      periodLabel    = meta.label;
      elapsedDays    = meta.elapsedDays;
      totalPeriodDays = meta.totalDays;
      startDate      = meta.startDate;
      endDate        = meta.endDate;

    } else {
      // weekly — default to current ISO week if no week param
      const curWeek = currentISOWeek(YEAR);
      const week    = weekParam >= 1 && weekParam <= curWeek ? weekParam : curWeek;
      const meta    = weeklyMeta(YEAR, week);
      issues        = await fetchByJQL(projectKeys, meta.dateJQL);
      periodLabel   = meta.label;
      elapsedDays   = meta.elapsedDays;
      totalPeriodDays = meta.totalDays;
      startDate     = meta.startDate;
      endDate       = meta.endDate;
    }

    const members = buildMembers(issues, elapsedDays);

    const teams = Array.from(new Set(members.map((m) => m.team)));
    const teamSummary: TeamSummary[] = teams
      .map((team) => {
        const tm = members.filter((m) => m.team === team);
        const total      = tm.reduce((s, m) => s + m.total, 0);
        const done       = tm.reduce((s, m) => s + m.done, 0);
        const inProgress = tm.reduce((s, m) => s + m.inProgress, 0);
        const blocked    = tm.reduce((s, m) => s + m.blocked, 0);
        return { team, total, done, inProgress, blocked, velocity: total > 0 ? Math.round((done / total) * 100) : 0, memberCount: tm.length };
      })
      .sort((a, b) => b.total - a.total);

    const projectSummary = buildProjectSummary(issues, projectKeys);
    const totalIssues    = issues.length;
    const totalDone      = issues.filter((i) => i.status === "Done").length;

    const payload: VelocityData = {
      period, periodLabel, elapsedDays, totalPeriodDays,
      startDate, endDate, sprintName,
      selectedProjects: projectKeys,
      currentWeek: currentISOWeek(YEAR),
      members, teamSummary, projectSummary,
      totalIssues, totalDone,
      overallVelocity: totalIssues > 0 ? Math.round((totalDone / totalIssues) * 100) : 0,
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("Velocity fetch error:", error);
    return NextResponse.json({ error: error.message, members: [], teamSummary: [], projectSummary: [] }, { status: 500 });
  }
}
