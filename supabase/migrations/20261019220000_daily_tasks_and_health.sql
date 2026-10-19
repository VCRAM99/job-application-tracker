-- Recurring daily tasks and optional private health tracking.
-- Apply with `supabase db push`. Do not reset the hosted database.
-- Existing rows are not changed.

create table public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  timezone text,
  health_tracking_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_preferences_timezone_length check (
    timezone is null or char_length(timezone) between 1 and 80
  )
);

create table public.recurring_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  weekdays smallint[] not null,
  start_date date,
  end_date date,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_tasks_user_id_id_key unique (user_id, id),
  constraint recurring_tasks_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint recurring_tasks_status_check check (status in ('active', 'paused')),
  constraint recurring_tasks_weekdays_check check (
    cardinality(weekdays) between 1 and 7
    and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
  ),
  constraint recurring_tasks_date_range_check check (
    start_date is null or end_date is null or start_date <= end_date
  )
);

create table public.recurring_task_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null,
  local_date date not null,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint recurring_task_completions_unique unique (task_id, local_date),
  constraint recurring_task_completions_owner_fkey
    foreign key (user_id, task_id) references public.recurring_tasks (user_id, id) on delete cascade
);

create table public.health_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  calorie_target integer,
  protein_target numeric(6, 1),
  water_goal_ml integer,
  water_increment_ml integer not null default 250,
  sleep_target_minutes integer,
  step_target integer,
  weight_unit text not null default 'kg',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_goals_calorie_target_check check (calorie_target is null or calorie_target >= 0),
  constraint health_goals_protein_target_check check (protein_target is null or protein_target >= 0),
  constraint health_goals_water_goal_check check (water_goal_ml is null or water_goal_ml >= 0),
  constraint health_goals_water_increment_check check (water_increment_ml > 0 and water_increment_ml <= 5000),
  constraint health_goals_sleep_target_check check (
    sleep_target_minutes is null or sleep_target_minutes between 1 and 1440
  ),
  constraint health_goals_step_target_check check (step_target is null or step_target >= 0),
  constraint health_goals_weight_unit_check check (weight_unit in ('kg', 'lb'))
);

create table public.food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  description text,
  calories integer not null,
  protein numeric(6, 1) not null,
  entry_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint food_entries_calories_check check (calories >= 0),
  constraint food_entries_protein_check check (protein >= 0),
  constraint food_entries_description_length check (
    description is null or char_length(description) <= 200
  )
);

create table public.water_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  amount_ml integer not null,
  created_at timestamptz not null default now(),
  constraint water_entries_amount_check check (amount_ml <> 0 and amount_ml between -5000 and 5000)
);

create table public.sleep_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  minutes integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sleep_entries_minutes_check check (minutes between 1 and 1440)
);

create table public.step_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  steps integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint step_entries_steps_check check (steps > 0)
);

create table public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(6, 3) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weight_entries_weight_check check (weight_kg > 0 and weight_kg < 500)
);

create index recurring_tasks_user_id_idx on public.recurring_tasks (user_id);
create index recurring_task_completions_user_date_idx
  on public.recurring_task_completions (user_id, local_date);
create index food_entries_user_date_idx on public.food_entries (user_id, local_date);
create index water_entries_user_date_idx on public.water_entries (user_id, local_date);
create index sleep_entries_user_date_idx on public.sleep_entries (user_id, local_date);
create index step_entries_user_date_idx on public.step_entries (user_id, local_date);
create index weight_entries_user_date_idx on public.weight_entries (user_id, measured_on);

create trigger user_preferences_set_user_id
  before insert or update on public.user_preferences
  for each row execute function public.assign_user_id();
create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

create trigger recurring_tasks_set_user_id
  before insert or update on public.recurring_tasks
  for each row execute function public.assign_user_id();
create trigger recurring_tasks_set_updated_at
  before update on public.recurring_tasks
  for each row execute function public.set_updated_at();

create trigger recurring_task_completions_set_user_id
  before insert or update on public.recurring_task_completions
  for each row execute function public.assign_user_id();

create trigger health_goals_set_user_id
  before insert or update on public.health_goals
  for each row execute function public.assign_user_id();
create trigger health_goals_set_updated_at
  before update on public.health_goals
  for each row execute function public.set_updated_at();

create trigger food_entries_set_user_id
  before insert or update on public.food_entries
  for each row execute function public.assign_user_id();
create trigger food_entries_set_updated_at
  before update on public.food_entries
  for each row execute function public.set_updated_at();

create trigger water_entries_set_user_id
  before insert or update on public.water_entries
  for each row execute function public.assign_user_id();

create trigger sleep_entries_set_user_id
  before insert or update on public.sleep_entries
  for each row execute function public.assign_user_id();
create trigger sleep_entries_set_updated_at
  before update on public.sleep_entries
  for each row execute function public.set_updated_at();

create trigger step_entries_set_user_id
  before insert or update on public.step_entries
  for each row execute function public.assign_user_id();
create trigger step_entries_set_updated_at
  before update on public.step_entries
  for each row execute function public.set_updated_at();

create trigger weight_entries_set_user_id
  before insert or update on public.weight_entries
  for each row execute function public.assign_user_id();
create trigger weight_entries_set_updated_at
  before update on public.weight_entries
  for each row execute function public.set_updated_at();

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'user_preferences',
    'recurring_tasks',
    'recurring_task_completions',
    'health_goals',
    'food_entries',
    'water_entries',
    'sleep_entries',
    'step_entries',
    'weight_entries'
  ]
  loop
    execute format('alter table public.%I enable row level security', tbl);
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
