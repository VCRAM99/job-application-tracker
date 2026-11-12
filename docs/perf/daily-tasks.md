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
