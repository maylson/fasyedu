create policy "profile read by school managers" on public.user_profiles
for select using (
  exists (
    select 1
    from public.user_school_roles managed
    join public.user_school_roles manager
      on manager.school_id = managed.school_id
    where managed.user_id = public.user_profiles.id
      and managed.is_active = true
      and manager.user_id = auth.uid()
      and manager.is_active = true
      and manager.role in ('DIRECAO', 'COORDENACAO', 'SECRETARIA')
  )
);
