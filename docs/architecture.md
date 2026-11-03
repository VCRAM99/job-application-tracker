# Architecture

Job Tracker is a Next.js 16 App Router app with Cache Components on, React 19, and Supabase (Postgres with row-level security, Auth, and Storage). It deploys to Vercel. This page covers how the code is layered, how data is read and written, what may be cached, and how pages stream.

## Layers

| Layer | Where | What it does |
|---|---|---|
| Routes | `src/app/(app)/**/page.tsx`, `src/app/(auth)`, `src/app/api`, `src/app/export` | Server Components that read `params` and `searchParams`, call loaders, and compose components. Signed-in pages sit under `(app)`, whose layout checks the session. |
| Components | `src/components/<domain>/` | Server Components by default. A file says `"use client"` only when it needs state, effects, browser APIs, or event handlers. `src/components/ui` holds the base-ui wrappers. |
| Domain code | `src/lib/<domain>/` | One folder per domain: `records` (companies, applications, contacts, tasks, preparation), `daily`, `jobs`, `analyze`, `resume`, `career`, `coach`, `ai`, `auth`, `import`. |
| Data access | `src/lib/supabase/` | `server.ts` creates the RLS-scoped client from the request's cookies. `proxy.ts` refreshes the session in `src/proxy.ts`. `client.ts` is the browser client, used only for direct Storage uploads. |
| Database | `supabase/migrations/` | Tables, RLS policies, guard triggers, and the few `security definer` functions. Production applies migrations when a PR merges to `main` (see `supabase/migrations/README.md`). |

Inside a domain folder the files follow one naming pattern:

- `data.ts` (or `<area>-data.ts`): server-only reads that pages and components call.
- `actions.ts` (or `<area>-actions.ts`): `"use server"` mutations. Each one checks its feature flag, calls `requireUser()`, validates `FormData`, writes, and revalidates.
- `action-utils.ts`: shared helpers for those actions. Not a `"use server"` module, so nothing in it becomes an endpoint.
- Pure modules (`logic.ts`, `query.ts`, `tracker.ts`, `dashboard.ts`, `pagination.ts`, `schemas.ts`, `constants.ts`, `flags.ts`): no I/O. They hold parsing, filtering, sorting, scoring, and validation, and carry most of the unit tests.

The career and coach actions are split by concern: profile and sources, AI settings and keys, fact review, and extraction for career; interview and draft forms plus shared controls for the coach UI.

## Data access pattern

Every read and write follows the same steps:

1. `const user = await requireUser()` gets the signed-in user. `getCurrentUser` is wrapped in React `cache()`, so a request makes one auth check no matter how many loaders call it. React's cache lasts one server request and is never shared between users.
2. `const supabase = await createClient()` gets the RLS-scoped client.
3. Each query names its columns where practical and still filters `.eq("user_id", user.id)`, even though RLS would also enforce it. A cross-user id therefore returns nothing instead of relying on one layer.
4. Independent queries run together with `Promise.all`. A query that needs only an id from the URL starts at the same time as the main record, not after it.
5. Loaders return `DataResult<T>` (`{ ok: true, data }` or `{ ok: false, error: "missing_table" | "unavailable" }`). Pages render the error state; they do not throw for missing tables.
6. Related rows come from one request when PostgREST can embed them through the owner foreign key, as in `getApplication`, which reads the company via `companies!applications_company_owner_fkey`.

AI calls go through the M1 gateway (`src/lib/ai/gateway.ts`) and the per-feature `run` modules. Every model output is validated in code before anything is saved.

Mutations revalidate the paths they change and never cache across users. Long lists (applications, contacts) are filtered and sorted in memory, which needs every row for counts and filter options, and then render 100 rows per page (`src/lib/records/pagination.ts`).

## Caching rule

Shared caches hold only public, user-independent data.

- `"use cache"` (any variant), `unstable_cache`, `cacheLife`, and `cacheTag` may appear only under `src/lib/public/`. Files there may not import the session, cookies, headers, or the RLS-scoped Supabase client.
- `src/lib/caching-guard.test.ts` enforces both rules on every test run.
- Today nothing is shared-cached. Every page depends on the signed-in user, so pages call `connection()` (directly or through `getCurrentUser`) and render per request.
- React `cache()` is request-scoped and fine anywhere. It is how `getCurrentUser` avoids repeated auth calls.

## Streaming conventions

- The `(app)` layout renders the shell inside `<Suspense>` after the session check. Routes with a `loading.tsx` show a spinner while the page itself loads.
- A section that is secondary to the page and has its own queries (coach follow-ups, drafts, prep) renders inside `<Suspense fallback={<SectionSkeleton …/>}>` (`src/components/shell/section-skeleton.tsx`). The main content then does not wait for it.
- When the page already knows what the section needs, it starts the section's promise before its own `await` and passes it in, so both load at once. The dashboard does this with `loadFollowUps()`.
- Heavy client-only pieces load on demand: the health charts (recharts) use `next/dynamic` with `ssr: false` and a placeholder of the same height, and the resume upload imports the Supabase browser client when a file is chosen. PDF and DOCX export, PDF text extraction, and XLSX parsing run only on the server.

## Optimistic updates

The application status change, task completion, job Save/Unsave and Hide/Unhide, and draft "Mark as sent" show their result before the server answers.

- Each update uses `useOptimistic` or the action's pending state inside a transition. When the action finishes, React drops the optimistic value and the server state shows. A rejected or failed write therefore returns to the saved value by itself, and any error message the action returns is shown.
- Forms keep `action={serverAction}` so they still post without JavaScript. With JavaScript they call the action from `onSubmit` inside `startTransition`. Rollback is covered by `src/components/optimistic.test.tsx`.

## Safety guards

- `next dev` refuses to start unless `NEXT_PUBLIC_SUPABASE_URL` is the local stack (`http://127.0.0.1:54321` or `localhost`). Setting `ALLOW_REMOTE_SUPABASE_IN_DEV=true` allows a hosted project on purpose. The check runs only in the development-server phase (`next.config.ts`, `src/lib/dev-guard.ts`), so `next build` and production servers are unaffected.
- `PERF_TIMING=1` (ignored on Vercel) logs each Supabase request's method, path, status, and duration, never query strings, headers, or bodies (`src/lib/supabase/timing.ts`). Only `scripts/perf/measure.ts` turns it on.
- V2 features need both their flag and beta access (`src/lib/beta.ts`). The check is per request and per user: the nav, pages, server actions, and `prepareAiRun` all call the same `v2Allowed` helpers, so a hidden link cannot be bypassed with a direct request. See [ai.md](ai.md#beta-access-and-providers).
- The CSP's `connect-src` names only the configured Supabase origin, plus its WebSocket form (`src/lib/security-headers.ts`). Production also sends HSTS, COOP and a restrictive Permissions-Policy.
- Feature flags default off and are read on the server at request time, so the same build serves both flag states (the e2e suite runs one build with flags on and off).
