-- Career profile, resume text sources, and server-side AI accounting.
-- Additive only: this file does not alter companies, applications, contacts,
-- tasks, preparation, daily tasks, or health tables.
-- Apply with `supabase db push`. Do not reset the hosted database.

create or replace function public.enforce_career_verification()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous jsonb;
  next_row jsonb;
begin
  if tg_op = 'INSERT' then
    if new.verification_state not in ('suggested', 'user_verified') then
      raise exception 'invalid initial verification state' using errcode = '23514';
    end if;
    return new;
  end if;

  if old.verification_state = 'user_verified'
    and new.verification_state = 'user_verified' then
    previous := pg_catalog.to_jsonb(old) - 'updated_at';
    next_row := pg_catalog.to_jsonb(new) - 'updated_at';
    if previous is distinct from next_row then
      raise exception 'verified facts are immutable' using errcode = '23514';
    end if;
  end if;

  if new.verification_state is distinct from old.verification_state then
    if not (
      (old.verification_state = 'suggested' and new.verification_state in ('user_verified', 'rejected'))
      or (old.verification_state = 'user_verified' and new.verification_state = 'superseded')
    ) then
      raise exception 'invalid verification transition' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_suggestion_review()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  accepter name;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.resulting_fact_id is not null or new.resolved_at is not null then
      raise exception 'suggestions start pending' using errcode = '23514';
    end if;
    return new;
  end if;

  if old.status <> 'pending' then
    raise exception 'resolved suggestions are immutable' using errcode = '23514';
  end if;

  if new.status = 'pending' then
    return new;
  end if;

  if new.status = 'rejected' then
    if new.resulting_fact_id is not null or new.resolved_at is null then
      raise exception 'rejected suggestions are not applied' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.status = 'accepted' then
    if new.resulting_fact_id is null or new.resolved_at is null then
      raise exception 'accepted suggestions require a fact' using errcode = '23514';
    end if;
    select pg_catalog.pg_get_userbyid(p.proowner)
      into accepter
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'accept_career_suggestion'
    limit 1;
    if current_user is distinct from accepter then
      raise exception 'suggestions are accepted through review' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'invalid suggestion transition' using errcode = '23514';
end;
$$;

create or replace function public.enforce_credential_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'unverified' or new.revoked_at is not null then
      raise exception 'credentials start unverified' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.status = 'verified' then
    raise exception 'live credential verification is not enabled' using errcode = '23514';
  end if;

  if new.status is distinct from old.status then
    if not (old.status = 'unverified' and new.status = 'revoked' and new.revoked_at is not null) then
      raise exception 'credentials can only be revoked' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.protect_career_source()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.body is distinct from old.body
    or new.sha256 is distinct from old.sha256
    or new.profile_id is distinct from old.profile_id
    or new.user_id is distinct from old.user_id then
    raise exception 'resume source text is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_career_verification() from public, anon;
revoke all on function public.enforce_suggestion_review() from public, anon;
revoke all on function public.enforce_credential_status() from public, anon;
revoke all on function public.protect_career_source() from public, anon;
grant execute on function public.enforce_career_verification() to authenticated;
grant execute on function public.enforce_suggestion_review() to authenticated;
grant execute on function public.enforce_credential_status() to authenticated;
grant execute on function public.protect_career_source() to authenticated;

create table public.career_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  summary text,
  target_roles text[] not null default '{}',
  countries text[] not null default '{}',
  work_arrangements text[] not null default '{}',
  salary_floor numeric(12, 2),
  salary_currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint career_profiles_user_id_id_key unique (user_id, id),
  constraint career_profiles_summary_length check (
    summary is null or char_length(summary) <= 4000
  ),
  constraint career_profiles_roles_check check (
    cardinality(target_roles) <= 12
    and (
      cardinality(target_roles) = 0
      or char_length(array_to_string(target_roles, '')) between 1 and 960
    )
  ),
  constraint career_profiles_countries_check check (
    cardinality(countries) <= 12
    and (
      cardinality(countries) = 0
      or array_to_string(countries, ',') ~ '^[A-Z]{2}(,[A-Z]{2})*$'
    )
  ),
  constraint career_profiles_arrangements_check check (
    work_arrangements <@ array['remote', 'hybrid', 'onsite']::text[]
  ),
  constraint career_profiles_salary_check check (salary_floor is null or salary_floor >= 0),
  constraint career_profiles_currency_check check (salary_currency ~ '^[A-Z]{3}$')
);

create table public.career_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  profile_id uuid not null,
  label text not null,
  body text not null,
  sha256 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint career_sources_user_id_id_key unique (user_id, id),
  constraint career_sources_profile_fkey
    foreign key (user_id, profile_id) references public.career_profiles (user_id, id) on delete cascade,
  constraint career_sources_label_length check (char_length(btrim(label)) between 1 and 120),
  constraint career_sources_body_length check (char_length(body) between 1 and 80000),
  constraint career_sources_sha256_check check (sha256 ~ '^[a-f0-9]{64}$')
);

create table public.ai_user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  execution_mode text not null default 'byok',
  provider text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_user_settings_mode_check check (execution_mode in ('managed', 'byok')),
  constraint ai_user_settings_provider_check check (
    provider is null or provider in ('openai', 'anthropic', 'google')
  ),
  constraint ai_user_settings_model_length check (
    model is null or char_length(model) between 1 and 80
  )
);

create table public.ai_platform_policy (
  id integer primary key default 1,
  managed_enabled boolean not null default false,
  monthly_request_limit integer not null default 0,
  monthly_token_limit integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint ai_platform_policy_singleton check (id = 1),
  constraint ai_platform_policy_limits_check check (
    monthly_request_limit >= 0 and monthly_token_limit >= 0
  )
);

insert into public.ai_platform_policy (id, managed_enabled, monthly_request_limit, monthly_token_limit)
values (1, false, 0, 0);

create table public.ai_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  key_version text not null,
  last_four text not null,
  ciphertext text not null,
  nonce text not null,
  auth_tag text not null,
  status text not null default 'unverified',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint ai_credentials_provider_check check (provider in ('openai', 'anthropic', 'google')),
  constraint ai_credentials_status_check check (status in ('unverified', 'verified', 'invalid', 'revoked')),
  constraint ai_credentials_last_four_check check (char_length(last_four) = 4),
  constraint ai_credentials_version_check check (char_length(key_version) between 1 and 20),
  constraint ai_credentials_material_check check (
    char_length(ciphertext) between 8 and 4000
    and char_length(nonce) between 8 and 128
    and char_length(auth_tag) between 8 and 128
  ),
  constraint ai_credentials_revoked_check check (
    (status = 'revoked' and revoked_at is not null)
    or (status <> 'revoked' and revoked_at is null)
  )
);

create unique index ai_credentials_one_active_idx
  on public.ai_credentials (user_id, provider)
  where status <> 'revoked';

create view public.ai_credential_summaries
with (security_invoker = true) as
select
  id,
  user_id,
  provider,
  key_version,
  last_four,
  status,
  created_at,
  updated_at,
  revoked_at
from public.ai_credentials;

create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key text not null,
  execution_mode text not null,
  provider text not null,
  model text not null,
  billed_to text not null,
  status text not null,
  input_tokens integer,
  output_tokens integer,
  estimated_cost_micros integer,
  error_class text,
  reserved_at timestamptz not null default now(),
  finalized_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_usage_events_user_key unique (user_id, idempotency_key),
  constraint ai_usage_events_user_id_id_key unique (user_id, id),
  constraint ai_usage_events_mode_check check (execution_mode in ('managed', 'byok')),
  constraint ai_usage_events_provider_check check (provider in ('openai', 'anthropic', 'google')),
  constraint ai_usage_events_billed_to_check check (billed_to in ('platform', 'user')),
  constraint ai_usage_events_status_check check (
    status in ('reserved', 'succeeded', 'failed', 'voided', 'expired')
  ),
  constraint ai_usage_events_key_length check (char_length(idempotency_key) between 8 and 200),
  constraint ai_usage_events_tokens_check check (
    (input_tokens is null or input_tokens >= 0)
    and (output_tokens is null or output_tokens >= 0)
    and (estimated_cost_micros is null or estimated_cost_micros >= 0)
  )
);

create table public.ai_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_event_id uuid,
  action text not null,
  schema_name text,
  provider text,
  model text,
  status text not null,
  error_class text,
  request_hash text,
  created_at timestamptz not null default now(),
  constraint ai_audit_events_usage_fkey
    foreign key (user_id, usage_event_id) references public.ai_usage_events (user_id, id) on delete set null (usage_event_id),
  constraint ai_audit_events_action_length check (char_length(action) between 1 and 80),
  constraint ai_audit_events_hash_check check (
    request_hash is null or request_hash ~ '^[a-f0-9]{64}$'
  )
);

create table public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_id uuid not null,
  usage_event_id uuid,
  fact_type text not null,
  payload jsonb not null,
  evidence_excerpt text,
  dedupe_key text not null,
  status text not null default 'pending',
  resulting_fact_id uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_suggestions_user_id_id_key unique (user_id, id),
  constraint ai_suggestions_source_fkey
    foreign key (user_id, source_id) references public.career_sources (user_id, id) on delete cascade,
  constraint ai_suggestions_usage_fkey
    foreign key (user_id, usage_event_id) references public.ai_usage_events (user_id, id) on delete set null (usage_event_id),
  constraint ai_suggestions_fact_type_check check (
    fact_type in (
      'employment',
      'education',
      'skill',
      'project',
      'accomplishment',
      'certification'
    )
  ),
  constraint ai_suggestions_status_check check (status in ('pending', 'accepted', 'rejected')),
  constraint ai_suggestions_payload_check check (jsonb_typeof(payload) = 'object'),
  constraint ai_suggestions_dedupe_check check (dedupe_key ~ '^[a-f0-9]{64}$'),
  constraint ai_suggestions_evidence_length check (
    evidence_excerpt is null or char_length(evidence_excerpt) <= 500
  ),
  constraint ai_suggestions_resolution_check check (
    (status = 'pending' and resulting_fact_id is null and resolved_at is null)
    or (status = 'accepted' and resulting_fact_id is not null and resolved_at is not null)
    or (status = 'rejected' and resulting_fact_id is null and resolved_at is not null)
  )
);

create unique index ai_suggestions_open_dedupe_idx
  on public.ai_suggestions (user_id, dedupe_key)
  where status in ('pending', 'accepted');

create table public.employment_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  profile_id uuid not null,
  verification_state text not null,
  source_id uuid,
  suggestion_id uuid,
  evidence_excerpt text,
  approved_at timestamptz,
  supersedes_id uuid,
  organization text not null,
  title text not null,
  location text,
  start_date date,
  end_date date,
  is_current boolean not null default false,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employment_entries_user_id_id_key unique (user_id, id),
  constraint employment_entries_profile_fkey
    foreign key (user_id, profile_id) references public.career_profiles (user_id, id) on delete cascade,
  constraint employment_entries_source_fkey
    foreign key (user_id, source_id) references public.career_sources (user_id, id) on delete set null (source_id),
  constraint employment_entries_suggestion_fkey
    foreign key (user_id, suggestion_id) references public.ai_suggestions (user_id, id) on delete set null (suggestion_id),
  constraint employment_entries_supersedes_fkey
    foreign key (user_id, supersedes_id) references public.employment_entries (user_id, id) on delete set null (supersedes_id),
  constraint employment_entries_state_check check (
    verification_state in ('suggested', 'user_verified', 'rejected', 'superseded')
  ),
  constraint employment_entries_approval_check check (
    (verification_state = 'user_verified' and approved_at is not null)
    or (verification_state = 'suggested' and approved_at is null)
    or (verification_state = 'rejected' and approved_at is null)
    or verification_state = 'superseded'
  ),
  constraint employment_entries_organization_length check (char_length(btrim(organization)) between 1 and 200),
  constraint employment_entries_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint employment_entries_current_check check (is_current = false or end_date is null),
  constraint employment_entries_dates_check check (
    start_date is null or end_date is null or start_date <= end_date
  ),
  constraint employment_entries_summary_length check (summary is null or char_length(summary) <= 4000),
  constraint employment_entries_evidence_length check (
    evidence_excerpt is null or char_length(evidence_excerpt) <= 500
  )
);

create table public.education_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  profile_id uuid not null,
  verification_state text not null,
  source_id uuid,
  suggestion_id uuid,
  evidence_excerpt text,
  approved_at timestamptz,
  supersedes_id uuid,
  institution text not null,
  credential text not null,
  field_of_study text,
  start_date date,
  end_date date,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint education_entries_user_id_id_key unique (user_id, id),
  constraint education_entries_profile_fkey
    foreign key (user_id, profile_id) references public.career_profiles (user_id, id) on delete cascade,
  constraint education_entries_source_fkey
    foreign key (user_id, source_id) references public.career_sources (user_id, id) on delete set null (source_id),
  constraint education_entries_suggestion_fkey
    foreign key (user_id, suggestion_id) references public.ai_suggestions (user_id, id) on delete set null (suggestion_id),
  constraint education_entries_supersedes_fkey
    foreign key (user_id, supersedes_id) references public.education_entries (user_id, id) on delete set null (supersedes_id),
  constraint education_entries_state_check check (
    verification_state in ('suggested', 'user_verified', 'rejected', 'superseded')
  ),
  constraint education_entries_approval_check check (
    (verification_state = 'user_verified' and approved_at is not null)
    or (verification_state = 'suggested' and approved_at is null)
    or (verification_state = 'rejected' and approved_at is null)
    or verification_state = 'superseded'
  ),
  constraint education_entries_institution_length check (char_length(btrim(institution)) between 1 and 200),
  constraint education_entries_credential_length check (char_length(btrim(credential)) between 1 and 200),
  constraint education_entries_dates_check check (
    start_date is null or end_date is null or start_date <= end_date
  ),
  constraint education_entries_summary_length check (summary is null or char_length(summary) <= 4000),
  constraint education_entries_evidence_length check (
    evidence_excerpt is null or char_length(evidence_excerpt) <= 500
  )
);

create table public.skill_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  profile_id uuid not null,
  verification_state text not null,
  source_id uuid,
  suggestion_id uuid,
  evidence_excerpt text,
  approved_at timestamptz,
  supersedes_id uuid,
  name text not null,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint skill_entries_user_id_id_key unique (user_id, id),
  constraint skill_entries_profile_fkey
    foreign key (user_id, profile_id) references public.career_profiles (user_id, id) on delete cascade,
  constraint skill_entries_source_fkey
    foreign key (user_id, source_id) references public.career_sources (user_id, id) on delete set null (source_id),
  constraint skill_entries_suggestion_fkey
    foreign key (user_id, suggestion_id) references public.ai_suggestions (user_id, id) on delete set null (suggestion_id),
  constraint skill_entries_supersedes_fkey
    foreign key (user_id, supersedes_id) references public.skill_entries (user_id, id) on delete set null (supersedes_id),
  constraint skill_entries_state_check check (
    verification_state in ('suggested', 'user_verified', 'rejected', 'superseded')
  ),
  constraint skill_entries_approval_check check (
    (verification_state = 'user_verified' and approved_at is not null)
    or (verification_state = 'suggested' and approved_at is null)
    or (verification_state = 'rejected' and approved_at is null)
    or verification_state = 'superseded'
  ),
  constraint skill_entries_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint skill_entries_evidence_length check (
    evidence_excerpt is null or char_length(evidence_excerpt) <= 500
  )
);

create table public.project_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  profile_id uuid not null,
  verification_state text not null,
  source_id uuid,
  suggestion_id uuid,
  evidence_excerpt text,
  approved_at timestamptz,
  supersedes_id uuid,
  name text not null,
  role_title text,
  url text,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_entries_user_id_id_key unique (user_id, id),
  constraint project_entries_profile_fkey
    foreign key (user_id, profile_id) references public.career_profiles (user_id, id) on delete cascade,
  constraint project_entries_source_fkey
    foreign key (user_id, source_id) references public.career_sources (user_id, id) on delete set null (source_id),
  constraint project_entries_suggestion_fkey
    foreign key (user_id, suggestion_id) references public.ai_suggestions (user_id, id) on delete set null (suggestion_id),
  constraint project_entries_supersedes_fkey
    foreign key (user_id, supersedes_id) references public.project_entries (user_id, id) on delete set null (supersedes_id),
  constraint project_entries_state_check check (
    verification_state in ('suggested', 'user_verified', 'rejected', 'superseded')
  ),
  constraint project_entries_approval_check check (
    (verification_state = 'user_verified' and approved_at is not null)
    or (verification_state = 'suggested' and approved_at is null)
    or (verification_state = 'rejected' and approved_at is null)
    or verification_state = 'superseded'
  ),
  constraint project_entries_name_length check (char_length(btrim(name)) between 1 and 200),
  constraint project_entries_url_check check (url is null or url ~* '^https?://'),
  constraint project_entries_summary_length check (summary is null or char_length(summary) <= 4000),
  constraint project_entries_evidence_length check (
    evidence_excerpt is null or char_length(evidence_excerpt) <= 500
  )
);

create table public.accomplishment_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  profile_id uuid not null,
  verification_state text not null,
  source_id uuid,
  suggestion_id uuid,
  evidence_excerpt text,
  approved_at timestamptz,
  supersedes_id uuid,
  title text not null,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accomplishment_entries_user_id_id_key unique (user_id, id),
  constraint accomplishment_entries_profile_fkey
    foreign key (user_id, profile_id) references public.career_profiles (user_id, id) on delete cascade,
  constraint accomplishment_entries_source_fkey
    foreign key (user_id, source_id) references public.career_sources (user_id, id) on delete set null (source_id),
  constraint accomplishment_entries_suggestion_fkey
    foreign key (user_id, suggestion_id) references public.ai_suggestions (user_id, id) on delete set null (suggestion_id),
  constraint accomplishment_entries_supersedes_fkey
    foreign key (user_id, supersedes_id) references public.accomplishment_entries (user_id, id) on delete set null (supersedes_id),
  constraint accomplishment_entries_state_check check (
    verification_state in ('suggested', 'user_verified', 'rejected', 'superseded')
  ),
  constraint accomplishment_entries_approval_check check (
    (verification_state = 'user_verified' and approved_at is not null)
    or (verification_state = 'suggested' and approved_at is null)
    or (verification_state = 'rejected' and approved_at is null)
    or verification_state = 'superseded'
  ),
  constraint accomplishment_entries_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint accomplishment_entries_summary_length check (summary is null or char_length(summary) <= 4000),
  constraint accomplishment_entries_evidence_length check (
    evidence_excerpt is null or char_length(evidence_excerpt) <= 500
  )
);

create table public.certification_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  profile_id uuid not null,
  verification_state text not null,
  source_id uuid,
  suggestion_id uuid,
  evidence_excerpt text,
  approved_at timestamptz,
  supersedes_id uuid,
  name text not null,
  issuer text,
  issued_on date,
  expires_on date,
  credential_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint certification_entries_user_id_id_key unique (user_id, id),
  constraint certification_entries_profile_fkey
    foreign key (user_id, profile_id) references public.career_profiles (user_id, id) on delete cascade,
  constraint certification_entries_source_fkey
    foreign key (user_id, source_id) references public.career_sources (user_id, id) on delete set null (source_id),
  constraint certification_entries_suggestion_fkey
    foreign key (user_id, suggestion_id) references public.ai_suggestions (user_id, id) on delete set null (suggestion_id),
  constraint certification_entries_supersedes_fkey
    foreign key (user_id, supersedes_id) references public.certification_entries (user_id, id) on delete set null (supersedes_id),
  constraint certification_entries_state_check check (
    verification_state in ('suggested', 'user_verified', 'rejected', 'superseded')
  ),
  constraint certification_entries_approval_check check (
    (verification_state = 'user_verified' and approved_at is not null)
    or (verification_state = 'suggested' and approved_at is null)
    or (verification_state = 'rejected' and approved_at is null)
    or verification_state = 'superseded'
  ),
  constraint certification_entries_name_length check (char_length(btrim(name)) between 1 and 200),
  constraint certification_entries_dates_check check (
    issued_on is null or expires_on is null or issued_on <= expires_on
  ),
  constraint certification_entries_url_check check (
    credential_url is null or credential_url ~* '^https?://'
  ),
  constraint certification_entries_evidence_length check (
    evidence_excerpt is null or char_length(evidence_excerpt) <= 500
  )
);

create index career_sources_user_idx on public.career_sources (user_id, created_at);
create index employment_entries_user_state_idx on public.employment_entries (user_id, verification_state);
create index education_entries_user_state_idx on public.education_entries (user_id, verification_state);
create index skill_entries_user_state_idx on public.skill_entries (user_id, verification_state);
create index project_entries_user_state_idx on public.project_entries (user_id, verification_state);
create index accomplishment_entries_user_state_idx on public.accomplishment_entries (user_id, verification_state);
create index certification_entries_user_state_idx on public.certification_entries (user_id, verification_state);
create index ai_suggestions_user_status_idx on public.ai_suggestions (user_id, status);
create index ai_usage_events_user_reserved_idx on public.ai_usage_events (user_id, reserved_at);
create index ai_audit_events_user_idx on public.ai_audit_events (user_id, created_at);

create trigger career_profiles_set_user_id
  before insert or update on public.career_profiles
  for each row execute function public.assign_user_id();
create trigger career_profiles_set_updated_at
  before update on public.career_profiles
  for each row execute function public.set_updated_at();

create trigger career_sources_set_user_id
  before insert or update on public.career_sources
  for each row execute function public.assign_user_id();
create trigger career_sources_protect
  before update on public.career_sources
  for each row execute function public.protect_career_source();
create trigger career_sources_set_updated_at
  before update on public.career_sources
  for each row execute function public.set_updated_at();

create trigger ai_user_settings_set_user_id
  before insert or update on public.ai_user_settings
  for each row execute function public.assign_user_id();
create trigger ai_user_settings_set_updated_at
  before update on public.ai_user_settings
  for each row execute function public.set_updated_at();

create trigger ai_credentials_set_user_id
  before insert or update on public.ai_credentials
  for each row execute function public.assign_user_id();
create trigger ai_credentials_status
  before insert or update on public.ai_credentials
  for each row execute function public.enforce_credential_status();
create trigger ai_credentials_set_updated_at
  before update on public.ai_credentials
  for each row execute function public.set_updated_at();

create trigger ai_suggestions_set_user_id
  before insert or update on public.ai_suggestions
  for each row execute function public.assign_user_id();
create trigger ai_suggestions_review
  before insert or update on public.ai_suggestions
  for each row execute function public.enforce_suggestion_review();
create trigger ai_suggestions_set_updated_at
  before update on public.ai_suggestions
  for each row execute function public.set_updated_at();

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'employment_entries',
    'education_entries',
    'skill_entries',
    'project_entries',
    'accomplishment_entries',
    'certification_entries'
  ]
  loop
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.assign_user_id()',
      tbl || '_10_set_user_id', tbl
    );
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.enforce_career_verification()',
      tbl || '_20_verification', tbl
    );
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      tbl || '_30_set_updated_at', tbl
    );
  end loop;
end $$;

alter table public.career_profiles enable row level security;
alter table public.career_sources enable row level security;
alter table public.ai_user_settings enable row level security;
alter table public.ai_platform_policy enable row level security;
alter table public.ai_credentials enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.ai_audit_events enable row level security;
alter table public.ai_suggestions enable row level security;
alter table public.employment_entries enable row level security;
alter table public.education_entries enable row level security;
alter table public.skill_entries enable row level security;
alter table public.project_entries enable row level security;
alter table public.accomplishment_entries enable row level security;
alter table public.certification_entries enable row level security;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'career_profiles',
    'career_sources',
    'ai_user_settings',
    'ai_credentials',
    'ai_suggestions',
    'employment_entries',
    'education_entries',
    'skill_entries',
    'project_entries',
    'accomplishment_entries',
    'certification_entries'
  ]
  loop
    execute format('revoke all on table public.%I from anon, authenticated', tbl);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', tbl);
    execute format(
      'create policy %I on public.%I for select to authenticated using (auth.uid() = user_id)',
      'select own ' || tbl, tbl
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (auth.uid() = user_id)',
      'insert own ' || tbl, tbl
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      'update own ' || tbl, tbl
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (auth.uid() = user_id)',
      'delete own ' || tbl, tbl
    );
  end loop;
end $$;

revoke insert, update, delete, select on public.ai_credentials from authenticated;
grant select (
  id,
  user_id,
  provider,
  key_version,
  last_four,
  status,
  created_at,
  updated_at,
  revoked_at
) on public.ai_credentials to authenticated;
grant select on public.ai_credential_summaries to authenticated;
revoke all on public.ai_credential_summaries from anon, public;

revoke all on table public.ai_usage_events from anon, authenticated;
grant select on table public.ai_usage_events to authenticated;
create policy "select own ai usage"
  on public.ai_usage_events for select to authenticated
  using (auth.uid() = user_id);

revoke all on table public.ai_audit_events from anon, authenticated;
grant select on table public.ai_audit_events to authenticated;
create policy "select own ai audit"
  on public.ai_audit_events for select to authenticated
  using (auth.uid() = user_id);

revoke all on table public.ai_platform_policy from anon, authenticated;
grant select on table public.ai_platform_policy to authenticated;
create policy "read ai platform policy"
  on public.ai_platform_policy for select to authenticated
  using (true);

create or replace function public.read_own_credential_material(p_credential_id uuid)
returns table (ciphertext text, nonce text, auth_tag text, key_version text, provider text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  return query
  select c.ciphertext, c.nonce, c.auth_tag, c.key_version, c.provider
  from public.ai_credentials c
  where c.id = p_credential_id
    and c.user_id = auth.uid()
    and c.status = 'unverified';
end;
$$;

create or replace function public.rotate_ai_credential(
  p_provider text,
  p_key_version text,
  p_last_four text,
  p_ciphertext text,
  p_nonce text,
  p_auth_tag text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  created uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_provider not in ('openai', 'anthropic', 'google') then
    raise exception 'unsupported provider' using errcode = '23514';
  end if;

  update public.ai_credentials
    set status = 'revoked',
        revoked_at = pg_catalog.now()
    where user_id = uid
      and provider = p_provider
      and status <> 'revoked';

  insert into public.ai_credentials (
    user_id, provider, key_version, last_four, ciphertext, nonce, auth_tag, status
  ) values (
    uid, p_provider, p_key_version, p_last_four, p_ciphertext, p_nonce, p_auth_tag, 'unverified'
  )
  returning id into created;

  return created;
end;
$$;

create or replace function public.revoke_ai_credential(p_credential_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  updated uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  update public.ai_credentials
    set status = 'revoked',
        revoked_at = pg_catalog.now()
    where id = p_credential_id
      and user_id = uid
      and status = 'unverified'
    returning id into updated;

  if updated is null then
    raise exception 'credential not found' using errcode = '42501';
  end if;
  return updated;
end;
$$;

create or replace function public.reserve_ai_usage(
  p_idempotency_key text,
  p_execution_mode text,
  p_provider text,
  p_model text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  existing public.ai_usage_events%rowtype;
  policy public.ai_platform_policy%rowtype;
  used_requests integer;
  used_tokens integer;
  created public.ai_usage_events%rowtype;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_execution_mode not in ('managed', 'byok') then
    raise exception 'unsupported execution mode' using errcode = '23514';
  end if;
  if p_provider not in ('openai', 'anthropic', 'google') then
    raise exception 'unsupported provider' using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('job-tracker-ai'),
    pg_catalog.hashtext(uid::text)
  );

  update public.ai_usage_events
    set status = 'expired',
        finalized_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    where user_id = uid
      and status = 'reserved'
      and expires_at < pg_catalog.now();

  select * into existing
  from public.ai_usage_events
  where user_id = uid
    and idempotency_key = p_idempotency_key;

  if found then
    if existing.status in ('voided', 'failed', 'expired') then
      update public.ai_usage_events
        set status = 'reserved',
            error_class = null,
            finalized_at = null,
            input_tokens = null,
            output_tokens = null,
            estimated_cost_micros = null,
            reserved_at = pg_catalog.now(),
            expires_at = pg_catalog.now() + interval '10 minutes',
            updated_at = pg_catalog.now(),
            execution_mode = p_execution_mode,
            provider = p_provider,
            model = p_model,
            billed_to = case when p_execution_mode = 'managed' then 'platform' else 'user' end
        where id = existing.id
        returning * into created;
      return pg_catalog.jsonb_build_object(
        'id', created.id,
        'status', created.status,
        'reused', false,
        'reopened', true
      );
    end if;

    return pg_catalog.jsonb_build_object(
      'id', existing.id,
      'status', existing.status,
      'reused', true,
      'reopened', false
    );
  end if;

  select * into policy from public.ai_platform_policy where id = 1;

  if p_execution_mode = 'managed' then
    if policy.managed_enabled is not true
      or policy.monthly_request_limit <= 0
      or policy.monthly_token_limit <= 0 then
      raise exception 'managed ai is not configured' using errcode = 'P0001';
    end if;

    select count(*)::integer,
           coalesce(sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)), 0)::integer
      into used_requests, used_tokens
    from public.ai_usage_events
    where user_id = uid
      and billed_to = 'platform'
      and status in ('reserved', 'succeeded')
      and reserved_at >= date_trunc('month', pg_catalog.now());

    if used_requests >= policy.monthly_request_limit or used_tokens >= policy.monthly_token_limit then
      raise exception 'quota exceeded' using errcode = 'P0001';
    end if;
  end if;

  insert into public.ai_usage_events (
    user_id, idempotency_key, execution_mode, provider, model, billed_to, status, expires_at
  ) values (
    uid,
    p_idempotency_key,
    p_execution_mode,
    p_provider,
    p_model,
    case when p_execution_mode = 'managed' then 'platform' else 'user' end,
    'reserved',
    pg_catalog.now() + interval '10 minutes'
  )
  returning * into created;

  return pg_catalog.jsonb_build_object(
    'id', created.id,
    'status', created.status,
    'reused', false,
    'reopened', false
  );
end;
$$;

create or replace function public.finalize_ai_usage(
  p_usage_event_id uuid,
  p_input_tokens integer,
  p_output_tokens integer,
  p_estimated_cost_micros integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  existing public.ai_usage_events%rowtype;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into existing
  from public.ai_usage_events
  where id = p_usage_event_id
    and user_id = uid
  for update;

  if not found then
    raise exception 'usage event not found' using errcode = '42501';
  end if;

  if existing.status = 'succeeded' then
    return pg_catalog.jsonb_build_object('id', existing.id, 'status', existing.status, 'reused', true);
  end if;

  if existing.status <> 'reserved' then
    raise exception 'usage event is not open' using errcode = '23514';
  end if;

  update public.ai_usage_events
    set status = 'succeeded',
        input_tokens = p_input_tokens,
        output_tokens = p_output_tokens,
        estimated_cost_micros = p_estimated_cost_micros,
        finalized_at = pg_catalog.now(),
        error_class = null,
        updated_at = pg_catalog.now()
    where id = existing.id;

  return pg_catalog.jsonb_build_object('id', existing.id, 'status', 'succeeded', 'reused', false);
end;
$$;

create or replace function public.void_ai_usage(
  p_usage_event_id uuid,
  p_error_class text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  existing public.ai_usage_events%rowtype;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into existing
  from public.ai_usage_events
  where id = p_usage_event_id
    and user_id = uid
  for update;

  if not found then
    raise exception 'usage event not found' using errcode = '42501';
  end if;

  if existing.status = 'succeeded' then
    return pg_catalog.jsonb_build_object('id', existing.id, 'status', existing.status, 'reused', true);
  end if;

  if existing.status <> 'reserved' then
    return pg_catalog.jsonb_build_object('id', existing.id, 'status', existing.status, 'reused', true);
  end if;

  update public.ai_usage_events
    set status = 'voided',
        error_class = left(coalesce(p_error_class, 'failed'), 80),
        finalized_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    where id = existing.id;

  return pg_catalog.jsonb_build_object('id', existing.id, 'status', 'voided', 'reused', false);
end;
$$;

create or replace function public.record_ai_audit(
  p_usage_event_id uuid,
  p_action text,
  p_schema_name text,
  p_provider text,
  p_model text,
  p_status text,
  p_error_class text,
  p_request_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  created uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_usage_event_id is not null and not exists (
    select 1 from public.ai_usage_events
    where id = p_usage_event_id and user_id = uid
  ) then
    raise exception 'usage event not found' using errcode = '42501';
  end if;
  if p_request_hash is not null and p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid request hash' using errcode = '23514';
  end if;

  insert into public.ai_audit_events (
    user_id, usage_event_id, action, schema_name, provider, model, status, error_class, request_hash
  ) values (
    uid,
    p_usage_event_id,
    left(p_action, 80),
    left(p_schema_name, 80),
    p_provider,
    p_model,
    left(p_status, 40),
    left(p_error_class, 80),
    p_request_hash
  )
  returning id into created;

  return created;
end;
$$;

create or replace function public.insert_career_suggestions(
  p_usage_event_id uuid,
  p_source_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  item jsonb;
  existing_id uuid;
  created_id uuid;
  ids jsonb := '[]'::jsonb;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 80 then
    raise exception 'invalid suggestion batch' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.career_sources
    where id = p_source_id and user_id = uid
  ) then
    raise exception 'source not found' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.ai_usage_events
    where id = p_usage_event_id and user_id = uid and status in ('reserved', 'succeeded')
  ) then
    raise exception 'usage event not found' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('job-tracker-ai'),
    pg_catalog.hashtext(uid::text)
  );

  for item in select value from jsonb_array_elements(p_items) loop
    existing_id := null;
    select id into existing_id
    from public.ai_suggestions
    where user_id = uid
      and dedupe_key = item->>'dedupe_key'
      and status in ('pending', 'accepted')
    limit 1;

    if existing_id is not null then
      ids := ids || pg_catalog.jsonb_build_array(existing_id);
      continue;
    end if;

    begin
      insert into public.ai_suggestions (
        user_id, source_id, usage_event_id, fact_type, payload, evidence_excerpt, dedupe_key, status
      ) values (
        uid,
        p_source_id,
        p_usage_event_id,
        item->>'fact_type',
        item->'payload',
        nullif(item->>'evidence_excerpt', ''),
        item->>'dedupe_key',
        'pending'
      )
      returning id into created_id;
      ids := ids || pg_catalog.jsonb_build_array(created_id);
    exception
      when unique_violation then
        select id into existing_id
        from public.ai_suggestions
        where user_id = uid
          and dedupe_key = item->>'dedupe_key'
          and status in ('pending', 'accepted')
        limit 1;
        ids := ids || pg_catalog.jsonb_build_array(existing_id);
    end;
  end loop;

  return pg_catalog.jsonb_build_object('ids', ids);
end;
$$;

create or replace function public.optional_date(p_value text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;
  if p_value !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'invalid date' using errcode = '23514';
  end if;
  return p_value::date;
end;
$$;

create or replace function public.accept_career_suggestion(
  p_suggestion_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  suggestion public.ai_suggestions%rowtype;
  source public.career_sources%rowtype;
  fact_id uuid;
  evidence text;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'invalid payload' using errcode = '22023';
  end if;

  select * into suggestion
  from public.ai_suggestions
  where id = p_suggestion_id
    and user_id = uid
  for update;

  if not found then
    raise exception 'suggestion not found' using errcode = '42501';
  end if;
  if suggestion.status = 'accepted' then
    return suggestion.resulting_fact_id;
  end if;
  if suggestion.status <> 'pending' then
    raise exception 'suggestion is not pending' using errcode = '23514';
  end if;

  select * into source
  from public.career_sources
  where id = suggestion.source_id
    and user_id = uid;

  if not found then
    raise exception 'source not found' using errcode = '42501';
  end if;

  evidence := nullif(left(coalesce(p_payload->>'evidence', suggestion.evidence_excerpt, ''), 500), '');

  if suggestion.fact_type = 'employment' then
    insert into public.employment_entries (
      user_id, profile_id, verification_state, source_id, suggestion_id, evidence_excerpt,
      approved_at, organization, title, location, start_date, end_date, is_current, summary
    ) values (
      uid, source.profile_id, 'user_verified', source.id, suggestion.id, evidence, pg_catalog.now(),
      p_payload->>'organization',
      p_payload->>'title',
      nullif(p_payload->>'location', ''),
      public.optional_date(p_payload->>'startDate'),
      public.optional_date(p_payload->>'endDate'),
      coalesce((p_payload->>'current')::boolean, false),
      nullif(p_payload->>'summary', '')
    )
    returning id into fact_id;
  elsif suggestion.fact_type = 'education' then
    insert into public.education_entries (
      user_id, profile_id, verification_state, source_id, suggestion_id, evidence_excerpt,
      approved_at, institution, credential, field_of_study, start_date, end_date, summary
    ) values (
      uid, source.profile_id, 'user_verified', source.id, suggestion.id, evidence, pg_catalog.now(),
      p_payload->>'institution',
      p_payload->>'credential',
      nullif(p_payload->>'fieldOfStudy', ''),
      public.optional_date(p_payload->>'startDate'),
      public.optional_date(p_payload->>'endDate'),
      nullif(p_payload->>'summary', '')
    )
    returning id into fact_id;
  elsif suggestion.fact_type = 'skill' then
    insert into public.skill_entries (
      user_id, profile_id, verification_state, source_id, suggestion_id, evidence_excerpt,
      approved_at, name, category
    ) values (
      uid, source.profile_id, 'user_verified', source.id, suggestion.id, evidence, pg_catalog.now(),
      p_payload->>'name',
      nullif(p_payload->>'category', '')
    )
    returning id into fact_id;
  elsif suggestion.fact_type = 'project' then
    insert into public.project_entries (
      user_id, profile_id, verification_state, source_id, suggestion_id, evidence_excerpt,
      approved_at, name, role_title, url, summary
    ) values (
      uid, source.profile_id, 'user_verified', source.id, suggestion.id, evidence, pg_catalog.now(),
      p_payload->>'name',
      nullif(p_payload->>'roleTitle', ''),
      nullif(p_payload->>'url', ''),
      nullif(p_payload->>'summary', '')
    )
    returning id into fact_id;
  elsif suggestion.fact_type = 'accomplishment' then
    insert into public.accomplishment_entries (
      user_id, profile_id, verification_state, source_id, suggestion_id, evidence_excerpt,
      approved_at, title, summary
    ) values (
      uid, source.profile_id, 'user_verified', source.id, suggestion.id, evidence, pg_catalog.now(),
      p_payload->>'title',
      nullif(p_payload->>'summary', '')
    )
    returning id into fact_id;
  elsif suggestion.fact_type = 'certification' then
    insert into public.certification_entries (
      user_id, profile_id, verification_state, source_id, suggestion_id, evidence_excerpt,
      approved_at, name, issuer, issued_on, expires_on, credential_url
    ) values (
      uid, source.profile_id, 'user_verified', source.id, suggestion.id, evidence, pg_catalog.now(),
      p_payload->>'name',
      nullif(p_payload->>'issuer', ''),
      public.optional_date(p_payload->>'issuedOn'),
      public.optional_date(p_payload->>'expiresOn'),
      nullif(p_payload->>'credentialUrl', '')
    )
    returning id into fact_id;
  else
    raise exception 'unsupported fact type' using errcode = '23514';
  end if;

  update public.ai_suggestions
    set status = 'accepted',
        resulting_fact_id = fact_id,
        resolved_at = pg_catalog.now()
    where id = suggestion.id
      and user_id = uid
      and status = 'pending';

  return fact_id;
end;
$$;

create or replace function public.reject_career_suggestion(p_suggestion_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  suggestion public.ai_suggestions%rowtype;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into suggestion
  from public.ai_suggestions
  where id = p_suggestion_id and user_id = uid
  for update;

  if not found then
    raise exception 'suggestion not found' using errcode = '42501';
  end if;
  if suggestion.status = 'rejected' then
    return suggestion.id;
  end if;
  if suggestion.status <> 'pending' then
    raise exception 'suggestion is not pending' using errcode = '23514';
  end if;

  update public.ai_suggestions
    set status = 'rejected',
        resolved_at = pg_catalog.now(),
        resulting_fact_id = null
    where id = suggestion.id;

  return suggestion.id;
end;
$$;

create or replace function public.supersede_career_fact(
  p_table text,
  p_fact_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  updated integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_table not in (
    'employment_entries',
    'education_entries',
    'skill_entries',
    'project_entries',
    'accomplishment_entries',
    'certification_entries'
  ) then
    raise exception 'unsupported fact table' using errcode = '23514';
  end if;

  execute pg_catalog.format(
    'update public.%I set verification_state = ''superseded'' where id = $1 and user_id = $2 and verification_state = ''user_verified''',
    p_table
  )
  using p_fact_id, uid;

  get diagnostics updated = row_count;
  if updated <> 1 then
    raise exception 'verified fact not found' using errcode = '42501';
  end if;
  return p_fact_id;
end;
$$;

revoke all on function public.revoke_ai_credential(uuid) from public, anon;
revoke all on function public.read_own_credential_material(uuid) from public, anon;
revoke all on function public.rotate_ai_credential(text, text, text, text, text, text) from public, anon;
revoke all on function public.reserve_ai_usage(text, text, text, text) from public, anon;
revoke all on function public.finalize_ai_usage(uuid, integer, integer, integer) from public, anon;
revoke all on function public.void_ai_usage(uuid, text) from public, anon;
revoke all on function public.record_ai_audit(uuid, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.insert_career_suggestions(uuid, uuid, jsonb) from public, anon;
revoke all on function public.optional_date(text) from public, anon;
revoke all on function public.accept_career_suggestion(uuid, jsonb) from public, anon;
revoke all on function public.reject_career_suggestion(uuid) from public, anon;
revoke all on function public.supersede_career_fact(text, uuid) from public, anon;

grant execute on function public.revoke_ai_credential(uuid) to authenticated;
grant execute on function public.read_own_credential_material(uuid) to authenticated;
grant execute on function public.rotate_ai_credential(text, text, text, text, text, text) to authenticated;
grant execute on function public.reserve_ai_usage(text, text, text, text) to authenticated;
grant execute on function public.finalize_ai_usage(uuid, integer, integer, integer) to authenticated;
grant execute on function public.void_ai_usage(uuid, text) to authenticated;
grant execute on function public.record_ai_audit(uuid, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.insert_career_suggestions(uuid, uuid, jsonb) to authenticated;
grant execute on function public.optional_date(text) to authenticated;
grant execute on function public.accept_career_suggestion(uuid, jsonb) to authenticated;
grant execute on function public.reject_career_suggestion(uuid) to authenticated;
grant execute on function public.supersede_career_fact(text, uuid) to authenticated;
