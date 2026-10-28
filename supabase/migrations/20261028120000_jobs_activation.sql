-- Recommended jobs activation (M2.1).
--
-- 1. apply_job_catalog: same signature, proof, lock, rate limit, and
--    empty-snapshot rules as 20261021120000. The posting insert now updates an
--    existing (source_id, source_job_id) row instead of failing with 23505, so
--    a source can refresh more than once. A posting that reappears after it
--    expired becomes active again. The response adds an `inserted` count.
--    This replaces an existing function body. It does not change a table,
--    grant, or policy.
-- 2. list_job_ingestion_sources: new. Lets the server runner read approved
--    source activation records without a user session. It checks its own HMAC
--    operation name and rejects a `now` more than five minutes from the
--    database clock, so a captured request cannot be replayed later.
--
-- No table is created, altered, or dropped. No service role is used.

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
  v_inserted integer := 0;
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
    from (select distinct on (source_job_id) * from incoming order by source_job_id) incoming
    left join public.catalog_employers employer
      on employer.normalized_name = public.normalize_employer_name(incoming.employer_name)
     and employer.website_domain = incoming.employer_domain
     and incoming.employer_name is not null
    on conflict (source_id, source_job_id) do update
      set employer_id = excluded.employer_id,
          title = excluded.title,
          location_text = excluded.location_text,
          country_code = excluded.country_code,
          region = excluded.region,
          work_arrangement = excluded.work_arrangement,
          employment_type = excluded.employment_type,
          seniority = excluded.seniority,
          compensation_min = excluded.compensation_min,
          compensation_max = excluded.compensation_max,
          currency = excluded.currency,
          salary_period = excluded.salary_period,
          posted_at = excluded.posted_at,
          last_verified_at = excluded.last_verified_at,
          listing_url = excluded.listing_url,
          application_url = excluded.application_url,
          application_method = excluded.application_method,
          content_hash = excluded.content_hash,
          listing_status = excluded.listing_status,
          requisition_id = excluded.requisition_id,
          description_text = excluded.description_text,
          skills = excluded.skills,
          title_tokens = excluded.title_tokens,
          skill_tokens = excluded.skill_tokens,
          provenance = excluded.provenance,
          updated_at = pg_catalog.now()
    returning source_job_id, (xmax = 0) as inserted
  )
  select
    count(*)::integer,
    coalesce(pg_catalog.array_agg(source_job_id), '{}'::text[]),
    (count(*) filter (where inserted))::integer
  into v_upserted, v_seen, v_inserted
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
    'inserted', v_inserted,
    'expired', v_expired
  );
end;
$$;


create or replace function public.list_job_ingestion_sources(p_payload text, p_proof text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_expected text;
  v_now timestamptz;
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
      convert_to('list-ingestion-sources' || E'\n' || p_payload, 'utf8'),
      convert_to(v_secret, 'utf8'),
      'sha256'
    ),
    'hex'
  );
  if v_expected is distinct from lower(p_proof) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  begin
    v_now := (p_payload::jsonb->>'now')::timestamptz;
  exception when others then
    v_now := null;
  end;
  if v_now is null or abs(extract(epoch from (pg_catalog.now() - v_now))) > 300 then
    raise exception 'stale request' using errcode = '42501';
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'slug', source.slug,
    'provider', source.provider,
    'sourceIdentifier', source.source_identifier,
    'region', source.region,
    'employerName', source.employer_name,
    'employerDomain', source.employer_domain,
    'accessMethod', source.access_method,
    'approvedUsage', source.approved_usage,
    'attributionRequirements', source.attribution_requirements,
    'retentionRestrictions', source.retention_restrictions,
    'allowedStorageFields', pg_catalog.to_jsonb(source.allowed_storage_fields),
    'refreshLimitPerDay', source.refresh_limit_per_day,
    'approvalStatus', source.approval_status,
    'termsStatus', source.terms_status,
    'liveIngestionEnabled', source.live_ingestion_enabled
  ) order by source.slug), '[]'::jsonb)
  into v_sources
  from public.job_sources source
  where source.approval_status = 'approved';

  return pg_catalog.jsonb_build_object('ok', true, 'sources', v_sources);
end;
$$;

revoke all on function public.list_job_ingestion_sources(text, text) from public, anon, authenticated;
grant execute on function public.list_job_ingestion_sources(text, text) to anon, authenticated;
