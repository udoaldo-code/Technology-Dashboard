import { NextResponse } from "next/server";
import { fetchDashboardData } from "@/lib/jira";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const project = searchParams.get("project") || undefined;
    const data = await fetchDashboardData(project);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Jira fetch error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch Jira data" },
      { status: 500 }
    );
  }
}
