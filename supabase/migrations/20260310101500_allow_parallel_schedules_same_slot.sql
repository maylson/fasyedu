-- Permite mais de um horário no mesmo dia/horário para a mesma turma
-- (caso especial de planejamento paralelo por professoras(es) diferentes).
drop index if exists public.uq_class_schedules_slot;
