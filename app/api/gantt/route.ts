import { NextResponse } from "next/server";
import { fetchProjectEpics, fetchProjects, type JiraEpic } from "@/lib/jira";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export interface GanttProject {
  key: string;
  name: string;
  epics: JiraEpic[];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const keys = (searchParams.get("projects") || "IV")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 6); // max 6 projects at a time

    // Fetch project names + epics in parallel
    const [projectList, epicResults] = await Promise.all([
      fetchProjects(),
      Promise.allSettled(keys.map((k) => fetchProjectEpics(k))),
    ]);

    const projectMap = Object.fromEntries(projectList.map((p) => [p.key, p.name]));

    const projects: GanttProject[] = keys.map((key, i) => {
      const result = epicResults[i];
      return {
        key,
        name: projectMap[key] || key,
        epics: result.status === "fulfilled" ? result.value : [],
      };
    });

    return NextResponse.json({ projects, fetchedAt: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, projects: [] }, { status: 500 });
  }
}
