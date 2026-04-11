import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const JIRA_BASE_URL = process.env.JIRA_BASE_URL || "https://linkit360.atlassian.net";
const JIRA_EMAIL    = process.env.JIRA_EMAIL    || "";
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN || "";

function getAuthHeaders(): HeadersInit {
  if (JIRA_EMAIL && JIRA_API_TOKEN) {
    const token = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
    return { Authorization: `Basic ${token}`, "Content-Type": "application/json", Accept: "application/json" };
  }
  return { "Content-Type": "application/json", Accept: "application/json" };
}

async function searchJira(jql: string, fields: string[], maxResults = 200): Promise<any[]> {
  const url = `${JIRA_BASE_URL}/rest/api/3/search/jql`;
  const all: any[] = [];
  let nextPageToken: string | undefined;
  let page = 0;
  do {
    const body: Record<string, any> = { jql, maxResults, fields };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const res = await fetch(url, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
      next: { revalidate: 0 },
    });
    if (!res.ok) { const t = await res.text(); throw new Error(`Jira API ${res.status}: ${t}`); }
    const data = await res.json();
    all.push(...(data.issues || []));
    nextPageToken = data.nextPageToken;
    page++;
  } while (nextPageToken && page < 10);
  return all;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const project = searchParams.get("project") || "IV";
  try {
    const epicFields = [
      "summary", "status", "priority", "duedate", "assignee",
      "created", "updated", "labels", "components",
    ];
    const taskFields = [
      "summary", "status", "issuetype", "priority", "duedate",
      "assignee", "parent", "created", "updated", "labels", "components",
    ];

    const [epicIssues, taskIssues] = await Promise.all([
      searchJira(
        `project = "${project}" AND issuetype = Epic AND created >= "2026-01-01" ORDER BY duedate ASC`,
        epicFields, 200
      ),
      searchJira(
        `project = "${project}" AND issuetype != Epic AND created >= "2026-01-01" ORDER BY updated DESC`,
        taskFields, 200
      ),
    ]);

    const epics = epicIssues.map((i: any) => ({
      key:        i.key,
      summary:    i.fields.summary   || "",
      status:     i.fields.status?.name || "Unknown",
      priority:   i.fields.priority?.name || "Medium",
      duedate:    i.fields.duedate   || null,
      assignee:   i.fields.assignee?.displayName || null,
      created:    i.fields.created   || "",
      updated:    i.fields.updated   || "",
      labels:     (i.fields.labels   || []) as string[],
      components: ((i.fields.components || []) as any[]).map((c) => c.name as string),
    }));

    const tasks = taskIssues.map((i: any) => ({
      key:        i.key,
      summary:    i.fields.summary   || "",
      status:     i.fields.status?.name || "Unknown",
      issuetype:  i.fields.issuetype?.name || "Task",
      priority:   i.fields.priority?.name || "Medium",
      duedate:    i.fields.duedate   || null,
      assignee:   i.fields.assignee?.displayName || null,
      parent:     i.fields.parent?.fields?.summary || null,
      parentKey:  i.fields.parent?.key || null,
      created:    i.fields.created   || "",
      updated:    i.fields.updated   || "",
      labels:     (i.fields.labels   || []) as string[],
      components: ((i.fields.components || []) as any[]).map((c) => c.name as string),
    }));

    return NextResponse.json({ epics, tasks, fetchedAt: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
