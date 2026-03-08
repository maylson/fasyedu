create type public.lesson_plan_status as enum (
  'DRAFT',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED'
);

alter table public.lesson_plans
  add column if not exists class_schedule_id uuid references public.class_schedules(id) on delete set null,
  add column if not exists lesson_date date,
  add column if not exists status public.lesson_plan_status not null default 'DRAFT',
  add column if not exists reviewer_comment text,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.lesson_plans
set lesson_date = coalesce(lesson_date, planned_date, current_date)
where lesson_date is null;

create index if not exists idx_lesson_plans_school_date
  on public.lesson_plans (school_id, lesson_date);

create unique index if not exists uq_lesson_plan_schedule_date
  on public.lesson_plans (class_schedule_id, lesson_date)
  where class_schedule_id is not null and lesson_date is not null;

drop trigger if exists trg_lesson_plans_updated_at on public.lesson_plans;
create trigger trg_lesson_plans_updated_at
before update on public.lesson_plans
for each row execute procedure public.set_updated_at();
