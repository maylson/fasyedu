-- Add internal SUPPORT role with full permissions and restricted assignment via RLS

alter type public.user_role add value if not exists 'SUPPORT';

create or replace function public.can_manage_school_data(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_has_any_role(
    p_school_id,
    array['SUPPORT', 'DIRECAO', 'COORDENACAO', 'SECRETARIA']::public.user_role[]
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
    array['SUPPORT', 'DIRECAO', 'COORDENACAO', 'PROFESSOR']::public.user_role[]
  );
$$;

alter policy "roles write by school managers" on public.user_school_roles
using (
  public.can_manage_school_data(school_id)
  and (
    role <> 'SUPPORT'::public.user_role
    or public.user_has_role(school_id, 'SUPPORT'::public.user_role)
  )
)
with check (
  public.can_manage_school_data(school_id)
  and (
    role <> 'SUPPORT'::public.user_role
    or public.user_has_role(school_id, 'SUPPORT'::public.user_role)
  )
);
