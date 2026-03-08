-- Allow selecting the teacher at schedule level.
-- Keep only the validation that class_subject belongs to the selected class.
create or replace function public.validate_class_schedule_links()
returns trigger
language plpgsql
as $$
declare
  v_class_id uuid;
begin
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
