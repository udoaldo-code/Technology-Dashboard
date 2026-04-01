import { NextResponse } from "next/server";
import { fetchProjects } from "@/lib/jira";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const projects = await fetchProjects();
    return NextResponse.json(projects);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
