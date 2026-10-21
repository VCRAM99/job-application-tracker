# Migrations

SQL migrations for the hosted Supabase project live in this directory.

`20261018204000_companies_and_applications.sql` creates `companies` and `applications`, with row level security so each signed-in user can only read and write their own rows. An application cannot reference a company owned by someone else.

`20261019160000_networking_tasks_preparation.sql` makes `applied_at` optional, then creates `contacts`, `tasks`, and `preparation_items`. Deleting a company or application clears those links and keeps the contact or task.

`20261019204500_import_companies_and_applications.sql` adds `import_companies` and `import_applications`. Both run as `security invoker`, require `auth.uid()`, lock one user's import at a time, and rely on row-level security. They do not change existing rows.

`20261019220000_daily_tasks_and_health.sql` adds preferences, recurring tasks, completions, health goals, and health entries. Health tracking defaults to off. Completions are unique per task and local date. It does not change existing job-search rows. Preview with `npx supabase db push --dry-run`, then apply with `npx supabase db push`.

`20261021043000_career_knowledge_and_ai.sql` adds career profiles, pasted text sources, verified fact tables, encrypted provider credentials, usage accounting, and AI suggestions. It does not alter the earlier tables. Authenticated users cannot read ciphertext or mark a key verified. Suggestions become verified facts only through `accept_career_suggestion`.

`20261021120000_recommended_jobs.sql` adds the shared job catalog, private job preferences, saved and hidden postings, alert subscriptions, and alert deliveries. Ordinary users can read approved catalog rows and cannot write them. Catalog writes need the HMAC gate in [docs/jobs.md](../../docs/jobs.md). The gate secret ships null. This file does not drop existing tables and does not enable live ingestion.

`20261021143000_application_match_key.sql` adds a normalized title-and-URL key on `applications`, a trigger that fills it, a per-user unique index, and `find_application_duplicate`. It does not rewrite historical duplicates that already share a key.

Apply pending files to the existing project with `supabase db push` only when you intend to change that database. Do not run `supabase db reset` against the hosted database. Do not push the career or recommended-jobs migrations to production until the matching feature is explicitly approved. The production hardening release does not add a migration.

See the README for the exact link and push commands.
