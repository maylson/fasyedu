alter table public.students
  add column if not exists photo_path text,
  add column if not exists photo_url text;

