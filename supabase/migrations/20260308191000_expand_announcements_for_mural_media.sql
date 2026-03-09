alter table public.announcements
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_mime text,
  add column if not exists attachment_size bigint;

create index if not exists idx_announcements_published_at on public.announcements (school_id, published_at desc);
