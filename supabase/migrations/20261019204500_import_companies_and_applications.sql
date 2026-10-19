-- Import companies and applications in one transaction per call.
-- The functions run as the signed-in user, so row-level security applies.
-- Apply with `supabase db push`. Do not reset the hosted database.

create or replace function public.import_companies(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  inserted_count int := 0;
  skipped_count int := 0;
  company_name text;
  company_key text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if jsonb_typeof(payload) is distinct from 'array' then
    raise exception 'payload must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(payload) > 500 then
    raise exception 'too many rows' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(auth.uid()::text));

  for item in select value from jsonb_array_elements(payload) loop
    company_name := regexp_replace(pg_catalog.btrim(item->>'name'), '[[:space:]]+', ' ', 'g');
    company_key := lower(company_name);

    if exists (
      select 1
      from public.companies
      where user_id = auth.uid()
        and lower(regexp_replace(pg_catalog.btrim(name), '[[:space:]]+', ' ', 'g')) = company_key
    ) then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    insert into public.companies (
      name, size, location, industry, research_status, priority_tier,
      reference, website_url, notes, follow_up_date
    ) values (
      company_name,
      coalesce(item->>'size', 'unknown'),
      nullif(item->>'location', ''),
      nullif(item->>'industry', ''),
      coalesce(item->>'research_status', 'not_started'),
      coalesce(item->>'priority_tier', 'unset'),
      nullif(item->>'reference', ''),
      nullif(item->>'website_url', ''),
      nullif(item->>'notes', ''),
      nullif(item->>'follow_up_date', '')::date
    );
    inserted_count := inserted_count + 1;
  end loop;

  return jsonb_build_object('inserted', inserted_count, 'skipped', skipped_count);
end;
$$;

create or replace function public.import_applications(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  inserted_apps int := 0;
  skipped_apps int := 0;
  created_companies int := 0;
  company_name text;
  company_key text;
  company_uuid uuid;
  title text;
  title_key text;
  job_url text;
  url_key text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if jsonb_typeof(payload) is distinct from 'array' then
    raise exception 'payload must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(payload) > 500 then
    raise exception 'too many rows' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(auth.uid()::text));

  for item in select value from jsonb_array_elements(payload) loop
    company_name := regexp_replace(pg_catalog.btrim(item->>'company_name'), '[[:space:]]+', ' ', 'g');
    company_key := lower(company_name);
    title := regexp_replace(pg_catalog.btrim(item->>'job_title'), '[[:space:]]+', ' ', 'g');
    title_key := lower(title);
    job_url := nullif(pg_catalog.btrim(coalesce(item->>'job_url', '')), '');
    url_key := case
      when job_url is null then ''
      else lower(regexp_replace(job_url, '/+$', ''))
    end;

    -- SELECT INTO keeps the previous value when no row matches, so clear it first.
    company_uuid := null;
    select id into company_uuid
    from public.companies
    where user_id = auth.uid()
      and lower(regexp_replace(pg_catalog.btrim(name), '[[:space:]]+', ' ', 'g')) = company_key
    order by created_at
    limit 1;

    if company_uuid is null then
      insert into public.companies (name)
      values (company_name)
      returning id into company_uuid;
      created_companies := created_companies + 1;
    end if;

    if exists (
      select 1
      from public.applications
      where user_id = auth.uid()
        and company_id = company_uuid
        and lower(regexp_replace(pg_catalog.btrim(job_title), '[[:space:]]+', ' ', 'g')) = title_key
        and coalesce(lower(regexp_replace(pg_catalog.btrim(job_url), '/+$', '')), '') = url_key
    ) then
      skipped_apps := skipped_apps + 1;
      continue;
    end if;

    insert into public.applications (
      company_id, job_title, job_url, source, location, work_arrangement,
      employment_type, salary_min, salary_max, salary_currency, status,
      applied_at, next_follow_up_date, notes
    ) values (
      company_uuid,
      title,
      job_url,
      nullif(item->>'source', ''),
      nullif(item->>'location', ''),
      coalesce(item->>'work_arrangement', 'unknown'),
      coalesce(item->>'employment_type', 'unknown'),
      nullif(item->>'salary_min', '')::numeric,
      nullif(item->>'salary_max', '')::numeric,
      coalesce(nullif(item->>'salary_currency', ''), 'USD'),
      coalesce(item->>'status', 'saved'),
      nullif(item->>'applied_at', '')::date,
      nullif(item->>'next_follow_up_date', '')::date,
      nullif(item->>'notes', '')
    );
    inserted_apps := inserted_apps + 1;
  end loop;

  return jsonb_build_object(
    'companies_created', created_companies,
    'applications_inserted', inserted_apps,
    'applications_skipped', skipped_apps
  );
end;
$$;

revoke all on function public.import_companies(jsonb) from public, anon;
revoke all on function public.import_applications(jsonb) from public, anon;
grant execute on function public.import_companies(jsonb) to authenticated;
grant execute on function public.import_applications(jsonb) to authenticated;
