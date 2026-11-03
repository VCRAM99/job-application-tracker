# Performance and accessibility after M6c (hardening and launch)

Measured on 2026-11-03 with the same script, machine and dataset as [m6b.md](m6b.md): `scripts/perf/measure.ts` on a production build against local Supabase. Health tracking was off for the perf user. `npx tsx scripts/perf/compare.ts m6b m6c` prints this table.

**Budget: first-load JS no more than 5% above M6b on any route. Met.** The largest increase is +2.0 KB (+1.1%), on Resumes, from the new "Unlinked versions" section and its delete control. Sentry adds nothing to the bundle without `SENTRY_DSN`: the client loads it with a dynamic import only when a DSN is set.

**Accessibility: no score went down.** Career stays at 96; every other measured page stays at 100.

| Page | First-load JS KB (transfer) | All JS by idle KB | Server render ms | Supabase calls | Auth calls | Lighthouse perf | a11y | best practices | LCP ms | TBT ms |
|---|---|---|---|---|---|---|---|---|---|---|
| login | 194.4 → 194.4 (0.0) | 209.5 → 209.5 (0.0) | 20 → 22 (+2) | 0 → 0 (0) | 0 → 0 (0) | 95 → 95 (0) | 100 → 100 (0) | 96 → 96 (0) | 2933 → 2943 (+10) | 26 → 35 (+9) |
| dashboard | 217.7 → 217.8 (+0.1) | 272.7 → 274.8 (+2.1) | 51 → 63 (+12) | 12 → 12 (0) | 2 → 2 (0) | 94 → 93 (-1) | 100 → 100 (0) | 100 → 100 (0) | 3092 → 3247 (+155) | 16 → 31 (+15) |
| applications list | 183.4 → 183.5 (+0.1) | 310.8 → 312.9 (+2.1) | 56 → 75 (+19) | 5 → 5 (0) | 2 → 2 (0) | 91 → 95 (+4) | 100 → 100 (0) | 100 → 100 (0) | 3495 → 2952 (-543) | 16 → 13 (-3) |
| application detail | 219.1 → 219.3 (+0.2) | 288.9 → 278.0 (-10.9) | 58 → 63 (+5) | 16 → 16 (0) | 2 → 2 (0) | 92 → 94 (+2) | 100 → 100 (0) | 100 → 100 (0) | 3386 → 3105 (-281) | 17 → 36 (+19) |
| jobs | 187.5 → 187.6 (+0.1) | 268.5 → 270.6 (+2.1) | 89 → 102 (+13) | 8 → 8 (0) | 2 → 2 (0) | 95 → 92 (-3) | 100 → 100 (0) | 100 → 100 (0) | 2937 → 3317 (+380) | 16 → 40 (+24) |
| analyze result | 186.2 → 186.4 (+0.2) | 277.9 → 280.1 (+2.2) | 49 → 62 (+13) | 12 → 12 (0) | 2 → 2 (0) | 95 → 95 (0) | 100 → 100 (0) | 100 → 100 (0) | 2934 → 2966 (+32) | 11 → 35 (+24) |
| resumes | 182.6 → 184.6 (+2.0) | 269.0 → 266.0 (-3.0) | 39 → 37 (-2) | 3 → 6 (+3) | 2 → 2 (0) | 96 → 96 (0) | 100 → 100 (0) | 100 → 100 (0) | 2784 → 2796 (+12) | 17 → 23 (+6) |
| career | 220.8 → 221.3 (+0.5) | 301.2 → 303.7 (+2.5) | 53 → 57 (+4) | 15 → 15 (0) | 2 → 2 (0) | 94 → 94 (0) | 96 → 96 (0) | 96 → 96 (0) | 3094 → 3134 (+40) | 29 → 49 (+20) |
| networking | 220.5 → 220.7 (+0.2) | 279.5 → 276.8 (-2.7) | 53 → 56 (+3) | 6 → 6 (0) | 2 → 2 (0) | 93 → 94 (+1) | 100 → 100 (0) | 100 → 100 (0) | 3249 → 3151 (-98) | 11 → 28 (+17) |
| daily tasks | 191.1 → 191.2 (+0.1) | 267.3 → 269.3 (+2.0) | 54 → 48 (-6) | 5 → 5 (0) | 2 → 2 (0) | 94 → 94 (0) | 100 → 100 (0) | 100 → 100 (0) | 3081 → 3125 (+44) | 16 → 37 (+21) |

**Server work.** Supabase and auth call counts are unchanged on every page except Resumes (3 → 6). That page now also lists the user's Storage folder to clean up uploads abandoned for more than 24 hours, and loads unlinked versions. All three run in the same `Promise.all`, so server render time did not rise (39 → 37 ms). The beta check reuses the request-cached user, so it adds no auth call.

**Lighthouse performance and LCP** moved by −3 to +4 points and −543 to +380 ms, with no consistent direction. Applications list and application detail got faster; Jobs and dashboard got slower. Server render times are 2–19 ms higher on most pages, from the per-request beta and provider checks plus run-to-run noise. Total blocking time rose 6–24 ms on most pages and still stays under 50 ms everywhere. That is consistent with simulated-throttling variance on an unchanged bundle; the M6a notes describe the method's run-to-run spread.
