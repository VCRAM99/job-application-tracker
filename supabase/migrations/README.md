# Migrations

SQL migrations for the hosted Supabase project live in this directory.

`20261018204000_companies_and_applications.sql` creates `companies` and `applications`, with row level security so each signed-in user can only read and write their own rows. An application cannot reference a company owned by someone else.

`20261019160000_networking_tasks_preparation.sql` makes `applied_at` optional, then creates `contacts`, `tasks`, and `preparation_items`. Deleting a company or application clears those links and keeps the contact or task.

`20261019204500_import_companies_and_applications.sql` adds `import_companies` and `import_applications`. Both run as `security invoker`, require `auth.uid()`, lock one user's import at a time, and rely on row-level security. They do not change existing rows.

`20261019220000_daily_tasks_and_health.sql` adds preferences, recurring tasks, completions, health goals, and health entries. Health tracking defaults to off. Completions are unique per task and local date. It does not change existing job-search rows. Preview with `npx supabase db push --dry-run`, then apply with `npx supabase db push`.

`20261021043000_career_knowledge_and_ai.sql` adds career profiles, pasted text sources, verified fact tables, encrypted provider credentials, usage accounting, and AI suggestions. It does not alter the earlier tables. Authenticated users cannot read ciphertext or mark a key verified. Suggestions become verified facts only through `accept_career_suggestion`.

`20261021120000_recommended_jobs.sql` adds the shared job catalog, private job preferences, saved and hidden postings, alert subscriptions, and alert deliveries. Ordinary users can read approved catalog rows and cannot write them. Catalog writes need the HMAC gate in [docs/jobs.md](../../docs/jobs.md). The gate secret ships null. This file does not drop existing tables and does not enable live ingestion.

`20261021143000_application_match_key.sql` adds a normalized title-and-URL key on `applications`, a trigger that fills it, a per-user unique index, and `find_application_duplicate`. It does not rewrite historical duplicates that already share a key. Rows without a usable URL keep a null key.

`20261023120000_preserve_historical_application_duplicates.sql` lets a preexisting duplicate stay editable. A later row whose key was left null keeps that null when another row already owns the key, including status changes. New inserts with the same key are still rejected. `import_applications` skips a row whose normalized title and URL already belong to that user, and it does not delete or merge applications.

`20261028120000_jobs_activation.sql` replaces the body of `apply_job_catalog` so a source can refresh more than once: an existing posting is updated instead of failing on the `(source_id, source_job_id)` key, and a posting that reappears after it expired becomes active again. The signature, proof check, lock, rate limit, and empty-snapshot rules are unchanged. It also adds `list_job_ingestion_sources`, an HMAC-gated read of approved source activation records for the server runner, which rejects a request whose `now` is more than five minutes off. It creates, alters, and drops no table, grant, or policy.

`20261101120000_jobs_chunked_apply.sql` replaces the body of `apply_job_catalog` again so the runner can send one snapshot in several chunks, each under the 2,000,000 character payload limit. A payload without chunk fields behaves as before. A chunk needs the previous chunk of the same snapshot to have succeeded, only chunk 0 counts toward the daily refresh limit, and only the final chunk of a complete snapshot expires listings, limited to those not verified since chunk 0 started. It changes no table, grant, or policy.

`20261102120000_resume_studio.sql` adds `resumes`, `resume_versions`, and `guard_resume_version` for AI Resume Studio. Both tables are owner-only. Deleting an application, analysis, or resume clears the link on a version and never blocks the delete. It also creates the private `resumes` Storage bucket (5 MB, PDF and DOCX only) and three `storage.objects` policies: insert, read, and delete only under `<auth.uid()>/<uuid>.pdf|docx`, with no update policy. The storage part is skipped on a database without the storage schema. No existing table, row, grant, or policy changes.

Apply pending files to the existing project with `supabase db push` only when you intend to change that database. Do not run `supabase db reset` against the hosted database. Do not push the career or recommended-jobs migrations to production until the matching feature is explicitly approved. The production hardening release does not add a migration.

See the README for the exact link and push commands.
