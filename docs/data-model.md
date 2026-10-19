# Data model

Companies and applications are created by `supabase/migrations/20261018204000_companies_and_applications.sql`. Contacts, tasks, and preparation items are created by `supabase/migrations/20261019160000_networking_tasks_preparation.sql`. Apply pending files with `supabase db push`. Do not reset the database.

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
- `applied_at date` — optional for every status
- `next_follow_up_date date`
- `notes text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

`company_id` references `companies(id)`. `(user_id, company_id)` references `companies(user_id, id)`, so an application cannot point at another user's company. Deleting a company deletes its applications. The company page states that count in the confirmation dialog before the delete runs. Contacts and tasks keep their rows and lose the company or application link.

Any application can move to any status in that list, including from Rejected or Withdrawn. `applied_at` stays optional.

## contacts

- `name text not null`
- `role_title`, `organization`, `email`, `linkedin_url`, `notes`
- `company_id` and `application_id` are nullable
- `relationship_type` — `recruiter`, `hiring_manager`, `employee`, `founder`, `referral`, `other`
- `outreach_status` — `not_contacted`, `connection_sent`, `contacted`, `replied`, `follow_up_needed`, `closed`
- `last_contacted_at date`, `next_follow_up_date date`

Deleting a company or application sets the matching contact column to null. The contact remains.

## tasks

- `title text not null`
- `description text`
- `status` — `todo`, `in_progress`, `done`
- `priority` — `low`, `medium`, `high`
- `due_date date`
- `company_id` and `application_id` are nullable
- `completed_at date` is set only when status is `done`

A task is overdue when it is not done and `due_date` is before today. Deleting a company or application clears the link and keeps the task.

## preparation_items

- `title text not null`
- `category` — `certification`, `coding`, `system_design`, `behavioral`, `other`
- `status` — `not_started`, `in_progress`, `completed`
- `target_date date`
- `completed_at date` is set only when status is `completed`
- `resource_url`, `notes`

## Dashboard metrics

- Companies: count of company rows.
- Applications: count of application rows.
- Active applications: status is `applied`, `recruiter_screen`, `technical_interview`, or `final_interview`.
- Interviews: status is `recruiter_screen`, `technical_interview`, or `final_interview`.
- Offers: status is `offer`.
- Submitted in the last 7 days: `applied_at` is within the last 7 calendar days, including today. Saved rows with no applied date are not counted.
- Upcoming follow-ups: company, application, or contact follow-up dates on or after today.
- Overdue follow-ups: those dates before today.
- Overdue tasks: not done, with a due date before today.
- Recent applications: five most recently updated.
- Priority companies needing attention: priority A or B, research status not closed, and follow-up date missing or on or before today.
- Preparation progress: counts of not started, in progress, and completed.

## Row Level Security

RLS is enabled on every user-owned table. `anon` has no privileges. `authenticated` can select, insert, update, and delete only rows where `auth.uid() = user_id`. Child rows that reference a company or application also require that parent to belong to `auth.uid()`, enforced by composite foreign keys.

Index every `user_id` column, and index foreign keys that the app filters on.

## Imports and exports

Companies and applications can be imported from the official CSV or XLSX templates and exported as CSV. Header names must match exactly, in any order. There is no column-name guessing. Dates use `YYYY-MM-DD`. Empty optional cells are accepted. Templates contain the header row only, and an XLSX template has one worksheet. `user_id` is never read from the file.

Company headers: Company Name (required), Size, Location, Industry, Research Status, Priority Tier, Reference, Website URL, Notes, Follow-up Date.

Application headers: Company Name (required), Job Title (required), Job URL, Source, Location, Work Arrangement, Employment Type, Salary Min, Salary Max, Salary Currency, Status, Applied Date, Next Follow-up Date, Notes.

Accepted stored values, with the default used when the cell is empty:

- Size: `small/startup`, `medium`, `large`, `unknown` (default `unknown`)
- Research Status: `not_started`, `researching`, `ready_to_apply`, `active`, `paused`, `closed` (default `not_started`)
- Priority Tier: `A`, `B`, `C`, `unset` (default `unset`)
- Work Arrangement: `remote`, `hybrid`, `onsite`, `unknown` (default `unknown`)
- Employment Type: `full_time`, `part_time`, `contract`, `internship`, `unknown` (default `unknown`)
- Status: `saved`, `applied`, `recruiter_screen`, `technical_interview`, `final_interview`, `offer`, `rejected`, `withdrawn` (default `saved`)
- Salary Currency: three letters, stored uppercase (default `USD`)

Salary amounts are nonnegative with up to two decimal places, and Salary Min cannot exceed Salary Max. Website and job URLs must start with `http://` or `https://`.

Duplicate company names are compared case-insensitively after collapsing whitespace, including repeats inside the file. Existing companies are skipped and are not overwritten. Duplicate applications match company, job title, and job URL with the trailing slash removed. An empty URL does not match a URL that is present. An application whose company name is new creates that company. Invalid rows block the entire file.

`public.import_companies` and `public.import_applications` in `20261019204500_import_companies_and_applications.sql` run as `security invoker` with an empty `search_path`. They require `auth.uid()`, take a per-user advisory lock, and insert without a `user_id` column so the existing trigger assigns the signed-in user. Row-level security still applies. `anon` cannot execute them. A constraint failure rolls the whole call back. The functions do not use the service role.

Exports use the same headers. Cells that start with `=`, `+`, `-`, or `@` are prefixed with a single quote so a spreadsheet does not treat them as formulas. That prefix is part of the exported text.
