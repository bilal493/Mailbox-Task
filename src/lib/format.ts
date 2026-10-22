const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

export const formatDateTime = (d: Date): string => dateTime.format(d);
export const providerLabel = (p: string): string => (p === "google" ? "Google" : p === "microsoft" ? "Microsoft" : p);
