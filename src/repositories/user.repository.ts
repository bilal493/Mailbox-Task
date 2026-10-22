import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import type { Executor, UserRow } from "@/db/types";

export const userRepository = {
  async findByEmail(ex: Executor, email: string): Promise<UserRow | undefined> {
    const [row] = await ex.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    return row;
  },
};
