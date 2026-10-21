-- Recommended jobs: shared catalog, private preferences, and alert history.
-- Additive. application_postings references the existing applications
-- unique key (user_id, id) from 20261019160000. Does not rewrite V1 rows.
-- Catalog writes require a server HMAC. The gate secret ships unset.
-- Apply with `supabase db push` only against a database you intend to change.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.job_catalog_gate (
  id integer primary key,
  secret text,
  constraint job_catalog_gate_singleton check (id = 1),
  constraint job_catalog_gate_secret_check check (
    secret is null or char_length(secret) between 32 and 200
  )
);

insert into public.job_catalog_gate (id, secret) values (1, null);
alter table public.job_catalog_gate enable row level security;
revoke all on table public.job_catalog_gate from public, anon, authenticated;

create or replace function public.normalize_employer_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(pg_catalog.btrim(coalesce(p_name, '')), '\s+', ' ', 'g'))
$$;

create or replace function public.job_json_text_array(p_value jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (
      select pg_catalog.array_agg(distinct token order by token)
      from (
        select left(pg_catalog.btrim(value), 80) as token
        from pg_catalog.jsonb_array_elements_text(
          case
            when pg_catalog.jsonb_typeof(p_value) = 'array' then p_value
            else '[]'::jsonb
          end
        ) as value
        where char_length(pg_catalog.btrim(value)) > 0
      ) tokens
    ),
    '{}'::text[]
  )
$$;

create or replace function public.job_text_tokens(p_value text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (
      select pg_catalog.array_agg(distinct token order by token)
      from (
        select token
        from pg_catalog.unnest(
          pg_catalog.regexp_split_to_array(lower(coalesce(p_value, '')), '[^a-z0-9+#]+')
        ) as token
        where char_length(token) > 1
          and token not in ('and', 'the', 'for', 'with', 'role', 'job', 'a', 'to', 'of')
      ) tokens
    ),
    '{}'::text[]
  )
$$;

create or replace function public.job_token_overlap(p_left text[], p_right text[])
returns integer
language sql
immutable
set search_path = ''
as $$
  select count(*)::integer
  from (
    select distinct token
    from pg_catalog.unnest(coalesce(p_left, '{}'::text[])) as token
    intersect
    select distinct token
    from pg_catalog.unnest(coalesce(p_right, '{}'::text[])) as token
  ) shared
$$;

create or replace function public.job_match_score(
  p_skill_tokens text[],
  p_posting_skill_tokens text[],
  p_role_tokens text[],
  p_title_tokens text[],
  p_experience_tokens text[],
  p_seniorities text[],
  p_posting_seniority text,
  p_preferred boolean,
  p_reference timestamptz,
  p_now timestamptz
)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_skills integer := 0;
  v_title integer := 0;
  v_seniority integer := 0;
  v_experience integer := 0;
  v_preferred integer := 0;
  v_freshness integer := 0;
  v_days integer;
begin
  if coalesce(pg_catalog.array_length(p_skill_tokens, 1), 0) > 0
     and coalesce(pg_catalog.array_length(p_posting_skill_tokens, 1), 0) > 0 then
    v_skills := least(
      30,
      round(
        (30::numeric * public.job_token_overlap(p_skill_tokens, p_posting_skill_tokens))
        / pg_catalog.array_length(p_skill_tokens, 1)
      )::integer
    );
  end if;

  if coalesce(pg_catalog.array_length(p_role_tokens, 1), 0) > 0
     and coalesce(pg_catalog.array_length(p_title_tokens, 1), 0) > 0 then
    v_title := least(
      25,
      round(
        (25::numeric * public.job_token_overlap(p_role_tokens, p_title_tokens))
        / pg_catalog.array_length(p_role_tokens, 1)
      )::integer
    );
  end if;

  if coalesce(pg_catalog.array_length(p_seniorities, 1), 0) = 0 then
    v_seniority := 0;
  elsif p_posting_seniority = 'unknown' then
    v_seniority := 5;
  elsif p_posting_seniority = any(p_seniorities) then
    v_seniority := 15;
  else
    v_seniority := 0;
  end if;

  if coalesce(pg_catalog.array_length(p_experience_tokens, 1), 0) > 0 then
    v_experience := least(10, public.job_token_overlap(p_experience_tokens, p_title_tokens) * 5);
  end if;

  if p_preferred then
    v_preferred := 10;
  end if;

  if p_reference is not null and p_now is not null then
    v_days := floor(extract(epoch from (p_now - p_reference)) / 86400)::integer;
    if v_days < 0 then
      v_days := 0;
    end if;
    if v_days <= 7 then
      v_freshness := 10;
    elsif v_days <= 30 then
      v_freshness := 6;
    elsif v_days <= 90 then
      v_freshness := 3;
    end if;
  end if;

  return v_skills + v_title + v_seniority + v_experience + v_preferred + v_freshness;
end;
$$;

create table public.catalog_employers (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  normalized_name text not null,
  website_domain text not null default '',
  country_code text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint catalog_employers_name_length check (char_length(pg_catalog.btrim(canonical_name)) between 1 and 200),
  constraint catalog_employers_domain_check check (
    website_domain = '' or website_domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'
  ),
  constraint catalog_employers_country_check check (
    country_code is null or country_code ~ '^[A-Z]{2}$'
  ),
  constraint catalog_employers_identity_key unique (normalized_name, website_domain)
);

create table public.job_sources (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  slug text not null,
  display_name text not null,
  source_identifier text,
  region text not null default 'global',
  employer_name text,
  employer_domain text not null default '',
  access_method text not null,
  approved_usage text not null,
  attribution_requirements text not null,
  retention_restrictions text not null,
  allowed_storage_fields text[] not null,
  refresh_limit_per_day integer not null default 0,
  approval_status text not null default 'draft',
  terms_status text not null default 'unclear',
  live_ingestion_enabled boolean not null default false,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint job_sources_slug_key unique (slug),
  constraint job_sources_provider_check check (provider in ('greenhouse', 'lever', 'ashby')),
  constraint job_sources_region_check check (region in ('global', 'eu')),
  constraint job_sources_approval_check check (approval_status in ('draft', 'approved', 'revoked')),
  constraint job_sources_terms_check check (terms_status in ('unclear', 'permitted', 'restricted')),
  constraint job_sources_refresh_check check (refresh_limit_per_day between 0 and 24),
  constraint job_sources_identifier_check check (
    source_identifier is null or source_identifier ~ '^[A-Za-z0-9_-]{1,80}$'
  ),
  constraint job_sources_domain_check check (
    employer_domain = '' or employer_domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'
  ),
  constraint job_sources_live_check check (
    live_ingestion_enabled = false
    or (
      approval_status = 'approved'
      and terms_status = 'permitted'
      and refresh_limit_per_day > 0
      and source_identifier is not null
      and char_length(pg_catalog.btrim(approved_usage)) > 0
      and char_length(pg_catalog.btrim(attribution_requirements)) > 0
      and char_length(pg_catalog.btrim(retention_restrictions)) > 0
      and cardinality(allowed_storage_fields) > 0
    )
  )
);

create table public.job_postings (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.job_sources (id) on delete restrict,
  employer_id uuid references public.catalog_employers (id) on delete set null,
  source_job_id text not null,
  title text not null,
  location_text text,
  country_code text,
  region text,
  work_arrangement text not null default 'unknown',
  employment_type text not null default 'unknown',
  seniority text not null default 'unknown',
  compensation_min numeric(12, 2),
  compensation_max numeric(12, 2),
  currency text,
  salary_period text not null default 'unknown',
  posted_at timestamptz,
  discovered_at timestamptz not null default pg_catalog.now(),
  last_verified_at timestamptz,
  listing_url text not null,
  application_url text,
  application_method text not null default 'unknown',
  content_hash text not null,
  listing_status text not null default 'unverified',
  requisition_id text,
  description_text text,
  skills text[] not null default '{}',
  title_tokens text[] not null default '{}',
  skill_tokens text[] not null default '{}',
  provenance jsonb not null default '{}'::jsonb,
  duplicate_of_posting_id uuid references public.job_postings (id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint job_postings_source_job_key unique (source_id, source_job_id),
  constraint job_postings_title_length check (char_length(pg_catalog.btrim(title)) between 1 and 200),
  constraint job_postings_source_job_length check (char_length(source_job_id) between 1 and 120),
  constraint job_postings_arrangement_check check (
    work_arrangement in ('remote', 'hybrid', 'onsite', 'unknown')
  ),
  constraint job_postings_employment_check check (
    employment_type in ('full_time', 'part_time', 'contract', 'internship', 'unknown')
  ),
  constraint job_postings_seniority_check check (
    seniority in ('intern', 'junior', 'mid', 'senior', 'staff', 'principal', 'manager', 'unknown')
  ),
  constraint job_postings_period_check check (
    salary_period in ('hour', 'day', 'week', 'month', 'year', 'unknown')
  ),
  constraint job_postings_method_check check (
    application_method in ('external', 'easy_apply', 'ats', 'email', 'unknown')
  ),
  constraint job_postings_status_check check (
    listing_status in ('active', 'unverified', 'expired')
  ),
  constraint job_postings_country_check check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  constraint job_postings_currency_check check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint job_postings_salary_check check (
    (compensation_min is null or compensation_min >= 0)
    and (compensation_max is null or compensation_max >= 0)
    and (compensation_min is null or compensation_max is null or compensation_min <= compensation_max)
  ),
  constraint job_postings_listing_url_check check (
    listing_url ~ '^https://[^[:space:]@]+$' and char_length(listing_url) <= 2000
  ),
  constraint job_postings_application_url_check check (
    application_url is null
    or (application_url ~ '^https://[^[:space:]@]+$' and char_length(application_url) <= 2000)
  ),
  constraint job_postings_hash_check check (content_hash ~ '^[a-f0-9]{64}$'),
  constraint job_postings_description_check check (
    description_text is null or char_length(description_text) <= 8000
  ),
  constraint job_postings_skills_check check (
    cardinality(skills) <= 40
    and cardinality(title_tokens) <= 40
    and cardinality(skill_tokens) <= 40
  ),
  constraint job_postings_provenance_check check (
    pg_catalog.jsonb_typeof(provenance) = 'object'
    and char_length(provenance::text) <= 4000
  ),
  constraint job_postings_requisition_check check (
    requisition_id is null or char_length(requisition_id) <= 80
  )
);

create index job_postings_status_country_idx on public.job_postings (listing_status, country_code);
create index job_postings_filters_idx on public.job_postings (work_arrangement, employment_type, seniority);
create index job_postings_posted_at_idx on public.job_postings (posted_at desc);
create index job_postings_employer_idx on public.job_postings (employer_id);

create table public.job_source_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.job_sources (id) on delete cascade,
  started_at timestamptz not null default pg_catalog.now(),
  finished_at timestamptz,
  status text not null,
  error text,
  fetched_count integer,
  idempotency_key text not null,
  constraint job_source_runs_status_check check (status in ('succeeded', 'failed')),
  constraint job_source_runs_key_key unique (idempotency_key),
  constraint job_source_runs_error_length check (error is null or char_length(error) <= 300)
);

create index job_source_runs_source_idx on public.job_source_runs (source_id, started_at desc);

create table public.job_processing_locks (
  name text primary key,
  owner text not null,
  expires_at timestamptz not null
);

alter table public.job_source_runs enable row level security;
alter table public.job_processing_locks enable row level security;
revoke all on table public.job_source_runs from public, anon, authenticated;
revoke all on table public.job_processing_locks from public, anon, authenticated;

create table public.job_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  keywords text,
  countries text[] not null default '{}',
  locations text[] not null default '{}',
  work_arrangements text[] not null default '{}',
  seniorities text[] not null default '{}',
  employment_types text[] not null default '{}',
  salary_min numeric(12, 2),
  salary_currency text not null default 'USD',
  include_unknown_compensation boolean not null default true,
  posted_within_days integer,
  exclude_easy_apply boolean not null default false,
  timezone text not null default 'UTC',
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint job_preferences_keywords_check check (keywords is null or char_length(keywords) <= 120),
  constraint job_preferences_salary_check check (salary_min is null or salary_min >= 0),
  constraint job_preferences_currency_check check (salary_currency ~ '^[A-Z]{3}$'),
  constraint job_preferences_posted_check check (
    posted_within_days is null or posted_within_days between 1 and 365
  ),
  constraint job_preferences_timezone_check check (char_length(timezone) between 1 and 80),
  constraint job_preferences_array_check check (
    cardinality(countries) <= 12
    and cardinality(locations) <= 12
    and cardinality(work_arrangements) <= 4
    and cardinality(seniorities) <= 8
    and cardinality(employment_types) <= 5
  )
);

create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  filters jsonb not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint saved_searches_user_id_id_key unique (user_id, id),
  constraint saved_searches_name_check check (char_length(pg_catalog.btrim(name)) between 1 and 80),
  constraint saved_searches_filters_check check (
    pg_catalog.jsonb_typeof(filters) = 'object' and char_length(filters::text) <= 4000
  )
);

create index saved_searches_user_idx on public.saved_searches (user_id, created_at desc);

create table public.posting_states (
  user_id uuid not null references auth.users (id) on delete cascade,
  posting_id uuid not null references public.job_postings (id) on delete cascade,
  saved boolean not null default false,
  hidden boolean not null default false,
  feedback text,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (user_id, posting_id),
  constraint posting_states_feedback_check check (
    feedback is null or feedback in ('already_applied', 'not_interested')
  )
);

create index posting_states_user_saved_idx on public.posting_states (user_id, saved);
create index posting_states_user_hidden_idx on public.posting_states (user_id, hidden);

create table public.employer_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  employer_id uuid not null references public.catalog_employers (id) on delete cascade,
  stance text not null,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (user_id, employer_id),
  constraint employer_preferences_stance_check check (stance in ('preferred', 'excluded'))
);

create table public.application_postings (
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid not null,
  posting_id uuid not null references public.job_postings (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (user_id, posting_id),
  constraint application_postings_application_key unique (user_id, application_id),
  constraint application_postings_application_fkey
    foreign key (user_id, application_id)
    references public.applications (user_id, id)
    on delete cascade
);

create table public.job_alert_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  saved_search_id uuid,
  cadence text not null default 'off',
  minimum_match integer not null default 40,
  delivery text not null default 'in_app',
  timezone text not null default 'UTC',
  paused boolean not null default false,
  last_successful_run_at timestamptz,
  last_error text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint job_alert_subscriptions_user_id_id_key unique (user_id, id),
  constraint job_alert_subscriptions_search_fkey
    foreign key (user_id, saved_search_id)
    references public.saved_searches (user_id, id)
    on delete set null (saved_search_id),
  constraint job_alert_subscriptions_cadence_check check (cadence in ('off', 'daily', 'weekly')),
  constraint job_alert_subscriptions_match_check check (minimum_match between 0 and 100),
  constraint job_alert_subscriptions_delivery_check check (delivery in ('in_app', 'email', 'both')),
  constraint job_alert_subscriptions_timezone_check check (char_length(timezone) between 1 and 80),
  constraint job_alert_subscriptions_error_check check (last_error is null or char_length(last_error) <= 300)
);

create index job_alert_subscriptions_user_idx on public.job_alert_subscriptions (user_id, cadence);

create table public.job_alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid not null references public.job_alert_subscriptions (id) on delete cascade,
  posting_id uuid not null references public.job_postings (id) on delete cascade,
  window_key text not null,
  channel text not null,
  status text not null,
  error text,
  read_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  constraint job_alert_deliveries_key unique (subscription_id, posting_id, window_key, channel),
  constraint job_alert_deliveries_window_check check (window_key ~ '^(daily|weekly):[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  constraint job_alert_deliveries_channel_check check (channel in ('in_app', 'email')),
  constraint job_alert_deliveries_status_check check (status in ('recorded', 'failed', 'skipped')),
  constraint job_alert_deliveries_error_check check (error is null or char_length(error) <= 300)
);

create index job_alert_deliveries_user_idx on public.job_alert_deliveries (user_id, created_at desc);

create or replace function public.protect_alert_delivery()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.subscription_id is distinct from old.subscription_id
     or new.posting_id is distinct from old.posting_id
     or new.window_key is distinct from old.window_key
     or new.channel is distinct from old.channel
     or new.status is distinct from old.status
     or new.error is distinct from old.error
     or new.created_at is distinct from old.created_at
  then
    raise exception 'delivery record cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.preserve_alert_subscription_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null then
      raise exception 'not authenticated' using errcode = '42501';
    end if;
    new.user_id := auth.uid();
    return new;
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'user_id cannot be changed' using errcode = '42501';
  end if;
  -- A catalog writer has no user session. It may stamp a run, not reassign the row.
  if auth.uid() is not null and auth.uid() is distinct from old.user_id then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.preserve_alert_subscription_owner() from public, anon;
grant execute on function public.preserve_alert_subscription_owner() to authenticated;

create trigger job_preferences_set_user_id
  before insert or update on public.job_preferences
  for each row execute function public.assign_user_id();
create trigger job_preferences_set_updated_at
  before update on public.job_preferences
  for each row execute function public.set_updated_at();
create trigger saved_searches_set_user_id
  before insert or update on public.saved_searches
  for each row execute function public.assign_user_id();
create trigger saved_searches_set_updated_at
  before update on public.saved_searches
  for each row execute function public.set_updated_at();
create trigger posting_states_set_user_id
  before insert or update on public.posting_states
  for each row execute function public.assign_user_id();
create trigger employer_preferences_set_user_id
  before insert or update on public.employer_preferences
  for each row execute function public.assign_user_id();
create trigger application_postings_set_user_id
  before insert or update on public.application_postings
  for each row execute function public.assign_user_id();
create trigger job_alert_subscriptions_set_user_id
  before insert or update on public.job_alert_subscriptions
  for each row execute function public.preserve_alert_subscription_owner();
create trigger job_alert_subscriptions_set_updated_at
  before update on public.job_alert_subscriptions
  for each row execute function public.set_updated_at();
create trigger job_alert_deliveries_protect
  before update on public.job_alert_deliveries
  for each row execute function public.protect_alert_delivery();

alter table public.catalog_employers enable row level security;
alter table public.job_sources enable row level security;
alter table public.job_postings enable row level security;
alter table public.job_preferences enable row level security;
alter table public.saved_searches enable row level security;
alter table public.posting_states enable row level security;
alter table public.employer_preferences enable row level security;
alter table public.application_postings enable row level security;
alter table public.job_alert_subscriptions enable row level security;
alter table public.job_alert_deliveries enable row level security;

revoke all on table public.catalog_employers from public, anon, authenticated;
revoke all on table public.job_sources from public, anon, authenticated;
revoke all on table public.job_postings from public, anon, authenticated;
revoke all on table public.job_preferences from public, anon, authenticated;
revoke all on table public.saved_searches from public, anon, authenticated;
revoke all on table public.posting_states from public, anon, authenticated;
revoke all on table public.employer_preferences from public, anon, authenticated;
revoke all on table public.application_postings from public, anon, authenticated;
revoke all on table public.job_alert_subscriptions from public, anon, authenticated;
revoke all on table public.job_alert_deliveries from public, anon, authenticated;

grant select on table public.catalog_employers to authenticated;
grant select on table public.job_sources to authenticated;
grant select on table public.job_postings to authenticated;
grant select, insert, update, delete on table public.job_preferences to authenticated;
grant select, insert, update, delete on table public.saved_searches to authenticated;
grant select, insert, update, delete on table public.posting_states to authenticated;
grant select, insert, update, delete on table public.employer_preferences to authenticated;
grant select, insert, update, delete on table public.application_postings to authenticated;
grant select, insert, update, delete on table public.job_alert_subscriptions to authenticated;
grant select, update on table public.job_alert_deliveries to authenticated;

create policy "read employers behind approved postings"
  on public.catalog_employers
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.job_postings posting
      join public.job_sources source on source.id = posting.source_id
      where posting.employer_id = catalog_employers.id
        and source.approval_status = 'approved'
    )
  );

create policy "read approved job sources"
  on public.job_sources
  for select
  to authenticated
  using (approval_status = 'approved');

create policy "read postings from approved sources"
  on public.job_postings
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.job_sources source
      where source.id = job_postings.source_id
        and source.approval_status = 'approved'
    )
  );

create policy "select own job preferences"
  on public.job_preferences for select to authenticated
  using (auth.uid() = user_id);
create policy "insert own job preferences"
  on public.job_preferences for insert to authenticated
  with check (auth.uid() = user_id);
create policy "update own job preferences"
  on public.job_preferences for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "delete own job preferences"
  on public.job_preferences for delete to authenticated
  using (auth.uid() = user_id);

create policy "select own saved searches"
  on public.saved_searches for select to authenticated
  using (auth.uid() = user_id);
create policy "insert own saved searches"
  on public.saved_searches for insert to authenticated
  with check (auth.uid() = user_id);
create policy "update own saved searches"
  on public.saved_searches for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "delete own saved searches"
  on public.saved_searches for delete to authenticated
  using (auth.uid() = user_id);

create policy "select own posting states"
  on public.posting_states for select to authenticated
  using (auth.uid() = user_id);
create policy "insert own posting states"
  on public.posting_states for insert to authenticated
  with check (auth.uid() = user_id);
create policy "update own posting states"
  on public.posting_states for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "delete own posting states"
  on public.posting_states for delete to authenticated
  using (auth.uid() = user_id);

create policy "select own employer preferences"
  on public.employer_preferences for select to authenticated
  using (auth.uid() = user_id);
create policy "insert own employer preferences"
  on public.employer_preferences for insert to authenticated
  with check (auth.uid() = user_id);
create policy "update own employer preferences"
  on public.employer_preferences for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "delete own employer preferences"
  on public.employer_preferences for delete to authenticated
  using (auth.uid() = user_id);

create policy "select own application postings"
  on public.application_postings for select to authenticated
  using (auth.uid() = user_id);
create policy "insert own application postings"
  on public.application_postings for insert to authenticated
  with check (auth.uid() = user_id);
create policy "delete own application postings"
  on public.application_postings for delete to authenticated
  using (auth.uid() = user_id);

create policy "select own alert subscriptions"
  on public.job_alert_subscriptions for select to authenticated
  using (auth.uid() = user_id);
create policy "insert own alert subscriptions"
  on public.job_alert_subscriptions for insert to authenticated
  with check (auth.uid() = user_id);
create policy "update own alert subscriptions"
  on public.job_alert_subscriptions for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "delete own alert subscriptions"
  on public.job_alert_subscriptions for delete to authenticated
  using (auth.uid() = user_id);

create policy "select own alert deliveries"
  on public.job_alert_deliveries for select to authenticated
  using (auth.uid() = user_id);
create policy "update own alert read state"
  on public.job_alert_deliveries for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into public.job_sources (
  provider,
  slug,
  display_name,
  region,
  access_method,
  approved_usage,
  attribution_requirements,
  retention_restrictions,
  allowed_storage_fields,
  refresh_limit_per_day,
  approval_status,
  terms_status,
  live_ingestion_enabled
) values
  (
    'greenhouse',
    'provider:greenhouse',
    'Greenhouse',
    'global',
    'documented_https_json',
    'Inactive template. A company board may be registered only after its public Job Board API use is approved.',
    'Name Greenhouse and link the original board URL. Do not present search-link results as indexed jobs.',
    'Do not store applicant data. Expire listings omitted from a successful full refresh. Do not retain provider HTML.',
    array['title', 'location', 'country', 'urls', 'compensation', 'requisition', 'plain_text'],
    0,
    'draft',
    'unclear',
    false
  ),
  (
    'lever',
    'provider:lever',
    'Lever',
    'global',
    'documented_https_json',
    'Inactive template. A company site may be registered only after Postings API use is approved. EU boards use the eu region.',
    'Name Lever and link the hosted posting. Do not submit applications through this product.',
    'Do not store candidate applications. Expire listings omitted from a successful full refresh.',
    array['title', 'location', 'country', 'urls', 'compensation', 'plain_text', 'workplace'],
    0,
    'draft',
    'unclear',
    false
  ),
  (
    'ashby',
    'provider:ashby',
    'Ashby',
    'global',
    'documented_https_json',
    'Inactive template. A job board name may be registered only after public posting API use is approved.',
    'Name Ashby and link the original job URL. Skip unlisted postings.',
    'Do not store applicant data. Do not retain HTML descriptions.',
    array['title', 'location', 'country', 'urls', 'compensation', 'plain_text', 'workplace'],
    0,
    'draft',
    'unclear',
    false
  );

create or replace function public.assert_job_operation_proof(
  p_operation text,
  p_payload text,
  p_proof text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
  expected text;
begin
  if p_operation not in (
    'apply-catalog',
    'register-source',
    'approve-source',
    'record-source-failure',
    'record-alerts',
    'collect-alerts'
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_payload is null or char_length(p_payload) = 0 or char_length(p_payload) > 2000000 then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_proof is null or p_proof !~ '^[a-f0-9]{64}$' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select gate.secret into secret from public.job_catalog_gate gate where gate.id = 1;
  if secret is null then
    raise exception 'job catalog writer is not configured' using errcode = 'P0001';
  end if;

  expected := encode(
    extensions.hmac(
      convert_to(p_operation || E'\n' || p_payload, 'utf8'),
      convert_to(secret, 'utf8'),
      'sha256'
    ),
    'hex'
  );
  if expected is distinct from lower(p_proof) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_job_operation_proof(text, text, text) from public, anon, authenticated;

create or replace function public.register_job_source(p_payload text, p_proof text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  body jsonb;
  created uuid;
begin
  perform public.assert_job_operation_proof('register-source', p_payload, p_proof);
  body := p_payload::jsonb;
  if coalesce(body->>'provider', '') not in ('greenhouse', 'lever', 'ashby') then
    raise exception 'invalid source' using errcode = '23514';
  end if;
  if coalesce(body->>'slug', '') !~ '^[a-z0-9:_-]{3,80}$' then
    raise exception 'invalid source' using errcode = '23514';
  end if;

  insert into public.job_sources (
    provider,
    slug,
    display_name,
    source_identifier,
    region,
    employer_name,
    employer_domain,
    access_method,
    approved_usage,
    attribution_requirements,
    retention_restrictions,
    allowed_storage_fields,
    refresh_limit_per_day,
    approval_status,
    terms_status,
    live_ingestion_enabled
  ) values (
    body->>'provider',
    body->>'slug',
    left(pg_catalog.btrim(body->>'displayName'), 120),
    nullif(body->>'sourceIdentifier', ''),
    coalesce(nullif(body->>'region', ''), 'global'),
    nullif(pg_catalog.btrim(body->>'employerName'), ''),
    coalesce(nullif(lower(body->>'employerDomain'), ''), ''),
    pg_catalog.btrim(body->>'accessMethod'),
    pg_catalog.btrim(body->>'approvedUsage'),
    pg_catalog.btrim(body->>'attributionRequirements'),
    pg_catalog.btrim(body->>'retentionRestrictions'),
    public.job_json_text_array(body->'allowedStorageFields'),
    0,
    'draft',
    'unclear',
    false
  )
  on conflict (slug) do nothing
  returning id into created;

  if created is null then
    select id into created from public.job_sources where slug = body->>'slug';
    return pg_catalog.jsonb_build_object('ok', true, 'created', false, 'id', created);
  end if;
  return pg_catalog.jsonb_build_object('ok', true, 'created', true, 'id', created);
end;
$$;

create or replace function public.approve_job_source(p_payload text, p_proof text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  body jsonb;
  updated uuid;
  v_live boolean;
begin
  perform public.assert_job_operation_proof('approve-source', p_payload, p_proof);
  body := p_payload::jsonb;
  v_live := coalesce((body->>'liveIngestionEnabled')::boolean, false);
  if v_live and (
    body->>'approvalStatus' is distinct from 'approved'
    or body->>'termsStatus' is distinct from 'permitted'
    or coalesce((body->>'refreshLimitPerDay')::integer, 0) <= 0
  ) then
    raise exception 'live ingestion is not approved' using errcode = '23514';
  end if;

  update public.job_sources
  set
    approval_status = body->>'approvalStatus',
    terms_status = body->>'termsStatus',
    live_ingestion_enabled = v_live,
    refresh_limit_per_day = coalesce((body->>'refreshLimitPerDay')::integer, 0),
    access_method = pg_catalog.btrim(body->>'accessMethod'),
    approved_usage = pg_catalog.btrim(body->>'approvedUsage'),
    attribution_requirements = pg_catalog.btrim(body->>'attributionRequirements'),
    retention_restrictions = pg_catalog.btrim(body->>'retentionRestrictions'),
    allowed_storage_fields = public.job_json_text_array(body->'allowedStorageFields'),
    updated_at = pg_catalog.now()
  where slug = body->>'slug'
  returning id into updated;

  if updated is null then
    raise exception 'source not found' using errcode = 'P0002';
  end if;
  return pg_catalog.jsonb_build_object('ok', true, 'id', updated, 'liveIngestionEnabled', v_live);
end;
$$;

create or replace function public.apply_job_catalog(p_payload text, p_proof text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  body jsonb;
  v_slug text;
  v_source uuid;
  v_limit integer;
  v_key text;
  v_lock text;
  v_owner text;
  v_locked text;
  v_complete boolean;
  v_allow_empty boolean;
  v_postings jsonb;
  v_seen text[];
  v_upserted integer := 0;
  v_expired integer := 0;
  v_recent integer;
begin
  perform public.assert_job_operation_proof('apply-catalog', p_payload, p_proof);
  body := p_payload::jsonb;
  v_slug := body->>'sourceSlug';
  v_key := 'apply-catalog:' || coalesce(body->>'idempotencyKey', '');
  if v_key = 'apply-catalog:' or char_length(v_key) > 160 then
    raise exception 'invalid catalog batch' using errcode = '23514';
  end if;
  select id, refresh_limit_per_day into v_source, v_limit
  from public.job_sources
  where slug = v_slug;
  if v_source is null then
    raise exception 'source not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.job_source_runs where idempotency_key = v_key) then
    return pg_catalog.jsonb_build_object('ok', true, 'reason', 'duplicate');
  end if;

  v_lock := 'catalog:' || v_slug;
  v_owner := v_key;
  insert into public.job_processing_locks as lock_row (name, owner, expires_at)
  values (v_lock, v_owner, pg_catalog.now() + interval '15 minutes')
  on conflict (name) do update
    set owner = excluded.owner,
        expires_at = excluded.expires_at
    where lock_row.expires_at < pg_catalog.now()
       or lock_row.owner = excluded.owner
  returning name into v_locked;
  if v_locked is null then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'lock_held');
  end if;

  if coalesce(v_limit, 0) > 0 then
    select count(*) into v_recent
    from public.job_source_runs
    where source_id = v_source
      and status = 'succeeded'
      and started_at > pg_catalog.now() - interval '24 hours';
    if v_recent >= v_limit then
      insert into public.job_source_runs (source_id, status, error, idempotency_key, finished_at)
      values (v_source, 'failed', 'rate_limited', v_key, pg_catalog.now());
      delete from public.job_processing_locks where name = v_lock and owner = v_owner;
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'rate_limited');
    end if;
  else
    delete from public.job_processing_locks where name = v_lock and owner = v_owner;
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'refresh_limit_unset');
  end if;

  v_postings := coalesce(body->'postings', '[]'::jsonb);
  v_complete := coalesce((body->>'completeSnapshot')::boolean, false);
  v_allow_empty := coalesce((body->>'allowEmpty')::boolean, false);
  if pg_catalog.jsonb_typeof(v_postings) <> 'array'
     or pg_catalog.jsonb_array_length(v_postings) > 500 then
    raise exception 'invalid catalog batch' using errcode = '23514';
  end if;
  if v_complete and pg_catalog.jsonb_array_length(v_postings) = 0 and not v_allow_empty then
    delete from public.job_processing_locks where name = v_lock and owner = v_owner;
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'empty_snapshot_blocked');
  end if;

  insert into public.catalog_employers (canonical_name, normalized_name, website_domain, country_code)
  select
    min(left(pg_catalog.btrim(name), 200)),
    normalized_name,
    website_domain,
    max(case when country ~ '^[A-Za-z]{2}$' then upper(country) else null end)
  from (
    select
      value->>'canonicalName' as name,
      value->>'websiteDomain' as domain,
      value->>'countryCode' as country,
      public.normalize_employer_name(value->>'canonicalName') as normalized_name,
      coalesce(nullif(lower(value->>'websiteDomain'), ''), '') as website_domain
    from pg_catalog.jsonb_array_elements(coalesce(body->'employers', '[]'::jsonb)) as value
    union all
    select
      value->>'employerName',
      value->>'employerDomain',
      value->>'countryCode',
      public.normalize_employer_name(value->>'employerName'),
      coalesce(nullif(lower(value->>'employerDomain'), ''), '')
    from pg_catalog.jsonb_array_elements(v_postings) as value
  ) names
  where char_length(pg_catalog.btrim(coalesce(name, ''))) between 1 and 200
  group by normalized_name, website_domain
  on conflict (normalized_name, website_domain) do update
    set country_code = coalesce(excluded.country_code, public.catalog_employers.country_code),
        updated_at = pg_catalog.now();

  with incoming as (
    select
      left(pg_catalog.btrim(item->>'sourceJobId'), 120) as source_job_id,
      nullif(pg_catalog.btrim(item->>'employerName'), '') as employer_name,
      coalesce(nullif(lower(item->>'employerDomain'), ''), '') as employer_domain,
      left(pg_catalog.btrim(item->>'title'), 200) as title,
      nullif(left(pg_catalog.btrim(item->>'locationText'), 200), '') as location_text,
      case when item->>'countryCode' ~ '^[A-Za-z]{2}$' then upper(item->>'countryCode') else null end as country_code,
      nullif(left(item->>'region', 80), '') as region,
      coalesce(item->>'workArrangement', 'unknown') as work_arrangement,
      coalesce(item->>'employmentType', 'unknown') as employment_type,
      coalesce(item->>'seniority', 'unknown') as seniority,
      nullif(item->>'compensationMin', '')::numeric as compensation_min,
      nullif(item->>'compensationMax', '')::numeric as compensation_max,
      case when item->>'currency' ~ '^[A-Za-z]{3}$' then upper(item->>'currency') else null end as currency,
      coalesce(nullif(item->>'salaryPeriod', ''), 'unknown') as salary_period,
      nullif(item->>'postedAt', '')::timestamptz as posted_at,
      item->>'listingUrl' as listing_url,
      nullif(item->>'applicationUrl', '') as application_url,
      coalesce(nullif(item->>'applicationMethod', ''), 'unknown') as application_method,
      nullif(left(item->>'requisitionId', 80), '') as requisition_id,
      nullif(left(item->>'descriptionText', 8000), '') as description_text,
      public.job_json_text_array(item->'skills') as skills,
      public.job_json_text_array(item->'titleTokens') as title_tokens,
      public.job_json_text_array(item->'skillTokens') as skill_tokens,
      item->>'contentHash' as content_hash,
      case
        when item->>'listingStatus' in ('active', 'unverified') then item->>'listingStatus'
        else 'unverified'
      end as listing_status,
      case
        when pg_catalog.jsonb_typeof(item->'provenance') = 'object' then item->'provenance'
        else '{}'::jsonb
      end as provenance
    from pg_catalog.jsonb_array_elements(v_postings) as item
  ),
  written as (
    insert into public.job_postings (
      source_id, employer_id, source_job_id, title, location_text, country_code, region,
      work_arrangement, employment_type, seniority, compensation_min, compensation_max,
      currency, salary_period, posted_at, last_verified_at, listing_url, application_url,
      application_method, content_hash, listing_status, requisition_id, description_text,
      skills, title_tokens, skill_tokens, provenance
    )
    select
      v_source,
      employer.id,
      incoming.source_job_id,
      incoming.title,
      incoming.location_text,
      incoming.country_code,
      incoming.region,
      incoming.work_arrangement,
      incoming.employment_type,
      incoming.seniority,
      incoming.compensation_min,
      incoming.compensation_max,
      incoming.currency,
      incoming.salary_period,
      incoming.posted_at,
      pg_catalog.now(),
      incoming.listing_url,
      incoming.application_url,
      incoming.application_method,
      incoming.content_hash,
      incoming.listing_status,
      incoming.requisition_id,
      incoming.description_text,
      incoming.skills,
      incoming.title_tokens,
      incoming.skill_tokens,
      incoming.provenance
    from incoming
    left join public.catalog_employers employer
      on employer.normalized_name = public.normalize_employer_name(incoming.employer_name)
     and employer.website_domain = incoming.employer_domain
     and incoming.employer_name is not null
    returning source_job_id
  )
  select
    count(*)::integer,
    coalesce(pg_catalog.array_agg(source_job_id), '{}'::text[])
  into v_upserted, v_seen
  from written;

  if v_complete then
    update public.job_postings
    set listing_status = 'expired',
        updated_at = pg_catalog.now()
    where source_id = v_source
      and listing_status <> 'expired'
      and not (source_job_id = any(coalesce(v_seen, '{}'::text[])));
    get diagnostics v_expired = row_count;
  end if;

  insert into public.job_source_runs (source_id, status, fetched_count, idempotency_key, finished_at)
  values (v_source, 'succeeded', v_upserted, v_key, pg_catalog.now());
  delete from public.job_processing_locks where name = v_lock and owner = v_owner;
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'upserted', v_upserted,
    'expired', v_expired
  );
end;
$$;

create or replace function public.record_job_source_failure(p_payload text, p_proof text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  body jsonb;
  v_source uuid;
  v_key text;
  v_active integer;
begin
  perform public.assert_job_operation_proof('record-source-failure', p_payload, p_proof);
  body := p_payload::jsonb;
  v_key := 'record-source-failure:' || coalesce(body->>'idempotencyKey', '');
  select id into v_source from public.job_sources where slug = body->>'sourceSlug';
  if v_source is null then
    raise exception 'source not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.job_source_runs where idempotency_key = v_key) then
    return pg_catalog.jsonb_build_object('ok', true, 'reason', 'duplicate');
  end if;
  insert into public.job_source_runs (source_id, status, error, idempotency_key, finished_at)
  values (
    v_source,
    'failed',
    left(coalesce(nullif(body->>'error', ''), 'source_request_failed'), 300),
    v_key,
    pg_catalog.now()
  );
  select count(*) into v_active
  from public.job_postings
  where source_id = v_source and listing_status = 'active';
  return pg_catalog.jsonb_build_object('ok', true, 'activeUnchanged', v_active);
end;
$$;

create or replace function public.record_job_alerts(p_payload text, p_proof text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  body jsonb;
  v_row record;
  v_owner uuid;
  v_written integer := 0;
  v_rejected integer := 0;
begin
  perform public.assert_job_operation_proof('record-alerts', p_payload, p_proof);
  body := p_payload::jsonb;
  if pg_catalog.jsonb_typeof(body->'deliveries') = 'array'
     and pg_catalog.jsonb_array_length(body->'deliveries') > 200 then
    raise exception 'too many deliveries' using errcode = '22023';
  end if;

  for v_row in
    select value from pg_catalog.jsonb_array_elements(coalesce(body->'deliveries', '[]'::jsonb)) as value
  loop
    select user_id into v_owner
    from public.job_alert_subscriptions
    where id = (v_row.value->>'subscriptionId')::uuid;
    if v_owner is null or v_owner::text is distinct from v_row.value->>'userId' then
      v_rejected := v_rejected + 1;
      continue;
    end if;
    insert into public.job_alert_deliveries (
      user_id, subscription_id, posting_id, window_key, channel, status, error
    ) values (
      v_owner,
      (v_row.value->>'subscriptionId')::uuid,
      (v_row.value->>'postingId')::uuid,
      v_row.value->>'windowKey',
      v_row.value->>'channel',
      v_row.value->>'status',
      nullif(left(v_row.value->>'error', 300), '')
    )
    on conflict (subscription_id, posting_id, window_key, channel) do update
      set status = excluded.status,
          error = excluded.error
      where public.job_alert_deliveries.status = 'failed';
    v_written := v_written + 1;
  end loop;

  update public.job_alert_subscriptions subscription
  set last_successful_run_at = (item->>'ranAt')::timestamptz,
      last_error = null,
      updated_at = pg_catalog.now()
  from pg_catalog.jsonb_array_elements(coalesce(body->'successes', '[]'::jsonb)) as item
  where subscription.id = (item->>'subscriptionId')::uuid;

  update public.job_alert_subscriptions subscription
  set last_error = left(coalesce(item->>'error', 'alert_failed'), 300),
      updated_at = pg_catalog.now()
  from pg_catalog.jsonb_array_elements(coalesce(body->'failures', '[]'::jsonb)) as item
  where subscription.id = (item->>'subscriptionId')::uuid;

  return pg_catalog.jsonb_build_object('ok', true, 'written', v_written, 'rejected', v_rejected);
end;
$$;

create or replace function public.collect_alert_workspace(p_payload text, p_proof text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz;
  v_total integer;
  v_postings jsonb;
  v_users jsonb;
begin
  perform public.assert_job_operation_proof('collect-alerts', p_payload, p_proof);
  v_now := (p_payload::jsonb->>'now')::timestamptz;
  if v_now is null then
    raise exception 'invalid alert workspace' using errcode = '23514';
  end if;

  select count(*) into v_total
  from public.job_postings posting
  join public.job_sources source on source.id = posting.source_id
  where source.approval_status = 'approved'
    and posting.listing_status in ('active', 'unverified');

  select coalesce(pg_catalog.jsonb_agg(row_to_json(limited)::jsonb), '[]'::jsonb)
  into v_postings
  from (
    select
      posting.id,
      posting.title,
      posting.title_tokens as "titleTokens",
      posting.skill_tokens as "skillTokens",
      posting.seniority,
      posting.employer_id as "employerId",
      posting.country_code as "countryCode",
      posting.work_arrangement as "workArrangement",
      posting.employment_type as "employmentType",
      posting.compensation_min as "compensationMin",
      posting.compensation_max as "compensationMax",
      posting.currency,
      posting.salary_period as "salaryPeriod",
      posting.posted_at as "postedAt",
      posting.last_verified_at as "lastVerifiedAt",
      posting.application_method as "applicationMethod",
      posting.listing_status as "listingStatus",
      posting.location_text as "locationText"
    from public.job_postings posting
    join public.job_sources source on source.id = posting.source_id
    where source.approval_status = 'approved'
      and posting.listing_status in ('active', 'unverified')
    order by coalesce(posting.posted_at, posting.discovered_at) desc, posting.id
    limit 500
  ) limited;

  select coalesce(pg_catalog.jsonb_agg(user_row.payload), '[]'::jsonb)
  into v_users
  from (
    select pg_catalog.jsonb_build_object(
      'userId', subscriber.user_id,
      'skillTokens', coalesce((
        select public.job_text_tokens(pg_catalog.string_agg(skill.name, ' '))
        from public.skill_entries skill
        where skill.user_id = subscriber.user_id
          and skill.verification_state = 'user_verified'
      ), '{}'::text[]),
      'roleTokens', coalesce((
        select public.job_text_tokens(pg_catalog.array_to_string(profile.target_roles, ' '))
        from public.career_profiles profile
        where profile.user_id = subscriber.user_id
      ), '{}'::text[]),
      'experienceTokens', coalesce((
        select public.job_text_tokens(pg_catalog.string_agg(job.title, ' '))
        from public.employment_entries job
        where job.user_id = subscriber.user_id
          and job.verification_state = 'user_verified'
      ), '{}'::text[]),
      'preferredEmployerIds', coalesce((
        select pg_catalog.array_agg(pref.employer_id)
        from public.employer_preferences pref
        where pref.user_id = subscriber.user_id and pref.stance = 'preferred'
      ), '{}'::uuid[]),
      'excludedEmployerIds', coalesce((
        select pg_catalog.array_agg(pref.employer_id)
        from public.employer_preferences pref
        where pref.user_id = subscriber.user_id and pref.stance = 'excluded'
      ), '{}'::uuid[]),
      'hiddenPostingIds', coalesce((
        select pg_catalog.array_agg(state.posting_id)
        from public.posting_states state
        where state.user_id = subscriber.user_id and state.hidden
      ), '{}'::uuid[]),
      'preferences', (
        select pg_catalog.jsonb_build_object(
          'keywords', pref.keywords,
          'countries', pref.countries,
          'locations', pref.locations,
          'workArrangements', pref.work_arrangements,
          'seniorities', pref.seniorities,
          'employmentTypes', pref.employment_types,
          'salaryMin', pref.salary_min,
          'salaryCurrency', pref.salary_currency,
          'includeUnknownCompensation', pref.include_unknown_compensation,
          'postedWithinDays', pref.posted_within_days,
          'excludeEasyApply', pref.exclude_easy_apply
        )
        from public.job_preferences pref
        where pref.user_id = subscriber.user_id
      ),
      'subscriptions', (
        select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id', sub.id,
          'cadence', sub.cadence,
          'minimumMatch', sub.minimum_match,
          'delivery', sub.delivery,
          'timezone', sub.timezone,
          'lastSuccessfulRunAt', sub.last_successful_run_at,
          'savedSearch', case
            when search.id is null then null
            else pg_catalog.jsonb_build_object('id', search.id, 'filters', search.filters)
          end
        )), '[]'::jsonb)
        from public.job_alert_subscriptions sub
        left join public.saved_searches search on search.id = sub.saved_search_id
        where sub.user_id = subscriber.user_id
          and sub.paused = false
          and sub.cadence in ('daily', 'weekly')
      )
    ) as payload
    from (
      select distinct user_id
      from public.job_alert_subscriptions
      where paused = false and cadence in ('daily', 'weekly')
    ) subscriber
  ) user_row;

  return pg_catalog.jsonb_build_object(
    'now', v_now,
    'truncated', v_total > 500,
    'postings', v_postings,
    'users', v_users
  );
end;
$$;

create or replace function public.search_recommended_jobs(p_query jsonb)
returns table (
  id uuid,
  title text,
  employer_id uuid,
  employer_name text,
  location_text text,
  country_code text,
  region text,
  work_arrangement text,
  employment_type text,
  seniority text,
  compensation_min numeric,
  compensation_max numeric,
  currency text,
  salary_period text,
  posted_at timestamptz,
  discovered_at timestamptz,
  last_verified_at timestamptz,
  listing_url text,
  application_url text,
  application_method text,
  listing_status text,
  requisition_id text,
  skills text[],
  source_provider text,
  source_name text,
  match_score integer,
  saved boolean,
  hidden boolean,
  feedback text,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_keywords text := left(replace(replace(pg_catalog.btrim(coalesce(p_query->>'keywords', '')), '%', ''), '_', ''), 120);
  v_countries text[];
  v_locations text[];
  v_arrangements text[];
  v_seniorities text[];
  v_employment text[];
  v_salary numeric;
  v_currency text;
  v_unknown boolean;
  v_posted integer;
  v_exclude_easy boolean;
  v_preferred_only boolean;
  v_saved_only boolean;
  v_include_hidden boolean;
  v_sort text;
  v_limit integer;
  v_offset integer;
  v_now timestamptz := pg_catalog.now();
  v_skills text[];
  v_roles text[];
  v_experience text[];
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_query is null or pg_catalog.jsonb_typeof(p_query) <> 'object' then
    raise exception 'invalid job search' using errcode = '23514';
  end if;

  select coalesce(pg_catalog.array_agg(upper(value)), '{}'::text[])
  into v_countries
  from pg_catalog.jsonb_array_elements_text(
    case when pg_catalog.jsonb_typeof(p_query->'countries') = 'array' then p_query->'countries' else '[]'::jsonb end
  ) as value
  where value ~ '^[A-Za-z]{2}$';

  v_locations := public.job_json_text_array(p_query->'locations');
  v_arrangements := public.job_json_text_array(p_query->'workArrangements');
  v_seniorities := public.job_json_text_array(p_query->'seniorities');
  v_employment := public.job_json_text_array(p_query->'employmentTypes');
  v_salary := nullif(p_query->>'salaryMin', '')::numeric;
  v_currency := case
    when p_query->>'salaryCurrency' ~ '^[A-Za-z]{3}$' then upper(p_query->>'salaryCurrency')
    else null
  end;
  v_unknown := coalesce((p_query->>'includeUnknownCompensation')::boolean, true);
  v_posted := nullif(p_query->>'postedWithinDays', '')::integer;
  v_exclude_easy := coalesce((p_query->>'excludeEasyApply')::boolean, false);
  v_preferred_only := coalesce((p_query->>'preferredOnly')::boolean, false);
  v_saved_only := coalesce((p_query->>'savedOnly')::boolean, false);
  v_include_hidden := coalesce((p_query->>'includeHidden')::boolean, false);
  v_sort := case
    when p_query->>'sort' in ('relevance', 'recency', 'company') then p_query->>'sort'
    else 'relevance'
  end;
  v_limit := least(greatest(coalesce((p_query->>'limit')::integer, 20), 1), 50);
  v_offset := greatest(coalesce((p_query->>'offset')::integer, 0), 0);

  select coalesce(public.job_text_tokens(pg_catalog.string_agg(skill.name, ' ')), '{}'::text[])
  into v_skills
  from public.skill_entries skill
  where skill.user_id = v_uid and skill.verification_state = 'user_verified';

  select coalesce(public.job_text_tokens(pg_catalog.array_to_string(profile.target_roles, ' ')), '{}'::text[])
  into v_roles
  from public.career_profiles profile
  where profile.user_id = v_uid;

  select coalesce(public.job_text_tokens(pg_catalog.string_agg(job.title, ' ')), '{}'::text[])
  into v_experience
  from public.employment_entries job
  where job.user_id = v_uid and job.verification_state = 'user_verified';

  return query
  with scored as (
    select
      posting.id,
      posting.title,
      posting.employer_id,
      employer.canonical_name as employer_name,
      posting.location_text,
      posting.country_code,
      posting.region,
      posting.work_arrangement,
      posting.employment_type,
      posting.seniority,
      posting.compensation_min,
      posting.compensation_max,
      posting.currency,
      posting.salary_period,
      posting.posted_at,
      posting.discovered_at,
      posting.last_verified_at,
      posting.listing_url,
      posting.application_url,
      posting.application_method,
      posting.listing_status,
      posting.requisition_id,
      posting.skills,
      source.provider as source_provider,
      source.display_name as source_name,
      public.job_match_score(
        v_skills,
        posting.skill_tokens,
        v_roles,
        posting.title_tokens,
        v_experience,
        v_seniorities,
        posting.seniority,
        exists (
          select 1 from public.employer_preferences pref
          where pref.user_id = v_uid
            and pref.employer_id = posting.employer_id
            and pref.stance = 'preferred'
        ),
        coalesce(posting.last_verified_at, posting.posted_at),
        v_now
      ) as match_score,
      coalesce(state.saved, false) as saved,
      coalesce(state.hidden, false) as hidden,
      state.feedback,
      count(*) over () as total_count
    from public.job_postings posting
    join public.job_sources source on source.id = posting.source_id
    left join public.catalog_employers employer on employer.id = posting.employer_id
    left join public.posting_states state
      on state.posting_id = posting.id and state.user_id = v_uid
    where source.approval_status = 'approved'
      and (
        posting.listing_status in ('active', 'unverified')
        or (v_saved_only and posting.listing_status = 'expired' and coalesce(state.saved, false))
      )
      and (cardinality(v_countries) = 0 or posting.country_code = any(v_countries))
      and (cardinality(v_arrangements) = 0 or posting.work_arrangement = any(v_arrangements))
      and (cardinality(v_seniorities) = 0 or posting.seniority = any(v_seniorities))
      and (cardinality(v_employment) = 0 or posting.employment_type = any(v_employment))
      and (
        cardinality(v_locations) = 0
        or exists (
          select 1
          from pg_catalog.unnest(v_locations) as loc
          where posting.location_text ilike '%' || replace(replace(loc, '%', ''), '_', '') || '%'
        )
      )
      and (
        v_keywords = ''
        or posting.title ilike '%' || v_keywords || '%'
        or coalesce(employer.canonical_name, '') ilike '%' || v_keywords || '%'
        or coalesce(posting.location_text, '') ilike '%' || v_keywords || '%'
        or exists (
          select 1 from pg_catalog.unnest(posting.skills) as skill
          where skill ilike '%' || v_keywords || '%'
        )
      )
      and (not v_exclude_easy or posting.application_method is distinct from 'easy_apply')
      and (
        v_posted is null
        or (posting.posted_at is not null and posting.posted_at >= v_now - make_interval(days => v_posted))
      )
      and not exists (
        select 1 from public.employer_preferences pref
        where pref.user_id = v_uid
          and pref.employer_id = posting.employer_id
          and pref.stance = 'excluded'
      )
      and (not v_preferred_only or exists (
        select 1 from public.employer_preferences pref
        where pref.user_id = v_uid
          and pref.employer_id = posting.employer_id
          and pref.stance = 'preferred'
      ))
      and (v_include_hidden or not coalesce(state.hidden, false))
      and (not v_saved_only or coalesce(state.saved, false))
      and (
        v_salary is null
        or (
          case
            when posting.salary_period = 'year'
              and posting.currency is not null
              and v_currency is not null
              and posting.currency = v_currency
              and posting.compensation_max is not null
              and posting.compensation_max < v_salary
            then 'fail'
            when posting.salary_period = 'year'
              and posting.currency is not null
              and v_currency is not null
              and posting.currency = v_currency
              and posting.compensation_min is not null
              and posting.compensation_min >= v_salary
              and (posting.compensation_max is null or posting.compensation_max >= v_salary)
            then 'pass'
            else 'unknown'
          end = 'pass'
          or (
            case
              when posting.salary_period = 'year'
                and posting.currency is not null
                and v_currency is not null
                and posting.currency = v_currency
                and posting.compensation_max is not null
                and posting.compensation_max < v_salary
              then 'fail'
              when posting.salary_period = 'year'
                and posting.currency is not null
                and v_currency is not null
                and posting.currency = v_currency
                and posting.compensation_min is not null
                and posting.compensation_min >= v_salary
                and (posting.compensation_max is null or posting.compensation_max >= v_salary)
              then 'pass'
              else 'unknown'
            end = 'unknown'
            and v_unknown
          )
        )
      )
  )
  select
    scored.id,
    scored.title,
    scored.employer_id,
    scored.employer_name,
    scored.location_text,
    scored.country_code,
    scored.region,
    scored.work_arrangement,
    scored.employment_type,
    scored.seniority,
    scored.compensation_min,
    scored.compensation_max,
    scored.currency,
    scored.salary_period,
    scored.posted_at,
    scored.discovered_at,
    scored.last_verified_at,
    scored.listing_url,
    scored.application_url,
    scored.application_method,
    scored.listing_status,
    scored.requisition_id,
    scored.skills,
    scored.source_provider,
    scored.source_name,
    scored.match_score,
    scored.saved,
    scored.hidden,
    scored.feedback,
    scored.total_count
  from scored
  order by
    case when v_sort = 'company' then lower(coalesce(scored.employer_name, '~~~~')) end asc,
    case when v_sort = 'company' then lower(scored.title) end asc,
    case when v_sort = 'recency' then coalesce(scored.posted_at, scored.discovered_at) end desc,
    case when v_sort = 'relevance' then scored.match_score end desc,
    scored.id asc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.normalize_employer_name(text) from public, anon, authenticated;
revoke all on function public.job_json_text_array(jsonb) from public, anon, authenticated;
revoke all on function public.job_text_tokens(text) from public, anon, authenticated;
revoke all on function public.job_token_overlap(text[], text[]) from public, anon, authenticated;
revoke all on function public.job_match_score(text[], text[], text[], text[], text[], text[], text, boolean, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.register_job_source(text, text) from public, anon, authenticated;
revoke all on function public.approve_job_source(text, text) from public, anon, authenticated;
revoke all on function public.apply_job_catalog(text, text) from public, anon, authenticated;
revoke all on function public.record_job_source_failure(text, text) from public, anon, authenticated;
revoke all on function public.record_job_alerts(text, text) from public, anon, authenticated;
revoke all on function public.collect_alert_workspace(text, text) from public, anon, authenticated;
revoke all on function public.search_recommended_jobs(jsonb) from public, anon, authenticated;
revoke all on function public.protect_alert_delivery() from public, anon, authenticated;

grant execute on function public.job_text_tokens(text) to authenticated;
grant execute on function public.job_json_text_array(jsonb) to authenticated;
grant execute on function public.job_token_overlap(text[], text[]) to authenticated;
grant execute on function public.job_match_score(text[], text[], text[], text[], text[], text[], text, boolean, timestamptz, timestamptz) to authenticated;
grant execute on function public.search_recommended_jobs(jsonb) to authenticated;
grant execute on function public.protect_alert_delivery() to authenticated;
grant execute on function public.register_job_source(text, text) to anon, authenticated;
grant execute on function public.approve_job_source(text, text) to anon, authenticated;
grant execute on function public.apply_job_catalog(text, text) to anon, authenticated;
grant execute on function public.record_job_source_failure(text, text) to anon, authenticated;
grant execute on function public.record_job_alerts(text, text) to anon, authenticated;
grant execute on function public.collect_alert_workspace(text, text) to anon, authenticated;
