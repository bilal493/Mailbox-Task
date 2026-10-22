import { NextResponse } from "next/server";
import { apiHandler, readJson } from "@/lib/api-handler";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, signSession } from "@/lib/session";
import { authService } from "@/services/auth.service";
import { loginSchema } from "@/validation/order.schemas";

export const POST = apiHandler(async (req) => {
  const { email, password } = loginSchema.parse(await readJson(req));
  const user = await authService.login(email, password);
  const res = NextResponse.json({ user });
  res.cookies.set(SESSION_COOKIE, await signSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
});
