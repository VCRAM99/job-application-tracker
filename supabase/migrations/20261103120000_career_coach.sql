-- Interview & Networking Intelligence (M5). Additive only: six new owner-only
-- tables, one guard function, two security invoker RPCs, and one nullable
-- column on applications with a trigger that keeps it. No existing row,
-- grant, policy, or function changes.
--
-- Every link to an application, company, contact, analysis, posting, brief,
-- or task clears to null when that row is deleted, so a delete never fails
-- because coach data points at it. The guard lets a foreign key clear a link
-- with no session when nothing else in the row changes, and otherwise
-- requires the owner's session and rejects links to rows the caller does not
-- own (or, for a catalog posting, cannot read).

-- When the application's status last changed. Null on rows that existed
-- before this migration; follow-up rules fall back to the applied date.
alter table public.applications add column if not exists status_changed_at timestamptz;

create or replace function public.track_application_status_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.status_changed_at := pg_catalog.now();
  elsif new.status is distinct from old.status then
    new.status_changed_at := pg_catalog.now();
  else
    -- Clients cannot set it directly.
    new.status_changed_at := old.status_changed_at;
  end if;
  return new;
end;
$$;

revoke all on function public.track_application_status_change() from public, anon;
grant execute on function public.track_application_status_change() to authenticated;

create trigger applications_40_status_changed_at
  before insert or update on public.applications
  for each row execute function public.track_application_status_change();

-- Generic guard. Trigger arguments name the row's link columns.
create or replace function public.guard_coach_row()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  links text[] := coalesce(tg_argv, '{}'::text[]);
  new_row jsonb := pg_catalog.to_jsonb(new);
  old_row jsonb := case when tg_op = 'UPDATE' then pg_catalog.to_jsonb(old) else null end;
  link text;
  value uuid;
  cleared_only boolean;
begin
  if tg_op = 'UPDATE' and (new_row - links - 'updated_at') = (old_row - links - 'updated_at') then
    cleared_only := true;
    foreach link in array links loop
      if new_row -> link is distinct from old_row -> link and new_row ->> link is not null then
        cleared_only := false;
      end if;
    end loop;
    if cleared_only and new_row is distinct from old_row then
      return new;
    end if;
  end if;

  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if new.user_id is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'user_id cannot be changed' using errcode = '42501';
  end if;

  foreach link in array links loop
    continue when new_row ->> link is null;
    continue when tg_op = 'UPDATE' and new_row -> link is not distinct from old_row -> link;
    value := (new_row ->> link)::uuid;
    if link = 'application_id' then
      perform 1 from public.applications where id = value and user_id = auth.uid();
    elsif link = 'company_id' then
      perform 1 from public.companies where id = value and user_id = auth.uid();
    elsif link = 'contact_id' then
      perform 1 from public.contacts where id = value and user_id = auth.uid();
    elsif link = 'analysis_id' then
      perform 1 from public.job_analyses where id = value and user_id = auth.uid();
    elsif link = 'brief_id' then
      perform 1 from public.research_briefs where id = value and user_id = auth.uid();
    elsif link = 'task_id' then
      perform 1 from public.tasks where id = value and user_id = auth.uid();
    elsif link = 'set_id' then
      perform 1 from public.interview_question_sets where id = value and user_id = auth.uid();
    elsif link = 'posting_id' then
      -- Catalog postings are shared; the caller's row-level security decides visibility.
      perform 1 from public.job_postings where id = value;
    else
      raise exception 'unknown link %', link using errcode = '42501';
    end if;
    if not found then
      raise exception '% not owned', link using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.guard_coach_row() from public, anon;
grant execute on function public.guard_coach_row() to authenticated;

-- Research briefs: claims grounded in user-provided sources only.
create table public.research_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid,
  application_id uuid,
  posting_id uuid references public.job_postings (id) on delete set null,
  label text not null,
  sources jsonb not null default '[]'::jsonb,
  claims jsonb not null default '[]'::jsonb,
  dropped jsonb not null default '{}'::jsonb,
  prompt_version text not null,
  schema_version text not null,
  provider text not null,
  model text not null,
  execution_mode text not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint research_briefs_user_id_id_key unique (user_id, id),
  constraint research_briefs_company_fkey
    foreign key (user_id, company_id) references public.companies (user_id, id)
    on delete set null (company_id),
  constraint research_briefs_application_fkey
    foreign key (user_id, application_id) references public.applications (user_id, id)
    on delete set null (application_id),
  constraint research_briefs_label_check check (char_length(pg_catalog.btrim(label)) between 1 and 160),
  constraint research_briefs_sources_check check (
    pg_catalog.jsonb_typeof(sources) = 'array'
    and pg_catalog.jsonb_array_length(sources) between 1 and 6
    and char_length(sources::text) <= 130000
  ),
  constraint research_briefs_claims_check check (
    pg_catalog.jsonb_typeof(claims) = 'array'
    and pg_catalog.jsonb_array_length(claims) <= 40
    and char_length(claims::text) <= 60000
  ),
  constraint research_briefs_dropped_check check (
    pg_catalog.jsonb_typeof(dropped) = 'object' and char_length(dropped::text) <= 2000
  ),
  constraint research_briefs_meta_check check (
    provider in ('openai', 'anthropic', 'google')
    and execution_mode in ('managed', 'byok')
    and char_length(model) between 1 and 80
    and char_length(prompt_version) between 1 and 80
    and char_length(schema_version) between 1 and 80
  )
);

-- Interview question sets generated from a fit analysis.
create table public.interview_question_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid,
  analysis_id uuid references public.job_analyses (id) on delete set null,
  label text not null,
  questions jsonb not null default '[]'::jsonb,
  dropped jsonb not null default '{}'::jsonb,
  prompt_version text not null,
  schema_version text not null,
  provider text not null,
  model text not null,
  execution_mode text not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint interview_question_sets_user_id_id_key unique (user_id, id),
  constraint interview_question_sets_application_fkey
    foreign key (user_id, application_id) references public.applications (user_id, id)
    on delete set null (application_id),
  constraint interview_question_sets_label_check check (char_length(pg_catalog.btrim(label)) between 1 and 160),
  constraint interview_question_sets_questions_check check (
    pg_catalog.jsonb_typeof(questions) = 'array'
    and pg_catalog.jsonb_array_length(questions) <= 20
    and char_length(questions::text) <= 40000
  ),
  constraint interview_question_sets_dropped_check check (
    pg_catalog.jsonb_typeof(dropped) = 'object' and char_length(dropped::text) <= 2000
  ),
  constraint interview_question_sets_meta_check check (
    provider in ('openai', 'anthropic', 'google')
    and execution_mode in ('managed', 'byok')
    and char_length(model) between 1 and 80
    and char_length(prompt_version) between 1 and 80
    and char_length(schema_version) between 1 and 80
  )
);

-- Typed practice answers and their coaching notes. No score is stored.
create table public.practice_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  set_id uuid not null,
  question_id text not null,
  answer text not null,
  feedback jsonb not null default '{}'::jsonb,
  dropped jsonb not null default '{}'::jsonb,
  prompt_version text not null,
  schema_version text not null,
  provider text not null,
  model text not null,
  execution_mode text not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint practice_answers_set_fkey
    foreign key (user_id, set_id) references public.interview_question_sets (user_id, id)
    on delete cascade,
  constraint practice_answers_question_check check (question_id ~ '^q-[0-9]{1,2}$'),
  constraint practice_answers_answer_check check (char_length(pg_catalog.btrim(answer)) between 1 and 6000),
  constraint practice_answers_feedback_check check (
    pg_catalog.jsonb_typeof(feedback) = 'object' and char_length(feedback::text) <= 8000
  ),
  constraint practice_answers_dropped_check check (
    pg_catalog.jsonb_typeof(dropped) = 'object' and char_length(dropped::text) <= 2000
  ),
  constraint practice_answers_meta_check check (
    provider in ('openai', 'anthropic', 'google')
    and execution_mode in ('managed', 'byok')
    and char_length(model) between 1 and 80
    and char_length(prompt_version) between 1 and 80
    and char_length(schema_version) between 1 and 80
  )
);

-- Story bank: one STAR outline per competency, citing verified fact ids.
create table public.story_bank_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  competency text not null,
  fact_ids jsonb not null default '[]'::jsonb,
  outline jsonb not null,
  dropped jsonb not null default '{}'::jsonb,
  prompt_version text not null,
  schema_version text not null,
  provider text not null,
  model text not null,
  execution_mode text not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint story_bank_entries_competency_key unique (user_id, competency),
  constraint story_bank_entries_competency_check check (
    competency in ('ownership', 'conflict', 'failure', 'leadership', 'ambiguity', 'impact')
  ),
  constraint story_bank_entries_facts_check check (
    pg_catalog.jsonb_typeof(fact_ids) = 'array'
    and pg_catalog.jsonb_array_length(fact_ids) between 1 and 8
    and char_length(fact_ids::text) <= 1000
  ),
  constraint story_bank_entries_outline_check check (
    pg_catalog.jsonb_typeof(outline) = 'object' and char_length(outline::text) <= 6000
  ),
  constraint story_bank_entries_dropped_check check (
    pg_catalog.jsonb_typeof(dropped) = 'object' and char_length(dropped::text) <= 2000
  ),
  constraint story_bank_entries_meta_check check (
    provider in ('openai', 'anthropic', 'google')
    and execution_mode in ('managed', 'byok')
    and char_length(model) between 1 and 80
    and char_length(prompt_version) between 1 and 80
    and char_length(schema_version) between 1 and 80
  )
);

-- Drafts. The app never sends them; the user copies, opens a mail link, and
-- marks one sent with mark_coach_draft_sent.
create table public.coach_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  format text not null,
  contact_id uuid references public.contacts (id) on delete set null,
  application_id uuid,
  analysis_id uuid references public.job_analyses (id) on delete set null,
  brief_id uuid,
  prompt_text text,
  subject text,
  body text not null,
  fact_ids jsonb not null default '[]'::jsonb,
  validation jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  marked_sent_at timestamptz,
  prompt_version text not null,
  schema_version text not null,
  provider text not null,
  model text not null,
  execution_mode text not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint coach_drafts_application_fkey
    foreign key (user_id, application_id) references public.applications (user_id, id)
    on delete set null (application_id),
  constraint coach_drafts_brief_fkey
    foreign key (user_id, brief_id) references public.research_briefs (user_id, id)
    on delete set null (brief_id),
  constraint coach_drafts_kind_check check (
    kind in ('outreach_recruiter', 'outreach_hiring_manager', 'referral_request', 'follow_up', 'thank_you', 'application_answer')
  ),
  constraint coach_drafts_format_check check (
    format in ('connection_note', 'message', 'email', 'answer')
    and ((kind = 'application_answer') = (format = 'answer'))
  ),
  constraint coach_drafts_body_check check (
    char_length(pg_catalog.btrim(body)) >= 1
    and char_length(body) <= case format when 'connection_note' then 300 when 'message' then 1200 else 2500 end
  ),
  constraint coach_drafts_prompt_check check (prompt_text is null or char_length(prompt_text) <= 2000),
  constraint coach_drafts_subject_check check (subject is null or char_length(subject) <= 150),
  constraint coach_drafts_answer_check check (kind <> 'application_answer' or char_length(pg_catalog.btrim(prompt_text)) >= 1),
  constraint coach_drafts_facts_check check (
    pg_catalog.jsonb_typeof(fact_ids) = 'array'
    and pg_catalog.jsonb_array_length(fact_ids) <= 20
    and char_length(fact_ids::text) <= 2000
  ),
  constraint coach_drafts_validation_check check (
    pg_catalog.jsonb_typeof(validation) = 'object' and char_length(validation::text) <= 2000
  ),
  constraint coach_drafts_status_check check (status in ('draft', 'marked_sent', 'archived')),
  constraint coach_drafts_sent_check check ((status = 'marked_sent') = (marked_sent_at is not null)),
  constraint coach_drafts_meta_check check (
    provider in ('openai', 'anthropic', 'google')
    and execution_mode in ('managed', 'byok')
    and char_length(model) between 1 and 80
    and char_length(prompt_version) between 1 and 80
    and char_length(schema_version) between 1 and 80
  )
);

-- Per-user state for deterministic follow-up suggestions: dismissed, or the task it created.
create table public.follow_up_suggestion_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  suggestion_key text not null,
  dismissed_at timestamptz,
  task_id uuid references public.tasks (id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint follow_up_suggestion_states_key unique (user_id, suggestion_key),
  constraint follow_up_suggestion_states_key_check check (
    suggestion_key ~ '^(applied_stale|thank_you|contact_follow_up):[0-9a-f-]{36}:[a-z0-9_-]{1,40}$'
  )
);

create index research_briefs_user_created_idx on public.research_briefs (user_id, created_at desc);
create index research_briefs_application_idx on public.research_briefs (user_id, application_id) where application_id is not null;
create index research_briefs_company_idx on public.research_briefs (user_id, company_id) where company_id is not null;
create index research_briefs_posting_idx on public.research_briefs (posting_id) where posting_id is not null;
create index interview_question_sets_user_created_idx on public.interview_question_sets (user_id, created_at desc);
create index interview_question_sets_application_idx on public.interview_question_sets (user_id, application_id) where application_id is not null;
create index interview_question_sets_analysis_idx on public.interview_question_sets (analysis_id) where analysis_id is not null;
create index practice_answers_set_idx on public.practice_answers (user_id, set_id, question_id);
create index coach_drafts_user_created_idx on public.coach_drafts (user_id, created_at desc);
create index coach_drafts_contact_idx on public.coach_drafts (contact_id) where contact_id is not null;
create index coach_drafts_application_idx on public.coach_drafts (user_id, application_id) where application_id is not null;
create index coach_drafts_analysis_idx on public.coach_drafts (analysis_id) where analysis_id is not null;
create index coach_drafts_brief_idx on public.coach_drafts (user_id, brief_id) where brief_id is not null;
create index follow_up_suggestion_states_task_idx on public.follow_up_suggestion_states (task_id) where task_id is not null;

create trigger research_briefs_10_set_user_id before insert on public.research_briefs
  for each row execute function public.assign_user_id();
create trigger research_briefs_20_guard before insert or update on public.research_briefs
  for each row execute function public.guard_coach_row('company_id', 'application_id', 'posting_id');
create trigger research_briefs_30_set_updated_at before update on public.research_briefs
  for each row execute function public.set_updated_at();

create trigger interview_question_sets_10_set_user_id before insert on public.interview_question_sets
  for each row execute function public.assign_user_id();
create trigger interview_question_sets_20_guard before insert or update on public.interview_question_sets
  for each row execute function public.guard_coach_row('application_id', 'analysis_id');
create trigger interview_question_sets_30_set_updated_at before update on public.interview_question_sets
  for each row execute function public.set_updated_at();

create trigger practice_answers_10_set_user_id before insert on public.practice_answers
  for each row execute function public.assign_user_id();
create trigger practice_answers_20_guard before insert or update on public.practice_answers
  for each row execute function public.guard_coach_row('set_id');
create trigger practice_answers_30_set_updated_at before update on public.practice_answers
  for each row execute function public.set_updated_at();

create trigger story_bank_entries_10_set_user_id before insert on public.story_bank_entries
  for each row execute function public.assign_user_id();
create trigger story_bank_entries_20_guard before insert or update on public.story_bank_entries
  for each row execute function public.guard_coach_row();
create trigger story_bank_entries_30_set_updated_at before update on public.story_bank_entries
  for each row execute function public.set_updated_at();

create trigger coach_drafts_10_set_user_id before insert on public.coach_drafts
  for each row execute function public.assign_user_id();
create trigger coach_drafts_20_guard before insert or update on public.coach_drafts
  for each row execute function public.guard_coach_row('contact_id', 'application_id', 'analysis_id', 'brief_id');
create trigger coach_drafts_30_set_updated_at before update on public.coach_drafts
  for each row execute function public.set_updated_at();

create trigger follow_up_suggestion_states_10_set_user_id before insert on public.follow_up_suggestion_states
  for each row execute function public.assign_user_id();
create trigger follow_up_suggestion_states_20_guard before insert or update on public.follow_up_suggestion_states
  for each row execute function public.guard_coach_row('task_id');
create trigger follow_up_suggestion_states_30_set_updated_at before update on public.follow_up_suggestion_states
  for each row execute function public.set_updated_at();

alter table public.research_briefs enable row level security;
alter table public.interview_question_sets enable row level security;
alter table public.practice_answers enable row level security;
alter table public.story_bank_entries enable row level security;
alter table public.coach_drafts enable row level security;
alter table public.follow_up_suggestion_states enable row level security;

do $grants$
declare
  t text;
begin
  foreach t in array array[
    'research_briefs', 'interview_question_sets', 'practice_answers',
    'story_bank_entries', 'coach_drafts', 'follow_up_suggestion_states'
  ] loop
    execute pg_catalog.format('revoke all on table public.%I from public, anon, authenticated', t);
    execute pg_catalog.format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute pg_catalog.format('create policy %I on public.%I for select to authenticated using (auth.uid() = user_id)', 'select own ' || t, t);
    execute pg_catalog.format('create policy %I on public.%I for insert to authenticated with check (auth.uid() = user_id)', 'insert own ' || t, t);
    execute pg_catalog.format(
      'create policy %I on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      'update own ' || t, t
    );
    execute pg_catalog.format('create policy %I on public.%I for delete to authenticated using (auth.uid() = user_id)', 'delete own ' || t, t);
  end loop;
end;
$grants$;

-- The only path that marks a draft sent. It runs on the user's explicit
-- click and updates the caller's own draft and its linked contact, if any.
-- A replied or closed contact keeps its status; only the date moves.
create or replace function public.mark_coach_draft_sent(p_draft_id uuid, p_local_date date)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_status text;
  v_contact uuid;
  v_format text;
  updated integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_local_date is null or p_local_date not between current_date - 1 and current_date + 1 then
    raise exception 'invalid local date' using errcode = '22023';
  end if;

  select d.id, d.status, d.contact_id, d.format into v_id, v_status, v_contact, v_format
  from public.coach_drafts as d
  where d.id = p_draft_id and d.user_id = auth.uid()
  for update;
  if not found then
    raise exception 'draft not found' using errcode = 'P0002';
  end if;
  if v_status = 'marked_sent' then
    return pg_catalog.jsonb_build_object('draft_id', v_id, 'already_sent', true, 'contact_updated', false);
  end if;
  if v_status <> 'draft' then
    raise exception 'draft archived' using errcode = '22023';
  end if;

  update public.coach_drafts
  set status = 'marked_sent', marked_sent_at = pg_catalog.now()
  where id = v_id and user_id = auth.uid();

  if v_contact is not null then
    update public.contacts
    set
      outreach_status = case
        when outreach_status in ('replied', 'closed') then outreach_status
        when v_format = 'connection_note' then 'connection_sent'
        else 'contacted'
      end,
      last_contacted_at = greatest(coalesce(last_contacted_at, p_local_date), p_local_date)
    where id = v_contact and user_id = auth.uid();
    get diagnostics updated = row_count;
  end if;

  return pg_catalog.jsonb_build_object('draft_id', v_id, 'already_sent', false, 'contact_updated', updated > 0);
end;
$$;

revoke all on function public.mark_coach_draft_sent(uuid, date) from public, anon;
grant execute on function public.mark_coach_draft_sent(uuid, date) to authenticated;

-- Creates the task for one follow-up suggestion at most once. A second call
-- for the same key returns the existing task while it exists.
create or replace function public.create_follow_up_task(
  p_key text,
  p_title text,
  p_description text,
  p_due date,
  p_application_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  state_id uuid;
  existing uuid;
  created uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  insert into public.follow_up_suggestion_states (suggestion_key)
  values (p_key)
  on conflict (user_id, suggestion_key) do nothing;

  select id, task_id into state_id, existing
  from public.follow_up_suggestion_states
  where user_id = auth.uid() and suggestion_key = p_key
  for update;
  if not found then
    raise exception 'suggestion not found' using errcode = 'P0002';
  end if;

  if existing is not null and exists (select 1 from public.tasks where id = existing and user_id = auth.uid()) then
    return pg_catalog.jsonb_build_object('task_id', existing, 'created', false);
  end if;

  insert into public.tasks (title, description, due_date, application_id, priority)
  values (p_title, p_description, p_due, p_application_id, 'medium')
  returning id into created;

  update public.follow_up_suggestion_states
  set task_id = created, dismissed_at = null
  where id = state_id;

  return pg_catalog.jsonb_build_object('task_id', created, 'created', true);
end;
$$;

revoke all on function public.create_follow_up_task(text, text, text, date, uuid) from public, anon;
grant execute on function public.create_follow_up_task(text, text, text, date, uuid) to authenticated;
