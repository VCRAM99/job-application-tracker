# Changelog

## v2.0.0 — Job Tracker 2.0

V2 adds an AI layer on top of the original tracker. Every V2 feature is off by default, gated per feature and by `BETA_USER_IDS`, and runs on the user's own Gemini key. Production activation steps are in [docs/launch.md](docs/launch.md).

### V2 wrap-up

- **Extraction quality.**
  - The precision reported in M6c (60%) came from incomplete gold labels: every "false positive" was a real requirement. The labels are complete now.
  - Added seven realistic tuning postings (about-us copy, duties, benefits, pay, equal-opportunity text, repeated requirements) and four held-out postings, written after the filters were final and scored once.
  - Clearer prompt guidance; boilerplate and duplicate filters in grounding; prompt version `job-fit-2026-11-11`.
  - Live, all sets: precision 97.2%, recall 96.4%. Held out: 100% / 96.8%, up from 100% / 83.9%.
- **CAPTCHA.** Cloudflare Turnstile on sign-up, sign-in, and the reset request. It is active only with `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, with no app-side enforcement, so a missing or broken widget never locks anyone out before Supabase CAPTCHA is turned on. The CSP allows Cloudflare only when enabled.
- **Sentry tunnel.** `/monitoring` is now a route handler that forwards only envelopes for the configured DSN (host, project id, and key), caps bodies at 256 KB, and logs nothing. This replaces the SDK rewrite tunnel, which could relay to any project.
- **Dependencies.** Patch and minor upgrades (Next 16.4.6, React 19.3.1, Sentry 11.12, and others). Production advisories went from 12 to 8, all low or moderate and documented in [docs/dependencies.md](docs/dependencies.md).
- **Review.** An independent reviewer agent found 12 issues (7 medium, 5 low, none critical or high), all fixed with regression tests. It also found that the first "held-out" set had leaked into tuning; that set now counts as tuning, and new held-out postings replace it.
- **Verification.** 652 Vitest tests in 86 files, 43 Playwright tests, and evals at 100% safety. First-load JS changed by at most +0.3 KB, with no accessibility drop ([docs/perf/v2.md](docs/perf/v2.md)).
- **Paste a job posting.** Paste the text of any posting (Workday, LinkedIn, a company site). AI proposes company, title, location, arrangement, employment type, salary, and requisition ID; only values grounded in the pasted text are filled in. The user reviews before saving, the existing duplicate check applies, fit analysis is one click away, and the link is never fetched.
- **Open to everyone.** `BETA_USER_IDS=*` opens every V2 feature to every signed-in user (unset or malformed stays closed). Privacy and terms pages (plain-language templates) are linked from every footer and from sign-up. Settings → Your data downloads everything an account owns as JSON. A runbook step covers account deletion requests.
- **Docs.** [Roadmap](docs/roadmap.md), [case study](docs/case-study.md), and an updated README.

### M6c — Hardening and launch (PR #10)

- `BETA_USER_IDS` gates every V2 page, action, and AI run on the server. `AI_PROVIDERS_ENABLED` defaults to Gemini only, and managed AI is unreachable unless enabled.
- Model ids were checked against provider docs; the model chosen in Settings drives every feature; Gemini falls back once on overload.
- Per-user AI rate limits (6 per minute, 80 per day); a tighter CSP, HSTS, and COOP; a 60-second provider timeout; a cap on stored resume files.
- Opt-in, scrubbed Sentry and a read-only `jobs status` command.
- One eval runner (mock in CI, live on demand) with 100% safety gates; an independent security review; a launch runbook.

### M6b — UI simplification (PR #9)

- Page headers with help tips and ⋯ menus, grouped navigation, and progressive disclosure for optional detail.

### M6a — Performance (PR #8)

- 2 auth calls per signed-in render, down from 3–12. Application detail: 16 Supabase calls, down from 27.
- First-load JS: Daily Tasks 291 → 189 KB, Resumes 278 → 182 KB.
- Playwright end-to-end suite, perf tooling, and a guard that keeps `next dev` on local Supabase.

### M5 — Interview and networking coach (PR #7)

- Interview questions from a fit analysis, a STAR story bank, practice notes, research briefs that cite only user-provided sources, outreach and application-answer drafts checked against verified facts, and follow-up suggestions. Nothing is ever sent.

### M4 — Resume Studio (PR #6)

- Upload a PDF or DOCX, parse it with grounding, tailor it to an analysis with edits that must cite verified facts, accept or reject each edit, and export to PDF or DOCX.

### Jobs activation (PRs #4, #5)

- Operator CLI to preview, register, approve, and refresh job sources; a daily Vercel Cron runs ingestion, then alerts; an optional allowlist for recommended jobs.

### M3 — Job intelligence (PR #3)

- Fit analysis: requirements quoted from the posting, matched to verified facts, and scored in code.

### M2 — Recommended jobs (PR #2)

- A shared catalog from approved public job boards (Greenhouse, Lever, and Ashby adapters behind an approval gate), private preferences, alert planning, add-to-tracker, and duplicate rejection with a database match key.

### M1 — AI career foundation (PR #1)

- Career profile with suggested facts that stay unverified until accepted. A provider-independent AI gateway. Encrypted BYOK keys. HMAC-gated usage accounting.

## v1 — Job Tracker

- Applications, companies, contacts, tasks, preparation, daily tasks, optional health tracking, CSV/XLSX import and export, Supabase Auth with RLS.
