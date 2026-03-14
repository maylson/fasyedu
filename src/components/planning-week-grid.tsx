"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import {
  addLessonPlanLinkResourceAction,
  deleteLessonPlanAction,
  deleteLessonPlanResourceAction,
  duplicateLessonPlanAction,
  saveLessonPlanAction,
  saveLessonPlanFormAction,
  uploadLessonPlanFileResourceAction,
} from "@/lib/actions/academic";

type PlanStatus = "DRAFT" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "HUMAN_REVIEW" | "MISSING";
type PersistedStatus = "DRAFT" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "HUMAN_REVIEW";

type PlanResource = {
  id: string;
  resource_type: "LINK" | "FILE";
  label: string | null;
  url: string | null;
  file_name: string | null;
  file_size: number | null;
  file_url: string | null;
};

type PlanningEntry = {
  scheduleId: string;
  classId: string;
  classSeries: string | null;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  className: string;
  subjectName: string;
  lessonDate: string;
  plan: {
    id: string | null;
    title: string | null;
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
  resources: PlanResource[];
};

type OptimisticPlanSnapshot = {
  id: string | null;
  title: string | null;
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

type PlanningDay = {
  value: number;
  label: string;
  lessonDate: string;
};

type PlanningWeekGridProps = {
  weekStartIso: string;
  weekEndIso: string;
  previousWeekIso: string;
  nextWeekIso: string;
  previousMonthIso: string;
  nextMonthIso: string;
  teacherName: string;
  days: PlanningDay[];
  timeSlots: string[];
  entries: PlanningEntry[];
  showPillars: boolean;
  duplicateClassTargets: Array<{
    classId: string;
    className: string;
    classSeries: string | null;
  }>;
  duplicateDateMin: string | null;
  duplicateDateMax: string | null;
  initialOpenScheduleId?: string;
  initialOpenLessonDate?: string;
};

type WizardStatus = "APPROVED" | "REJECTED" | "HUMAN_REVIEW";
const PILLAR_OPTIONS = ["Físico", "Socioafetivo", "Volitivo", "Cognitivo", "Transcendental"] as const;
const WIZARD_WAITING_TEXTS = [
  "<p><i>Estamos agora em um processo detalhado de análise do seu planejamento de aula. Isso inclui uma revisão minuciosa dos objetivos, metodologia e recursos propostos. Aguarde um pouco enquanto finalizamos esta análise importante.</i></p>",
  "<p><i>Seu planejamento está passando por uma verificação completa em nossos sistemas. Estamos analisando cada aspecto para garantir alinhamento com boas práticas pedagógicas. Obrigado por aguardar.</i></p>",
  "<p><i>Estamos em uma fase crítica de análise do seu planejamento. Revisamos objetivos, metodologia e recursos para garantir coerência didática. Em breve traremos uma avaliação detalhada.</i></p>",
  "<p><i>O processamento do seu planejamento está em andamento. Revisamos cada componente para assegurar qualidade pedagógica. Agradecemos sua paciência por mais alguns instantes.</i></p>",
  "<p><i>Estamos verificando todos os detalhes do seu planejamento com máxima atenção. Este tempo é necessário para garantir uma análise cuidadosa e útil para sua aula.</i></p>",
  "<p><i>Seu planejamento está em fase rigorosa de análise. Examinamos objetivos, metodologia, recursos e linguagem para garantir qualidade. Em breve você verá o feedback completo.</i></p>",
  "<p><i>Estamos quase terminando a verificação do seu planejamento de aula. Obrigado por aguardar enquanto concluímos esta etapa de análise minuciosa.</i></p>",
  "<p><i>Estamos analisando seu planejamento com atenção de detetive: cada detalhe importa. Aguarde só mais um pouco para receber o veredito pedagógico.</i></p>",
  "<p><i>Sabe aquela espera da pipoca no micro-ondas? Estamos nessa, revisando tudo com cuidado para entregar uma análise completa e útil. Já já termina.</i></p>",
  "<p><i>Seu planejamento está em boas mãos. Estamos conferindo objetivos, metodologia e recursos para garantir consistência. Em instantes exibiremos o feedback.</i></p>",
];

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

function toFeedbackDisplayHtml(raw: string, forcePlainText = false) {
  const decoded = decodeHtmlEntities(raw);
  if (forcePlainText) {
    return `<p>${escapeHtml(decoded).replaceAll("\n", "<br />")}</p>`;
  }
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

function getSavedStatusModalStyles(status: PlanStatus) {
  if (status === "APPROVED") return "bg-emerald-50";
  if (status === "REJECTED") return "bg-rose-50";
  if (status === "UNDER_REVIEW" || status === "HUMAN_REVIEW") return "bg-yellow-100";
  if (status === "DRAFT") return "bg-sky-50";
  return "bg-orange-50";
}

function getStatusLabel(status: PlanStatus) {
  if (status === "APPROVED") return "Aprovado";
  if (status === "REJECTED") return "Rejeitado";
  if (status === "UNDER_REVIEW") return "Em revisão";
  if (status === "HUMAN_REVIEW") return "Revisão Humana";
  if (status === "DRAFT") return "Rascunho";
  return "Sem planejamento";
}

function formatDateRange(startIso: string, endIso: string) {
  const start = new Date(`${startIso}T12:00:00`).toLocaleDateString("pt-BR");
  const end = new Date(`${endIso}T12:00:00`).toLocaleDateString("pt-BR");
  return `${start} a ${end}`;
}

function formatDatePtBr(dateIso: string) {
  return new Date(`${dateIso}T12:00:00`).toLocaleDateString("pt-BR");
}

function formatBytes(value: number | null) {
  if (!value) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
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

export function PlanningWeekGrid({
  weekStartIso,
  weekEndIso,
  previousWeekIso,
  nextWeekIso,
  previousMonthIso,
  nextMonthIso,
  teacherName,
  days,
  timeSlots,
  entries,
  showPillars,
  duplicateClassTargets,
  duplicateDateMin,
  duplicateDateMax,
  initialOpenScheduleId,
  initialOpenLessonDate,
}: PlanningWeekGridProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [wizardText, setWizardText] = useState("");
  const [wizardStatus, setWizardStatus] = useState<WizardStatus | null>(null);
  const [wizardBusy, setWizardBusy] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [showWizardPanel, setShowWizardPanel] = useState(false);
  const [wizardStreamingPlainPreview, setWizardStreamingPlainPreview] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<PersistedStatus>("DRAFT");
  const [selectedPillars, setSelectedPillars] = useState<string[]>([]);
  const [optimisticStatusByKey, setOptimisticStatusByKey] = useState<Record<string, PlanStatus>>({});
  const [optimisticDeletedKeys, setOptimisticDeletedKeys] = useState<Record<string, boolean>>({});
  const [optimisticPlanByKey, setOptimisticPlanByKey] = useState<Record<string, OptimisticPlanSnapshot>>({});
  const [recentlyUpdatedCardKey, setRecentlyUpdatedCardKey] = useState<string | null>(null);
  const [duplicateSource, setDuplicateSource] = useState<PlanningEntry | null>(null);
  const [duplicateTargetClassId, setDuplicateTargetClassId] = useState<string>("");
  const [duplicateTargetScheduleId, setDuplicateTargetScheduleId] = useState<string>("");
  const [duplicateTargetDate, setDuplicateTargetDate] = useState<string>("");
  const [duplicateScheduleTargets, setDuplicateScheduleTargets] = useState<
    Array<{ scheduleId: string; classId: string; dayOfWeek: number; label: string }>
  >([]);
  const [duplicateScheduleTargetsLoading, setDuplicateScheduleTargetsLoading] = useState(false);
  const [duplicateScheduleTargetsError, setDuplicateScheduleTargetsError] = useState<string | null>(null);
  const submitStatusRef = useRef<PersistedStatus>("DRAFT");
  const latestWizardFeedbackRef = useRef("");
  const [isPending, startTransition] = useTransition();
  const [deletingPlanKey, setDeletingPlanKey] = useState<string | null>(null);
  const [savingPlanKey, setSavingPlanKey] = useState<string | null>(null);
  const modalFormRef = useRef<HTMLFormElement | null>(null);
  const waitingIntervalRef = useRef<number | null>(null);
  const wizardTypingIntervalRef = useRef<number | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const autoOpenDoneRef = useRef(false);

  useEffect(() => {
    const target = document.getElementById("planning-grid-zone");
    if (!target) return;
    target.removeAttribute("data-loading");
    const overlay = target.querySelector<HTMLElement>("[data-loading-overlay]");
    overlay?.classList.add("hidden");
  }, [pathname, searchParams]);

  function clearWaitingStreaming() {
    if (waitingIntervalRef.current !== null) {
      window.clearInterval(waitingIntervalRef.current);
      waitingIntervalRef.current = null;
    }
  }

  function clearWizardTypingStreaming() {
    if (wizardTypingIntervalRef.current !== null) {
      window.clearInterval(wizardTypingIntervalRef.current);
      wizardTypingIntervalRef.current = null;
    }
  }

  function stopWizardStreaming(resetText = false) {
    clearWaitingStreaming();
    clearWizardTypingStreaming();
    setWizardStreamingPlainPreview(false);
    if (resetText) {
      setWizardText("");
    }
  }

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

  function startWaitingStreaming() {
    clearWaitingStreaming();
    const waitingHtml = WIZARD_WAITING_TEXTS[Math.floor(Math.random() * WIZARD_WAITING_TEXTS.length)];
    const waitingPlain = waitingHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    let idx = 0;
    setWizardStreamingPlainPreview(true);
    setWizardText("");
    waitingIntervalRef.current = window.setInterval(() => {
      idx += 2;
      if (idx >= waitingPlain.length) {
        setWizardText(waitingPlain);
        clearWaitingStreaming();
        return;
      }
      setWizardText(waitingPlain.slice(0, idx));
    }, 18);
  }

  const effectiveEntries = useMemo(
    () =>
      entries.map((entry) => {
        const entryKey = `${entry.scheduleId}-${entry.lessonDate}`;
        if (optimisticDeletedKeys[entryKey]) {
          return {
            ...entry,
            plan: {
              ...entry.plan,
              id: null,
              title: null,
              content: null,
              objective: null,
              methodology: null,
              pillars: null,
              resources: null,
              classroom_activities: null,
              home_activities: null,
              ai_feedback: null,
              status: "MISSING" as PlanStatus,
            },
            resources: [],
          };
        }
        const optimisticPlan = optimisticPlanByKey[entryKey];
        if (!optimisticPlan) return entry;
        return {
          ...entry,
          plan: {
            ...entry.plan,
            ...optimisticPlan,
          },
        };
      }),
    [entries, optimisticDeletedKeys, optimisticPlanByKey],
  );

  const entriesByCell = useMemo(() => {
    const map = new Map<string, PlanningEntry[]>();
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

  const modalFormId = activeEntry ? `plan-form-${activeEntry.scheduleId}-${activeEntry.lessonDate}` : "plan-form";

  const displayedStatus: PlanStatus = isDirty
    ? "DRAFT"
    : (wizardStatus ?? (submitStatus as PlanStatus) ?? (activeEntry?.plan.status ?? "MISSING")) as PlanStatus;
  const savedStatus = (activeEntry?.plan.status ?? "MISSING") as PlanStatus;
  const modalBackgroundStatus = (isDirty ? "DRAFT" : displayedStatus) || savedStatus;

  function handleDeletePlan(entry: PlanningEntry) {
    if (!entry.plan.id) return;
    if (!window.confirm("Tem certeza que deseja excluir este planejamento?")) {
      return;
    }

    const key = `${entry.scheduleId}-${entry.lessonDate}`;
    setDeletingPlanKey(key);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("id", entry.plan.id as string);
        await deleteLessonPlanAction(formData);

        setOptimisticDeletedKeys((current) => ({ ...current, [key]: true }));
        setOptimisticStatusByKey((current) => ({ ...current, [key]: "MISSING" }));
        setOptimisticPlanByKey((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
        setCardSavedAnimation(key);
        stopWizardStreaming(true);
        setActiveKey(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Nao foi possivel excluir o planejamento.";
        window.alert(message);
      } finally {
        setDeletingPlanKey(null);
      }
    });
  }

  function openModal(entry: PlanningEntry) {
    stopWizardStreaming();
    const initialFeedback = entry.plan.ai_feedback ?? "";
    setActiveKey(`${entry.scheduleId}-${entry.lessonDate}`);
    setWizardStatus(null);
    setWizardText(initialFeedback);
    latestWizardFeedbackRef.current = initialFeedback;
    setWizardError(null);
    setShowWizardPanel(initialFeedback.trim().length > 0);
    setIsDirty(false);
    const initialStatus = normalizePersistedStatus(entry.plan.status);
    setSubmitStatus(initialStatus);
    submitStatusRef.current = initialStatus;
    const parsedPillars = (entry.plan.pillars ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    setSelectedPillars(parsedPillars);
  }

  function buildPlanSectionHtml(entry: PlanningEntry) {
    const content = (entry.plan.content ?? "").trim();
    const objective = (entry.plan.objective ?? "").trim();
    const methodology = (entry.plan.methodology ?? "").trim();
    const classroomActivities = (entry.plan.classroom_activities ?? "").trim();
    const homeActivities = (entry.plan.home_activities ?? "").trim();

    return `
      <section class="plan-card">
        <h3>${escapeHtml(entry.subjectName)}</h3>
        <p class="meta">${escapeHtml(entry.className)} · ${escapeHtml(formatDatePtBr(entry.lessonDate))} · ${escapeHtml(
          `${entry.startsAt.slice(0, 5)} - ${entry.endsAt.slice(0, 5)}`,
        )}</p>
        ${content ? `<p><strong>Conteúdo:</strong> ${escapeHtml(content).replaceAll("\n", "<br />")}</p>` : ""}
        ${objective ? `<p><strong>Objetivo:</strong> ${escapeHtml(objective).replaceAll("\n", "<br />")}</p>` : ""}
        ${methodology ? `<p><strong>Metodologia:</strong> ${escapeHtml(methodology).replaceAll("\n", "<br />")}</p>` : ""}
        ${classroomActivities ? `<p><strong>Atividades em Sala:</strong> ${escapeHtml(classroomActivities).replaceAll("\n", "<br />")}</p>` : ""}
        ${homeActivities ? `<p><strong>Atividades em Casa:</strong> ${escapeHtml(homeActivities).replaceAll("\n", "<br />")}</p>` : ""}
        ${
          !content && !objective && !methodology && !classroomActivities && !homeActivities
            ? `<p class="empty">Sem conteúdo preenchido neste planejamento.</p>`
            : ""
        }
      </section>
    `;
  }

  function openPdfDocument(title: string, subtitle: string, rows: PlanningEntry[]) {
    const printableRows = [...rows].sort((a, b) => {
      if (a.lessonDate !== b.lessonDate) return a.lessonDate.localeCompare(b.lessonDate);
      if (a.startsAt !== b.startsAt) return a.startsAt.localeCompare(b.startsAt);
      return a.className.localeCompare(b.className, "pt-BR");
    });

    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      window.alert("Não foi possível abrir a janela de exportação. Verifique o bloqueador de pop-up.");
      return;
    }

    const logoUrl = `${window.location.origin}/fasy-login-brand.jpg`;
    const nowLabel = new Date().toLocaleString("pt-BR");
    const bodyHtml = printableRows.map((entry) => buildPlanSectionHtml(entry)).join("");

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: A4; margin: 16mm 12mm 18mm 12mm; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: #0b2a4a; background: #fff; }
      header { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #d5e2f0; padding-bottom: 10px; margin-bottom: 12px; }
      header img { width: 72px; height: auto; border-radius: 8px; object-fit: cover; }
      .head-title h1 { margin: 0; font-size: 18px; letter-spacing: 0.01em; color: #0d3f73; }
      .head-title p { margin: 4px 0 0; font-size: 12px; color: #406487; }
      .meta-sheet { margin: 0 0 12px; font-size: 12px; color: #406487; }
      .plan-card { border: 1px solid #c9d9ea; border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; page-break-inside: avoid; }
      .plan-card h3 { margin: 0; font-size: 14px; color: #0d3f73; }
      .plan-card .meta { margin: 4px 0 8px; font-size: 12px; color: #4a6a88; }
      .plan-card p { margin: 6px 0; font-size: 12px; line-height: 1.45; }
      .plan-card p strong { color: #0b2a4a; }
      .plan-card .empty { color: #6b839d; font-style: italic; }
      footer { position: fixed; bottom: 0; left: 0; right: 0; border-top: 1px solid #d5e2f0; padding: 6px 12mm 0; font-size: 10px; color: #6b839d; text-align: center; background: #fff; }
      @media print {
        a[href]:after { content: ""; }
      }
    </style>
  </head>
  <body>
    <header>
      <img src="${logoUrl}" alt="FASY" />
      <div class="head-title">
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(subtitle)}</p>
      </div>
    </header>
    <p class="meta-sheet">Gerado em: ${escapeHtml(nowLabel)}</p>
    ${bodyHtml || '<p class="meta-sheet">Nenhum planejamento encontrado para exportação.</p>'}
    <footer>Plano de Aula gerado através do FASY - www.fasyedu.com.br</footer>
    <script>
      window.addEventListener("load", () => {
        setTimeout(() => window.print(), 120);
      });
    </script>
  </body>
</html>`;

    try {
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      popup.focus();
    } catch {
      popup.close();
      window.alert("Falha ao gerar o PDF nesta aba. Tente novamente.");
    }
  }

  function exportSinglePlan(entry: PlanningEntry) {
    openPdfDocument(
      "Plano de Aula",
      `${entry.className} · ${entry.subjectName} · ${formatDatePtBr(entry.lessonDate)}`,
      [entry],
    );
  }

  function exportDayPlans(day: PlanningDay) {
    const dayEntries = effectiveEntries.filter((entry) => entry.lessonDate === day.lessonDate && entry.plan.id);
    openPdfDocument(
      "Planos de Aula do Dia",
      `${teacherName} · ${day.label} · ${formatDatePtBr(day.lessonDate)}`,
      dayEntries,
    );
  }

  function exportWeeklySlotPlans(slot: string) {
    const slotEntries = effectiveEntries.filter((entry) => entry.startsAt === slot && entry.plan.id);
    openPdfDocument(
      "Planos de Aula por Horário",
      `${teacherName} · Semana ${formatDateRange(weekStartIso, weekEndIso)} · Horário ${slot.slice(0, 5)}`,
      slotEntries,
    );
  }

  useEffect(() => {
    if (autoOpenDoneRef.current) return;
    if (!initialOpenScheduleId || !initialOpenLessonDate) return;
    const targetKey = `${initialOpenScheduleId}-${initialOpenLessonDate}`;
    const target = effectiveEntries.find((entry) => `${entry.scheduleId}-${entry.lessonDate}` === targetKey);
    if (!target) return;
    openModal(target);
    autoOpenDoneRef.current = true;
  }, [initialOpenScheduleId, initialOpenLessonDate, effectiveEntries]);

  function markAsDirty() {
    if (!isDirty) setIsDirty(true);
    setWizardStatus(null);
    setSubmitStatus("DRAFT");
    submitStatusRef.current = "DRAFT";
  }

  function togglePillar(pillar: string) {
    setSelectedPillars((current) => {
      const next = current.includes(pillar) ? current.filter((item) => item !== pillar) : [...current, pillar];
      return next;
    });
    markAsDirty();
  }

  function setPendingStatus(status: PersistedStatus) {
    setWizardStatus(null);
    setSubmitStatus(status);
    submitStatusRef.current = status;
  }

  function persistWithSave(closeAfterSubmit = false) {
    if (!activeEntry || !modalFormRef.current) return;

    const entry = activeEntry;
    const key = `${entry.scheduleId}-${entry.lessonDate}`;
    const nextStatus = submitStatusRef.current as PlanStatus;
    const formData = new FormData(modalFormRef.current);

    setSavingPlanKey(key);
    startTransition(async () => {
      try {
        const savedPlan = await saveLessonPlanAction(formData);
        const persistedStatus = ((savedPlan?.status as PlanStatus) ?? nextStatus) as PlanStatus;
        setOptimisticStatusByKey((current) => ({ ...current, [key]: persistedStatus }));
        if (savedPlan) {
          setOptimisticDeletedKeys((current) => ({ ...current, [key]: false }));
          setOptimisticPlanByKey((current) => ({
            ...current,
            [key]: {
              id: savedPlan.id,
              title: savedPlan.title ?? null,
              content: savedPlan.content ?? null,
              objective: savedPlan.objective ?? null,
              methodology: savedPlan.methodology ?? null,
              pillars: savedPlan.pillars ?? null,
              resources: savedPlan.resources ?? null,
              classroom_activities: savedPlan.classroom_activities ?? null,
              home_activities: savedPlan.home_activities ?? null,
              ai_feedback: savedPlan.ai_feedback ?? null,
              reviewer_comment: savedPlan.reviewer_comment ?? null,
              status: persistedStatus,
            },
          }));
          latestWizardFeedbackRef.current = savedPlan.ai_feedback ?? latestWizardFeedbackRef.current;
          setWizardText(savedPlan.ai_feedback ?? wizardText);
          setSubmitStatus(normalizePersistedStatus(persistedStatus));
          submitStatusRef.current = normalizePersistedStatus(persistedStatus);
          setSelectedPillars(
            (savedPlan.pillars ?? "")
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
          );
        }
        setCardSavedAnimation(key);
        if (closeAfterSubmit) {
          stopWizardStreaming(true);
          setActiveKey(null);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Nao foi possivel salvar o planejamento.";
        window.alert(message);
      } finally {
        setSavingPlanKey(null);
      }
    });
  }

  async function runWizard() {
    if (!modalFormRef.current) return;
    const formData = new FormData(modalFormRef.current);
    setWizardBusy(true);
    setWizardError(null);
    setShowWizardPanel(true);
    stopWizardStreaming(true);
    startWaitingStreaming();

    const payload = {
      lesson_plan_id: activeEntry?.plan.id ?? "",
      class_schedule_id: activeEntry?.scheduleId ?? "",
      lesson_date: activeEntry?.lessonDate ?? "",
      previous_feedback: wizardText || activeEntry?.plan.ai_feedback || "",
      content: String(formData.get("content") ?? ""),
      objective: String(formData.get("objective") ?? ""),
      methodology: String(formData.get("methodology") ?? ""),
      resources: String(formData.get("resources") ?? ""),
      classroom_activities: String(formData.get("classroom_activities") ?? ""),
      home_activities: String(formData.get("home_activities") ?? ""),
      context: {
        className: activeEntry?.className ?? "",
        subjectName: activeEntry?.subjectName ?? "",
        lessonDate: activeEntry?.lessonDate ?? "",
        timeRange: activeEntry ? `${activeEntry.startsAt.slice(0, 5)} - ${activeEntry.endsAt.slice(0, 5)}` : "",
      },
    };

    startTransition(async () => {
      try {
        const response = await fetch("/api/planning/wizard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = (await response.json()) as { status?: WizardStatus; feedback?: string };
        if (!result.status || !result.feedback) {
          throw new Error("Nao foi possivel obter a avaliacao do Wizard.");
        }
        clearWaitingStreaming();
        setWizardStatus(result.status);
        setSubmitStatus(result.status);
        submitStatusRef.current = result.status;
        setIsDirty(false);
        const fullFeedback = decodeHtmlEntities(result.feedback);
        latestWizardFeedbackRef.current = fullFeedback;

        let index = 0;
        const full = fullFeedback;
        const hasHtmlTag = /<\/?[a-z][\s\S]*>/i.test(full);
        if (hasHtmlTag) {
          const plainPreview = full.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          if (plainPreview.length > 0) {
            setWizardStreamingPlainPreview(true);
            clearWizardTypingStreaming();
            wizardTypingIntervalRef.current = window.setInterval(() => {
              index += 1;
              setWizardText(plainPreview.slice(0, index));
              if (index >= plainPreview.length) {
                clearWizardTypingStreaming();
                setWizardText(full);
                setWizardStreamingPlainPreview(false);
              }
            }, 10);
          } else {
            setWizardText(full);
            setWizardStreamingPlainPreview(false);
          }
        } else {
          clearWizardTypingStreaming();
          wizardTypingIntervalRef.current = window.setInterval(() => {
            index += 1;
            setWizardText(full.slice(0, index));
            if (index >= full.length) {
              clearWizardTypingStreaming();
            }
          }, 14);
        }
      } catch {
        stopWizardStreaming();
        setWizardError("Falha ao avaliar o plano agora. Tente novamente em instantes.");
      } finally {
        setWizardBusy(false);
      }
    });
  }

  useEffect(() => {
    return () => {
      stopWizardStreaming();
    };
  }, []);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white p-4">
        <p className="text-sm text-[var(--muted)]">
          Professor: <strong className="text-[var(--brand-blue)]">{teacherName}</strong>
        </p>
        <div className="flex items-center gap-2">
          <Link
            href={`/planejamento?week=${previousMonthIso}`}
            onClick={() => showLoadingOverlay("planning-grid-zone")}
            className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm hover:bg-[var(--panel-soft)]"
          >
            Mês anterior
          </Link>
          <Link
            href={`/planejamento?week=${previousWeekIso}`}
            onClick={() => showLoadingOverlay("planning-grid-zone")}
            className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm hover:bg-[var(--panel-soft)]"
          >
            Semana anterior
          </Link>
          <span className="rounded-lg bg-[var(--panel-soft)] px-3 py-1 text-sm text-[var(--brand-blue)]">{formatDateRange(weekStartIso, weekEndIso)}</span>
          <Link
            href={`/planejamento?week=${nextWeekIso}`}
            onClick={() => showLoadingOverlay("planning-grid-zone")}
            className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm hover:bg-[var(--panel-soft)]"
          >
            Próxima semana
          </Link>
          <Link
            href={`/planejamento?week=${nextMonthIso}`}
            onClick={() => showLoadingOverlay("planning-grid-zone")}
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
              <th className="w-24 px-3 py-2">Horario</th>
              {days.map((day) => (
                <th key={`head-${day.value}`} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      {day.label} · {new Date(`${day.lessonDate}T12:00:00`).toLocaleDateString("pt-BR")}
                    </span>
                    <button
                      type="button"
                      onClick={() => exportDayPlans(day)}
                      className="rounded-full border border-[var(--line)] bg-white px-2 py-0.5 text-[10px] font-semibold text-[var(--brand-blue)] hover:bg-[var(--panel-soft)]"
                    >
                      PDF
                    </button>
                  </div>
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
                <td className="px-3 py-3 text-xs font-semibold whitespace-nowrap text-[var(--brand-blue)]">
                  <div className="flex flex-col items-start gap-1">
                    <span>{slot.slice(0, 5)}</span>
                    <button
                      type="button"
                      onClick={() => exportWeeklySlotPlans(slot)}
                      className="rounded-full border border-[var(--line)] bg-white px-2 py-0.5 text-[10px] font-semibold text-[var(--brand-blue)] hover:bg-[var(--panel-soft)]"
                    >
                      PDF
                    </button>
                  </div>
                </td>
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
                              <p className="text-xs text-[var(--muted)]">{entry.className}</p>
                              <p className="text-xs text-[var(--brand-blue)]">
                                {entry.startsAt.slice(0, 5)} - {entry.endsAt.slice(0, 5)}
                              </p>
                              {entry.plan.id ? (
                                <div className="mt-2">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      exportSinglePlan(entry);
                                    }}
                                    className="mr-2 rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-[11px] hover:bg-[var(--panel-soft)]"
                                  >
                                    PDF
                                  </button>
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
          <div
            className={`w-full max-w-7xl rounded-2xl border border-[var(--line)] shadow-[0_20px_60px_rgba(8,33,63,0.34)] ${getSavedStatusModalStyles(
              modalBackgroundStatus,
            )}`}
          >
            <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-white px-4 py-3">
              <div>
                <h3 className="text-base font-semibold text-[var(--brand-blue)]">Planejamento de Aula</h3>
                <p className="text-xs text-[var(--muted)]">
                  {activeEntry.className} · {activeEntry.subjectName} · {new Date(`${activeEntry.lessonDate}T12:00:00`).toLocaleDateString("pt-BR")} · {" "}
                  {activeEntry.startsAt.slice(0, 5)} - {activeEntry.endsAt.slice(0, 5)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${getStatusBadgeStyles(displayedStatus)}`}>{getStatusLabel(displayedStatus)}</span>
              </div>
            </div>

            <div className="max-h-[calc(90vh-130px)] overflow-y-auto p-4">
              <div className="flex gap-4">
                <div className="min-w-0 flex-1">
                  <form
                    id={modalFormId}
                    key={`${activeEntry.scheduleId}-${activeEntry.lessonDate}-${activeEntry.plan.id ?? "new"}`}
                    ref={modalFormRef}
                    action={saveLessonPlanFormAction}
                    className="grid gap-3"
                  >
                    <input type="hidden" name="id" value={activeEntry.plan.id ?? ""} />
                    <input type="hidden" name="class_schedule_id" value={activeEntry.scheduleId} />
                    <input type="hidden" name="lesson_date" value={activeEntry.lessonDate} />
                    <input type="hidden" name="status" value={submitStatusRef.current} />
                    <input
                      type="hidden"
                      name="ai_feedback"
                      value={latestWizardFeedbackRef.current || wizardText || activeEntry.plan.ai_feedback || ""}
                    />
                    <input type="hidden" name="pillars" value={showPillars ? selectedPillars.join(", ") : activeEntry.plan.pillars ?? ""} />

                    {activeEntry.plan.reviewer_comment ? (
                      <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Parecer da Coordenação</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">{activeEntry.plan.reviewer_comment}</p>
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
                                name="pillars_option"
                                value={pillar}
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
                      <textarea
                        name="classroom_activities"
                        defaultValue={activeEntry.plan.classroom_activities ?? ""}
                        onChange={markAsDirty}
                        className="fasy-input min-h-24"
                        placeholder="Descreva as atividades realizadas em sala."
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Atividades em Casa</span>
                      <textarea
                        name="home_activities"
                        defaultValue={activeEntry.plan.home_activities ?? ""}
                        onChange={markAsDirty}
                        className="fasy-input min-h-20"
                        placeholder="Descreva o dever de casa (se houver)."
                      />
                    </label>
                  </form>

                  <section className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)]/35 p-3">
                    <h4 className="text-sm font-semibold text-[var(--brand-blue)]">Recursos extras (link ou arquivo)</h4>
                    {!activeEntry.plan.id ? (
                      <p className="mt-2 text-xs text-[var(--muted)]">Salve o planejamento primeiro para habilitar anexos e links.</p>
                    ) : (
                      <div className="mt-2 grid gap-3">
                        <form action={addLessonPlanLinkResourceAction} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                          <input type="hidden" name="lesson_plan_id" value={activeEntry.plan.id} />
                          <input name="label" className="fasy-input text-sm" placeholder="Nome do material (opcional)" />
                          <input name="url" className="fasy-input text-sm" placeholder="https://youtube.com/..." />
                          <SubmitButton className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm hover:bg-[var(--panel-soft)]" pendingLabel="Adicionando...">
                            Adicionar link
                          </SubmitButton>
                        </form>

                        <form action={uploadLessonPlanFileResourceAction} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                          <input type="hidden" name="lesson_plan_id" value={activeEntry.plan.id} />
                          <input name="label" className="fasy-input text-sm" placeholder="Nome do arquivo (opcional)" />
                          <input type="file" name="file" className="fasy-input text-sm" />
                          <SubmitButton className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm hover:bg-[var(--panel-soft)]" pendingLabel="Enviando...">
                            Anexar arquivo
                          </SubmitButton>
                        </form>

                        <div className="grid gap-2">
                          {activeEntry.resources.length === 0 ? (
                            <p className="text-xs text-[var(--muted)]">Nenhum recurso extra adicionado.</p>
                          ) : (
                            activeEntry.resources.map((resource) => (
                              <div key={resource.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs">
                                <div className="min-w-0">
                                  <p className="font-medium text-[var(--brand-blue)]">{resource.label || (resource.resource_type === "LINK" ? "Link externo" : resource.file_name || "Arquivo")}</p>
                                  {resource.resource_type === "LINK" && resource.url ? (
                                    <a href={resource.url} target="_blank" rel="noreferrer" className="truncate text-[var(--muted)] underline">
                                      {resource.url}
                                    </a>
                                  ) : null}
                                  {resource.resource_type === "FILE" && resource.file_url ? (
                                    <a href={resource.file_url} target="_blank" rel="noreferrer" className="truncate text-[var(--muted)] underline">
                                      {resource.file_name} {resource.file_size ? `(${formatBytes(resource.file_size)})` : ""}
                                    </a>
                                  ) : null}
                                </div>
                                <form action={deleteLessonPlanResourceAction}>
                                  <input type="hidden" name="id" value={resource.id} />
                                  <SubmitButton className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100" pendingLabel="...">
                                    Excluir
                                  </SubmitButton>
                                </form>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </section>
                </div>

                <aside
                  className={`overflow-hidden rounded-xl border border-[var(--line)] bg-white transition-all duration-300 ${showWizardPanel ? "w-full max-w-[420px] opacity-100" : "w-0 max-w-0 border-transparent opacity-0"}`}
                >
                  <div className="flex h-full flex-col p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-[var(--brand-blue)]">Feedback do Wizard</h4>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getStatusBadgeStyles(displayedStatus)}`}>
                        {getStatusLabel(displayedStatus)}
                      </span>
                    </div>
                    <div
                      className="min-h-40 flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)]/40 p-2 text-sm text-[var(--foreground)]"
                      dangerouslySetInnerHTML={{
                        __html: toFeedbackDisplayHtml(
                          wizardText || activeEntry.plan.ai_feedback || "Sem avaliação automática ainda.",
                          wizardStreamingPlainPreview,
                        ),
                      }}
                    />
                    {wizardError ? <p className="mt-2 text-xs text-rose-700">{wizardError}</p> : null}
                  </div>
                </aside>
              </div>
            </div>

            <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--line)] bg-white px-4 py-3">
              {activeEntry.plan.id ? (
                <>
                  {deletingPlanKey === `${activeEntry.scheduleId}-${activeEntry.lessonDate}` ? (
                    <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      Excluindo planejamento...
                    </span>
                  ) : null}
                  <form
                    action={() => {
                      handleDeletePlan(activeEntry);
                    }}
                  >
                    <SubmitButton
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 hover:bg-rose-100"
                      pendingLabel="Excluindo..."
                      disabled={wizardBusy || isPending || deletingPlanKey === `${activeEntry.scheduleId}-${activeEntry.lessonDate}`}
                    >
                      {deletingPlanKey === `${activeEntry.scheduleId}-${activeEntry.lessonDate}` ? "Excluindo..." : "Excluir"}
                    </SubmitButton>
                  </form>
                </>
              ) : null}

              <button
                type="button"
                onClick={runWizard}
                disabled={wizardBusy || isPending || savingPlanKey === `${activeEntry.scheduleId}-${activeEntry.lessonDate}`}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M4 20l7-7" />
                  <path d="M14.5 3.5l6 6" />
                  <path d="M12 6l1-2 1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
                  <path d="M18 12l.7-1.3L20 10l-1.3-.7L18 8l-.7 1.3L16 10l1.3.7L18 12z" />
                </svg>
                {wizardBusy || isPending ? "Avaliando..." : "Wizard"}
              </button>
              <button
                type="button"
                onClick={() => setPendingStatus("HUMAN_REVIEW")}
                disabled={wizardBusy || isPending || savingPlanKey === `${activeEntry.scheduleId}-${activeEntry.lessonDate}`}
                className="rounded-lg border border-yellow-300 bg-yellow-100 px-3 py-2 text-sm font-medium text-yellow-800 hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Revisão Humana
              </button>
              <button
                type="button"
                onClick={() => {
                  stopWizardStreaming(true);
                  setActiveKey(null);
                }}
                className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--panel-soft)]"
              >
                Cancelar
              </button>
              {savingPlanKey === `${activeEntry.scheduleId}-${activeEntry.lessonDate}` ? (
                <span className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
                  Salvando planejamento...
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => persistWithSave(true)}
                className="fasy-btn-primary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                disabled={wizardBusy || isPending || savingPlanKey === `${activeEntry.scheduleId}-${activeEntry.lessonDate}`}
              >
                {savingPlanKey === `${activeEntry.scheduleId}-${activeEntry.lessonDate}` ? "Salvando..." : "Salvar"}
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
              Origem: {duplicateSource.className} · {duplicateSource.subjectName} ·{" "}
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
                    <option key={`dup-class-${item.classId}`} value={item.classId}>
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
                    <option key={`dup-target-${item.scheduleId}`} value={item.scheduleId}>
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
