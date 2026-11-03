/**
 * Writes docs/ui/review.md: before/after screenshot pairs side by side, one row per capture.
 *
 *   npx tsx scripts/ui/review.ts
 */
import { existsSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"

const ROOT = path.resolve(__dirname, "../..")
const DIR = path.join(ROOT, "docs/ui")

/** One line per page: what changed. */
const SUMMARY: Record<string, string> = {
  login: "Unchanged.",
  signup: "Unchanged.",
  "forgot-password": "Unchanged.",
  "reset-password": "Unchanged.",
  dashboard: "Header paragraph moved into a HelpTip; follow-ups show Create task with Draft message and Dismiss in ⋯; grouped navigation.",
  companies: "Header sentence moved into a HelpTip.",
  "company-detail": "Delete company moved into ⋯ (same confirmation dialog); Edit and Add application stay.",
  "company-new": "Form explanation moved into a HelpTip.",
  applications: "Header sentence moved into a HelpTip; Import / export and Add application stay.",
  "application-detail": "One header action (Edit); Analyze fit, Tailor resume, and Delete application in ⋯.",
  "application-new": "Form explanation moved into a HelpTip.",
  "application-edit": "Form explanation moved into a HelpTip.",
  "applications-import": "Header, template, and accepted-values intros moved into HelpTips; the accepted-values table stays visible.",
  networking: "Header sentence moved into a HelpTip.",
  "contact-detail": "Delete contact moved into ⋯; Draft outreach and Edit stay.",
  "contact-new": "Form explanation moved into a HelpTip.",
  tasks: "Header sentence moved into a HelpTip.",
  "task-detail": "Delete task moved into ⋯; Mark complete and Edit stay.",
  "task-new": "Form explanation moved into a HelpTip.",
  preparation: "Header sentence moved into a HelpTip.",
  "preparation-detail": "Delete moved into ⋯; Edit stays.",
  "daily-tasks": "Header and weekly-insights notes moved into HelpTips.",
  "daily-task-new": "Form explanation moved into a HelpTip.",
  settings: "Shared page header; every card's explanation moved into a HelpTip on its title. Billing mode, key status, and allowance stay visible.",
  career: "Header and all five section intros moved into HelpTips; Suggested and Verified labels stay visible.",
  jobs: "Keyword, location, and sort stay; other filters fold into More filters. Cards: 4 visible actions plus ⋯ (was 10); title links to details; Why this estimate folds.",
  "job-detail": "Shared header; company stays as the subtitle.",
  "job-alerts": "Header sentence moved into a HelpTip.",
  analyze: "Header and job-description intros moved into HelpTips; billing mode stays visible.",
  "analyze-result": "All analyses moved into ⋯; separate-checks, partial-match, and readability intros moved into HelpTips. The qualification disclaimer stays visible.",
  resumes: "Header sentence moved into a HelpTip.",
  "resume-detail": "Shared header.",
  "resume-tailor": "Shared header.",
  "resume-version": "Shared header; AI-proposed · unverified and Not an ATS score stay visible.",
  "interview-new": "Shared header; billing mode stays visible.",
  "interview-set": "Shared header.",
  "story-bank": "Header sentence moved into a HelpTip.",
  "research-new": "Shared header.",
  "research-brief": "\"From your sources only\" note stays visible as the subtitle.",
  "draft-new": "Header sentence moved into a HelpTip.",
  draft: "AI draft and Not sent labels stay visible.",
  "state-empty-dashboard": "Empty dashboard with the new header.",
  "state-empty-applications": "Empty state: one line and one action.",
  "state-empty-networking": "Empty state: one line and one action.",
  "state-empty-resumes": "Empty state with the new header.",
  "state-empty-analyze": "Empty state with the new header.",
  "state-error-application-form": "Validation errors stay visible next to each field.",
  "state-dialog-delete-application": "Same confirmation dialog, opened from the ⋯ menu.",
  "state-dialog-mark-sent": "Same confirmation dialog.",
  "state-menu-application": "New: the ⋯ menu on application detail, kept inside the viewport at 390px.",
  "state-menu-job": "New: a job card's ⋯ menu with the less frequent actions.",
  "state-helptip-dashboard": "New: the header HelpTip, opened by tap on mobile.",
}

const before = existsSync(path.join(DIR, "before")) ? readdirSync(path.join(DIR, "before")) : []
const after = existsSync(path.join(DIR, "after")) ? readdirSync(path.join(DIR, "after")) : []
const names = [...new Set([...before, ...after])].filter((file) => file.endsWith(".webp")).sort((left, right) => {
  const order = Object.keys(SUMMARY)
  const key = (file: string) => order.indexOf(file.split("--")[0]!)
  return key(left) - key(right) || left.localeCompare(right)
})

const rows = names.map((file) => {
  const [page, variant] = file.replace(/\.webp$/, "").split("--")
  const cell = (side: "before" | "after", list: string[]) => (list.includes(file) ? `<img src="${side}/${file}" width="420" alt="${page} ${variant} ${side}">` : "—")
  return `| **${page}** (${variant}) | ${cell("before", before)} | ${cell("after", after)} | ${SUMMARY[page!] ?? ""} |`
})

writeFileSync(
  path.join(DIR, "review.md"),
  [
    "# UI review: before and after (M6b)",
    "",
    "Captured by `scripts/ui/screenshots.ts` from a production build. Every V2 flag is on, the data is the perf dataset (300 applications, 200 contacts, 500 postings), and AI states come from the fake provider. Variants: dark desktop, light desktop, and 390px mobile. Rules: [conventions.md](conventions.md). Findings: [audit.md](audit.md).",
    "",
    "| Page | Before | After | What changed |",
    "|---|---|---|---|",
    ...rows,
    "",
  ].join("\n"),
)
console.log(`${rows.length} rows in docs/ui/review.md`)
