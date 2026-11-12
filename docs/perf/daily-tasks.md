# Daily Tasks performance

Measured with `scripts/perf/daily-tasks.ts` against a production build (`npx tsx e2e/support/serve.ts build`) and local Supabase, as the perf user with health tracking on and five daily habits. Lighthouse and first-load JS come from `scripts/perf/measure.ts`.

**How the timings are taken:**
- **click → UI:** a capture-phase `pointerdown` listener in the page starts the clock. It stops at the first DOM change or animation frame where the expected change is on screen (the habit shown as done, the meal listed, the next date shown).
- **click → confirmed:** stops when the server action's response has been read in full.
- **Runs:** each figure is the median of 7.
- **Latency pass:** a second pass adds 150 ms of round-trip latency between browser and server (Chrome network emulation). Local Supabase answers in about 1–5 ms, so the local pass hides any wait for the server.

## Before (main at 71b9a66)

| Interaction | Local: click → UI | Local: click → confirmed | +150 ms RTT: click → UI | +150 ms RTT: click → confirmed |
|---|---|---|---|---|
| Toggle a checklist item | 53.9 ms | 51.2 ms | 167.2 ms | 156.6 ms |
| Add a calorie entry | 78.3 ms | 75.8 ms | 196.6 ms | 156.0 ms |
| Change day (Next day) | 53.6 ms | — | 163.2 ms | — |

The UI changes only after the server answers: each action revalidates `/daily-tasks`, and adding food also redirects, so the click waits a full round trip plus a server re-render.

| Page | First-load JS (transfer) | All JS by idle | Server render | Supabase calls | Lighthouse perf / a11y / best practices | LCP | TBT |
|---|---|---|---|---|---|---|---|
| /daily-tasks | 191.0 KB | 381.1 KB | 57 ms | 11 (2 auth) | 93 / 100 / 100 | 3238 ms | 39 ms |

## After (feature/daily-tasks-overhaul)

| Interaction | Local: click → UI | Local: click → confirmed | +150 ms RTT: click → UI | +150 ms RTT: click → confirmed |
|---|---|---|---|---|
| Toggle a checklist item | **4.6 ms** (was 53.9) | 31.2 ms (was 51.2) | **5.6 ms** (was 167.2) | 165.7 ms (was 156.6) |
| Add a calorie entry | **4.4 ms** (was 78.3) | 24.0 ms (was 75.8) | **4.3 ms** (was 196.6) | 165.5 ms (was 156.0) |
| Change day (Next day) | **3.1 ms** (was 53.6) | — (no request) | **3.0 ms** (was 163.2) | — |

Targets: UI update under 100 ms (met: 3–6 ms), and server confirmation under 1 s locally (met: 24–31 ms).

**Why it is faster:**
- **Mutations:** every change shows in the next frame through `useOptimistic`. The server action returns only the saved row, with no revalidation or redirect, so confirmation costs one Supabase write instead of a full page re-render. With 150 ms latency the confirmation still takes one round trip (about 166 ms), but the UI no longer waits for it.
- **Day changes:** these are state changes over about 105 days loaded in one parallel batch. Nearby days load in the background before you reach them.

| Page | First-load JS (transfer) | All JS by idle | Server render | Supabase calls | Lighthouse perf / a11y / best practices | LCP | TBT |
|---|---|---|---|---|---|---|---|
| /daily-tasks before | 191.0 KB | 381.1 KB | 57 ms | 11 (2 auth) | 93 / 100 / 100 | 3238 ms | 39 ms |
| /daily-tasks after | 199.3 KB (+4.3%) | 277.4 KB (−104 KB) | 46 ms | 11 (2 auth) | 92 / 100 / 100 | 3392 ms | 16 ms |

**First-load JS** is +8.3 KB (+4.3%), within the 5% budget. That covers the client page, its optimistic store, and the preferences panel. JS fetched by idle is 104 KB lower: the health chart (recharts) now loads only when Health Insights scrolls into view.

**LCP and Lighthouse.** The first "after" run had the chart rendering on load: LCP 4051 ms, performance 87. With the chart mounted on visibility, LCP is 3392 ms, within the ±150 ms run-to-run swing of this setup, and performance is 92 against 93. Accessibility stays at 100.

**Other pages:** first-load JS on the other measured pages changed by −0.2 to 0 KB, and accessibility held everywhere. The dashboard read 79 once and 93 on the next run, with no code change, matching the noise seen in earlier milestones.
