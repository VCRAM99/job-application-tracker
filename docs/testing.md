# Testing

There are four layers of tests, plus live model evals and performance measurement. Everything except the first layer runs against the local Supabase stack only.

| Layer | Command | Needs | What it covers |
|---|---|---|---|
| Unit and component | `npm test` | nothing | Pure logic, validators, React components (jsdom), mocked AI adapters, the caching guard, optimistic rollback |
| Database (PGlite) | `npm test` | nothing | `*.integration.test.ts` and `migration.test.ts` apply `supabase/migrations` to an in-memory Postgres and check RLS, triggers, and functions |
| Local Postgres | `npm test` with `LOCAL_SUPABASE_*` set | local Supabase | `*local-postgres.integration.test.ts` call the real PostgREST and Auth. They are skipped without the variables. |
| End to end | `npm run test:e2e` | local Supabase, Docker | Playwright (Chromium) against `next build && next start` |

CI (`.github/workflows/ci.yml`) runs typecheck, lint, `npm test`, and a build with placeholder env. The local Postgres and e2e layers are local gates (see below).

## Unit, component, and database tests

```bash
npm test
```

To include the local Postgres tests, start Supabase and pass its URL and keys:

```bash
npx supabase start
```

```bash
eval "$(npx supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')" && LOCAL_SUPABASE_URL=$API_URL LOCAL_SUPABASE_ANON_KEY=$ANON_KEY LOCAL_SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY npm test
```

The local tests refuse any URL other than `http://127.0.0.1:54321`.

## End-to-end tests

```bash
npm run test:e2e
```

This builds the app once (`e2e/support/serve.ts build`), then Playwright:

1. Runs `e2e/support/seed.ts` (global setup). It deletes and recreates two local users, `e2e-user@example.test` and `e2e-auth@example.test`. It saves a BYOK OpenAI setting with a fake key, adds verified career facts, sets the local accounting and catalog gates, and loads `src/lib/jobs/sources/fixtures/greenhouse.json` into the catalog. The generated password goes to `e2e/.state/user.json`, which is gitignored and never printed.
2. Starts three servers: a fake OpenAI endpoint on port 3199 (`e2e/support/fake-openai.ts`), the app with every V2 flag on (3100), and the same build with every flag off (3101).
3. Signs in once (`e2e/auth.setup.ts`) and runs the specs.

`npm run test:e2e:nobuild` reuses the last build.

**No live AI calls.** The app server gets `OPENAI_BASE_URL=http://127.0.0.1:3199/v1`, and the e2e user's provider is OpenAI with a fake key. Every structured call goes to the fake. The fake answers by schema name with deterministic output that the app's validators accept, and it reuses `src/lib/analyze/mock.ts` for fit analysis. Platform keys and `GEMINI_API_KEY` are empty in the server env.

**No production values.** `next build` and `next start` run in production mode, which reads `.env.local`. Next never overrides a variable that is already set, so `e2e/support/local-env.ts` starts them with every key named in `.env.local`, `.env`, and `.env.production*` preset to an empty value, then fills in the local values from `.env.development.local`. Only key names are read from those files. After the build, `serve.ts` checks that the browser bundle names `http://127.0.0.1:54321` and no `*.supabase.co` project.

| Spec | Covers |
|---|---|
| `auth.spec.ts` | redirect when signed out, wrong password, sign in and sign out (separate user, since sign-out ends every session), password reset pages |
| `records.spec.ts` | dashboard; companies create, edit, delete; applications create, edit, status change, filter, delete; CSV import and export; contacts; tasks and mark complete; preparation; daily tasks check-off; theme toggle |
| `jobs.spec.ts` | catalog search, save and the saved filter, hide and the include-hidden filter, Add to tracker |
| `ai.spec.ts` | fit analysis; interview questions, add to prep, practice notes, story bank; research brief; outreach draft with the "AI draft" and "Not sent" labels, mark as sent and the contact update; follow-up suggestion, create task (double click makes one task); resume upload, parse, tailor, accept, DOCX export |
| `flags-off.spec.ts` | off states for jobs, fit analysis, Resume Studio, and the coach pages; tracking pages still work and hide V2 entry points |
| `mobile.spec.ts` | ten key pages on a Pixel 7 viewport with no horizontal scroll, and the mobile navigation |

The resume test alone sets `bypassCSP`. The production CSP allows `https://*.supabase.co` only, so the browser's direct upload to local Storage would be blocked under `next start`. Every other test runs with the real policy.

### Why e2e is a local gate, not a CI job

The suite needs the full local Supabase stack (Postgres, Auth, Storage, PostgREST, and about ten containers), a production build, three servers, and local secrets generated per machine for the credential key ring, accounting gate, and catalog gate. GitHub Actions could run `supabase start`, but the image pulls and stack start-up add several minutes and are a known source of flaky runs, and the secrets would have to be generated in the workflow. Run `npm run test:e2e` before opening a PR that touches UI, data access, or actions. A CI job is a reasonable follow-up once the stack start-up has proven reliable there.

## Live model evals

`scripts/eval/*-live.ts` call a real provider with fictional fixtures and report how many outputs the validators keep or drop. They are opt-in and cost tokens. See [ai.md](ai.md), [analyze.md](analyze.md), [resume-studio.md](resume-studio.md), and [career-coach.md](career-coach.md).

## Performance measurement

```bash
npm run perf:seed
```

```bash
npx tsx e2e/support/serve.ts build && npm run perf:measure -- after
```

`perf:seed` creates `perf-user@example.test` with 100 companies, 300 applications, 200 contacts, 150 tasks, 60 preparation items, and a 500-posting catalog source. `perf:measure` starts its own servers with `PERF_TIMING=1` and records, for each page:

- first-load JS, and all JS by network idle;
- server render time;
- the Supabase calls each render makes;
- Lighthouse medians of three runs.

It also records the ten slowest statements from `pg_stat_statements`. In a second pass it turns on `auto_explain` for PostgREST's role, without bind parameters, to capture EXPLAIN ANALYZE plans. Every database setting it changes is restored. Results go to `perf-results/` (gitignored). The write-ups are [perf/baseline.md](perf/baseline.md) and [perf/after.md](perf/after.md).
