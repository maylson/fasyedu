update public.lesson_plans
set status = 'HUMAN_REVIEW'
where status = 'UNDER_REVIEW';
