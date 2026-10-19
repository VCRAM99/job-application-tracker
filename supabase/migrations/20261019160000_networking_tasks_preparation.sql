-- Networking, tasks, and preparation.
-- Also allow any application status without an applied date.
-- Apply with `supabase db push`. Do not reset the hosted database.

alter table public.applications
  drop constraint applications_applied_date_check;

alter table public.applications
  add constraint applications_user_id_id_key unique (user_id, id);

create or replace function public.align_owned_links()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  application_company uuid;
begin
  if new.application_id is not null then
    select company_id
      into application_company
    from public.applications
    where id = new.application_id
      and user_id = new.user_id;

    if application_company is null then
      raise exception 'application does not belong to this user' using errcode = '42501';
    end if;

    if new.company_id is null then
      new.company_id := application_company;
    elsif new.company_id is distinct from application_company then
      raise exception 'application does not belong to the selected company' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.align_owned_links() from public, anon;
grant execute on function public.align_owned_links() to authenticated;

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  role_title text,
  organization text,
  email text,
  linkedin_url text,
  company_id uuid,
  application_id uuid,
  relationship_type text not null default 'other',
  outreach_status text not null default 'not_contacted',
  last_contacted_at date,
  next_follow_up_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_name_length check (char_length(btrim(name)) between 1 and 200),
  constraint contacts_relationship_type_check check (
    relationship_type in (
      'recruiter',
      'hiring_manager',
      'employee',
      'founder',
      'referral',
      'other'
    )
  ),
  constraint contacts_outreach_status_check check (
    outreach_status in (
      'not_contacted',
      'connection_sent',
      'contacted',
      'replied',
      'follow_up_needed',
      'closed'
    )
  ),
  constraint contacts_email_check check (
    email is null or email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint contacts_linkedin_url_check check (
    linkedin_url is null or linkedin_url ~* '^https?://'
  ),
  constraint contacts_company_owner_fkey
    foreign key (user_id, company_id)
    references public.companies (user_id, id)
    on delete set null (company_id),
  constraint contacts_application_owner_fkey
    foreign key (user_id, application_id)
    references public.applications (user_id, id)
    on delete set null (application_id)
);

create index contacts_user_id_idx on public.contacts (user_id);
create index contacts_user_name_idx on public.contacts (user_id, name);
create index contacts_user_follow_up_idx on public.contacts (user_id, next_follow_up_date);
create index contacts_company_id_idx on public.contacts (company_id);
create index contacts_application_id_idx on public.contacts (application_id);

create trigger contacts_10_set_user_id
  before insert or update on public.contacts
  for each row execute function public.assign_user_id();

create trigger contacts_20_align_links
  before insert or update on public.contacts
  for each row execute function public.align_owned_links();

create trigger contacts_30_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo',
  priority text not null default 'medium',
  due_date date,
  company_id uuid,
  application_id uuid,
  completed_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint tasks_status_check check (status in ('todo', 'in_progress', 'done')),
  constraint tasks_priority_check check (priority in ('low', 'medium', 'high')),
  constraint tasks_completed_check check (
    (status = 'done' and completed_at is not null)
    or (status <> 'done' and completed_at is null)
  ),
  constraint tasks_company_owner_fkey
    foreign key (user_id, company_id)
    references public.companies (user_id, id)
    on delete set null (company_id),
  constraint tasks_application_owner_fkey
    foreign key (user_id, application_id)
    references public.applications (user_id, id)
    on delete set null (application_id)
);

create index tasks_user_id_idx on public.tasks (user_id);
create index tasks_user_status_idx on public.tasks (user_id, status);
create index tasks_user_due_idx on public.tasks (user_id, due_date);
create index tasks_company_id_idx on public.tasks (company_id);
create index tasks_application_id_idx on public.tasks (application_id);

create trigger tasks_10_set_user_id
  before insert or update on public.tasks
  for each row execute function public.assign_user_id();

create trigger tasks_20_align_links
  before insert or update on public.tasks
  for each row execute function public.align_owned_links();

create trigger tasks_30_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

create table public.preparation_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  category text not null default 'other',
  status text not null default 'not_started',
  target_date date,
  completed_at date,
  resource_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint preparation_items_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint preparation_items_category_check check (
    category in ('certification', 'coding', 'system_design', 'behavioral', 'other')
  ),
  constraint preparation_items_status_check check (
    status in ('not_started', 'in_progress', 'completed')
  ),
  constraint preparation_items_completed_check check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  ),
  constraint preparation_items_resource_url_check check (
    resource_url is null or resource_url ~* '^https?://'
  )
);

create index preparation_items_user_id_idx on public.preparation_items (user_id);
create index preparation_items_user_status_idx on public.preparation_items (user_id, status);
create index preparation_items_user_category_idx on public.preparation_items (user_id, category);

create trigger preparation_items_set_user_id
  before insert or update on public.preparation_items
  for each row execute function public.assign_user_id();

create trigger preparation_items_set_updated_at
  before update on public.preparation_items
  for each row execute function public.set_updated_at();

alter table public.contacts enable row level security;
alter table public.tasks enable row level security;
alter table public.preparation_items enable row level security;

revoke all on table public.contacts from anon, authenticated;
revoke all on table public.tasks from anon, authenticated;
revoke all on table public.preparation_items from anon, authenticated;
grant select, insert, update, delete on table public.contacts to authenticated;
grant select, insert, update, delete on table public.tasks to authenticated;
grant select, insert, update, delete on table public.preparation_items to authenticated;

create policy "select own contacts"
  on public.contacts for select to authenticated
  using (auth.uid() = user_id);

create policy "insert own contacts"
  on public.contacts for insert to authenticated
  with check (
    auth.uid() = user_id
    and (
      company_id is null
      or exists (
        select 1 from public.companies
        where companies.id = company_id and companies.user_id = auth.uid()
      )
    )
    and (
      application_id is null
      or exists (
        select 1 from public.applications
        where applications.id = application_id and applications.user_id = auth.uid()
      )
    )
  );

create policy "update own contacts"
  on public.contacts for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      company_id is null
      or exists (
        select 1 from public.companies
        where companies.id = company_id and companies.user_id = auth.uid()
      )
    )
    and (
      application_id is null
      or exists (
        select 1 from public.applications
        where applications.id = application_id and applications.user_id = auth.uid()
      )
    )
  );

create policy "delete own contacts"
  on public.contacts for delete to authenticated
  using (auth.uid() = user_id);

create policy "select own tasks"
  on public.tasks for select to authenticated
  using (auth.uid() = user_id);

create policy "insert own tasks"
  on public.tasks for insert to authenticated
  with check (
    auth.uid() = user_id
    and (
      company_id is null
      or exists (
        select 1 from public.companies
        where companies.id = company_id and companies.user_id = auth.uid()
      )
    )
    and (
      application_id is null
      or exists (
        select 1 from public.applications
        where applications.id = application_id and applications.user_id = auth.uid()
      )
    )
  );

create policy "update own tasks"
  on public.tasks for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      company_id is null
      or exists (
        select 1 from public.companies
        where companies.id = company_id and companies.user_id = auth.uid()
      )
    )
    and (
      application_id is null
      or exists (
        select 1 from public.applications
        where applications.id = application_id and applications.user_id = auth.uid()
      )
    )
  );

create policy "delete own tasks"
  on public.tasks for delete to authenticated
  using (auth.uid() = user_id);

create policy "select own preparation items"
  on public.preparation_items for select to authenticated
  using (auth.uid() = user_id);

create policy "insert own preparation items"
  on public.preparation_items for insert to authenticated
  with check (auth.uid() = user_id);

create policy "update own preparation items"
  on public.preparation_items for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own preparation items"
  on public.preparation_items for delete to authenticated
  using (auth.uid() = user_id);
