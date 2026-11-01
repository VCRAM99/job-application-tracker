/** A fictional person and fictional employers. example.com and 555 numbers only. */
export const AVERY_LINES = [
  "Avery Quill",
  "avery.quill@example.com | +1 555 0100 | Toronto, Canada",
  "Summary",
  "Backend engineer with 6 years building payment and data services.",
  "Experience",
  "Senior Backend Engineer, Lumen Ridge Labs, Toronto, Jan 2022 - Present",
  "- Cut p95 checkout latency by 40% by moving fraud checks to an async queue.",
  "- Led 3 engineers to migrate billing from MySQL to PostgreSQL with zero downtime.",
  "- Built a reconciliation service that processes $2M in daily transactions.",
  "Backend Engineer, Harbor Finch Systems, Remote, Jun 2019 - Dec 2021",
  "- Wrote TypeScript APIs for merchant onboarding used by 1,200 merchants.",
  "- Added contract tests that reduced integration incidents by half.",
  "Education",
  "BSc Computer Science, Northgate University, 2019",
  "Skills",
  "TypeScript, Node.js, PostgreSQL, Redis, Docker, AWS",
  "Projects",
  "Ledgerlite - open-source double-entry ledger library in TypeScript.",
] as const

export const AVERY_TEXT = AVERY_LINES.join("\n")
