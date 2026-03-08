alter type public.lesson_plan_status add value if not exists 'HUMAN_REVIEW';

alter table public.lesson_plans
  add column if not exists methodology text,
  add column if not exists pillars text,
  add column if not exists resources text,
  add column if not exists classroom_activities text,
  add column if not exists home_activities text,
  add column if not exists ai_feedback text,
  add column if not exists analyzed_at timestamptz;

create type public.lesson_plan_resource_type as enum ('LINK', 'FILE');

create table if not exists public.lesson_plan_resources (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  lesson_plan_id uuid not null references public.lesson_plans(id) on delete cascade,
  resource_type public.lesson_plan_resource_type not null,
  label text,
  url text,
  file_path text,
  file_name text,
  file_size bigint,
  created_by uuid not null references public.user_profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  check (
    (resource_type = 'LINK' and url is not null and file_path is null)
    or
    (resource_type = 'FILE' and file_path is not null)
  )
);

create index if not exists idx_lesson_plan_resources_plan
  on public.lesson_plan_resources (lesson_plan_id);

alter table public.lesson_plan_resources enable row level security;

create policy "lesson plan resources by school" on public.lesson_plan_resources
for all using (public.user_belongs_to_school(school_id))
with check (public.user_belongs_to_school(school_id));

insert into storage.buckets (id, name, public, file_size_limit)
values ('lesson-plan-resources', 'lesson-plan-resources', false, 10485760)
on conflict (id) do nothing;
