/**
 * Prints a before/after markdown table from two perf-results files.
 *
 *   npx tsx scripts/perf/compare.ts baseline after
 */
import { readFileSync } from "node:fs"
import path from "node:path"

type Row = {
  name: string
  js: { transferKb: number; idleTransferKb: number }
  server: { medianMs: number; supabaseCalls: number; authCalls: number; supabaseMs: number }
  lighthouse: { performance: number; accessibility: number; bestPractices: number; lcpMs: number; tbtMs: number }
}
type Run = { results: Row[]; slow: Array<{ meanMs: number; query: string }>; plans: Array<{ ms: number; text: string }> }

const [before, after] = process.argv.slice(2).map((label) => JSON.parse(readFileSync(path.join("perf-results", `${label}.json`), "utf8")) as Run)
if (!before || !after) throw new Error("Usage: compare.ts <before> <after>")

const pair = (a: number, b: number, digits = 0) => {
  const delta = b - a
  const sign = delta > 0 ? "+" : ""
  return `${a.toFixed(digits)} → ${b.toFixed(digits)} (${sign}${delta.toFixed(digits)})`
}

const lines = [
  "| Page | First-load JS KB (transfer) | All JS by idle KB | Server render ms | Supabase calls | Auth calls | Lighthouse perf | a11y | best practices | LCP ms | TBT ms |",
  "|---|---|---|---|---|---|---|---|---|---|---|",
]
for (const row of before.results) {
  const next = after.results.find((entry) => entry.name === row.name)
  if (!next) continue
  lines.push(
    `| ${row.name} | ${pair(row.js.transferKb, next.js.transferKb, 1)} | ${pair(row.js.idleTransferKb, next.js.idleTransferKb, 1)} | ${pair(row.server.medianMs, next.server.medianMs)} | ${pair(row.server.supabaseCalls, next.server.supabaseCalls)} | ${pair(row.server.authCalls, next.server.authCalls)} | ${pair(row.lighthouse.performance, next.lighthouse.performance)} | ${pair(row.lighthouse.accessibility, next.lighthouse.accessibility)} | ${pair(row.lighthouse.bestPractices, next.lighthouse.bestPractices)} | ${pair(row.lighthouse.lcpMs, next.lighthouse.lcpMs)} | ${pair(row.lighthouse.tbtMs, next.lighthouse.tbtMs)} |`,
  )
}
console.log(lines.join("\n"))
console.log("\nSlowest statements (mean ms, before → after, same rank):")
for (let index = 0; index < Math.max(before.slow.length, after.slow.length); index++) {
  console.log(`${index + 1}. ${before.slow[index]?.meanMs ?? "–"} → ${after.slow[index]?.meanMs ?? "–"} | ${(after.slow[index]?.query ?? "").replace(/"public"\./g, "").replace(/"/g, "").slice(0, 110)}`)
}
console.log("\nSlowest plans (ms, before → after, same rank):")
for (let index = 0; index < Math.max(before.plans.length, after.plans.length); index++) {
  console.log(`${index + 1}. ${before.plans[index]?.ms.toFixed(2) ?? "–"} → ${after.plans[index]?.ms.toFixed(2) ?? "–"} | ${(after.plans[index]?.text ?? "").replace(/\s+/g, " ").replace(/"public"\./g, "").replace(/"/g, "").slice(0, 110)}`)
}
