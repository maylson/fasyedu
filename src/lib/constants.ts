export const SYSTEM_ROLE_OPTIONS = [
  "SUPPORT",
  "DIRECAO",
  "COORDENACAO",
  "PROFESSOR",
  "SECRETARIA",
  "PAI",
  "ALUNO",
] as const;

export const ROLE_OPTIONS = [
  "DIRECAO",
  "COORDENACAO",
  "PROFESSOR",
  "SECRETARIA",
  "PAI",
  "ALUNO",
] as const;

export type UserRole = (typeof SYSTEM_ROLE_OPTIONS)[number];

export const STAGE_OPTIONS = [
  "EDUCACAO_INFANTIL",
  "FUNDAMENTAL_1",
  "FUNDAMENTAL_2",
  "ENSINO_MEDIO",
  "CURSO_LIVRE",
] as const;

export type EducationStage = (typeof STAGE_OPTIONS)[number];

export const STAGE_LABELS: Record<EducationStage, string> = {
  EDUCACAO_INFANTIL: "Educação Infantil",
  FUNDAMENTAL_1: "Fundamental 1",
  FUNDAMENTAL_2: "Fundamental 2",
  ENSINO_MEDIO: "Ensino Médio",
  CURSO_LIVRE: "Curso Livre",
};

export function getEducationStageLabel(stage: string) {
  return STAGE_LABELS[stage as EducationStage] ?? stage;
}

export const SERIES_OPTIONS_BY_STAGE: Record<EducationStage, string[]> = {
  EDUCACAO_INFANTIL: ["Berçário I", "Berçário II", "Maternal I", "Maternal II", "Jardim I", "Jardim II"],
  FUNDAMENTAL_1: ["1º Ano", "2º Ano", "3º Ano", "4º Ano", "5º Ano"],
  FUNDAMENTAL_2: ["6º Ano", "7º Ano", "8º Ano", "9º Ano"],
  ENSINO_MEDIO: ["1ª Série", "2ª Série", "3ª Série"],
  CURSO_LIVRE: [],
};

export const WEEKDAY_OPTIONS = [
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
  { value: 6, label: "Sábado" },
  { value: 7, label: "Domingo" },
] as const;

export function getWeekdayLabel(day: number) {
  return WEEKDAY_OPTIONS.find((item) => item.value === day)?.label ?? "Dia";
}
