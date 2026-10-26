-- Job fit analyses. Additive only: new table, nullable provenance columns,
-- and owner policies. Existing rows are not updated or deleted.
-- Apply with `supabase migration up --local` or `supabase db push` on a
-- database you mean to change. Do not reset the hosted database.

create or replace function public.guard_job_analysis()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- A referenced posting, application, or resume source was deleted and the
  -- foreign key is clearing its link. This also runs for catalog deletes made
  -- without a user session. Allow it only when nothing else in the row changes.
  if tg_op = 'UPDATE'
    and (new.posting_id is null or new.posting_id is not distinct from old.posting_id)
    and (new.application_id is null or new.application_id is not distinct from old.application_id)
    and (new.resume_source_id is null or new.resume_source_id is not distinct from old.resume_source_id)
    and (pg_catalog.to_jsonb(new) - array['posting_id', 'application_id', 'resume_source_id', 'updated_at'])
      = (pg_catalog.to_jsonb(old) - array['posting_id', 'application_id', 'resume_source_id', 'updated_at'])
    and (new.posting_id, new.application_id, new.resume_source_id)
      is distinct from (old.posting_id, old.application_id, old.resume_source_id)
  then
    return new;
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

  if tg_op = 'INSERT' then
    if new.source = 'posting' and new.posting_id is null then
      raise exception 'posting required' using errcode = '23514';
    end if;
    if new.source = 'application' and new.application_id is null then
      raise exception 'application required' using errcode = '23514';
    end if;
    if new.source = 'pasted' and (new.posting_id is not null or new.application_id is not null) then
      raise exception 'pasted analysis has no catalog link' using errcode = '23514';
    end if;
  end if;

  if new.application_id is not null
    and (tg_op = 'INSERT' or new.application_id is distinct from old.application_id)
    and not exists (
    select 1
    from public.applications
    where id = new.application_id
      and user_id = auth.uid()
  ) then
    raise exception 'application not owned' using errcode = '42501';
  end if;

  if new.posting_id is not null
    and (tg_op = 'INSERT' or new.posting_id is distinct from old.posting_id)
    and not exists (
    select 1
    from public.job_postings
    where id = new.posting_id
  ) then
    raise exception 'posting not visible' using errcode = '42501';
  end if;

  if new.resume_source_id is not null
    and (tg_op = 'INSERT' or new.resume_source_id is distinct from old.resume_source_id)
    and not exists (
    select 1
    from public.career_sources
    where id = new.resume_source_id
      and user_id = auth.uid()
  ) then
    raise exception 'resume source not owned' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_job_analysis() from public, anon;
grant execute on function public.guard_job_analysis() to authenticated;

create table public.job_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  posting_id uuid,
  application_id uuid,
  resume_source_id uuid,
  source text not null,
  jd_title text,
  jd_company text,
  jd_text text not null,
  jd_hash text not null,
  profile_fingerprint text not null,
  prompt_version text not null,
  schema_version text not null,
  provider text,
  model text,
  execution_mode text,
  status text not null default 'pending',
  error_code text,
  score smallint,
  coverage_confidence numeric(5, 4),
  score_breakdown jsonb not null default '{}'::jsonb,
  requirements jsonb not null default '[]'::jsonb,
  matches jsonb not null default '[]'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  dropped_requirement_count integer not null default 0,
  gap_claims jsonb not null default '[]'::jsonb,
  readability jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint job_analyses_posting_fkey
    foreign key (posting_id) references public.job_postings (id) on delete set null,
  constraint job_analyses_application_fkey
    foreign key (user_id, application_id) references public.applications (user_id, id)
    on delete set null (application_id),
  constraint job_analyses_resume_source_fkey
    foreign key (user_id, resume_source_id) references public.career_sources (user_id, id)
    on delete set null (resume_source_id),
  constraint job_analyses_source_check check (source in ('posting', 'pasted', 'application')),
  constraint job_analyses_status_check check (status in ('pending', 'complete', 'failed')),
  constraint job_analyses_mode_check check (
    execution_mode is null or execution_mode in ('managed', 'byok')
  ),
  constraint job_analyses_provider_check check (
    provider is null or provider in ('openai', 'anthropic', 'google')
  ),
  constraint job_analyses_hash_check check (
    jd_hash ~ '^[a-f0-9]{64}$' and profile_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  constraint job_analyses_version_check check (
    char_length(prompt_version) between 1 and 80
    and char_length(schema_version) between 1 and 80
  ),
  constraint job_analyses_title_check check (
    (jd_title is null or char_length(pg_catalog.btrim(jd_title)) between 1 and 200)
    and (jd_company is null or char_length(pg_catalog.btrim(jd_company)) between 1 and 200)
  ),
  constraint job_analyses_jd_length_check check (
    char_length(jd_text) between 1 and 30000
    and (status <> 'complete' or char_length(jd_text) between 200 and 30000)
  ),
  constraint job_analyses_model_check check (
    model is null or char_length(model) between 1 and 80
  ),
  constraint job_analyses_error_check check (
    (status = 'failed' and error_code is not null and char_length(error_code) between 1 and 80)
    or (status in ('pending', 'complete') and error_code is null)
  ),
  constraint job_analyses_complete_check check (
    status <> 'complete'
    or (
      provider is not null
      and execution_mode is not null
      and model is not null
      and (score is null or score between 0 and 100)
    )
  ),
  constraint job_analyses_score_check check (score is null or score between 0 and 100),
  constraint job_analyses_coverage_check check (
    coverage_confidence is null or (coverage_confidence >= 0 and coverage_confidence <= 1)
  ),
  constraint job_analyses_dropped_check check (
    dropped_requirement_count between 0 and 200
  ),
  constraint job_analyses_breakdown_check check (
    pg_catalog.jsonb_typeof(score_breakdown) = 'object'
    and char_length(score_breakdown::text) <= 4000
  ),
  constraint job_analyses_requirements_check check (
    pg_catalog.jsonb_typeof(requirements) = 'array'
    and pg_catalog.jsonb_array_length(requirements) <= 40
    and char_length(requirements::text) <= 200000
  ),
  constraint job_analyses_matches_check check (
    pg_catalog.jsonb_typeof(matches) = 'array'
    and pg_catalog.jsonb_array_length(matches) <= 40
    and char_length(matches::text) <= 200000
  ),
  constraint job_analyses_blockers_check check (
    pg_catalog.jsonb_typeof(blockers) = 'array'
    and pg_catalog.jsonb_array_length(blockers) <= 40
  ),
  constraint job_analyses_claims_check check (
    pg_catalog.jsonb_typeof(gap_claims) = 'array'
    and pg_catalog.jsonb_array_length(gap_claims) <= 40
  ),
  constraint job_analyses_readability_check check (
    readability is null or (
      pg_catalog.jsonb_typeof(readability) = 'object'
      and char_length(readability::text) <= 20000
    )
  )
);

create unique index job_analyses_cache_idx
  on public.job_analyses (user_id, jd_hash, profile_fingerprint, prompt_version)
  where status = 'complete';

create index job_analyses_user_created_idx
  on public.job_analyses (user_id, created_at desc);

create trigger job_analyses_10_set_user_id
  before insert on public.job_analyses
  for each row execute function public.assign_user_id();

create trigger job_analyses_20_guard
  before insert or update on public.job_analyses
  for each row execute function public.guard_job_analysis();

create trigger job_analyses_30_set_updated_at
  before update on public.job_analyses
  for each row execute function public.set_updated_at();

alter table public.job_analyses enable row level security;

revoke all on table public.job_analyses from public, anon, authenticated;
grant select, insert, update, delete on table public.job_analyses to authenticated;

create policy "select own job analyses"
  on public.job_analyses
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "insert own job analyses"
  on public.job_analyses
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "update own job analyses"
  on public.job_analyses
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own job analyses"
  on public.job_analyses
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- A suggested fact may point back at the analysis it came from. The pointer
-- must name one of the caller's own analyses when it is written.
create or replace function public.guard_fact_provenance()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.provenance is null
    or (tg_op = 'UPDATE' and new.provenance is not distinct from old.provenance) then
    return new;
  end if;
  if auth.uid() is null or not exists (
    select 1
    from public.job_analyses
    where id = (new.provenance->>'analysisId')::uuid
      and user_id = auth.uid()
  ) then
    raise exception 'analysis not owned' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_fact_provenance() from public, anon;
grant execute on function public.guard_fact_provenance() to authenticated;

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
    execute format('alter table public.%I add column provenance jsonb', tbl);
    execute format(
      'alter table public.%I add constraint %I check (
         provenance is null
         or (
           pg_catalog.jsonb_typeof(provenance) = ''object''
           and char_length(provenance::text) <= 2000
           and (provenance->>''analysisId'') ~ ''^[0-9a-fA-F-]{36}$''
         )
       )',
      tbl,
      tbl || '_provenance_check'
    );
    execute format(
      'create trigger %I before insert or update of provenance on public.%I
         for each row execute function public.guard_fact_provenance()',
      tbl || '_provenance_guard',
      tbl
    );
  end loop;
end $$;
