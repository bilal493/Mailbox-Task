type Level = "info" | "warn" | "error";

function log(level: Level, scope: string, message: string, extra?: unknown) {
  const line = `${new Date().toISOString()} [${level}] [${scope}] ${message}`;
  if (level === "error") console.error(line, extra ?? "");
  else if (level === "warn") console.warn(line, extra ?? "");
  else console.log(line, extra ?? "");
}

export const createLogger = (scope: string) => ({
  info: (m: string, extra?: unknown) => log("info", scope, m, extra),
  warn: (m: string, extra?: unknown) => log("warn", scope, m, extra),
  error: (m: string, extra?: unknown) => log("error", scope, m, extra),
});
export type Logger = ReturnType<typeof createLogger>;
