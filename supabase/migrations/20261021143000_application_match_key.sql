-- Reliable application duplicate detection.
-- Stores a normalized title-and-URL key so a targeted lookup and a unique
-- index cover every matching row, including concurrent inserts.
-- Existing rows that already share a key keep a null key on the later row
-- so this file can be applied when historical duplicates exist.
-- Apply with `supabase db push` only against a database you intend to change.

create or replace function public.normalize_job_url(p_url text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_url text;
  v_rest text;
  v_proto text;
  v_host text;
  v_path text;
  v_query text;
begin
  v_url := pg_catalog.btrim(coalesce(p_url, ''));
  if v_url = '' or v_url !~* '^https?://' then
    return null;
  end if;
  v_url := split_part(v_url, '#', 1);
  v_proto := lower(split_part(v_url, '://', 1));
  v_rest := substring(v_url from char_length(v_proto) + 4);
  v_query := '';
  if position('?' in v_rest) > 0 then
    v_query := substring(v_rest from position('?' in v_rest));
    v_rest := substring(v_rest from 1 for position('?' in v_rest) - 1);
  end if;
  if position('/' in v_rest) > 0 then
    v_host := split_part(v_rest, '/', 1);
    v_path := substring(v_rest from position('/' in v_rest));
  else
    v_host := v_rest;
    v_path := '/';
  end if;
  if position('@' in v_host) > 0 then
    v_host := substring(v_host from position('@' in v_host) + 1);
  end if;
  v_host := lower(v_host);
  if v_path <> '/' then
    v_path := regexp_replace(v_path, '/+$', '');
    if v_path = '' then
      v_path := '/';
    end if;
  end if;
  return v_proto || '://' || v_host || v_path || v_query;
end;
$$;

alter table public.applications
  add column job_match_key text;

create or replace function public.application_match_key(p_title text, p_url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when public.normalize_job_url(p_url) is null
      or char_length(pg_catalog.btrim(coalesce(p_title, ''))) = 0
    then null
    else lower(pg_catalog.btrim(p_title)) || E'\n' || public.normalize_job_url(p_url)
  end
$$;

do $$
declare
  v_row record;
  v_key text;
begin
  for v_row in
    select id, user_id, job_title, job_url
    from public.applications
    order by created_at, id
  loop
    v_key := public.application_match_key(v_row.job_title, v_row.job_url);
    if v_key is null then
      continue;
    end if;
    if exists (
      select 1
      from public.applications existing
      where existing.user_id = v_row.user_id
        and existing.job_match_key = v_key
    ) then
      continue;
    end if;
    update public.applications
    set job_match_key = v_key
    where id = v_row.id;
  end loop;
end $$;

create or replace function public.set_application_match_key()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.job_match_key := public.application_match_key(new.job_title, new.job_url);
  return new;
end;
$$;

create trigger applications_set_match_key
  before insert or update on public.applications
  for each row execute function public.set_application_match_key();

create unique index applications_user_match_key_idx
  on public.applications (user_id, job_match_key)
  where job_match_key is not null;

create or replace function public.find_application_duplicate(p_title text, p_url text)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select application.id
  from public.applications application
  where application.user_id = auth.uid()
    and public.application_match_key(application.job_title, application.job_url)
      = public.application_match_key(p_title, p_url)
    and public.application_match_key(p_title, p_url) is not null
  order by application.created_at, application.id
  limit 1
$$;

revoke all on function public.normalize_job_url(text) from public, anon, authenticated;
revoke all on function public.application_match_key(text, text) from public, anon, authenticated;
revoke all on function public.set_application_match_key() from public, anon, authenticated;
revoke all on function public.find_application_duplicate(text, text) from public, anon, authenticated;
grant execute on function public.normalize_job_url(text) to authenticated;
grant execute on function public.application_match_key(text, text) to authenticated;
grant execute on function public.set_application_match_key() to authenticated;
grant execute on function public.find_application_duplicate(text, text) to authenticated;
