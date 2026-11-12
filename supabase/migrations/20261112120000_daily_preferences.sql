-- Daily Tasks overhaul: goal mode, protein direction, and which health metrics are shown.
-- Additive only: three nullable columns on the existing owner-only health_goals table (RLS and
-- grants unchanged). Existing rows are not rewritten; null means the default, applied in code:
--   goal_mode null          -> 'bulk' (targets are amounts to reach, as before)
--   protein_direction null  -> 'follow' (protein uses the goal mode)
--   hidden_metrics null     -> nothing hidden
-- Hiding a metric only hides it; no entries are deleted.
alter table public.health_goals
  add column if not exists goal_mode text,
  add column if not exists protein_direction text,
  add column if not exists hidden_metrics text[];

alter table public.health_goals
  add constraint health_goals_goal_mode_check check (goal_mode is null or goal_mode in ('cut', 'bulk')),
  add constraint health_goals_protein_direction_check check (protein_direction is null or protein_direction in ('follow', 'reach')),
  add constraint health_goals_hidden_metrics_check check (
    hidden_metrics is null or hidden_metrics <@ array['food', 'water', 'sleep', 'steps', 'weight']::text[]
  );
