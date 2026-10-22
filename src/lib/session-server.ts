import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AuthUser } from "@/domain/types";
import { SESSION_COOKIE, verifySession } from "./session";

/** For server components (pages/layouts). Route handlers use requireUser(req). */
export async function getCurrentUser(): Promise<AuthUser | null> {
  return verifySession(cookies().get(SESSION_COOKIE)?.value);
}

export async function requirePageUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
