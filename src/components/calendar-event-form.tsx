"use client";

import { useMemo, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { STAGE_OPTIONS, type EducationStage } from "@/lib/constants";

type EventFormClass = {
  id: string;
  name: string;
  series: string | null;
  stage: EducationStage;
};

type CalendarEventFormProps = {
  action: (formData: FormData) => Promise<void>;
  classes: EventFormClass[];
  schoolYearStart: string | null;
  schoolYearEnd: string | null;
};

const STAGE_LABELS: Record<EducationStage, string> = {
  EDUCACAO_INFANTIL: "Educação Infantil",
  FUNDAMENTAL_1: "Fundamental 1",
  FUNDAMENTAL_2: "Fundamental 2",
  ENSINO_MEDIO: "Ensino Médio",
  CURSO_LIVRE: "Curso Livre",
};

export function CalendarEventForm({ action, classes, schoolYearStart, schoolYearEnd }: CalendarEventFormProps) {
  const [selectedStages, setSelectedStages] = useState<Set<EducationStage>>(new Set());
  const [selectedSeries, setSelectedSeries] = useState<Set<string>>(new Set());
  const [manuallySelectedClassIds, setManuallySelectedClassIds] = useState<Set<string>>(new Set());
  const [isAdministrative, setIsAdministrative] = useState(false);

  const seriesByStage = useMemo(() => {
    const map = new Map<EducationStage, string[]>();
    for (const stage of STAGE_OPTIONS) {
      const series = Array.from(new Set(classes.filter((item) => item.stage === stage).map((item) => item.series).filter(Boolean) as string[]))
        .sort((a, b) => a.localeCompare(b, "pt-BR"));
      map.set(stage, series);
    }
    return map;
  }, [classes]);

  const allSeriesSorted = useMemo(
    () => Array.from(new Set(classes.map((item) => item.series).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [classes],
  );

  const derivedSelectedSeries = useMemo(() => {
    const next = new Set(selectedSeries);
    for (const stage of selectedStages) {
      const stageSeries = seriesByStage.get(stage) ?? [];
      stageSeries.forEach((series) => next.add(series));
    }
    return next;
  }, [selectedSeries, selectedStages, seriesByStage]);

  const derivedSelectedClassIds = useMemo(() => {
    const next = new Set(manuallySelectedClassIds);
    for (const classItem of classes) {
      if (selectedStages.has(classItem.stage)) {
        next.add(classItem.id);
        continue;
      }
      if (classItem.series && derivedSelectedSeries.has(classItem.series)) {
        next.add(classItem.id);
      }
    }
    return next;
  }, [manuallySelectedClassIds, classes, selectedStages, derivedSelectedSeries]);

  function toggleStage(stage: EducationStage, checked: boolean) {
    setSelectedStages((current) => {
      const next = new Set(current);
      if (checked) next.add(stage);
      else next.delete(stage);
      return next;
    });
  }

  function toggleSeries(series: string, checked: boolean) {
    setSelectedSeries((current) => {
      const next = new Set(current);
      if (checked) next.add(series);
      else next.delete(series);
      return next;
    });

  }

  function toggleClass(classId: string, checked: boolean) {
    setManuallySelectedClassIds((current) => {
      const next = new Set(current);
      if (checked) next.add(classId);
      else next.delete(classId);
      return next;
    });
  }

  function handleAdministrativeToggle(checked: boolean) {
    setIsAdministrative(checked);
    if (checked) {
      setSelectedStages(new Set());
      setSelectedSeries(new Set());
      setManuallySelectedClassIds(new Set());
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white p-4">
      <h3 className="text-sm font-semibold text-[var(--brand-blue)]">Cadastrar evento</h3>
      <form action={action} className="mt-3 grid gap-3">
        <div className="grid gap-3 lg:grid-cols-3">
          <input name="title" className="fasy-input" placeholder="Nome do evento" required />
          <input
            name="event_date"
            type="date"
            className="fasy-input"
            min={schoolYearStart ?? undefined}
            max={schoolYearEnd ?? undefined}
            required
          />
          <select name="event_type" className="fasy-input" defaultValue="PROGRAMACAO">
            <option value="FERIADO">Feriado</option>
            <option value="COMEMORACAO">Comemoração</option>
            <option value="PROGRAMACAO">Programação</option>
          </select>
        </div>

        <textarea name="description" className="fasy-input min-h-24" placeholder="Descrição do evento" />

        <div className="grid gap-3 lg:grid-cols-2">
          <fieldset className={`rounded-xl border p-3 ${isAdministrative ? "border-[var(--line)] bg-[var(--panel-soft)]/40 opacity-70" : "border-[var(--line)]"}`}>
            <legend className="px-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Etapas</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {STAGE_OPTIONS.map((stage) => (
                <label key={`stage-${stage}`} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="target_stages"
                    value={stage}
                    checked={selectedStages.has(stage)}
                    disabled={isAdministrative}
                    onChange={(event) => toggleStage(stage, event.currentTarget.checked)}
                    className="h-4 w-4"
                  />
                  <span>{STAGE_LABELS[stage]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className={`rounded-xl border p-3 ${isAdministrative ? "border-[var(--line)] bg-[var(--panel-soft)]/40 opacity-70" : "border-[var(--line)]"}`}>
            <legend className="px-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Séries</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {allSeriesSorted.length === 0 ? <p className="text-xs text-[var(--muted)]">Sem séries cadastradas.</p> : null}
              {allSeriesSorted.map((series) => (
                <label key={`series-${series}`} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="target_series"
                    value={series}
                    checked={derivedSelectedSeries.has(series)}
                    disabled={isAdministrative}
                    onChange={(event) => toggleSeries(series, event.currentTarget.checked)}
                    className="h-4 w-4"
                  />
                  <span>{series}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <fieldset className={`rounded-xl border p-3 ${isAdministrative ? "border-[var(--line)] bg-[var(--panel-soft)]/40 opacity-70" : "border-[var(--line)]"}`}>
          <legend className="px-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Turmas específicas</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {classes.length === 0 ? <p className="text-xs text-[var(--muted)]">Sem turmas cadastradas.</p> : null}
            {classes.map((classItem) => (
              <label key={`class-${classItem.id}`} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="target_class_ids"
                  value={classItem.id}
                  checked={derivedSelectedClassIds.has(classItem.id)}
                  disabled={isAdministrative}
                  onChange={(event) => toggleClass(classItem.id, event.currentTarget.checked)}
                  className="h-4 w-4"
                />
                <span>
                  {classItem.name} · {STAGE_LABELS[classItem.stage]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="is_administrative"
              checked={isAdministrative}
              onChange={(event) => handleAdministrativeToggle(event.currentTarget.checked)}
              className="h-4 w-4"
            />
            <span>Evento administrativo (visível somente para o staff)</span>
          </label>
          <input type="file" name="attachment_file" accept=".pdf,image/*" className="fasy-input text-sm" />
        </div>

        <div>
          <SubmitButton className="fasy-btn-primary px-4 py-2 text-sm" pendingLabel="Salvando...">
            Cadastrar evento
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}
