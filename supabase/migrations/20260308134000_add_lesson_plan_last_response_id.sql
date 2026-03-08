alter table public.lesson_plans
  add column if not exists ai_last_response_id text;
