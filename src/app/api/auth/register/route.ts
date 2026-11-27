import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createSession } from "@/lib/auth";
import { limitOr429, guardWrite } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  name: z.string().min(1).max(80).optional(),
});

export async function POST(request: NextRequest) {
  const limited = limitOr429(request, "auth-register", 10);
  if (limited) return limited;
  const readonly = guardWrite();
  if (readonly) return readonly;
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const { email, password, name } = parsed.data;
    const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }
    const user = await db.user.create({
      data: { email: email.toLowerCase(), name, passwordHash: hashPassword(password), role: "USER" },
    });
    await createSession(user.id);
    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } }, { status: 201 });
  } catch (err) {
    console.error("register failed", err);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
