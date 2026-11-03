import { execFileSync } from "node:child_process"

/** psql against the local Supabase database container only. No app imports, so specs can use it. */
const DB_CONTAINER = "supabase_db_job-application-tracker"

export function psql(sql: string, capture = false, role = "postgres"): string {
  const ports = execFileSync("docker", ["port", DB_CONTAINER, "5432"], { encoding: "utf8" })
  if (!ports.split("\n").some((line) => /^(127\.0\.0\.1|0\.0\.0\.0|\[::\]):54322$/.test(line.trim()))) {
    throw new Error("Refusing: the local database container is not bound to port 54322.")
  }
  const output = execFileSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", role, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qtA"], {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", capture ? "pipe" : "ignore", "pipe"],
  })
  return capture ? output : ""
}

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`

/**
 * Moves a user's AI usage rows out of the per-minute and per-day rate-limit windows, so a serial
 * suite of AI flows is not refused by the real limit (which is what a person would hit).
 */
export function clearAiRateWindow(email: string) {
  psql(`update public.ai_usage_events set created_at = created_at - interval '2 days' where user_id = (select id from auth.users where email = ${quote(email)});`)
}
