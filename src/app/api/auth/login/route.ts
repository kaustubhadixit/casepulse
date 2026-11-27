import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/auth";
import { limitOr429, guardWrite } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

export async function POST(request: NextRequest) {
  // brute-force protection: 10 attempts / minute / IP
  const limited = limitOr429(request, "auth-login", 10);
  if (limited) return limited;
  const readonly = guardWrite();
  if (readonly) return readonly;
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }
    const { email, password } = parsed.data;
    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    await createSession(user.id);
    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error("login failed", err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
