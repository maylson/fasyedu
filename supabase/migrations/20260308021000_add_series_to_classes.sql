alter table public.classes
  add column if not exists series text;

create index if not exists idx_classes_school_stage_series
  on public.classes (school_id, stage, series);

-- Backfill from existing class names when possible.
update public.classes
set series = case
  when name ~ '^[0-9]+º Ano' then substring(name from '^([0-9]+º Ano)')
  when name ~ '^[0-9]+º EM' then substring(name from '^([0-9]+º EM)')
  else series
end
where series is null;
