# Migrations

This directory is reserved for Supabase SQL migrations.

Milestone 1 does not add business tables. The intended multi-user model, `user_id` ownership, and row-level security rules are documented in `docs/data-model.md`.

When a later milestone adds a table:

1. Add a new timestamped `.sql` file here.
2. Include `user_id uuid not null references auth.users (id) on delete cascade` on every user-owned table.
3. Enable row level security in the same migration as the table.
4. Add select, insert, update, and delete policies that allow a row only when `auth.uid() = user_id`.
5. Do not grant the secret key to the browser, and do not add a policy that allows every authenticated user to read every row.
