-- M6c: read-only status of catalog source runs for the operator CLI (`jobs status`).
-- Additive only: one function. No tables, columns, policies, or data change.
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
