import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { SESSION_COOKIE } from "@/lib/session";

export const POST = apiHandler(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
});
