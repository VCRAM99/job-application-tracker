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

`company_id` references `companies(id)`. `(user_id, company_id)` references `companies(user_id, id)`, so an application cannot point at another user's company. Deleting a company deletes its applications.

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

## Imports

CSV and XLSX import are not implemented. When they are, they must set `user_id` from the verified session, never from a column in the file.
