export const ROLE_OPTIONS = [
  "DIRECAO",
  "COORDENACAO",
  "PROFESSOR",
  "SECRETARIA",
  "PAI",
  "ALUNO",
] as const;

export type UserRole = (typeof ROLE_OPTIONS)[number];

export const STAGE_OPTIONS = [
  "EDUCACAO_INFANTIL",
  "FUNDAMENTAL_1",
  "FUNDAMENTAL_2",
  "ENSINO_MEDIO",
  "CURSO_LIVRE",
] as const;

export type EducationStage = (typeof STAGE_OPTIONS)[number];
