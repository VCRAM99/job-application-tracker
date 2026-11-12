# Dependency advisories

`npm audit --omit=dev`, checked on 2026-11-11 after the V2 wrap-up upgrades: **0 critical, 0 high, 6 moderate, 2 low** (main had 12: 0 high, 10 moderate, 2 low).

## Upgraded in the V2 wrap-up

Patch and minor releases only:

- `next` 16.4.2 → 16.4.6 and `eslint-config-next` to match
- `react` and `react-dom` 19.3.0 → 19.3.1
- `@sentry/nextjs` 11.10 → 11.12, which clears the `@sentry/bundler-plugins` → `glob` advisory
- `@supabase/supabase-js` 2.118 → 2.119
- `openai` 7.39 → 7.55
- `@google/genai` 2.30 → 2.32
- `lucide-react`, `docx`, `cn`, and `shadcn` 4.22 → 4.23

`npm update` also moved the transitive `glob` and `minimatch`. Lint, types, the full Vitest suite, the e2e suite, and the build pass on the new versions.

Not upgraded:

- `@anthropic-ai/sdk` 1.x, `@google/genai` 3.x, `unpdf` 2.x, `@types/node` 26: major versions, with no advisory against the current ones.
- `@playwright/test` 1.65: a test tool, and a new browser download.

## Remaining advisories

| Package (severity) | Path | Why it stays |
|---|---|---|
| `minimatch` (moderate, ReDoS with crafted glob patterns) | `shadcn` → `ts-morph` → `@ts-morph/common` | `shadcn` is the component CLI. The app only imports its stylesheet (`shadcn/tailwind.css` in `src/app/globals.css`), so none of its JavaScript runs in the app, and the CLI never receives patterns from users. The only fix npm offers is `shadcn@1.0.0`, a major downgrade. |
| `deepmerge` (low, prototype poisoning in `mergeObject`) | `shadcn` → `@shadcn/registry` | Same CLI-only path; never loaded by the app. |
| `@shadcn/registry`, `ts-morph`, `@ts-morph/common`, `shadcn` (moderate or low) | the same chain | Each is reported because it depends on one of the two packages above. |
| `uuid` (moderate, missing buffer bounds check in v3/v5/v6 when a buffer is passed) | `exceljs` → `uuid@8` | `exceljs` calls only `uuid.v4()`, with no buffer argument, when it writes conditional-formatting rules. The app only reads XLSX imports. The fix npm offers is `exceljs@3.4.0`, a major downgrade. |
| `exceljs` (moderate) | direct | Reported because of `uuid`, above. |

Revisit when `shadcn` or `exceljs` publish releases that move to fixed versions.
