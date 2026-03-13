"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { deleteLessonPlanAction, duplicateLessonPlanAction, saveLessonPlanAction } from "@/lib/actions/academic";

type PlanStatus = "DRAFT" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "HUMAN_REVIEW" | "MISSING";
type PersistedStatus = "DRAFT" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "HUMAN_REVIEW";

type CoordinationEntry = {
  scheduleId: string;
  classId: string;
  classSeries: string | null;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  className: string;
  subjectName: string;
  teacherName: string;
  lessonDate: string;
  plan: {
    id: string | null;
    content: string | null;
    objective: string | null;
    methodology: string | null;
    pillars: string | null;
    resources: string | null;
    classroom_activities: string | null;
    home_activities: string | null;
    ai_feedback: string | null;
    reviewer_comment: string | null;
    status: PlanStatus;
  };
};

type CoordinationDay = {
  value: number;
  label: string;
  lessonDate: string;
};

type CoordinationWeekGridProps = {
  classId: string;
  teacherId: string | null;
  className: string;
  weekStartIso: string;
  weekEndIso: string;
  previousWeekIso: string;
  nextWeekIso: string;
  previousMonthIso: string;
  nextMonthIso: string;
  days: CoordinationDay[];
  timeSlots: string[];
  entries: CoordinationEntry[];
  showPillars: boolean;
  duplicateClassTargets: Array<{
    classId: string;
    className: string;
    classSeries: string | null;
  }>;
  duplicateDateMin: string | null;
  duplicateDateMax: string | null;
};

const PILLAR_OPTIONS = ["Físico", "Socioafetivo", "Volitivo", "Cognitivo", "Transcendental"] as const;

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeFeedbackHtml(input: string) {
  let sanitized = input;
  sanitized = sanitized.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  sanitized = sanitized.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  sanitized = sanitized.replace(/\son\w+="[^"]*"/gi, "");
  sanitized = sanitized.replace(/\son\w+='[^']*'/gi, "");
  sanitized = sanitized.replace(/\s(href|src)\s*=\s*(['"])javascript:[\s\S]*?\2/gi, "");
  return sanitized;
}

function decodeHtmlEntities(input: string) {
  return input
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function toFeedbackDisplayHtml(raw: string) {
  const decoded = decodeHtmlEntities(raw);
  const hasHtmlTag = /<\/?[a-z][\s\S]*>/i.test(decoded);
  if (hasHtmlTag) {
    return sanitizeFeedbackHtml(decoded);
  }
  return `<p>${escapeHtml(decoded).replaceAll("\n", "<br />")}</p>`;
}

function getStatusStyles(status: PlanStatus) {
  if (status === "APPROVED") return "border-emerald-200 bg-emerald-50";
  if (status === "REJECTED") return "border-rose-200 bg-rose-50";
  if (status === "UNDER_REVIEW" || status === "HUMAN_REVIEW") return "border-yellow-200 bg-yellow-100";
  if (status === "DRAFT") return "border-sky-200 bg-sky-50";
  return "border-0 bg-orange-50/60";
}

function getStatusBadgeStyles(status: PlanStatus) {
  if (status === "APPROVED") return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  if (status === "REJECTED") return "bg-rose-100 text-rose-800 border border-rose-200";
  if (status === "UNDER_REVIEW" || status === "HUMAN_REVIEW") return "bg-yellow-100 text-yellow-800 border border-yellow-300";
  if (status === "DRAFT") return "bg-sky-100 text-sky-800 border border-sky-200";
  return "bg-orange-100 text-orange-800 border border-orange-300";
}

function getStatusLabel(status: PlanStatus) {
  if (status === "APPROVED") return "Aprovado";
  if (status === "REJECTED") return "Rejeitado";
  if (status === "UNDER_REVIEW" || status === "HUMAN_REVIEW") return "Em revisão";
  if (status === "DRAFT") return "Rascunho";
  return "Sem planejamento";
}

function getSavedStatusModalStyles(status: PlanStatus) {
  if (status === "APPROVED") return "bg-emerald-50";
  if (status === "REJECTED") return "bg-rose-50";
  if (status === "UNDER_REVIEW" || status === "HUMAN_REVIEW") return "bg-yellow-100";
  if (status === "DRAFT") return "bg-sky-50";
  return "bg-orange-50";
}

function formatDateRange(startIso: string, endIso: string) {
  const start = new Date(`${startIso}T12:00:00`).toLocaleDateString("pt-BR");
  const end = new Date(`${endIso}T12:00:00`).toLocaleDateString("pt-BR");
  return `${start} a ${end}`;
}

function normalizePersistedStatus(status: PlanStatus): PersistedStatus {
  if (status === "APPROVED" || status === "REJECTED" || status === "UNDER_REVIEW" || status === "HUMAN_REVIEW") {
    return status;
  }
  return "DRAFT";
}

function isoWeekdayFromDateInput(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.getDay() === 0 ? 7 : date.getDay();
}

function showLoadingOverlay(targetId: string) {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.setAttribute("data-loading", "true");
  const overlay = target.querySelector<HTMLElement>("[data-loading-overlay]");
  overlay?.classList.remove("hidden");
}

export function CoordinationWeekGrid({
  classId,
  teacherId,
  className,
  weekStartIso,
  weekEndIso,
  previousWeekIso,
  nextWeekIso,
  previousMonthIso,
  nextMonthIso,
  days,
  timeSlots,
  entries,
  showPillars,
  duplicateClassTargets,
  duplicateDateMin,
  duplicateDateMax,
}: CoordinationWeekGridProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [selectedPillars, setSelectedPillars] = useState<string[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<PersistedStatus>("DRAFT");
  const modalFormRef = useRef<HTMLFormElement | null>(null);
  const [optimisticStatusByKey, setOptimisticStatusByKey] = useState<Record<string, PlanStatus>>({});
  const [optimisticDeletedKeys, setOptimisticDeletedKeys] = useState<Record<string, boolean>>({});
  const [recentlyUpdatedCardKey, setRecentlyUpdatedCardKey] = useState<string | null>(null);
  const [duplicateSource, setDuplicateSource] = useState<CoordinationEntry | null>(null);
  const [duplicateTargetClassId, setDuplicateTargetClassId] = useState<string>("");
  const [duplicateTargetScheduleId, setDuplicateTargetScheduleId] = useState<string>("");
  const [duplicateTargetDate, setDuplicateTargetDate] = useState<string>("");
  const [duplicateScheduleTargets, setDuplicateScheduleTargets] = useState<
    Array<{ scheduleId: string; classId: string; dayOfWeek: number; label: string }>
  >([]);
  const [duplicateScheduleTargetsLoading, setDuplicateScheduleTargetsLoading] = useState(false);
  const [duplicateScheduleTargetsError, setDuplicateScheduleTargetsError] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const target = document.getElementById("coord-grid-zone");
    if (!target) return;
    target.removeAttribute("data-loading");
    const overlay = target.querySelector<HTMLElement>("[data-loading-overlay]");
    overlay?.classList.add("hidden");
  }, [pathname, searchParams]);

  const effectiveEntries = useMemo(
    () =>
      entries.map((entry) => {
        const entryKey = `${entry.scheduleId}-${entry.lessonDate}`;
        if (!optimisticDeletedKeys[entryKey]) return entry;
        return {
          ...entry,
          plan: {
            ...entry.plan,
            id: null,
            content: null,
            objective: null,
            methodology: null,
            pillars: null,
            resources: null,
            classroom_activities: null,
            home_activities: null,
            ai_feedback: null,
            reviewer_comment: null,
            status: "MISSING" as PlanStatus,
          },
        };
      }),
    [entries, optimisticDeletedKeys],
  );

  const entriesByCell = useMemo(() => {
    const map = new Map<string, CoordinationEntry[]>();
    effectiveEntries.forEach((entry) => {
      const key = `${entry.dayOfWeek}|${entry.startsAt}`;
      const current = map.get(key) ?? [];
      current.push(entry);
      map.set(key, current);
    });
    return map;
  }, [effectiveEntries]);

  const activeEntry = useMemo(
    () => effectiveEntries.find((entry) => `${entry.scheduleId}-${entry.lessonDate}` === activeKey) ?? null,
    [activeKey, effectiveEntries],
  );
  const eligibleTargetClasses = useMemo(() => {
    if (!duplicateSource) return [];
    return duplicateClassTargets
      .filter((target) => {
        if (!duplicateSource.classSeries) return true;
        return target.classSeries === duplicateSource.classSeries;
      })
      .sort((a, b) => a.className.localeCompare(b.className, "pt-BR"))
      .map((item) => ({ classId: item.classId, className: item.className }));
  }, [duplicateClassTargets, duplicateSource]);

  const effectiveTargetClassId =
    duplicateTargetClassId && eligibleTargetClasses.some((item) => item.classId === duplicateTargetClassId)
      ? duplicateTargetClassId
      : "";
  const visibleScheduleTargets = useMemo(() => duplicateScheduleTargets, [duplicateScheduleTargets]);
  const effectiveTargetScheduleId =
    duplicateTargetScheduleId && visibleScheduleTargets.some((item) => item.scheduleId === duplicateTargetScheduleId)
      ? duplicateTargetScheduleId
      : "";
  const selectedTargetSchedule = visibleScheduleTargets.find((item) => item.scheduleId === effectiveTargetScheduleId);
  const duplicateDateWeekday = isoWeekdayFromDateInput(duplicateTargetDate);
  const isDuplicateDateCompatible =
    !selectedTargetSchedule || !duplicateDateWeekday ? true : duplicateDateWeekday === selectedTargetSchedule.dayOfWeek;

  useEffect(() => {
    async function loadTargetsByClass() {
      if (!duplicateSource || !effectiveTargetClassId) {
        setDuplicateScheduleTargets([]);
        setDuplicateScheduleTargetsError(null);
        setDuplicateScheduleTargetsLoading(false);
        return;
      }

      setDuplicateScheduleTargetsLoading(true);
      setDuplicateScheduleTargetsError(null);
      setDuplicateScheduleTargets([]);
      setDuplicateTargetScheduleId("");

      try {
        const response = await fetch(`/api/schedule-targets?class_id=${encodeURIComponent(effectiveTargetClassId)}`);
        const result = (await response.json()) as {
          targets?: Array<{ scheduleId: string; classId: string; dayOfWeek: number; label: string }>;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(result.error || "Não foi possível carregar horários da turma de destino.");
        }

        setDuplicateScheduleTargets(result.targets ?? []);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao carregar horários da turma.";
        setDuplicateScheduleTargetsError(message);
      } finally {
        setDuplicateScheduleTargetsLoading(false);
      }
    }

    void loadTargetsByClass();
  }, [duplicateSource, effectiveTargetClassId]);

  const modalFormId = activeEntry ? `coord-plan-form-${activeEntry.scheduleId}-${activeEntry.lessonDate}` : "coord-plan-form";
  const buildNavigationHref = (weekIso: string) => {
    const params = new URLSearchParams();
    if (classId) params.set("class_id", classId);
    if (teacherId) params.set("teacher_id", teacherId);
    params.set("week", weekIso);
    return `/coordenacao?${params.toString()}`;
  };

  const displayedStatus: PlanStatus = isDirty
    ? "DRAFT"
    : ((submitStatus as PlanStatus) ?? (activeEntry?.plan.status ?? "MISSING"));
  const savedStatus = (activeEntry?.plan.status ?? "MISSING") as PlanStatus;
  const modalBackgroundStatus = (isDirty ? "DRAFT" : displayedStatus) || savedStatus;

  function setCardSavedAnimation(cardKey: string) {
    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
    setRecentlyUpdatedCardKey(cardKey);
    highlightTimeoutRef.current = window.setTimeout(() => {
      setRecentlyUpdatedCardKey(null);
      highlightTimeoutRef.current = null;
    }, 1100);
  }

  function openModal(entry: CoordinationEntry) {
    setActiveKey(`${entry.scheduleId}-${entry.lessonDate}`);
    setIsDirty(false);
    const initialStatus = normalizePersistedStatus(entry.plan.status);
    setSubmitStatus(initialStatus);
    const parsedPillars = (entry.plan.pillars ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    setSelectedPillars(parsedPillars);
  }

  function markAsDirty() {
    if (!isDirty) setIsDirty(true);
    setSubmitStatus("DRAFT");
  }

  function togglePillar(pillar: string) {
    setSelectedPillars((current) => {
      const next = current.includes(pillar) ? current.filter((item) => item !== pillar) : [...current, pillar];
      return next;
    });
    markAsDirty();
  }

  function setPendingStatus(status: PersistedStatus) {
    setIsDirty(false);
    setSubmitStatus(status);
  }

  function persistWithSave(closeAfterSubmit = false) {
    if (!modalFormRef.current || !activeEntry) return;
    const key = `${activeEntry.scheduleId}-${activeEntry.lessonDate}`;
    const nextStatus = submitStatus as PlanStatus;
    setOptimisticStatusByKey((current) => ({ ...current, [key]: nextStatus }));
    setCardSavedAnimation(key);
    modalFormRef.current.requestSubmit();
    if (closeAfterSubmit) {
      setActiveKey(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white p-4">
        <p className="text-sm text-[var(--muted)]">
          Turma: <strong className="text-[var(--brand-blue)]">{className}</strong>
        </p>
        <div className="flex items-center gap-2">
          <Link
            href={buildNavigationHref(previousMonthIso)}
            onClick={() => showLoadingOverlay("coord-grid-zone")}
            className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm hover:bg-[var(--panel-soft)]"
          >
            Mês anterior
          </Link>
          <Link
            href={buildNavigationHref(previousWeekIso)}
            onClick={() => showLoadingOverlay("coord-grid-zone")}
            className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm hover:bg-[var(--panel-soft)]"
          >
            Semana anterior
          </Link>
          <span className="rounded-lg bg-[var(--panel-soft)] px-3 py-1 text-sm text-[var(--brand-blue)]">{formatDateRange(weekStartIso, weekEndIso)}</span>
          <Link
            href={buildNavigationHref(nextWeekIso)}
            onClick={() => showLoadingOverlay("coord-grid-zone")}
            className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm hover:bg-[var(--panel-soft)]"
          >
            Próxima semana
          </Link>
          <Link
            href={buildNavigationHref(nextMonthIso)}
            onClick={() => showLoadingOverlay("coord-grid-zone")}
            className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm hover:bg-[var(--panel-soft)]"
          >
            Próximo mês
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--panel-soft)] text-[var(--muted)]">
            <tr>
              <th className="w-24 px-3 py-2">Horário</th>
              {days.map((day) => (
                <th key={`head-${day.value}`} className="px-3 py-2">
                  {day.label} · {new Date(`${day.lessonDate}T12:00:00`).toLocaleDateString("pt-BR")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeSlots.length === 0 ? (
              <tr className="border-t border-[var(--line)]">
                <td className="px-3 py-6 text-center text-[var(--muted)]" colSpan={days.length + 1}>
                  Sem aulas nesta semana.
                </td>
              </tr>
            ) : null}
            {timeSlots.map((slot) => (
              <tr key={`slot-${slot}`} className="border-t border-[var(--line)] align-top">
                <td className="px-3 py-3 text-xs font-semibold whitespace-nowrap text-[var(--brand-blue)]">{slot.slice(0, 5)}</td>
                {days.map((day) => {
                  const slotEntries = entriesByCell.get(`${day.value}|${slot}`) ?? [];
                  return (
                    <td key={`cell-${day.value}-${slot}`} className="px-2 py-2">
                      <div className="space-y-2">
                        {slotEntries.length === 0 ? (
                          <div className="min-h-14 rounded-lg border border-dashed border-[var(--line)] bg-[var(--panel-soft)]/40" />
                        ) : null}
                        {slotEntries.map((entry) => {
                          const entryKey = `${entry.scheduleId}-${entry.lessonDate}`;
                          const status = optimisticDeletedKeys[entryKey]
                            ? "MISSING"
                            : optimisticStatusByKey[entryKey] ?? entry.plan.status ?? "MISSING";
                          const isRecentlyUpdated = recentlyUpdatedCardKey === entryKey;
                          return (
                            <article
                              key={entryKey}
                              role="button"
                              tabIndex={0}
                              onClick={() => openModal(entry)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  openModal(entry);
                                }
                              }}
                              className={`rounded-xl border p-2 transition-all duration-500 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(8,33,63,0.14)] ${getStatusStyles(status)} ${
                                isRecentlyUpdated ? "ring-2 ring-[var(--primary)] shadow-[0_14px_30px_rgba(8,33,63,0.18)]" : ""
                              } cursor-pointer`}
                            >
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold">{entry.subjectName}</p>
                                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-[var(--brand-blue)]">{getStatusLabel(status)}</span>
                              </div>
                              <p className="text-xs text-[var(--muted)]">{entry.teacherName}</p>
                              <p className="text-xs text-[var(--brand-blue)]">
                                {entry.startsAt.slice(0, 5)} - {entry.endsAt.slice(0, 5)}
                              </p>
                              {entry.plan.id ? (
                                <div className="mt-2">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setDuplicateSource(entry);
                                      setDuplicateTargetClassId("");
                                      setDuplicateTargetScheduleId("");
                                      setDuplicateTargetDate(entry.lessonDate);
                                      setDuplicateScheduleTargets([]);
                                      setDuplicateScheduleTargetsError(null);
                                      setDuplicateScheduleTargetsLoading(false);
                                    }}
                                    className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-[11px] hover:bg-[var(--panel-soft)]"
                                  >
                                    Duplicar
                                  </button>
                                </div>
                              ) : null}
                            </article>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {activeEntry ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(7,26,52,0.56)] p-3 md:p-8">
          <div className={`w-full max-w-5xl rounded-2xl border border-[var(--line)] shadow-[0_20px_60px_rgba(8,33,63,0.34)] ${getSavedStatusModalStyles(modalBackgroundStatus)}`}>
            <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-white px-4 py-3">
              <div>
                <h3 className="text-base font-semibold text-[var(--brand-blue)]">Revisão de Planejamento</h3>
                <p className="text-xs text-[var(--muted)]">
                  {activeEntry.className} · {activeEntry.subjectName} · {new Date(`${activeEntry.lessonDate}T12:00:00`).toLocaleDateString("pt-BR")} · {" "}
                  {activeEntry.startsAt.slice(0, 5)} - {activeEntry.endsAt.slice(0, 5)}
                </p>
              </div>
              <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${getStatusBadgeStyles(displayedStatus)}`}>{getStatusLabel(displayedStatus)}</span>
            </div>

            <div className="max-h-[calc(90vh-130px)] overflow-y-auto p-4">
              <form
                id={modalFormId}
                key={`${activeEntry.scheduleId}-${activeEntry.lessonDate}-${activeEntry.plan.id ?? "new"}`}
                ref={modalFormRef}
                action={saveLessonPlanAction}
                className="grid gap-3"
              >
                <input type="hidden" name="id" value={activeEntry.plan.id ?? ""} />
                <input type="hidden" name="class_schedule_id" value={activeEntry.scheduleId} />
                <input type="hidden" name="lesson_date" value={activeEntry.lessonDate} />
                <input type="hidden" name="status" value={submitStatus} />
                <input type="hidden" name="ai_feedback" value={activeEntry.plan.ai_feedback ?? ""} />
                <input type="hidden" name="pillars" value={showPillars ? selectedPillars.join(", ") : activeEntry.plan.pillars ?? ""} />

                {activeEntry.plan.ai_feedback ? (
                  <section className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-sm">
                    <p className="text-xs font-semibold text-indigo-800">Último feedback de IA</p>
                    <div
                      className="mt-2 space-y-2 text-[13px] leading-relaxed text-[var(--brand-blue)] [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold"
                      dangerouslySetInnerHTML={{ __html: toFeedbackDisplayHtml(activeEntry.plan.ai_feedback) }}
                    />
                  </section>
                ) : null}

                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Conteúdo</span>
                  <textarea name="content" defaultValue={activeEntry.plan.content ?? ""} onChange={markAsDirty} className="fasy-input min-h-28" placeholder="Descreva o conteúdo da aula." />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Objetivo</span>
                  <textarea name="objective" defaultValue={activeEntry.plan.objective ?? ""} onChange={markAsDirty} className="fasy-input min-h-24" placeholder="Qual o objetivo de aprendizagem?" />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Metodologia</span>
                  <textarea name="methodology" defaultValue={activeEntry.plan.methodology ?? ""} onChange={markAsDirty} className="fasy-input min-h-24" placeholder="Como a aula será conduzida?" />
                </label>

                {showPillars ? (
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">Pilares</span>
                    <div className="grid gap-2 rounded-xl border border-[var(--line)] bg-white p-3 sm:grid-cols-2">
                      {PILLAR_OPTIONS.map((pillar) => (
                        <label key={pillar} className="flex items-center gap-2 text-sm text-[var(--brand-blue)]">
                          <input
                            type="checkbox"
                            checked={selectedPillars.includes(pillar)}
                            onChange={() => togglePillar(pillar)}
                            className="h-4 w-4 rounded border-[var(--line)]"
                          />
                          <span>{pillar}</span>
                        </label>
                      ))}
                    </div>
                  </label>
                ) : null}

                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Recursos</span>
                  <textarea name="resources" defaultValue={activeEntry.plan.resources ?? ""} onChange={markAsDirty} className="fasy-input min-h-20" placeholder="Materiais usados na aula." />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Atividades em Sala</span>
                  <textarea name="classroom_activities" defaultValue={activeEntry.plan.classroom_activities ?? ""} onChange={markAsDirty} className="fasy-input min-h-24" placeholder="Descreva as atividades realizadas em sala." />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Atividades em Casa</span>
                  <textarea name="home_activities" defaultValue={activeEntry.plan.home_activities ?? ""} onChange={markAsDirty} className="fasy-input min-h-20" placeholder="Descreva o dever de casa (se houver)." />
                </label>

                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Parecer da Coordenação</span>
                  <textarea
                    name="reviewer_comment"
                    defaultValue={activeEntry.plan.reviewer_comment ?? ""}
                    onChange={markAsDirty}
                    className="fasy-input min-h-20"
                    placeholder="Comentário de aprovação, ajustes ou devolutiva ao professor."
                  />
                </label>
              </form>
            </div>

            <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--line)] bg-white px-4 py-3">
              <button type="button" onClick={() => setPendingStatus("DRAFT")} className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-800 hover:bg-sky-100">
                Rascunho
              </button>
              <button type="button" onClick={() => setPendingStatus("HUMAN_REVIEW")} className="rounded-lg border border-yellow-300 bg-yellow-100 px-3 py-2 text-sm text-yellow-800 hover:bg-yellow-200">
                Em revisão
              </button>
              <button type="button" onClick={() => setPendingStatus("REJECTED")} className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 hover:bg-rose-100">
                Rejeitar
              </button>
              <button type="button" onClick={() => setPendingStatus("APPROVED")} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 hover:bg-emerald-100">
                Aprovar
              </button>

              {activeEntry.plan.id ? (
                <form action={deleteLessonPlanAction}>
                  <input type="hidden" name="id" value={activeEntry.plan.id} />
                  <SubmitButton
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 hover:bg-rose-100"
                    pendingLabel="Excluindo..."
                    onClick={(event) => {
                      if (!window.confirm("Tem certeza que deseja excluir este planejamento?")) {
                        event.preventDefault();
                        return;
                      }
                      const key = `${activeEntry.scheduleId}-${activeEntry.lessonDate}`;
                      setOptimisticDeletedKeys((current) => ({ ...current, [key]: true }));
                      setOptimisticStatusByKey((current) => ({ ...current, [key]: "MISSING" }));
                      setCardSavedAnimation(key);
                      setActiveKey(null);
                    }}
                  >
                    Excluir
                  </SubmitButton>
                </form>
              ) : null}

              <button type="button" onClick={() => setActiveKey(null)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--panel-soft)]">
                Cancelar
              </button>
              <button type="button" onClick={() => persistWithSave(true)} className="fasy-btn-primary px-3 py-2 text-sm">
                Salvar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {duplicateSource ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(7,26,52,0.56)] p-3">
          <div className="w-full max-w-2xl rounded-2xl border border-[var(--line)] bg-white p-4 shadow-[0_20px_60px_rgba(8,33,63,0.34)]">
            <h3 className="text-base font-semibold text-[var(--brand-blue)]">Duplicar planejamento</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Origem: {duplicateSource.className} · {duplicateSource.subjectName} · {duplicateSource.teacherName} ·{" "}
              {new Date(`${duplicateSource.lessonDate}T12:00:00`).toLocaleDateString("pt-BR")} · {duplicateSource.startsAt.slice(0, 5)}
            </p>
            <form
              action={duplicateLessonPlanAction}
              className="mt-4 grid gap-3"
              onSubmit={() => {
                window.setTimeout(() => setDuplicateSource(null), 120);
              }}
            >
              <input type="hidden" name="source_id" value={duplicateSource.plan.id ?? ""} />
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Turma de destino</span>
                <select
                  value={effectiveTargetClassId}
                  onChange={(event) => {
                    setDuplicateTargetClassId(event.currentTarget.value);
                    setDuplicateTargetScheduleId("");
                  }}
                  className="fasy-input"
                  required
                >
                  <option value="" disabled>
                    Selecione a turma
                  </option>
                  {eligibleTargetClasses.length === 0 ? (
                    <option value="">Sem turmas compatíveis</option>
                  ) : null}
                  {eligibleTargetClasses.map((item) => (
                    <option key={`coord-dup-class-${item.classId}`} value={item.classId}>
                      {item.className}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Horário de destino</span>
                <select
                  name="target_schedule_id"
                  value={effectiveTargetScheduleId}
                  onChange={(event) => setDuplicateTargetScheduleId(event.currentTarget.value)}
                  className="fasy-input"
                  required
                  disabled={!effectiveTargetClassId || duplicateScheduleTargetsLoading}
                >
                  <option value="" disabled>
                    {duplicateScheduleTargetsLoading
                      ? "Carregando horários..."
                      : !effectiveTargetClassId
                        ? "Selecione a turma primeiro"
                        : "Selecione o destino"}
                  </option>
                  {visibleScheduleTargets.map((item) => (
                    <option key={`coord-dup-target-${item.scheduleId}`} value={item.scheduleId}>
                      {item.label}
                    </option>
                  ))}
                </select>
                {duplicateScheduleTargetsError ? (
                  <p className="text-xs text-rose-700">{duplicateScheduleTargetsError}</p>
                ) : null}
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Data de destino</span>
                <input
                  type="date"
                  name="target_lesson_date"
                  value={duplicateTargetDate}
                  min={duplicateDateMin ?? undefined}
                  max={duplicateDateMax ?? undefined}
                  onChange={(event) => setDuplicateTargetDate(event.currentTarget.value)}
                  className="fasy-input"
                  required
                />
                {!isDuplicateDateCompatible ? (
                  <p className="text-xs text-rose-700">A data precisa cair no mesmo dia da semana do horário de destino.</p>
                ) : null}
              </label>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDuplicateSource(null)}
                  className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--panel-soft)]"
                >
                  Cancelar
                </button>
                <SubmitButton
                  pendingLabel="Duplicando..."
                  disabled={!isDuplicateDateCompatible || !effectiveTargetScheduleId}
                  className="fasy-btn-primary px-3 py-2 text-sm"
                >
                  Confirmar duplicação
                </SubmitButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
