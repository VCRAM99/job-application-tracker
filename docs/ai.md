# Career AI (Milestone 1)

Job fit analysis is a later layer on this gateway. Flags, routes, and the local Gemini eval are in [analyze.md](analyze.md).

Career AI is an additive layer on Job Tracker. It does not change companies, applications, networking, tasks, preparation, daily tasks, or health tracking. The feature is off in production until `AI_FEATURES_ENABLED` is explicitly true. If the career migration has not been applied, Career and AI settings show an unavailable state and the rest of the app still loads.

Live provider calls are not part of the automated tests. Tests use fake clients and an in-process PostgreSQL build.

## Architecture

Server actions call `generateStructured`. That function checks the execution mode, model registry, and credentials before it reserves usage. A provider adapter then returns text plus normalized token counts. Zod validates the JSON. Only after that validation does the action store suggestions. Finalize runs after the suggestions are stored. A failed provider call voids the reservation.

Supported cloud providers (`src/lib/ai/models.ts`; the first entry is the default):

| Provider | Adapter | Models offered | Legacy (kept for saved settings, not offered) | Status |
| --- | --- | --- | --- | --- |
| Google Gemini | `generateContent` JSON schema | `gemini-3.5-flash-lite` (default), `gemini-3.8-flash` | `gemini-2.5-flash`, `gemini-2.5-pro` | Live-verified |
| OpenAI | Chat Completions JSON schema | `gpt-6-luna` (default), `gpt-6.1-terra` | `gpt-5.4-mini`, `gpt-5.4` | Mock-tested only, hidden unless enabled |
| Anthropic | Messages API JSON schema | `claude-haiku-5-5` (default), `claude-sonnet-5-5`, `claude-sonnet-5` | `claude-haiku-4-5` | Mock-tested only, hidden unless enabled |

Model ids were checked against each provider's model page on 2026-11-02:

- Google: aistudio.google.com/docs/models. 3.8 Flash and 3.5 Flash-Lite are stable; 2.5 Flash and 2.5 Pro are deprecated, closed to new users, and shut down on December 1, 2026.
- Anthropic: platform.claude.com/docs/en/about-claude/models/overview. `claude-haiku-4-5` is an alias of a dated snapshot that retires no sooner than October 15, 2026.
- OpenAI: developers.openai.com/api/docs/models. `gpt-6-luna` is listed as the most efficient model; the 5.4 ids could not be confirmed there.

**Which model runs.** The model picked in AI settings is used by every feature (analysis, resume, coach, extraction). If nothing is picked, or the saved id is no longer in the registry, the provider default applies. `JOB_ANALYSIS_{OPENAI,ANTHROPIC,GOOGLE}_MODEL` remain operator overrides for analysis only. Unsupported model strings are rejected before a provider call. The client cannot choose an API endpoint. Prices are not stored.

**Gemini overload fallback.** When `gemini-3.5-flash-lite` answers 503 or 529 (overloaded), the adapter waits briefly and retries once on `gemini-3.8-flash`. Every other failure (bad key, rate limit, unavailable model) is reported as is. Saved results record the model that actually answered; usage rows record the requested one.

**Anthropic.** Calls set `max_tokens` to 16,000 and `output_config.effort: "low"`. Thinking tokens count toward `max_tokens`, so long inputs no longer stop at `context_limit`.

**Timeouts.** Every provider request times out after 60 seconds (`PROVIDER_TIMEOUT_MS`). Without that, the Gemini SDK waits indefinitely and the other SDKs wait up to 10 minutes. A timeout is a provider failure: the gateway retries it like other transient errors, then voids the reservation.

A provider 404, or a "model not found" message, is reported as `model_unavailable` with a message that asks the user to pick another model. It is not retried.

Execution modes:

- **Bring your own key.** Uses the encrypted key saved for the selected provider.
- **Managed AI.** Uses a platform key and the monthly allowance. Both the database policy and the server environment must allow it. Defaults are off and zero.
- **Local desktop.** Reserved for a future Windows/macOS companion. `assertCloudExecution` rejects it. This milestone does not include Tauri, Ollama, device pairing, or a remote command channel.

The gateway does not switch modes on its own. A request must match the mode saved in AI settings.

## Beta access and providers

- **`BETA_USER_IDS`** is a comma-separated list of user UUIDs. On Vercel it gates every V2 feature on the server: career AI, fit analysis, Resume Studio, the coach, and recommended jobs. Pages show the off state, actions refuse before they create a Supabase client, and `prepareAiRun` checks again before any provider call.
  - Unset on Vercel means nobody gets access; unset locally means everyone.
  - One malformed entry closes access for everyone.
  - `JOB_RECOMMENDATIONS_ALLOWED_USER_IDS` still grants Jobs on its own, so the existing production allowlist keeps working (`src/lib/beta.ts`).
- **`AI_PROVIDERS_ENABLED`** is a comma-separated list of `google`, `openai` and `anthropic`. On Vercel it defaults to `google`; locally every provider is on. A provider that is not listed is hidden in settings, refused when saved, and refused again by every run path and by `completeWithProvider`. Providers other than Google carry a "Beta — not live-verified" label.
- **Managed AI** is offered only when `AI_MANAGED_ENABLED=true` with positive limits. Otherwise every mode picker hides it, and the settings action and the run paths refuse it.

## Rate limits

Each user may start 6 AI runs per minute and 80 per day, in every mode. The limits are counted from `ai_usage_events`, so no migration was needed (`src/lib/ai/rate-limit.ts`). Cached analyses and reused results are free. A run past the limit gets "You have reached the AI request limit for now." If the count cannot be read, the check fails open; the database caps (one open reservation, 200 rows a month) still apply.

## Monitoring

Sentry is loaded only when `SENTRY_DSN` is set (`src/instrumentation.ts`, `src/instrumentation-client.ts`). It reports errors only: tracing is off, and there are no breadcrumbs and no default PII.
- `scrubEvent` keeps only the method and path of the request, and drops users, extras, spans and stack-frame source and variables.
- It redacts emails, API keys, JWTs, bearer tokens and UUIDs in messages and tags.
- Provider failures are reported once per run, tagged with code, provider and model only.
- Browser events go through the `/monitoring` tunnel, so the CSP needs no Sentry host.

## Bring your own key

Keys are encrypted with AES-256-GCM before they are written. The nonce and auth tag are stored separately from the ciphertext. `AI_CREDENTIALS_KEY` is 32 bytes, encoded as base64 or 64-character hex. `AI_CREDENTIALS_KEY_VERSION` labels the key so a later rotation can keep older ciphertext readable.

`AI_CREDENTIALS_KEY` is server-only. Do not use a `NEXT_PUBLIC_` name. The app does not use a Supabase service-role key for this.

Saved keys start as `unverified`. The database trigger rejects marking a key verified in this milestone, so the UI cannot show a provider as connected just because a key was saved. Revoke removes the active key. The full key is never selected into the browser. Ciphertext is readable only by `read_own_credential_material`, and only for the owner’s unverified row, on the server.

Online verification would call the provider and can cost money. Leave the key unverified until that check is explicitly built and funded.

## Managed quotas

`ai_platform_policy` is a single row. Authenticated users can read it and cannot update it. `reserve_ai_usage` reads that row, locks the user, expires old reservations, and reuses an idempotency key. A succeeded key is not charged again. A reserved key returns in progress. A voided or expired key can be reopened. Finalize of an already succeeded row does not change the stored token counts.

The server also requires `AI_MANAGED_ENABLED=true`, positive integer request and token limits, and the platform key for the selected provider. If any of those are missing, extraction returns a configuration error and does not call the provider.

Usage reservation, finalize, void, suggestion insert, and audit insert require an HMAC proof. The server builds it with `AI_ACCOUNTING_SECRET`. The same value must be stored in `ai_accounting_gate` by a database owner. Authenticated users cannot read that table. A direct API call without the proof is rejected, so a signed-in browser cannot create, finalize, or reopen quota rows on its own. Reopening a voided managed reservation checks the monthly quota again. One open reservation is allowed at a time. Managed and bring-your-own-key modes stay on the reservation the server signed. A second finalize cannot change the stored token counts, and this milestone stores no estimated cost. Each account can have one open reservation and at most 200 usage rows in a calendar month. A single request cannot record more than 200,000 input tokens or 200,000 output tokens.

Set both copies of the secret before extraction. Generate one with `openssl rand -base64 32`. Do not commit it. Leave the gate null until you are ready to use AI.

## Career knowledge base

One `career_profiles` row per user. Many `career_sources` rows hold pasted text, a label, and a SHA-256 of the body. Sources are not DOCX or PDF files. The body and hash cannot be edited in place; add another source instead.

Facts live in separate tables for employment, education, skills, projects, accomplishments, and certifications. Verification states are `suggested`, `user_verified`, `rejected`, and `superseded`. A verified row cannot be edited. Supersede marks it `superseded` and leaves it in history. Approval timestamps are required for `user_verified` and forbidden for `suggested` or `rejected`.

AI writes `ai_suggestions` only. `accept_career_suggestion` inserts one verified fact and marks that suggestion accepted. Accepting one suggestion does not accept the others. `reject_career_suggestion` leaves the suggestion rejected. A second accept of the same suggestion returns the existing fact. Duplicate pending or accepted suggestions for the same source and identity are ignored.

Resume text is untrusted. The system prompt tells the model not to follow instructions inside it, not to invent facts, and not to mark anything verified. Schema-valid output is still a suggestion until the user accepts it.

## Database

`supabase/migrations/20261021043000_career_knowledge_and_ai.sql` is additive. It does not alter V1 tables. Row Level Security is on for user-owned tables. Credential, usage, and suggestion status changes that a user must not forge go through `security definer` functions. Those functions check `auth.uid()`, set an empty `search_path`, and are not granted to `anon`.

Isolated tests in `src/lib/career/db.integration.test.ts` apply every migration to PGlite, set the role to `authenticated`, and check cross-user reads and writes, suggestion acceptance, credential column access, verification rules, and quota reuse. They do not connect to the hosted project.

Do not run `supabase db reset` or `supabase db push` against production from this milestone. The app stays usable before the migration is applied.

## Local testing

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

`npm test` includes the PGlite database tests. It does not call OpenAI, Anthropic, or Gemini.

To exercise the UI locally, set `AI_FEATURES_ENABLED=true` in `.env.local`, generate a credentials key with `openssl rand -base64 32`, and apply the new migration to a database that is not production. Leave managed variables unset. Paste a resume on Career, save a provider key in Settings, and extract. The key remains unverified. Without a real provider key, extraction fails with a credential error and does not create verified facts.

## Production and staging

Production defaults (the activation steps, in order, are in [launch.md](launch.md)):

- `BETA_USER_IDS` unset (nobody)
- `AI_PROVIDERS_ENABLED` unset (Google only)
- `AI_FEATURES_ENABLED` unset or `false`
- `AI_MANAGED_ENABLED` unset or `false`
- managed limits `0`
- no platform keys required

Turning the feature on in staging or production is an operator step: set the flag, set `AI_CREDENTIALS_KEY`, apply the migration to that database, and only then decide whether managed AI should be funded. This repository does not deploy those changes.

## Future desktop executor

A later companion can implement the same structured task locally and return suggestions through the existing review path. M1 only defines the cloud target and rejects the desktop target. It does not add a generic remote execution API.
