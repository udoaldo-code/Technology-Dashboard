import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const JIRA_BASE_URL = process.env.JIRA_BASE_URL || "https://linkit360.atlassian.net";
const JIRA_EMAIL = process.env.JIRA_EMAIL || "";
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN || "";

function authHeaders() {
  const token = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
  return { Authorization: `Basic ${token}`, Accept: "application/json" };
}

export interface SprintIssue {
  key: string;
  summary: string;
  status: string;
  issuetype: string;
  assignee: string | null;
  priority: string;
  duedate: string | null;
  points: number | null;
}

export interface SprintData {
  sprintId: number;
  sprintName: string;
  state: string;
  startDate: string;
  endDate: string;
  goal: string;
  issues: SprintIssue[];
  fetchedAt: string;
  boardId: number;
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

async function getSprintIssues(sprintId: number): Promise<SprintIssue[]> {
  const fields = "summary,status,issuetype,assignee,priority,customfield_10016,duedate";
  const res = await fetch(
    `${JIRA_BASE_URL}/rest/agile/1.0/sprint/${sprintId}/issue?maxResults=200&fields=${fields}`,
    { headers: authHeaders(), next: { revalidate: 0 } }
  );
  if (!res.ok) throw new Error(`Sprint issues fetch failed: ${res.status}`);
  const data = await res.json();
  return (data.issues || []).map((i: any) => ({
    key: i.key,
    summary: i.fields.summary || "",
    status: i.fields.status?.name || "Unknown",
    issuetype: i.fields.issuetype?.name || "Task",
    assignee: i.fields.assignee?.displayName || null,
    priority: i.fields.priority?.name || "Medium",
    duedate: i.fields.duedate || null,
    points: i.fields.customfield_10016 || null,
  }));
}

async function getBoardId(projectKey: string): Promise<number> {
  const res = await fetch(
    `${JIRA_BASE_URL}/rest/agile/1.0/board?projectKeyOrId=${projectKey}&maxResults=5`,
    { headers: authHeaders(), next: { revalidate: 0 } }
  );
  if (!res.ok) throw new Error(`Board fetch failed: ${res.status}`);
  const data = await res.json();
  const board = data.values?.[0];
  if (!board) throw new Error(`No board found for project ${projectKey}`);
  return board.id;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const project = searchParams.get("project") || "IV";

    const boardId = await getBoardId(project);
    const sprint = await getActiveSprint(boardId);

    if (!sprint) {
      return NextResponse.json({ error: "No active sprint found", issues: [], sprintName: "", boardId }, { status: 200 });
    }

    const issues = await getSprintIssues(sprint.id);

    const payload: SprintData = {
      sprintId: sprint.id,
      sprintName: sprint.name,
      state: sprint.state,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      goal: sprint.goal || "",
      issues,
      fetchedAt: new Date().toISOString(),
      boardId,
    };

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("Sprint fetch error:", error);
    return NextResponse.json({ error: error.message, issues: [] }, { status: 500 });
  }
}
