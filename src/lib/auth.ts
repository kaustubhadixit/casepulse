import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { newToken } from "@/lib/password";

export const SESSION_COOKIE = "pp_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

/** Create a session row + set the httpOnly cookie. */
export async function createSession(userId: string): Promise<string> {
  const token = newToken();
  await db.session.create({
    data: { id: token, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return token;
}

/** Resolve the signed-in user (or null) from the session cookie. */
export async function getAuthUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: token },
    include: { user: true },
  });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name, role: session.user.role };
}

/** Require any authenticated user; returns null when not signed in. */
export async function requireUser(): Promise<AuthUser | null> {
  return getAuthUser();
}

/** Require an ADMIN user; returns null otherwise. */
export async function requireAdmin(): Promise<AuthUser | null> {
  const user = await getAuthUser();
  return user && user.role === "ADMIN" ? user : null;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { id: token } });
  }
  jar.delete(SESSION_COOKIE);
}
