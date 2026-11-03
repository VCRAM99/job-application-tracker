# Performance and accessibility after M6b (UI simplification)

Measured on 2026-11-02 with the same script, machine, and dataset as [after.md](after.md) (M6a): `scripts/perf/measure.ts` on a production build. Health tracking was off for the perf user in both runs. `npx tsx scripts/perf/compare.ts after m6b` prints this table.

**Budget: first-load JS no more than 5% above M6a on any route. Met.** The largest increase is +2.2 KB (+1.2%) on Jobs. It comes from the shared HelpTip and ⋯ menu code (portal positioning, about 1–2 KB), which every page header now uses. No menu library was added.

| Page | First-load JS KB (transfer) | Change | All JS by idle KB | Lighthouse perf | a11y | best practices | LCP ms |
|---|---|---|---|---|---|---|---|
| login | 194.4 → 194.4 | 0.0% | 209.5 → 209.5 | 95 → 95 | 100 → 100 | 96 → 96 | 2955 → 2933 |
| dashboard | 216.2 → 217.7 | +0.7% | 261.7 → 272.7 | 93 → 94 | 100 → 100 | 100 → 100 | 3242 → 3092 |
| applications list | 182.2 → 183.4 | +0.7% | 296.5 → 310.8 | 95 → 91 | 100 → 100 | 100 → 100 | 2946 → 3495 |
| application detail | 217.7 → 219.1 | +0.6% | 263.2 → 288.9 | 94 → 92 | 100 → 100 | 100 → 100 | 3095 → 3386 |
| jobs | 185.3 → 187.5 | +1.2% | 257.8 → 268.5 | 94 → 95 | 100 → 100 | 100 → 100 | 3088 → 2937 |
| analyze result | 184.3 → 186.2 | +1.0% | 261.0 → 277.9 | 95 → 95 | 100 → 100 | 100 → 100 | 2960 → 2934 |
| resumes | 182.0 → 182.6 | +0.3% | 254.3 → 269.0 | 96 → 96 | 100 → 100 | 100 → 100 | 2794 → 2784 |
| career | 219.6 → 220.8 | +0.5% | 290.5 → 301.2 | 94 → 94 | **94 → 96** | 96 → 96 | 3104 → 3094 |
| networking | 219.1 → 220.5 | +0.6% | 260.5 → 279.5 | 94 → 93 | 100 → 100 | 100 → 100 | 3094 → 3249 |
| daily tasks | 189.3 → 191.1 | +1.0% | 255.9 → 267.3 | 94 → 94 | 100 → 100 | 100 → 100 | 3087 → 3081 |

**Accessibility.** No score went down. Career rose from 94 to 96, because card titles are now real `h2` headings instead of `div`s, which fixes the heading order. The other measured pages stay at 100.

**Lighthouse performance** moved by −4 to +1 points. LCP moved by −150 to +549 ms, with no consistent direction: some pages got faster (dashboard −150 ms, jobs −151 ms) and others slower (applications list +549 ms, application detail +291 ms). The `next build` output is unchanged apart from about 1–2 KB of shared code, and server calls are identical (same Supabase and auth counts as M6a). Most of this looks like simulated-throttling run-to-run variance (see the M6a notes), though the applications list's +549 ms is larger than the usual swing.

**Server work is unchanged.** Supabase calls per render and auth calls (2) match M6a on every page. M6b changed no data access.
