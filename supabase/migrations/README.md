# Migrations

SQL migrations for the hosted Supabase project live in this directory.

`20261018204000_companies_and_applications.sql` creates `companies` and `applications`, with row level security so each signed-in user can only read and write their own rows. An application cannot reference a company owned by someone else.

`20261019160000_networking_tasks_preparation.sql` makes `applied_at` optional, then creates `contacts`, `tasks`, and `preparation_items`. Deleting a company or application clears those links and keeps the contact or task.

`20261019204500_import_companies_and_applications.sql` adds `import_companies` and `import_applications`. Both run as `security invoker`, require `auth.uid()`, lock one user's import at a time, and rely on row-level security. They do not change existing rows.

Apply pending files to the existing project with `supabase db push`. Do not run `supabase db reset` against the hosted database. The production hardening release does not add a migration.

See the README for the exact link and push commands.
