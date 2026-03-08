-- Security hardening and bootstrap workflow

create or replace function public.user_has_any_role(p_school_id uuid, p_roles public.user_role[])
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
      and usr.role = any(p_roles)
      and usr.is_active = true
  );
$$;

create or replace function public.can_manage_school_data(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_has_any_role(
    p_school_id,
    array['DIRECAO', 'COORDENACAO', 'SECRETARIA']::public.user_role[]
  );
$$;

create or replace function public.can_manage_academic_data(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_has_any_role(
    p_school_id,
    array['DIRECAO', 'COORDENACAO', 'PROFESSOR']::public.user_role[]
  );
$$;

create or replace function public.bootstrap_school(
  p_school_name text,
  p_trade_name text default null,
  p_city text default null,
  p_state text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_school_id uuid;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if exists (
    select 1 from public.user_school_roles where user_id = v_user_id and is_active = true
  ) then
    raise exception 'User already has school membership';
  end if;

  insert into public.user_profiles (id, full_name)
  values (v_user_id, 'Novo Usuario')
  on conflict (id) do nothing;

  insert into public.schools (name, trade_name, city, state)
  values (p_school_name, p_trade_name, p_city, p_state)
  returning id into v_school_id;

  insert into public.user_school_roles (user_id, school_id, role)
  values (v_user_id, v_school_id, 'DIRECAO');

  return v_school_id;
end;
$$;

grant execute on function public.bootstrap_school(text, text, text, text) to authenticated;

-- Schools policies
create policy "schools manage by leaders" on public.schools
for update using (public.can_manage_school_data(id))
with check (public.can_manage_school_data(id));

-- User-school roles policies
create policy "roles read by school managers" on public.user_school_roles
for select using (
  user_id = auth.uid() or public.can_manage_school_data(school_id)
);

create policy "roles write by school managers" on public.user_school_roles
for all using (public.can_manage_school_data(school_id))
with check (public.can_manage_school_data(school_id));

-- Restrict write access for school structure tables
alter policy "years by school" on public.school_years
using (public.user_belongs_to_school(school_id))
with check (public.can_manage_school_data(school_id));

alter policy "subjects by school" on public.subjects
using (public.user_belongs_to_school(school_id))
with check (public.can_manage_school_data(school_id));

alter policy "students by school" on public.students
using (public.user_belongs_to_school(school_id))
with check (public.can_manage_school_data(school_id));

alter policy "guardians by school" on public.guardians
using (public.user_belongs_to_school(school_id))
with check (public.can_manage_school_data(school_id));

alter policy "student guardians by school" on public.student_guardians
using (public.user_belongs_to_school(school_id))
with check (public.can_manage_school_data(school_id));

alter policy "teachers by school" on public.teachers
using (public.user_belongs_to_school(school_id))
with check (public.can_manage_school_data(school_id));

alter policy "classes by school" on public.classes
using (public.user_belongs_to_school(school_id))
with check (public.can_manage_school_data(school_id));

alter policy "class subjects by school" on public.class_subjects
using (public.user_belongs_to_school(school_id))
with check (public.can_manage_school_data(school_id));

alter policy "enrollments by school" on public.enrollments
using (public.user_belongs_to_school(school_id))
with check (public.can_manage_school_data(school_id));

-- Teaching data: teacher/coordinator/direction can write
alter policy "lesson plans by school" on public.lesson_plans
using (public.user_belongs_to_school(school_id))
with check (public.can_manage_academic_data(school_id));

alter policy "assessments by school" on public.assessments
using (public.user_belongs_to_school(school_id))
with check (public.can_manage_academic_data(school_id));

alter policy "assessment items by school" on public.assessment_items
using (public.user_belongs_to_school(school_id))
with check (public.can_manage_academic_data(school_id));

alter policy "grades by school" on public.grades
using (public.user_belongs_to_school(school_id))
with check (public.can_manage_academic_data(school_id));

-- Institutional communication managed by leadership/secretary/coordination
alter policy "events by school" on public.events
using (public.user_belongs_to_school(school_id))
with check (public.can_manage_school_data(school_id));

alter policy "announcements by school" on public.announcements
using (public.user_belongs_to_school(school_id))
with check (public.can_manage_school_data(school_id));
