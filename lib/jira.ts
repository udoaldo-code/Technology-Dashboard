export interface JiraEpic {
  key: string;
  summary: string;
  status: string;
  priority: string;
  startDate: string | null;
  duedate: string | null;
  newStartDate: string | null;
  newDueDate: string | null;
  assignee: string | null;
  created: string;
  updated: string;
  description?: string;
}

export interface JiraTask {
  key: string;
  summary: string;
  status: string;
  issuetype: string;
  priority: string;
  startDate: string | null;
  duedate: string | null;
  newStartDate: string | null;
  newDueDate: string | null;
  assignee: string | null;
  parent: string | null;
  parentKey: string | null;
  created: string;
  updated: string;
}

export interface JiraDashboardData {
  epics: JiraEpic[];
  tasks: JiraTask[];
  fetchedAt: string;
  totalEpics: number;
  totalTasks: number;
}

const JIRA_BASE_URL = process.env.JIRA_BASE_URL || "https://linkit360.atlassian.net";
const JIRA_EMAIL = process.env.JIRA_EMAIL || "";
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN || "";
const PROJECT_KEY = process.env.JIRA_PROJECT_KEY || "IV";

function getAuthHeaders(): HeadersInit {
  if (JIRA_EMAIL && JIRA_API_TOKEN) {
    const token = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
    return {
      Authorization: `Basic ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function searchJira(jql: string, fields: string[], maxResults = 100): Promise<any[]> {
  const url = `${JIRA_BASE_URL}/rest/api/3/search/jql`;
  const allIssues: any[] = [];
  let nextPageToken: string | undefined = undefined;
  let pageCount = 0;

  do {
    const body: Record<string, any> = { jql, maxResults, fields };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    const res = await fetch(url, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    allIssues.push(...(data.issues || []));
    nextPageToken = data.nextPageToken;
    pageCount++;
  } while (nextPageToken && pageCount < 10);

  return allIssues;
}

function extractText(field: any): string {
  if (!field) return "";
  if (typeof field === "string") return field;
  if (field.content) {
    return field.content
      .map((block: any) =>
        (block.content || []).map((inline: any) => inline.text || "").join("")
      )
      .join(" ");
  }
  return "";
}

export async function fetchProjects(): Promise<Array<{ key: string; name: string; category: string | null }>> {
  const url = `${JIRA_BASE_URL}/rest/api/3/project/search?maxResults=100&action=browse`;
  const res = await fetch(url, { headers: getAuthHeaders(), next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Projects fetch error ${res.status}`);
  const data = await res.json();
  return (data.values || []).map((p: any) => ({
    key: p.key,
    name: p.name,
    category: p.projectCategory?.name || null,
  }));
}

export async function fetchProjectTasks(projectKey: string): Promise<JiraTask[]> {
  const fields = ["summary", "status", "issuetype", "priority", "customfield_10015", "duedate", "customfield_10578", "customfield_10049", "assignee", "parent", "created", "updated"];
  const issues = await searchJira(
    `project = "${projectKey}" AND issuetype != Epic AND created >= "2026-01-01" ORDER BY updated DESC`,
    fields, 200
  );
  return issues.map((issue: any) => ({
    key: issue.key,
    summary: issue.fields.summary || "",
    status: issue.fields.status?.name || "Unknown",
    issuetype: issue.fields.issuetype?.name || "Task",
    priority: issue.fields.priority?.name || "Medium",
    startDate: issue.fields.customfield_10015 || null,
    duedate: issue.fields.duedate || null,
    newStartDate: issue.fields.customfield_10578 || null,
    newDueDate: issue.fields.customfield_10049 || null,
    assignee: issue.fields.assignee?.displayName || null,
    parent: issue.fields.parent?.fields?.summary || null,
    parentKey: issue.fields.parent?.key || null,
    created: issue.fields.created || "",
    updated: issue.fields.updated || "",
  }));
}

export async function fetchProjectEpics(projectKey: string): Promise<JiraEpic[]> {
  const fields = ["summary", "status", "priority", "customfield_10015", "duedate", "customfield_10578", "customfield_10049", "assignee", "created", "updated"];
  const issues = await searchJira(
    `project = "${projectKey}" AND issuetype = Epic AND created >= "2026-01-01" ORDER BY duedate ASC`,
    fields, 100
  );
  return issues.map((issue: any) => ({
    key: issue.key,
    summary: issue.fields.summary || "",
    status: issue.fields.status?.name || "Unknown",
    priority: issue.fields.priority?.name || "Medium",
    startDate: issue.fields.customfield_10015 || null,
    duedate: issue.fields.duedate || null,
    newStartDate: issue.fields.customfield_10578 || null,
    newDueDate: issue.fields.customfield_10049 || null,
    assignee: issue.fields.assignee?.displayName || null,
    created: issue.fields.created || "",
    updated: issue.fields.updated || "",
  }));
}

export async function fetchDashboardData(projectKey?: string): Promise<JiraDashboardData> {
  const key = projectKey || PROJECT_KEY;
  const epicFields = ["summary", "status", "priority", "customfield_10015", "duedate", "customfield_10578", "customfield_10049", "assignee", "description", "created", "updated"];
  const taskFields = ["summary", "status", "issuetype", "priority", "customfield_10015", "duedate", "customfield_10578", "customfield_10049", "assignee", "parent", "created", "updated"];

  const [epicIssues, taskIssues] = await Promise.all([
    searchJira(
      `project = "${key}" AND issuetype = Epic AND created >= "2026-01-01" ORDER BY duedate ASC`,
      epicFields,
      100
    ),
    searchJira(
      `project = "${key}" AND issuetype != Epic AND created >= "2026-01-01" ORDER BY updated DESC`,
      taskFields,
      100
    ),
  ]);

  const epics: JiraEpic[] = epicIssues.map((issue: any) => ({
    key: issue.key,
    summary: issue.fields.summary || "",
    status: issue.fields.status?.name || "Unknown",
    priority: issue.fields.priority?.name || "Medium",
    startDate: issue.fields.customfield_10015 || null,
    duedate: issue.fields.duedate || null,
    newStartDate: issue.fields.customfield_10578 || null,
    newDueDate: issue.fields.customfield_10049 || null,
    assignee: issue.fields.assignee?.displayName || null,
    created: issue.fields.created || "",
    updated: issue.fields.updated || "",
    description: extractText(issue.fields.description),
  }));

  const tasks: JiraTask[] = taskIssues.map((issue: any) => ({
    key: issue.key,
    summary: issue.fields.summary || "",
    status: issue.fields.status?.name || "Unknown",
    issuetype: issue.fields.issuetype?.name || "Task",
    priority: issue.fields.priority?.name || "Medium",
    startDate: issue.fields.customfield_10015 || null,
    duedate: issue.fields.duedate || null,
    newStartDate: issue.fields.customfield_10578 || null,
    newDueDate: issue.fields.customfield_10049 || null,
    assignee: issue.fields.assignee?.displayName || null,
    parent: issue.fields.parent?.fields?.summary || null,
    parentKey: issue.fields.parent?.key || null,
    created: issue.fields.created || "",
    updated: issue.fields.updated || "",
  }));

  return {
    epics,
    tasks,
    fetchedAt: new Date().toISOString(),
    totalEpics: epics.length,
    totalTasks: tasks.length,
  };
}
