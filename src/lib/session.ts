import { jwtVerify, SignJWT } from "jose";
import type { NextRequest } from "next/server";
import { ForbiddenError, UnauthenticatedError } from "@/domain/errors";
import { ROLES, type AuthUser, type Role } from "@/domain/types";
import { getEnv } from "./env";

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

const key = () => new TextEncoder().encode(getEnv().SESSION_SECRET);

export async function signSession(user: AuthUser): Promise<string> {
  return new SignJWT({ email: user.email, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    const role = payload.role as Role;
    if (!payload.sub || typeof payload.email !== "string" || !ROLES.includes(role)) return null;
    return { id: payload.sub, email: payload.email, role };
  } catch {
    return null;
  }
}

export async function requireUser(req: NextRequest): Promise<AuthUser> {
  const user = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) throw new UnauthenticatedError();
  return user;
}

export async function requireAdminUser(req: NextRequest): Promise<AuthUser> {
  const user = await requireUser(req);
  if (user.role !== "admin") throw new ForbiddenError("Admin access required");
  return user;
}
