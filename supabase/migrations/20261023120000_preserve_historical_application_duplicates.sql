-- Historical applications that already share a normalized title and URL keep a
-- null match key. Editing or changing the status of those rows must succeed.
-- A new insert with the same key is still rejected by the unique index.
-- This does not delete or merge any application.

create or replace function public.set_application_match_key()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_key text;
begin
  v_key := public.application_match_key(new.job_title, new.job_url);
  if tg_op = 'UPDATE'
     and old.job_match_key is null
     and v_key is not null
     and exists (
       select 1
       from public.applications existing
       where existing.user_id = new.user_id
         and existing.id <> new.id
         and existing.job_match_key = v_key
     ) then
    new.job_match_key := null;
    return new;
  end if;
  new.job_match_key := v_key;
  return new;
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
  incoming_key text;
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
    incoming_key := public.application_match_key(title, job_url);

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
      from public.applications existing
      where existing.user_id = auth.uid()
        and existing.company_id = company_uuid
        and lower(regexp_replace(pg_catalog.btrim(existing.job_title), '[[:space:]]+', ' ', 'g')) = title_key
        and coalesce(lower(regexp_replace(pg_catalog.btrim(existing.job_url), '/+$', '')), '') = url_key
    ) or (
      incoming_key is not null
      and exists (
        select 1
        from public.applications existing
        where existing.user_id = auth.uid()
          and public.application_match_key(existing.job_title, existing.job_url) = incoming_key
      )
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
