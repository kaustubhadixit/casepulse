import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cases = await db.case.count();
    return NextResponse.json({ status: "ok", database: "connected", cases });
  } catch (err) {
    console.error("health check failed", err);
    return NextResponse.json({ status: "degraded", database: "unavailable" }, { status: 503 });
  }
}
