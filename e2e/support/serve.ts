/**
 * LOCAL ONLY. Builds and starts the app for e2e and perf runs with the
 * explicit environment from local-env.ts, so `.env.local` is never loaded.
 *
 *   npx tsx e2e/support/serve.ts build        # next build, then checks the bundle
 *   npx tsx e2e/support/serve.ts start on     # next start on 3100, flags on
 *   npx tsx e2e/support/serve.ts start off    # next start on 3101, flags off
 */
import { spawn, spawnSync } from "node:child_process"
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

import { APP_PORT, FLAGS_OFF_PORT, LOCAL_SUPABASE_URL, ROOT, serverEnv } from "./local-env"

const NEXT = path.join(ROOT, "node_modules/.bin/next")

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    return statSync(full).isDirectory() ? files(full) : [full]
  })
}

/** The browser bundle must name the local stack and nothing hosted. */
function checkBundle() {
  const chunks = files(path.join(ROOT, ".next/static")).filter((file) => file.endsWith(".js"))
  const text = chunks.map((file) => readFileSync(file, "utf8")).join("\n")
  if (!text.includes(LOCAL_SUPABASE_URL)) throw new Error("Build check failed: the client bundle does not reference the local Supabase URL.")
  if (/https:\/\/[a-z0-9-]+\.supabase\.co/.test(text)) throw new Error("Build check failed: the client bundle references a hosted Supabase project.")
}

const [command, variant] = process.argv.slice(2)
if (command === "build") {
  const result = spawnSync(NEXT, ["build"], { cwd: ROOT, env: serverEnv("on") as NodeJS.ProcessEnv, stdio: "inherit" })
  if (result.status !== 0) process.exit(result.status ?? 1)
  checkBundle()
  console.log("e2e build ready.")
} else if (command === "start" && (variant === "on" || variant === "off")) {
  const port = variant === "on" ? APP_PORT : FLAGS_OFF_PORT
  const child = spawn(NEXT, ["start", "-p", String(port), "-H", "127.0.0.1"], { cwd: ROOT, env: serverEnv(variant) as NodeJS.ProcessEnv, stdio: "inherit" })
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal))
  child.on("exit", (code: number | null) => process.exit(code ?? 0))
} else {
  console.error("Usage: serve.ts build | start on|off")
  process.exit(1)
}
