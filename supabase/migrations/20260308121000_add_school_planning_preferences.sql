alter table public.schools
  add column if not exists planning_pillars_enabled boolean not null default false;
