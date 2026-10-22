import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./tests/test-env";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false, // integration tests share one database
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      SESSION_SECRET: "test-secret-test-secret-test-secret",
    },
  },
});
