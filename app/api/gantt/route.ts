import { NextResponse } from "next/server";
import { fetchProjectEpics, fetchProjectTasks, fetchProjects, type JiraEpic, type JiraTask } from "@/lib/jira";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export interface GanttProject {
  key: string;
  name: string;
  epics: JiraEpic[];
  tasks: JiraTask[];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const keys = (searchParams.get("projects") || "IV")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 6); // max 6 projects at a time

    // Fetch project names + epics + tasks in parallel
    const [projectList, epicResults, taskResults] = await Promise.all([
      fetchProjects(),
      Promise.allSettled(keys.map((k) => fetchProjectEpics(k))),
      Promise.allSettled(keys.map((k) => fetchProjectTasks(k))),
    ]);

    const projectMap = Object.fromEntries(projectList.map((p) => [p.key, p.name]));

    const projects: GanttProject[] = keys.map((key, i) => {
      const epicResult = epicResults[i];
      const taskResult = taskResults[i];
      const epics = epicResult.status === "fulfilled" ? epicResult.value : [];
      const tasks = taskResult.status === "fulfilled" ? taskResult.value : [];
      return {
        key,
        name: projectMap[key] || key,
        // Exclude "Dropped" epics at the API level
        epics: epics.filter((e) => e.status !== "Dropped"),
        tasks,
      };
    });

    return NextResponse.json({ projects, fetchedAt: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, projects: [] }, { status: 500 });
  }
}
