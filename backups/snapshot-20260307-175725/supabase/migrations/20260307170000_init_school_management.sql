-- Supabase schema for a multi-school management platform
create extension if not exists "pgcrypto";

create type public.user_role as enum (
  'DIRECAO',
  'COORDENACAO',
  'PROFESSOR',
  'SECRETARIA',
  'PAI',
  'ALUNO'
);

create type public.education_stage as enum (
  'EDUCACAO_INFANTIL',
  'FUNDAMENTAL_1',
  'FUNDAMENTAL_2',
  'ENSINO_MEDIO',
  'CURSO_LIVRE'
);

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  document text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trade_name text,
  cnpj text,
  email text,
  phone text,
  address_line text,
  city text,
  state text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_school_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  role public.user_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, school_id, role)
);

create table if not exists public.school_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  title text not null,
  starts_at date not null,
  ends_at date not null,
  is_active boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  unique (school_id, title),
  check (ends_at >= starts_at)
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  code text,
  stage public.education_stage not null,
  weekly_workload smallint,
  created_at timestamptz not null default timezone('utc', now()),
  unique (school_id, name)
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid unique references public.user_profiles(id) on delete set null,
  registration_code text not null,
  full_name text not null,
  birth_date date,
  stage public.education_stage not null,
  status text not null default 'ATIVO',
  created_at timestamptz not null default timezone('utc', now()),
  unique (school_id, registration_code)
);

create table if not exists public.guardians (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid unique references public.user_profiles(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  document text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.student_guardians (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  relationship text not null,
  is_financial_responsible boolean not null default false,
  unique (student_id, guardian_id)
);

create table if not exists public.teachers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid unique references public.user_profiles(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  specialty text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  school_year_id uuid not null references public.school_years(id) on delete cascade,
  name text not null,
  stage public.education_stage not null,
  shift text not null,
  vacancies integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  unique (school_id, school_year_id, name)
);

create table if not exists public.class_subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  teacher_id uuid references public.teachers(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (class_id, subject_id)
);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  school_year_id uuid not null references public.school_years(id) on delete cascade,
  status text not null default 'ATIVA',
  enrolled_at date not null default current_date,
  canceled_at date,
  created_at timestamptz not null default timezone('utc', now()),
  unique (student_id, class_id, school_year_id)
);

create table if not exists public.lesson_plans (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_subject_id uuid not null references public.class_subjects(id) on delete cascade,
  title text not null,
  objective text,
  content text,
  planned_date date,
  created_by uuid not null references public.user_profiles(id),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_subject_id uuid not null references public.class_subjects(id) on delete cascade,
  title text not null,
  assessment_date date not null,
  max_score numeric(6,2) not null default 10,
  created_by uuid not null references public.user_profiles(id),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.assessment_items (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  title text not null,
  weight numeric(8,4) not null default 1,
  max_score numeric(6,2) not null default 10,
  unique (assessment_id, title)
);

create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  assessment_item_id uuid not null references public.assessment_items(id) on delete cascade,
  score numeric(6,2) not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (enrollment_id, assessment_item_id)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  school_year_id uuid references public.school_years(id) on delete set null,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  audience text not null default 'TODOS',
  created_by uuid not null references public.user_profiles(id),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  title text not null,
  message text not null,
  audience text not null default 'TODOS',
  is_pinned boolean not null default false,
  published_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz,
  created_by uuid not null references public.user_profiles(id)
);

create index if not exists idx_user_school_roles_school on public.user_school_roles (school_id);
create index if not exists idx_students_school on public.students (school_id);
create index if not exists idx_teachers_school on public.teachers (school_id);
create index if not exists idx_classes_school on public.classes (school_id, school_year_id);
create index if not exists idx_enrollments_school on public.enrollments (school_id, school_year_id);
create index if not exists idx_events_school on public.events (school_id, starts_at);
create index if not exists idx_announcements_school on public.announcements (school_id, published_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.user_profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.user_belongs_to_school(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_school_roles usr
    where usr.user_id = auth.uid()
      and usr.school_id = p_school_id
      and usr.is_active = true
  );
$$;

create or replace function public.user_has_role(p_school_id uuid, p_role public.user_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_school_roles usr
    where usr.user_id = auth.uid()
      and usr.school_id = p_school_id
      and usr.role = p_role
      and usr.is_active = true
  );
$$;

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_schools_updated_at on public.schools;
create trigger trg_schools_updated_at
before update on public.schools
for each row execute procedure public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.user_profiles enable row level security;
alter table public.schools enable row level security;
alter table public.user_school_roles enable row level security;
alter table public.school_years enable row level security;
alter table public.subjects enable row level security;
alter table public.students enable row level security;
alter table public.guardians enable row level security;
alter table public.student_guardians enable row level security;
alter table public.teachers enable row level security;
alter table public.classes enable row level security;
alter table public.class_subjects enable row level security;
alter table public.enrollments enable row level security;
alter table public.lesson_plans enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_items enable row level security;
alter table public.grades enable row level security;
alter table public.events enable row level security;
alter table public.announcements enable row level security;

create policy "profile own read" on public.user_profiles
for select using (id = auth.uid());

create policy "profile own update" on public.user_profiles
for update using (id = auth.uid());

create policy "school by membership" on public.schools
for select using (public.user_belongs_to_school(id));

create policy "roles own memberships" on public.user_school_roles
for select using (user_id = auth.uid());

create policy "years by school" on public.school_years
for all using (public.user_belongs_to_school(school_id))
with check (public.user_belongs_to_school(school_id));

create policy "subjects by school" on public.subjects
for all using (public.user_belongs_to_school(school_id))
with check (public.user_belongs_to_school(school_id));

create policy "students by school" on public.students
for all using (public.user_belongs_to_school(school_id))
with check (public.user_belongs_to_school(school_id));

create policy "guardians by school" on public.guardians
for all using (public.user_belongs_to_school(school_id))
with check (public.user_belongs_to_school(school_id));

create policy "student guardians by school" on public.student_guardians
for all using (public.user_belongs_to_school(school_id))
with check (public.user_belongs_to_school(school_id));

create policy "teachers by school" on public.teachers
for all using (public.user_belongs_to_school(school_id))
with check (public.user_belongs_to_school(school_id));

create policy "classes by school" on public.classes
for all using (public.user_belongs_to_school(school_id))
with check (public.user_belongs_to_school(school_id));

create policy "class subjects by school" on public.class_subjects
for all using (public.user_belongs_to_school(school_id))
with check (public.user_belongs_to_school(school_id));

create policy "enrollments by school" on public.enrollments
for all using (public.user_belongs_to_school(school_id))
with check (public.user_belongs_to_school(school_id));

create policy "lesson plans by school" on public.lesson_plans
for all using (public.user_belongs_to_school(school_id))
with check (public.user_belongs_to_school(school_id));

create policy "assessments by school" on public.assessments
for all using (public.user_belongs_to_school(school_id))
with check (public.user_belongs_to_school(school_id));

create policy "assessment items by school" on public.assessment_items
for all using (public.user_belongs_to_school(school_id))
with check (public.user_belongs_to_school(school_id));

create policy "grades by school" on public.grades
for all using (public.user_belongs_to_school(school_id))
with check (public.user_belongs_to_school(school_id));

create policy "events by school" on public.events
for all using (public.user_belongs_to_school(school_id))
with check (public.user_belongs_to_school(school_id));

create policy "announcements by school" on public.announcements
for all using (public.user_belongs_to_school(school_id))
with check (public.user_belongs_to_school(school_id));
