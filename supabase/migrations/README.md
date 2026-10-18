# Migrations

SQL migrations for the hosted Supabase project live in this directory.

`20261018204000_companies_and_applications.sql` creates `companies` and `applications`, with row level security so each signed-in user can only read and write their own rows. An application cannot reference a company owned by someone else.

Apply pending files to the existing project with `supabase db push`. Do not run `supabase db reset` against the hosted database.

See the README for the exact link and push commands.
