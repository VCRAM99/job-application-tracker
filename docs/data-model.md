# Data model

This milestone does not create business tables. The notes below are the contract for later migrations. Put those migrations in `supabase/migrations/` and apply them with the Supabase CLI or dashboard. Do not apply the sketch in this document as-is.

## Ownership

Every user-owned row carries `user_id uuid not null references auth.users (id) on delete cascade`.

The signed-in user id comes from `auth.uid()`, which is the `sub` claim of the verified access token. Application code must filter by that id as well. Row Level Security is the boundary that prevents another account from reading or writing the row.

The Supabase secret / service-role key bypasses RLS. It stays on the server, is never prefixed with `NEXT_PUBLIC_`, and is not used by this milestone.

## Planned tables

These tables are not created yet.

### profiles

One row per auth user.

- `id uuid primary key references auth.users (id) on delete cascade`
- `created_at timestamptz not null default now()`

### companies

Research targets for one user.

- `id uuid primary key`
- `user_id uuid not null`
- `name text not null`
- `industry text`
- `size text`
- `location text`
- `priority text`
- `notes text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### applications

More than one application can belong to the same company. The application still stores `user_id` so policies do not depend on a join.

- `id uuid primary key`
- `user_id uuid not null`
- `company_id uuid not null`
- role, status, source URL, dates, and notes added with the feature

### networking

Contacts, referrals, and follow-ups. Each row has `user_id`. Optional `company_id` points at a company owned by the same user.

### tasks

Follow-up work. Each row has `user_id` and may reference a company, application, or contact.

### preparation

Certification and interview-practice rows. Each row has `user_id`.

## Row Level Security

Enable RLS on every user-owned table. Grants to `anon` and `authenticated` are not enough, and a policy of `using (true)` is not acceptable.

For each table, the policies are the same shape:

```sql
alter table public.companies enable row level security;

create policy "select own companies"
  on public.companies
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "insert own companies"
  on public.companies
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "update own companies"
  on public.companies
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own companies"
  on public.companies
  for delete
  to authenticated
  using (auth.uid() = user_id);
```

Repeat that for applications, contacts, follow-ups, tasks, and preparation items. Child rows must not be readable through a parent the caller does not own. When a child references a company, the insert policy should also require that the company belongs to `auth.uid()`.

Index every `user_id` column, and index foreign keys that the app will filter on.

## Imports

CSV and XLSX import will write rows as the signed-in user. Import code must set `user_id` from the verified session, never from a column in the file.
