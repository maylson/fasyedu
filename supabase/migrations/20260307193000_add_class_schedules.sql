create table if not exists public.class_schedules (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  class_subject_id uuid not null references public.class_subjects(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  starts_at time not null,
  ends_at time not null,
  room text,
  created_by uuid not null references public.user_profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_at > starts_at)
);

create index if not exists idx_class_schedules_school_class_day
  on public.class_schedules (school_id, class_id, day_of_week, starts_at);

create unique index if not exists uq_class_schedules_slot
  on public.class_schedules (class_id, day_of_week, starts_at);

create or replace function public.validate_class_schedule_links()
returns trigger
language plpgsql
as $$
declare
  v_class_id uuid;
  v_teacher_id uuid;
begin
  select class_id, teacher_id
  into v_class_id, v_teacher_id
  from public.class_subjects
  where id = new.class_subject_id;

  if v_class_id is null then
    raise exception 'Class subject not found';
  end if;

  if v_class_id <> new.class_id then
    raise exception 'Selected class subject does not belong to selected class';
  end if;

  if new.teacher_id is distinct from v_teacher_id then
    raise exception 'Teacher must match the teacher assigned in class subject';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_class_schedules_updated_at on public.class_schedules;
create trigger trg_class_schedules_updated_at
before update on public.class_schedules
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_class_schedules_validate_links on public.class_schedules;
create trigger trg_class_schedules_validate_links
before insert or update on public.class_schedules
for each row execute procedure public.validate_class_schedule_links();

alter table public.class_schedules enable row level security;

create policy "class schedules by school" on public.class_schedules
for all using (public.user_belongs_to_school(school_id))
with check (public.can_manage_school_data(school_id));
