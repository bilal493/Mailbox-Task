import bcrypt from "bcryptjs";
import { db } from "@/db/client";
import { UnauthenticatedError } from "@/domain/errors";
import type { AuthUser } from "@/domain/types";
import { userRepository } from "@/repositories/user.repository";

export const authService = {
  async login(email: string, password: string): Promise<AuthUser> {
    const user = await userRepository.findByEmail(db, email);
    // Same message for unknown email and wrong password: do not leak which exists.
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !ok) throw new UnauthenticatedError("Invalid email or password");
    return { id: user.id, email: user.email, role: user.role };
  },
};
