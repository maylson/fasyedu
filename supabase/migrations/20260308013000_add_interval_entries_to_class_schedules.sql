-- Support non-class entries (e.g., interval/recess) in weekly schedules.
alter table public.class_schedules
  add column if not exists entry_type text not null default 'AULA',
  add column if not exists title text;

alter table public.class_schedules
  alter column class_subject_id drop not null,
  alter column teacher_id drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_class_schedules_entry_type'
      and conrelid = 'public.class_schedules'::regclass
  ) then
    alter table public.class_schedules
      add constraint chk_class_schedules_entry_type
      check (entry_type in ('AULA', 'INTERVALO'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_class_schedules_entry_data'
      and conrelid = 'public.class_schedules'::regclass
  ) then
    alter table public.class_schedules
      add constraint chk_class_schedules_entry_data
      check (
        (entry_type = 'AULA' and class_subject_id is not null and teacher_id is not null)
        or
        (entry_type = 'INTERVALO' and class_subject_id is null and teacher_id is null)
      );
  end if;
end $$;

create or replace function public.validate_class_schedule_links()
returns trigger
language plpgsql
as $$
declare
  v_class_id uuid;
begin
  if new.entry_type = 'INTERVALO' then
    return new;
  end if;

  select class_id
  into v_class_id
  from public.class_subjects
  where id = new.class_subject_id;

  if v_class_id is null then
    raise exception 'Class subject not found';
  end if;

  if v_class_id <> new.class_id then
    raise exception 'Selected class subject does not belong to selected class';
  end if;

  return new;
end;
$$;
