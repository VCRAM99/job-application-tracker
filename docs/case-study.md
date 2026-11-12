# Case study: Job Tracker 2.0

## Problem

A job search spreads across a dozen tools: a spreadsheet of applications, notes on companies and contacts, saved postings, resume versions, and interview prep. V1 of Job Tracker put the tracking in one private place. V2 asks whether AI can help with the judgment-heavy parts:
- how well a posting fits;
- what to change in a resume;
- how to prepare for an interview;
- what to write to a recruiter.

The constraint was to do this without the product inventing anything about the candidate, sending anything on their behalf, or holding anyone's data in a shared AI account.

## Architecture

- **Stack:** Next.js 16 (App Router, Cache Components) with React 19 Server Components, on Vercel. Supabase provides Postgres with Row Level Security on every table, plus Auth and private Storage.
- **No service-role client.** Every query runs as the signed-in user, under RLS. The few writes that cross users (AI usage accounting, the shared job catalog) go through `SECURITY DEFINER` functions that need an HMAC proof signed with a server-only secret.
- **One AI gateway.** It handles provider adapters (Gemini live; OpenAI and Anthropic mock-tested), model registry checks, a usage reservation per run, retries with one JSON repair, a 60-second timeout, and per-user rate limits counted from the usage log.
- **Bring your own key.** Provider keys are encrypted with AES-256-GCM and decrypted only on the server.
- **Feature gates.** Each V2 feature has its own flag, and `BETA_USER_IDS` gates every page, action, and AI run on the server. Merging changes nothing for users until an operator follows the [launch runbook](launch.md).

## Key decisions and trade-offs

- **The model proposes; code verifies.**
  - Requirements must quote the posting word for word.
  - Resume edits and drafts may only cite facts the user verified.
  - Research claims must quote text the user provided.
  - Paste-a-job fields must appear in the pasted text.
  - Anything unsupported is dropped before it is saved.
  - Trade-off: some recall is lost to strict grounding, in exchange for no fabricated claims.
- **No model scores.** The fit estimate is computed in code from requirement-to-fact matches, so a model cannot inflate it.
- **Nothing is sent.** Drafts are copied or opened in the user's own mail app. "Mark as sent" is a manual click.
- **BYOK and Gemini only at launch.** No platform spend or key custody. Managed AI is built but unreachable until spend caps exist.
- **Few migrations.** Rate limits reuse the usage table. The launch needed one migration: a read-only status function and a storage cap.
- **Opt-in third parties.** Sentry and CAPTCHA load only when configured:
  - **Sentry** reports through a same-origin tunnel that relays only to the project's own DSN.
  - **Turnstile** never blocks sign-in on the app side; Supabase enforces it once enabled.

## Safety approach for AI

- **Untrusted input.** Pasted text, postings, and contact notes are delimited as data in every prompt. Injected instructions are treated as content. In paste-a-job, a quote that reads like an instruction cannot ground a value.
- **Adversarial evals.**
  - Every eval case adds planted fabrications to the model's output: fake employers, titles, numbers, degrees, skills, and unknown ids.
  - It also adds injected instructions and ungrounded quotes.
  - The validators must drop all of them.
  - CI runs the mock suite and fails on any safety regression. Breaking the resume-edit validator drops the fabrication catch to 88%, which fails the build.
- **Independent review.** A separate reviewer agent that did not write the code reviewed each launch milestone. Every real finding was fixed with a regression test. One finding was about the evaluation itself: the first "held-out" fixtures had leaked into tuning. They were relabeled, and new held-out postings were written and scored once.

## Testing and evals

- **Vitest:** 652 tests in 86 files: unit, component, in-memory Postgres (PGlite), and RLS tests against local Supabase.
- **Playwright:** 43 end-to-end tests against a production build, with the production CSP enforced, a fake AI provider, and Cloudflare's Turnstile test key.
- **Live Gemini evals** (`gemini-3.5-flash-lite`, [docs/evals/latest.md](evals/latest.md)):
  - 100% of 56 planted fabrications and 3 injections dropped; 100% citation validity.
  - Requirement extraction: 97.2% precision, 96.4% recall across 20 postings. On four held-out postings, recall rose from 83.9% with the previous prompt to 96.8%, at 100% precision.

## Performance

Measured with Lighthouse (simulated mobile) and Postgres statement stats on a seeded dataset (300 applications, 500 postings); see [docs/perf](perf).

- **Auth calls:** signed-in pages make 2 per render, down from 3–12, after the performance pass. Application detail went from 27 Supabase calls to 16.
- **First-load JS:**
  - Daily Tasks: 291 → 191 KB. Charts load on demand.
  - Resumes: 278 → 184 KB. The Supabase browser client loads on the first upload.
- **Accessibility:** Lighthouse scores 100 on every measured page except Career (96).
- **Budget held:** later milestones kept first-load JS within 5%. The V2 wrap-up added at most 0.3 KB.

## What I'd do next

- **Managed AI with real spend caps.** Count provider calls, not runs, and add a kill switch.
- **Live-verify OpenAI and Anthropic** with the same eval suite.
- **More job-board sources**, and a helper that finds a company's public board.
- **Cover letters and more resume templates**, using the existing validators.
- **A local AI companion** (Tauri + Ollama), so resumes never leave the machine.
- **End-to-end tests in CI.**

The full list is in [roadmap.md](roadmap.md).

## Resume bullets

- Built Job Tracker 2.0 on Next.js 16, React 19, and Supabase. AI features include fit analysis, resume tailoring, an interview and outreach coach, and paste-a-job import. Each runs on the user's own Gemini key, behind per-user beta gating and rate limits.
- Designed a "model proposes, code verifies" pipeline: every AI claim must quote the posting or the user's verified facts. Live evals drop 100% of 56 planted fabrications and 3 prompt injections, and CI fails on any safety regression.
- Raised requirement-extraction recall on held-out postings from 83.9% to 96.8% at 100% precision. On the way, traced a reported 60% precision to incomplete eval labels rather than model errors.
- Cut auth round trips per signed-in render from up to 12 to 2, and Supabase calls on the heaviest page from 27 to 16. Reduced first-load JS on two routes by about 100 KB each (291 → 191 KB, 278 → 184 KB) while keeping Lighthouse accessibility at 100 on 9 of 10 measured pages.
- Hardened the launch with Row Level Security and no service-role key; HMAC-gated database functions; encrypted BYOK keys; a strict CSP and HSTS; opt-in Turnstile CAPTCHA; and a DSN-pinned Sentry tunnel. Verified with 652 unit and integration tests, 43 Playwright tests, and independent agent reviews.
