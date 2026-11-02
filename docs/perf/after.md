# Performance after M6a

The [baseline](baseline.md) measurements were rerun identically on 2026-11-02 against a production build of `feature/v6a-performance`:

- same script (`scripts/perf/measure.ts`) and machine;
- the local database was reset, then reseeded with the same dataset;
- every V2 flag was on, and every AI call went to the fake provider.

`npx tsx scripts/perf/compare.ts baseline after` prints this table.

Local Supabase answers in a few milliseconds, so server render times move little here. What carries over to production is the **number of Supabase round trips** per render, each of which costs roughly 20–80 ms against the hosted project, and the JS sizes. Lighthouse runs a simulated slow-4G mobile profile, so a ±150 ms LCP change from one run to the next is noise.

## Before → after

| Page | First-load JS KB (transfer) | All JS by idle KB | Server render ms | Supabase calls | Auth calls | Lighthouse perf | a11y | best practices | LCP ms | TBT ms |
|---|---|---|---|---|---|---|---|---|---|---|
| login | 194.4 → 194.4 | 209.5 → 209.5 | 19 → 18 | 0 → 0 | 0 → 0 | 95 → 95 | 100 → 100 | 96 → 96 | 2932 → 2955 | 24 → 38 |
| dashboard | 216.8 → 216.2 | 455.9 → 261.7 | 50 → 44 | 14 → 12 | 4 → 2 | 94 → 93 | 100 → 100 | 100 → 100 | 3091 → 3242 | 15 → 23 |
| applications list | 182.2 → 182.2 | 461.3 → 296.5 | 64 → 56 | 7 → 5 | 4 → 2 | 94 → 95 | 100 → 100 | 100 → 100 | 3095 → 2946 | 17 → 9 |
| application detail | 218.0 → 217.7 | 457.4 → 263.2 | 60 → 49 | **27 → 16** | **12 → 2** | 94 → 94 | 100 → 100 | 100 → 100 | 3092 → 3095 | 9 → 10 |
| jobs | 185.2 → 185.3 | 451.7 → 257.8 | 89 → 84 | 10 → 8 | 4 → 2 | 95 → 94 | 100 → 100 | 100 → 100 | 2937 → 3088 | 9 → 21 |
| analyze result | 184.3 → 184.3 | 448.2 → 261.0 | 54 → 45 | 13 → 12 | 3 → 2 | 95 → 95 | 100 → 100 | 100 → 100 | 2939 → 2960 | 14 → 16 |
| resumes | **277.7 → 182.0** | 448.2 → 254.3 | 42 → 41 | 5 → 3 | 4 → 2 | 94 → 96 | 100 → 100 | 96 → 100 | 3089 → 2794 | 13 → 25 |
| career | 219.6 → 219.6 | 454.9 → 290.5 | 52 → 52 | 16 → 15 | 3 → 2 | 94 → 94 | 94 → 94 | 96 → 96 | 3099 → 3104 | 21 → 30 |
| networking | 218.4 → 219.1 | 454.9 → 260.5 | 64 → 58 | 8 → 6 | 4 → 2 | 93 → 94 | 100 → 100 | 100 → 100 | 3241 → 3094 | 14 → 11 |
| daily tasks | **291.1 → 189.3** | 449.8 → 255.9 | 48 → 49 | 8 → 5 | 5 → 2 | 92 → 94 | 100 → 100 | 100 → 100 | 3405 → 3087 | 22 → 21 |

## Top improvements

1. **Auth round trips.** Every signed-in render now makes 2 auth calls: the proxy's session refresh plus one shared `getCurrentUser`. Before it made 3–12. Application detail went from 12 to 2, and its total Supabase calls from 27 to 16.
2. **Prefetched JS: about 165–194 KB less transfer on every signed-in page.** recharts moved out of the Daily Tasks route chunk, so prefetching sidebar links no longer pulls it into every page.
3. **Daily Tasks first-load JS: 291 → 189 KB.** The health charts load on the client when needed, behind same-height placeholders.
4. **Resumes first-load JS: 278 → 182 KB.** The Supabase browser client loads on the first upload. Best practices went from 96 to 100.
5. **Waterfalls removed.**
   - Application detail loads versions and the latest analysis alongside the application, which embeds its company in one request.
   - The dashboard's follow-ups start with its own queries and stream in.
   - Coach sections stream behind skeletons instead of holding the page.

Long lists also render at most 100 rows per page now. The applications and contacts lists in this dataset have 300 and 200 rows.

## Slowest queries

Statement times are unchanged within noise. Every record query still takes under 2.5 ms (mean, `pg_stat_statements`):

| # | Before ms | After ms | Statement |
|---|---|---|---|
| 1 | 2.51 | 2.37 | `SELECT applications.* … WHERE user_id = $1` |
| 2 | 1.62 | 1.46 | `SELECT contacts.* … WHERE user_id = $1` |
| 3 | 1.08 | 1.24 | dashboard applications columns |
| 4 | 0.84 | 1.34 | follow-up applications columns |
| 5 | 0.76 | 0.69 | contact form application options |
| 6 | 0.38 | 0.37 | dashboard tasks |
| 7 | 0.36 | 0.44 | follow-up contacts |
| 8 | 0.33 | 0.44 | dashboard contacts |
| 9 | 0.25 | 0.32 | dashboard companies |
| 10 | 0.17 | not in top 10 | company options (after: `INSERT INTO user_preferences`, 1.98 ms, once, the first-visit timezone sync) |

The ranks are matched by statement, not by position. The after database was freshly reset, so its first-call costs land in different places.

Jobs search (`search_job_postings`, auto_explain) took 164.4 and 155.7 ms before, and 179.4 and 160.5 ms after. It has the same plan. The cost is per-row match scoring in SQL, which an index does not reach (see the baseline). M6a adds no migration.
