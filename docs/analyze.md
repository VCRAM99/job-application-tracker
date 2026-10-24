# Job fit analysis (Milestone 3)

Fit analysis compares one job description with career facts in the `user_verified` state. The number on the result page is a qualification match estimate. Scoring runs in application code. The model extracts requirements and can match requirements that deterministic checks leave open. It does not produce the score.

The feature stays off until both `JOB_ANALYSIS_ENABLED=true` and career AI are enabled. See [ai.md](ai.md) for credentials, quotas, and providers.

## What a run does

1. Normalize whitespace in the job text and require 200 to 30,000 characters.
2. Reuse a completed row when `user_id`, `jd_hash`, `profile_fingerprint`, and `prompt_version` already match. That reuse does not call a provider.
3. Otherwise reserve one managed or bring-your-own-key usage row for the whole run, using the Milestone 1 idempotency key, HMAC proof, and void-on-failure behavior.
4. Ask the selected provider's small model to extract requirements. Each evidence quote must appear in the normalized job text. Ungrounded requirements are dropped. At most 40 requirements are kept.
5. Match skills, certifications, education, titles, seniority, and years from verified facts in code. The model sees only the remaining requirements and the verified facts, with their ids.
6. Drop any fact id the model returns that is not in that verified set. A met or partial match with no remaining fact id becomes unclear.
7. Score the scorable requirements. Required counts double a preferred requirement. Met is 1, partial is 0.5, and not evidenced is 0. Unclear requirements stay out of the denominator and are reported in coverage confidence.
8. List work-authorization or location mismatches and years-of-experience shortfalls beside the score.
9. Optionally run readability heuristics on a pasted resume source. Those checks do not parse a file.

"I have this" inserts a skill fact in the `suggested` state with provenance pointing at the analysis. Accepting it on Career is a separate review. Nothing is auto-verified.

Default models, overridable on the server:

| Provider | Environment variable | Default |
| --- | --- | --- |
| OpenAI | `JOB_ANALYSIS_OPENAI_MODEL` | `gpt-5.4-mini` |
| Anthropic | `JOB_ANALYSIS_ANTHROPIC_MODEL` | `claude-haiku-4-5` |
| Google | `JOB_ANALYSIS_GOOGLE_MODEL` | `gemini-2.5-flash` |

The value must already be in the curated model list. Prompt version is `job-fit-2026-10-23`. Schema version is `job-fit-schema-1`. Change the prompt version when the schema changes so older cached analyses are not reused.

## Flags

| Variable | Default | What it controls |
| --- | --- | --- |
| `JOB_ANALYSIS_ENABLED` | Off unless the value is `true`. | `/analyze`, posting and application entry points, and the fit nav item. Also requires career AI to be enabled. |
| `JOB_ANALYSIS_MOCK_PROVIDER` | Off. Ignored when `NODE_ENV` or `VERCEL_ENV` is `production`. | Local stand-in that returns structured JSON and does not call a provider or reserve quota. |

`JOB_ANALYSIS_ENABLED=1` and `JOB_ANALYSIS_ENABLED=yes` stay off.

## Routes

- `/analyze` pastes a job description and lists past analyses.
- `/analyze/[id]` shows the estimate, coverage, blockers, requirements, gaps, and readability heuristics.
- Catalog posting detail `/jobs/[id]` can analyze the stored description when it is long enough.
- An application detail page links to `/analyze?application=...` and prefills the title, company, and notes.

## Live evaluation

Automated tests do not call Gemini. To score the fictional fixtures yourself:

```bash
GEMINI_API_KEY=your-key npx tsx scripts/eval/job-analysis-live.ts
```

The script prints a warning, then per-fixture precision and recall against the expected phrases, the share of requirements dropped for grounding, and token totals. It does not write to the database. Keep the key out of the client and out of git.

## Limitations

- Years of experience are the merged span of verified employment dates. Overlapping roles are not double counted, and undated roles do not add years.
- Contradictory lines in a job description are scored as separate requirements.
- Work authorization and location are blockers only when the match status is not evidenced. Unclear means the facts were not enough to decide.
- Catalog descriptions are stored up to 8,000 characters. Longer text has to be pasted.
- A cached analysis is reused until a verified fact changes or the prompt version changes, including when you press re-check.
- The local mock provider is for interface checks. It is not a measure of extraction quality.
