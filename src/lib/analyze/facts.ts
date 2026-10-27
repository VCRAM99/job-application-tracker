import { sha256 } from "@/lib/analyze/hash"
import type { VerifiedFact } from "@/lib/analyze/types"

const ALIASES: Record<string, string> = {
  js: "javascript",
  javascript: "javascript",
  ts: "typescript",
  typescript: "typescript",
  node: "nodejs",
  nodejs: "nodejs",
  "node.js": "nodejs",
  postgres: "postgresql",
  postgresql: "postgresql",
  k8s: "kubernetes",
  kubernetes: "kubernetes",
  react: "react",
  reactjs: "react",
  "react.js": "react",
  go: "go",
  golang: "go",
  py: "python",
  python: "python",
  aws: "aws",
  "amazon web services": "aws",
}

export function canonicalSkill(value: string): string {
  const compact = value
    .toLowerCase()
    .replace(/[^a-z0-9+.#]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
  if (ALIASES[compact]) return ALIASES[compact]
  const squeezed = compact.replace(/[.\s]/g, "")
  return ALIASES[squeezed] ?? squeezed
}

export function profileFingerprint(facts: Array<{ id: string; updatedAt: string }>): string {
  const lines = [...facts]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((fact) => `${fact.id}:${fact.updatedAt}`)
  return sha256(lines.join("\n"))
}

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000

export function experienceYears(facts: VerifiedFact[], now = new Date()): number | null {
  const intervals: Array<[number, number]> = []
  for (const fact of facts) {
    if (fact.type !== "employment" || !fact.startDate) continue
    const start = Date.parse(`${fact.startDate}T00:00:00Z`)
    const end = fact.endDate ? Date.parse(`${fact.endDate}T00:00:00Z`) : now.getTime()
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue
    intervals.push([start, end])
  }
  if (intervals.length === 0) return null
  intervals.sort((left, right) => left[0] - right[0])
  let cursorStart = intervals[0]?.[0] ?? 0
  let cursorEnd = intervals[0]?.[1] ?? 0
  let total = 0
  for (const [start, end] of intervals.slice(1)) {
    if (start <= cursorEnd) {
      cursorEnd = Math.max(cursorEnd, end)
    } else {
      total += cursorEnd - cursorStart
      cursorStart = start
      cursorEnd = end
    }
  }
  total += cursorEnd - cursorStart
  return Math.floor(total / YEAR_MS)
}

const SENIORITY_RANK: Record<string, number> = {
  intern: 0,
  junior: 1,
  mid: 2,
  senior: 3,
  lead: 4,
  staff: 4,
  manager: 4,
  principal: 5,
}

export function seniorityTokens(value: string): string[] {
  const text = value.toLowerCase()
  return Object.keys(SENIORITY_RANK).filter((token) => new RegExp(`\\b${token}\\b`).test(text))
}

export function seniorityCompatible(requirement: string, title: string): boolean {
  const wanted = seniorityTokens(requirement)
  if (wanted.length === 0) return true
  const held = seniorityTokens(title)
  if (held.length === 0) return false
  const wantedRank = Math.max(...wanted.map((token) => SENIORITY_RANK[token] ?? 0))
  const heldRank = Math.max(...held.map((token) => SENIORITY_RANK[token] ?? 0))
  return heldRank >= wantedRank
}
