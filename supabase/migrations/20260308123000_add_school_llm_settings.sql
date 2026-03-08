alter table public.schools
  add column if not exists llm_enabled boolean not null default false,
  add column if not exists llm_provider text not null default 'OPENAI',
  add column if not exists llm_model text,
  add column if not exists llm_base_url text,
  add column if not exists llm_api_key text;
