-- AI Resume Studio (M4). Additive only: two new owner-only tables, one guard
-- function, and a private Storage bucket with owner-path policies. Existing
-- tables, rows, grants, and policies are not changed.
--
-- Deleting an application or a job analysis clears the link on a resume
-- version. Deleting a resume clears resume_id and keeps the version's own
-- content, because a version linked to an application is the record of what
-- was sent. The guard allows those foreign-key clears with no user session.

create or replace function public.guard_resume_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and (new.resume_id is null or new.resume_id is not distinct from old.resume_id)
    and (new.analysis_id is null or new.analysis_id is not distinct from old.analysis_id)
    and (new.application_id is null or new.application_id is not distinct from old.application_id)
    and (pg_catalog.to_jsonb(new) - array['resume_id', 'analysis_id', 'application_id', 'updated_at'])
      = (pg_catalog.to_jsonb(old) - array['resume_id', 'analysis_id', 'application_id', 'updated_at'])
    and (new.resume_id, new.analysis_id, new.application_id)
      is distinct from (old.resume_id, old.analysis_id, old.application_id)
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

  if new.analysis_id is not null
    and (tg_op = 'INSERT' or new.analysis_id is distinct from old.analysis_id)
    and not exists (
      select 1 from public.job_analyses
      where id = new.analysis_id and user_id = auth.uid()
    ) then
    raise exception 'analysis not owned' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_resume_version() from public, anon;
grant execute on function public.guard_resume_version() to authenticated;

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  storage_path text not null,
  mime text not null,
  size_bytes integer not null,
  sha256 text not null,
  extracted_text text not null,
  parse_status text not null default 'unparsed',
  parsed jsonb,
  parse_provider text,
  parse_model text,
  parse_execution_mode text,
  parse_prompt_version text,
  parse_schema_version text,
  parse_dropped jsonb not null default '{}'::jsonb,
  parse_error text,
  parsed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint resumes_user_id_id_key unique (user_id, id),
  constraint resumes_user_sha_key unique (user_id, sha256),
  constraint resumes_storage_path_key unique (storage_path),
  constraint resumes_label_check check (char_length(pg_catalog.btrim(label)) between 1 and 120),
  constraint resumes_path_check check (
    storage_path ~ ('^' || user_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|docx)$')
  ),
  constraint resumes_mime_check check (
    mime in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  ),
  constraint resumes_size_check check (size_bytes between 1 and 5242880),
  constraint resumes_sha_check check (sha256 ~ '^[a-f0-9]{64}$'),
  constraint resumes_text_check check (char_length(extracted_text) between 1 and 80000),
  constraint resumes_parse_status_check check (parse_status in ('unparsed', 'parsed', 'failed')),
  constraint resumes_parsed_check check (
    (parse_status = 'parsed' and parsed is not null
      and pg_catalog.jsonb_typeof(parsed) = 'object'
      and char_length(parsed::text) <= 200000
      and parse_provider in ('openai', 'anthropic', 'google')
      and parse_execution_mode in ('managed', 'byok')
      and char_length(parse_model) between 1 and 80
      and char_length(parse_prompt_version) between 1 and 80
      and char_length(parse_schema_version) between 1 and 80)
    or (parse_status <> 'parsed' and parsed is null)
  ),
  constraint resumes_dropped_check check (
    pg_catalog.jsonb_typeof(parse_dropped) = 'object' and char_length(parse_dropped::text) <= 2000
  ),
  constraint resumes_error_check check (
    (parse_status = 'failed' and char_length(parse_error) between 1 and 80)
    or (parse_status <> 'failed' and parse_error is null)
  )
);

create index resumes_user_created_idx on public.resumes (user_id, created_at desc);

create trigger resumes_10_set_user_id
  before insert on public.resumes
  for each row execute function public.assign_user_id();
create trigger resumes_30_set_updated_at
  before update on public.resumes
  for each row execute function public.set_updated_at();

create table public.resume_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  resume_id uuid,
  analysis_id uuid references public.job_analyses (id) on delete set null,
  application_id uuid,
  label text not null,
  base_content jsonb not null,
  edits jsonb not null default '[]'::jsonb,
  final_content jsonb not null,
  dropped jsonb not null default '{}'::jsonb,
  readability_before jsonb,
  readability_after jsonb,
  prompt_version text not null,
  schema_version text not null,
  provider text not null,
  model text not null,
  execution_mode text not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint resume_versions_resume_fkey
    foreign key (user_id, resume_id) references public.resumes (user_id, id)
    on delete set null (resume_id),
  constraint resume_versions_application_fkey
    foreign key (user_id, application_id) references public.applications (user_id, id)
    on delete set null (application_id),
  constraint resume_versions_label_check check (char_length(pg_catalog.btrim(label)) between 1 and 160),
  constraint resume_versions_content_check check (
    pg_catalog.jsonb_typeof(base_content) = 'object'
    and pg_catalog.jsonb_typeof(final_content) = 'object'
    and char_length(base_content::text) <= 200000
    and char_length(final_content::text) <= 200000
  ),
  constraint resume_versions_edits_check check (
    pg_catalog.jsonb_typeof(edits) = 'array'
    and pg_catalog.jsonb_array_length(edits) <= 40
    and char_length(edits::text) <= 100000
  ),
  constraint resume_versions_dropped_check check (
    pg_catalog.jsonb_typeof(dropped) = 'object' and char_length(dropped::text) <= 2000
  ),
  constraint resume_versions_readability_check check (
    (readability_before is null or (pg_catalog.jsonb_typeof(readability_before) = 'object' and char_length(readability_before::text) <= 20000))
    and (readability_after is null or (pg_catalog.jsonb_typeof(readability_after) = 'object' and char_length(readability_after::text) <= 20000))
  ),
  constraint resume_versions_meta_check check (
    provider in ('openai', 'anthropic', 'google')
    and execution_mode in ('managed', 'byok')
    and char_length(model) between 1 and 80
    and char_length(prompt_version) between 1 and 80
    and char_length(schema_version) between 1 and 80
  )
);

create index resume_versions_user_created_idx on public.resume_versions (user_id, created_at desc);
create index resume_versions_application_idx on public.resume_versions (user_id, application_id)
  where application_id is not null;
create index resume_versions_resume_idx on public.resume_versions (user_id, resume_id)
  where resume_id is not null;
create index resume_versions_analysis_idx on public.resume_versions (analysis_id)
  where analysis_id is not null;

create trigger resume_versions_10_set_user_id
  before insert on public.resume_versions
  for each row execute function public.assign_user_id();
create trigger resume_versions_20_guard
  before insert or update on public.resume_versions
  for each row execute function public.guard_resume_version();
create trigger resume_versions_30_set_updated_at
  before update on public.resume_versions
  for each row execute function public.set_updated_at();

alter table public.resumes enable row level security;
alter table public.resume_versions enable row level security;
revoke all on table public.resumes from public, anon, authenticated;
revoke all on table public.resume_versions from public, anon, authenticated;
grant select, insert, update, delete on table public.resumes to authenticated;
grant select, insert, update, delete on table public.resume_versions to authenticated;

create policy "select own resumes" on public.resumes
  for select to authenticated using (auth.uid() = user_id);
create policy "insert own resumes" on public.resumes
  for insert to authenticated with check (auth.uid() = user_id);
create policy "update own resumes" on public.resumes
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own resumes" on public.resumes
  for delete to authenticated using (auth.uid() = user_id);

create policy "select own resume versions" on public.resume_versions
  for select to authenticated using (auth.uid() = user_id);
create policy "insert own resume versions" on public.resume_versions
  for insert to authenticated with check (auth.uid() = user_id);
create policy "update own resume versions" on public.resume_versions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own resume versions" on public.resume_versions
  for delete to authenticated using (auth.uid() = user_id);

-- Private bucket for original uploads. Supabase provides the storage schema;
-- databases without it (unit test databases) skip this block.
do $storage$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'resumes',
    'resumes',
    false,
    5242880,
    array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  )
  -- A pre-existing bucket with this id is brought to the same private settings.
  on conflict (id) do update set
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists "insert own resume files" on storage.objects;
  drop policy if exists "read own resume files" on storage.objects;
  drop policy if exists "delete own resume files" on storage.objects;

  -- Object keys are exactly <auth.uid()>/<uuid>.pdf or .docx. No update policy:
  -- an original upload is never overwritten.
  execute $policy$
    create policy "insert own resume files" on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'resumes'
        and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|docx)$')
      )
  $policy$;
  execute $policy$
    create policy "read own resume files" on storage.objects
      for select to authenticated
      using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $policy$;
  execute $policy$
    create policy "delete own resume files" on storage.objects
      for delete to authenticated
      using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $policy$;
end;
$storage$;
