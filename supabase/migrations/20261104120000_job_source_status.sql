-- M6c launch hardening. Two changes, no tables, columns, or data:
-- 1. job_source_status: read-only status of catalog source runs for the operator CLI (`jobs status`).
-- 2. The resumes bucket insert policy also caps each user at 30 stored files, counted by
--    public.resume_file_count() (see the end of this file).
-- Same HMAC gate as the other catalog functions (job_catalog_gate secret + fresh `now`), so a
-- session-less publishable-key client can call it but only the operator who holds
-- JOB_CATALOG_WRITE_SECRET gets an answer. It returns source slugs and run metadata only:
-- no user, preference, alert, or posting content.

create or replace function public.job_source_status(p_payload text, p_proof text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_expected text;
  v_limit integer;
  v_sources jsonb;
begin
  if p_payload is null or char_length(p_payload) = 0 or char_length(p_payload) > 1000 then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_proof is null or p_proof !~ '^[a-f0-9]{64}$' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select gate.secret into v_secret from public.job_catalog_gate gate where gate.id = 1;
  if v_secret is null then
    raise exception 'job catalog writer is not configured' using errcode = 'P0001';
  end if;
  v_expected := encode(
    extensions.hmac(
      convert_to('source-status' || E'\n' || p_payload, 'utf8'),
      convert_to(v_secret, 'utf8'),
      'sha256'
    ),
    'hex'
  );
  if v_expected is distinct from lower(p_proof) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.job_request_is_fresh(p_payload) then
    raise exception 'stale request' using errcode = '42501';
  end if;

  begin
    v_limit := coalesce((p_payload::jsonb->>'runs')::integer, 5);
  exception when others then
    v_limit := 5;
  end;
  v_limit := greatest(1, least(v_limit, 20));

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'slug', source.slug,
    'approvalStatus', source.approval_status,
    'liveIngestionEnabled', source.live_ingestion_enabled,
    'refreshLimitPerDay', source.refresh_limit_per_day,
    'runs', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'startedAt', recent.started_at,
        'finishedAt', recent.finished_at,
        'status', recent.status,
        'fetchedCount', recent.fetched_count,
        'error', left(recent.error, 80)
      ) order by recent.started_at desc)
      from (
        select run.started_at, run.finished_at, run.status, run.fetched_count, run.error
        from public.job_source_runs run
        where run.source_id = source.id
        order by run.started_at desc
        limit v_limit
      ) recent
    ), '[]'::jsonb)
  ) order by source.slug), '[]'::jsonb)
  into v_sources
  from public.job_sources source;

  return pg_catalog.jsonb_build_object('ok', true, 'sources', v_sources);
end;
$$;

revoke all on function public.job_source_status(text, text) from public, anon, authenticated;
-- The CLI calls with the publishable key and no session (role anon), like the other catalog
-- functions; the HMAC proof is the gate.
grant execute on function public.job_source_status(text, text) to anon, authenticated;

-- Resume uploads go straight from the browser to Storage, so the insert policy is the only
-- server-side check on how much one account can store. It now also refuses a new object once the
-- user's folder holds 30 files (150 MB at the 5 MB limit). Read and delete are unchanged, and
-- deleting a resume or an abandoned upload frees a slot. Same skip as the original block when the
-- storage schema is absent (unit test databases).
do $storage$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  -- A policy on storage.objects cannot read storage.objects itself (Postgres reports infinite
  -- recursion), so the count runs as the function owner. It only ever counts the caller's own
  -- folder, takes no arguments, and returns a number; anon cannot call it.
  execute $function$
    create or replace function public.resume_file_count()
    returns integer
    language sql
    stable
    security definer
    set search_path = ''
    as $body$
      select count(*)::integer from storage.objects
      where bucket_id = 'resumes'
        and auth.uid() is not null
        and (storage.foldername(name))[1] = auth.uid()::text
    $body$
  $function$;
  revoke all on function public.resume_file_count() from public, anon, authenticated;
  grant execute on function public.resume_file_count() to authenticated;

  drop policy if exists "insert own resume files" on storage.objects;
  execute $policy$
    create policy "insert own resume files" on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'resumes'
        and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|docx)$')
        and public.resume_file_count() < 30
      )
  $policy$;
end;
$storage$;
