# Data model

Companies and applications are created by `supabase/migrations/20261018204000_companies_and_applications.sql`. That migration has to be applied to the hosted database with `supabase db push`. Do not reset the database.

Networking, tasks, and preparation are not created yet.

## Ownership

Every user-owned row carries `user_id uuid not null references auth.users (id) on delete cascade`.

The signed-in user id comes from `auth.uid()`. Application queries also filter on the session user id. Row Level Security is the boundary that prevents another account from reading or writing the row.

Insert and update triggers set `user_id` from `auth.uid()` and reject a change to that column. Primary keys and timestamps are generated in the database.

The Supabase secret / service-role key bypasses RLS. This app does not use it.

## companies

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null`
- `name text not null`
- `size text not null` — `small/startup`, `medium`, `large`, `unknown`
- `location text`
- `industry text`
- `research_status text not null` — `not_started`, `researching`, `ready_to_apply`, `active`, `paused`, `closed`
- `priority_tier text not null` — `A`, `B`, `C`, `unset`
- `reference text`
- `website_url text`
- `notes text`
- `follow_up_date date`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

`(user_id, id)` is unique so an application can reference both columns.

## applications

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null`
- `company_id uuid not null`
- `job_title text not null`
- `job_url text`
- `source text`
- `location text`
- `work_arrangement text not null` — `remote`, `hybrid`, `onsite`, `unknown`
- `employment_type text not null` — `full_time`, `part_time`, `contract`, `internship`, `unknown`
- `salary_min numeric(12, 2)`, `salary_max numeric(12, 2)`, `salary_currency text not null default 'USD'`
- `status text not null` — `saved`, `applied`, `recruiter_screen`, `technical_interview`, `final_interview`, `offer`, `rejected`, `withdrawn`
- `applied_at date` — required unless status is `saved`
- `next_follow_up_date date`
- `notes text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

`company_id` references `companies(id)`. `(user_id, company_id)` references `companies(user_id, id)`, so an application cannot point at another user's company. Deleting a company deletes its applications.

Status changes move one stage at a time along Saved → Applied → Recruiter Screen → Technical Interview → Final Interview → Offer. Any open stage can move to Rejected or Withdrawn. A closed application can reopen as Saved or Applied.

## Later tables

### networking

Contacts, referrals, and follow-ups. Each row has `user_id`. Optional `company_id` points at a company owned by the same user.

### tasks

Follow-up work. Each row has `user_id` and may reference a company, application, or contact.

### preparation

Certification and interview-practice rows. Each row has `user_id`.

## Row Level Security

RLS is enabled on `companies` and `applications`. `anon` has no privileges. `authenticated` can select, insert, update, and delete only rows where `auth.uid() = user_id`. Application insert and update policies also require the referenced company to belong to `auth.uid()`.

Index every `user_id` column, and index foreign keys that the app filters on.

## Imports

CSV and XLSX import are not implemented. When they are, they must set `user_id` from the verified session, never from a column in the file.
