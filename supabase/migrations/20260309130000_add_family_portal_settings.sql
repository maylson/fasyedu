alter table public.schools
  add column if not exists parent_contents_enabled boolean not null default false,
  add column if not exists student_agenda_enabled boolean not null default false;

