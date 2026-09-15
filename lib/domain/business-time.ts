const BUSINESS_TIME_ZONE = "Europe/Berlin";

/** Formats operational timestamps in the company's timezone, independent of the server/browser locale. */
export function formatBusinessDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(typeof value === "string" ? new Date(value) : value);
}

export { BUSINESS_TIME_ZONE };
