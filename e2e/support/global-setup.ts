import { execFileSync } from "node:child_process"

import { ROOT } from "./local-env"

/** Recreates the local e2e users and fixtures before every run. */
export default function globalSetup() {
  execFileSync("npx", ["tsx", "--conditions=react-server", "e2e/support/seed.ts"], { cwd: ROOT, stdio: "inherit" })
}
