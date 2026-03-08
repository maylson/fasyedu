do $$
declare
  v_user_id uuid;
  v_school_id uuid;
begin
  select id into v_user_id
  from auth.users
  where email = 'maylson@caemy.com'
  limit 1;

  if v_user_id is null then
    raise exception 'Admin user with email % was not found in auth.users', 'maylson@caemy.com';
  end if;

  insert into public.user_profiles (id, full_name)
  values (v_user_id, 'Admin FASY')
  on conflict (id) do nothing;

  select id into v_school_id
  from public.schools
  where name = 'Colegio Mirante'
    and coalesce(city, '') = 'Belem'
    and coalesce(state, '') = 'PA'
  limit 1;

  if v_school_id is null then
    insert into public.schools (name, trade_name, city, state)
    values ('Colegio Mirante', 'GRUPO VIRTUS LTDA', 'Belem', 'PA')
    returning id into v_school_id;
  end if;

  insert into public.user_school_roles (user_id, school_id, role)
  values (v_user_id, v_school_id, 'DIRECAO')
  on conflict (user_id, school_id, role) do nothing;
end $$;