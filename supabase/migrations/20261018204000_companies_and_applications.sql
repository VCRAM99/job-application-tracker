-- Companies and applications owned by the signed-in user.
-- Apply with `supabase db push`. Do not reset the hosted database.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.assign_user_id()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
  elsif new.user_id is distinct from old.user_id then
    raise exception 'user_id cannot be changed' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon;
revoke all on function public.assign_user_id() from public, anon;
grant execute on function public.set_updated_at() to authenticated;
grant execute on function public.assign_user_id() to authenticated;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  size text not null default 'unknown',
  location text,
  industry text,
  research_status text not null default 'not_started',
  priority_tier text not null default 'unset',
  reference text,
  website_url text,
  notes text,
  follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_user_id_id_key unique (user_id, id),
  constraint companies_name_length check (char_length(btrim(name)) between 1 and 200),
  constraint companies_size_check check (size in ('small/startup', 'medium', 'large', 'unknown')),
  constraint companies_research_status_check check (
    research_status in (
      'not_started',
      'researching',
      'ready_to_apply',
      'active',
      'paused',
      'closed'
    )
  ),
  constraint companies_priority_tier_check check (priority_tier in ('A', 'B', 'C', 'unset')),
  constraint companies_website_url_check check (
    website_url is null or website_url ~* '^https?://'
  )
);

create index companies_user_id_idx on public.companies (user_id);
create index companies_user_name_idx on public.companies (user_id, name);
create index companies_user_follow_up_idx on public.companies (user_id, follow_up_date);

create trigger companies_set_user_id
  before insert or update on public.companies
  for each row execute function public.assign_user_id();

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null,
  job_title text not null,
  job_url text,
  source text,
  location text,
  work_arrangement text not null default 'unknown',
  employment_type text not null default 'unknown',
  salary_min numeric(12, 2),
  salary_max numeric(12, 2),
  salary_currency text not null default 'USD',
  status text not null default 'saved',
  applied_at date,
  next_follow_up_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applications_company_id_fkey
    foreign key (company_id) references public.companies (id) on delete cascade,
  constraint applications_company_owner_fkey
    foreign key (user_id, company_id) references public.companies (user_id, id) on delete cascade,
  constraint applications_job_title_length check (char_length(btrim(job_title)) between 1 and 200),
  constraint applications_work_arrangement_check check (
    work_arrangement in ('remote', 'hybrid', 'onsite', 'unknown')
  ),
  constraint applications_employment_type_check check (
    employment_type in ('full_time', 'part_time', 'contract', 'internship', 'unknown')
  ),
  constraint applications_status_check check (
    status in (
      'saved',
      'applied',
      'recruiter_screen',
      'technical_interview',
      'final_interview',
      'offer',
      'rejected',
      'withdrawn'
    )
  ),
  constraint applications_salary_currency_check check (salary_currency ~ '^[A-Z]{3}$'),
  constraint applications_salary_nonnegative_check check (
    (salary_min is null or salary_min >= 0)
    and (salary_max is null or salary_max >= 0)
  ),
  constraint applications_salary_range_check check (
    salary_min is null or salary_max is null or salary_min <= salary_max
  ),
  constraint applications_job_url_check check (
    job_url is null or job_url ~* '^https?://'
  ),
  constraint applications_applied_date_check check (
    status = 'saved' or applied_at is not null
  )
);

create index applications_user_id_idx on public.applications (user_id);
create index applications_user_status_idx on public.applications (user_id, status);
create index applications_company_id_idx on public.applications (company_id);
create index applications_user_follow_up_idx on public.applications (user_id, next_follow_up_date);

create trigger applications_set_user_id
  before insert or update on public.applications
  for each row execute function public.assign_user_id();

create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

alter table public.companies enable row level security;
alter table public.applications enable row level security;

revoke all on table public.companies from anon, authenticated;
revoke all on table public.applications from anon, authenticated;
grant select, insert, update, delete on table public.companies to authenticated;
grant select, insert, update, delete on table public.applications to authenticated;

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

create policy "select own applications"
  on public.applications
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "insert own applications"
  on public.applications
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.companies
      where companies.id = company_id
        and companies.user_id = auth.uid()
    )
  );

create policy "update own applications"
  on public.applications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.companies
      where companies.id = company_id
        and companies.user_id = auth.uid()
    )
  );

create policy "delete own applications"
  on public.applications
  for delete
  to authenticated
  using (auth.uid() = user_id);
