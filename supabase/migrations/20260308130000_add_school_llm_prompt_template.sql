alter table public.schools
  add column if not exists llm_prompt_template text;
