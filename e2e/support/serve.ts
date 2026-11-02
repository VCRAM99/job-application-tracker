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

/**
 * Next inlines NEXT_PUBLIC_SUPABASE_URL into client and server bundles at build time, so a
 * build made with `npm run build` (which reads `.env.local`) would talk to the hosted project.
 * The browser bundle must name the local stack, and no bundle may name a hosted project.
 */
function checkBundle() {
  const read = (dir: string) =>
    files(path.join(ROOT, dir))
      .filter((file) => file.endsWith(".js"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n")
  const client = read(".next/static")
  const server = read(".next/server")
  if (!client.includes(LOCAL_SUPABASE_URL)) throw new Error("Build check failed: the client bundle does not reference the local Supabase URL. Rebuild with `npx tsx e2e/support/serve.ts build`.")
  if (/https:\/\/[a-z0-9-]+\.supabase\.co/.test(client + server)) throw new Error("Build check failed: the build references a hosted Supabase project. Rebuild with `npx tsx e2e/support/serve.ts build`.")
}

const [command, variant] = process.argv.slice(2)
if (command === "build") {
  const result = spawnSync(NEXT, ["build"], { cwd: ROOT, env: serverEnv("on") as NodeJS.ProcessEnv, stdio: "inherit" })
  if (result.status !== 0) process.exit(result.status ?? 1)
  checkBundle()
  console.log("e2e build ready.")
} else if (command === "start" && (variant === "on" || variant === "off")) {
  // `test:e2e:nobuild` and `perf:measure` reuse whatever build is in .next.
  checkBundle()
  const port = variant === "on" ? APP_PORT : FLAGS_OFF_PORT
  const child = spawn(NEXT, ["start", "-p", String(port), "-H", "127.0.0.1"], { cwd: ROOT, env: serverEnv(variant) as NodeJS.ProcessEnv, stdio: "inherit" })
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal))
  child.on("exit", (code: number | null) => process.exit(code ?? 0))
} else {
  console.error("Usage: serve.ts build | start on|off")
  process.exit(1)
}
