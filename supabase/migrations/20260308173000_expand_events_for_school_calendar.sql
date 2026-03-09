do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'event_type' and n.nspname = 'public'
  ) then
    create type public.event_type as enum ('FERIADO', 'COMEMORACAO', 'PROGRAMACAO');
  end if;
end $$;

alter table public.events
  add column if not exists event_type public.event_type not null default 'PROGRAMACAO',
  add column if not exists target_stages public.education_stage[] not null default '{}',
  add column if not exists target_series text[] not null default '{}',
  add column if not exists target_class_ids uuid[] not null default '{}',
  add column if not exists is_administrative boolean not null default false,
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_mime text,
  add column if not exists attachment_size bigint;

create index if not exists idx_events_type on public.events (event_type);
create index if not exists idx_events_admin on public.events (is_administrative);
