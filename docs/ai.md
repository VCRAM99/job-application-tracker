# Career AI (Milestone 1)

Career AI is an additive layer on Job Tracker. It does not change companies, applications, networking, tasks, preparation, daily tasks, or health tracking. The feature is off in production until `AI_FEATURES_ENABLED` is explicitly true. If the career migration has not been applied, Career and AI settings show an unavailable state and the rest of the app still loads.

Live provider calls are not part of the automated tests. Tests use fake clients and an in-process PostgreSQL build.

## Architecture

Server actions call `generateStructured`. That function checks the execution mode, model registry, and credentials before it reserves usage. A provider adapter then returns text plus normalized token counts. Zod validates the JSON. Only after that validation does the action store suggestions. Finalize runs after the suggestions are stored. A failed provider call voids the reservation.

Supported cloud providers:

| Provider | Adapter | Curated models |
| --- | --- | --- |
| OpenAI | Chat Completions JSON schema | `gpt-5.4-mini`, `gpt-5.4` |
| Anthropic | Messages API JSON schema | `claude-sonnet-5`, `claude-haiku-4-5` |
| Google Gemini | `generateContent` JSON schema | `gemini-2.5-flash`, `gemini-2.5-pro` |

The model list lives in `src/lib/ai/models.ts`. Prices are not stored. Unsupported model strings are rejected before a provider call. The client cannot choose an API endpoint.

Execution modes:

- **Bring your own key.** Uses the encrypted key saved for the selected provider.
- **Managed AI.** Uses a platform key and the monthly allowance. Both the database policy and the server environment must allow it. Defaults are off and zero.
- **Local desktop.** Reserved for a future Windows/macOS companion. `assertCloudExecution` rejects it. This milestone does not include Tauri, Ollama, device pairing, or a remote command channel.

The gateway does not switch modes on its own. A request must match the mode saved in AI settings.

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

Production defaults:

- `AI_FEATURES_ENABLED` unset or `false`
- `AI_MANAGED_ENABLED` unset or `false`
- managed limits `0`
- no platform keys required

Turning the feature on in staging or production is an operator step: set the flag, set `AI_CREDENTIALS_KEY`, apply the migration to that database, and only then decide whether managed AI should be funded. This repository does not deploy those changes.

## Future desktop executor

A later companion can implement the same structured task locally and return suggestions through the existing review path. M1 only defines the cloud target and rejects the desktop target. It does not add a generic remote execution API.
