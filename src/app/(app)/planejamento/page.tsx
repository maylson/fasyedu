import { ModuleShell } from "@/components/module-shell";
import { PlanningWeekGrid } from "@/components/planning-week-grid";
import { getUserContext } from "@/lib/app-context";
import { getWeekdayLabel, WEEKDAY_OPTIONS } from "@/lib/constants";

type PlanejamentoPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type PlanStatus = "DRAFT" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "HUMAN_REVIEW";

function getDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekStart(dateInput?: string) {
  const baseDate = dateInput ? new Date(`${dateInput}T12:00:00`) : new Date();
  const day = baseDate.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(baseDate);
  start.setDate(baseDate.getDate() + mondayOffset);
  start.setHours(12, 0, 0, 0);
  return start;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export default async function PlanejamentoPage({ searchParams }: PlanejamentoPageProps) {
  const { supabase, activeSchoolId, user, roles } = await getUserContext();
  const isProfessor = roles.includes("PROFESSOR") || roles.includes("SUPPORT");
  const params = await searchParams;
  const requestedWeek = typeof params.week === "string" ? params.week : undefined;
  const initialOpenScheduleId = typeof params.open_schedule_id === "string" ? params.open_schedule_id : "";
  const initialOpenLessonDate = typeof params.open_lesson_date === "string" ? params.open_lesson_date : "";

  const weekStart = getWeekStart(requestedWeek);
  const weekStartIso = getDateOnly(weekStart);
  const weekEndIso = getDateOnly(addDays(weekStart, 6));
  const previousWeekIso = getDateOnly(addDays(weekStart, -7));
  const nextWeekIso = getDateOnly(addDays(weekStart, 7));

  if (!isProfessor) {
    return (
      <ModuleShell title="Planejamento de Aulas" description="Calendário semanal de planejamento do professor">
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Esta área é exclusiva para o perfil Professor.
        </p>
      </ModuleShell>
    );
  }

  const { data: teacher } = await supabase
    .from("teachers")
    .select("id, full_name")
    .eq("school_id", activeSchoolId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!teacher) {
    return (
      <ModuleShell title="Planejamento de Aulas" description="Calendário semanal de planejamento">
        <p className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-4 text-sm">
          Seu usuário não está vinculado a um cadastro de professor nesta escola.
        </p>
      </ModuleShell>
    );
  }

  const { data: schoolSettings } = await supabase
    .from("schools")
    .select("planning_pillars_enabled")
    .eq("id", activeSchoolId)
    .maybeSingle();
  const { data: activeSchoolYear } = await supabase
    .from("school_years")
    .select("starts_at, ends_at")
    .eq("school_id", activeSchoolId)
    .eq("is_active", true)
    .maybeSingle();

  const [schedulesResult, plansResult] = await Promise.all([
    supabase
      .from("class_schedules")
      .select("id, class_id, class_subject_id, day_of_week, starts_at, ends_at, classes(id,name,series), class_subjects(subjects(name))")
      .eq("school_id", activeSchoolId)
      .eq("teacher_id", teacher.id)
      .order("day_of_week")
      .order("starts_at"),
    supabase
      .from("lesson_plans")
      .select(
        "id, class_schedule_id, lesson_date, title, objective, content, methodology, pillars, resources, classroom_activities, home_activities, ai_feedback, reviewer_comment, status",
      )
      .eq("school_id", activeSchoolId)
      .gte("lesson_date", weekStartIso)
      .lte("lesson_date", weekEndIso),
  ]);

  const schedules = (schedulesResult.data ?? []) as Array<{
    id: string;
    class_id: string;
    class_subject_id: string;
    day_of_week: number;
    starts_at: string;
    ends_at: string;
    classes?: { id?: string; name?: string; series?: string | null } | Array<{ id?: string; name?: string; series?: string | null }>;
    class_subjects?:
      | { subjects?: { name?: string } | Array<{ name?: string }> }
      | Array<{ subjects?: { name?: string } | Array<{ name?: string }> }>;
  }>;

  const plans = (plansResult.data ?? []) as Array<{
    id: string;
    class_schedule_id: string | null;
    lesson_date: string | null;
    title: string | null;
    objective: string | null;
    content: string | null;
    methodology: string | null;
    pillars: string | null;
    resources: string | null;
    classroom_activities: string | null;
    home_activities: string | null;
    ai_feedback: string | null;
    reviewer_comment: string | null;
    status: PlanStatus;
  }>;

  const plansBySlot = new Map<string, (typeof plans)[number]>();
  plans.forEach((plan) => {
    if (plan.class_schedule_id && plan.lesson_date) {
      plansBySlot.set(`${plan.class_schedule_id}-${plan.lesson_date}`, plan);
    }
  });

  const planIds = plans.map((plan) => plan.id);
  const resourcesResult =
    planIds.length > 0
      ? await supabase
          .from("lesson_plan_resources")
          .select("id, lesson_plan_id, resource_type, label, url, file_path, file_name, file_size")
          .eq("school_id", activeSchoolId)
          .in("lesson_plan_id", planIds)
      : { data: [], error: null };

  const resources = (resourcesResult.data ?? []) as Array<{
    id: string;
    lesson_plan_id: string;
    resource_type: "LINK" | "FILE";
    label: string | null;
    url: string | null;
    file_path: string | null;
    file_name: string | null;
    file_size: number | null;
  }>;

  const resourcesWithUrls = await Promise.all(
    resources.map(async (resource) => {
      if (resource.resource_type !== "FILE" || !resource.file_path) {
        return { ...resource, file_url: null as string | null };
      }
      const signed = await supabase.storage.from("lesson-plan-resources").createSignedUrl(resource.file_path, 3600);
      return { ...resource, file_url: signed.data?.signedUrl ?? null };
    }),
  );

  const resourcesByPlanId = new Map<string, typeof resourcesWithUrls>();
  resourcesWithUrls.forEach((resource) => {
    const current = resourcesByPlanId.get(resource.lesson_plan_id) ?? [];
    current.push(resource);
    resourcesByPlanId.set(resource.lesson_plan_id, current);
  });

  const hasSaturdayOrSundayClass = schedules.some((entry) => entry.day_of_week === 6 || entry.day_of_week === 7);
  const hasSundayClass = schedules.some((entry) => entry.day_of_week === 7);
  const visibleWeekdays = WEEKDAY_OPTIONS.filter((day) => {
    if (day.value <= 5) return true;
    if (day.value === 6) return hasSaturdayOrSundayClass;
    if (day.value === 7) return hasSundayClass;
    return false;
  });

  const days = visibleWeekdays.map((day) => {
    const lessonDate = getDateOnly(addDays(weekStart, day.value - 1));
    return { value: day.value, label: getWeekdayLabel(day.value), lessonDate };
  });

  const entries = schedules.map((schedule) => {
    const lessonDate = getDateOnly(addDays(weekStart, schedule.day_of_week - 1));
    const key = `${schedule.id}-${lessonDate}`;
    const plan = plansBySlot.get(key);
    const className = Array.isArray(schedule.classes) ? schedule.classes[0]?.name : schedule.classes?.name;
    const classId = Array.isArray(schedule.classes) ? schedule.classes[0]?.id : schedule.classes?.id;
    const classSeries = Array.isArray(schedule.classes) ? schedule.classes[0]?.series : schedule.classes?.series;
    const classSubject = Array.isArray(schedule.class_subjects) ? schedule.class_subjects[0] : schedule.class_subjects;
    const subjectName = Array.isArray(classSubject?.subjects) ? classSubject?.subjects[0]?.name : classSubject?.subjects?.name;
    return {
      scheduleId: schedule.id,
      classId: classId ?? schedule.class_id,
      classSeries: classSeries ?? null,
      dayOfWeek: schedule.day_of_week,
      startsAt: schedule.starts_at,
      endsAt: schedule.ends_at,
      className: className ?? "Turma",
      subjectName: subjectName ?? "Disciplina",
      lessonDate,
      plan: {
        id: plan?.id ?? null,
        title: plan?.title ?? null,
        content: plan?.content ?? null,
        objective: plan?.objective ?? null,
        methodology: plan?.methodology ?? null,
        pillars: plan?.pillars ?? null,
        resources: plan?.resources ?? null,
        classroom_activities: plan?.classroom_activities ?? null,
        home_activities: plan?.home_activities ?? null,
        ai_feedback: plan?.ai_feedback ?? null,
        reviewer_comment: plan?.reviewer_comment ?? null,
        status: (plan?.status ?? "MISSING") as PlanStatus | "MISSING",
      },
      resources: plan?.id ? resourcesByPlanId.get(plan.id) ?? [] : [],
    };
  });

  const timeSlots = Array.from(new Set(schedules.map((schedule) => schedule.starts_at))).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  const allSchedulesResult = await supabase
    .from("class_schedules")
    .select("id, class_id, day_of_week, starts_at, classes(id,name,series), class_subjects(subjects(name))")
    .eq("school_id", activeSchoolId)
    .eq("entry_type", "AULA")
    .order("day_of_week")
    .order("starts_at")
    .limit(10000);

  const allSchedules = (allSchedulesResult.data ?? []) as Array<{
    id: string;
    class_id: string;
    day_of_week: number;
    starts_at: string;
    classes?: { id?: string; name?: string; series?: string | null } | Array<{ id?: string; name?: string; series?: string | null }>;
    class_subjects?:
      | { subjects?: { name?: string } | Array<{ name?: string }> }
      | Array<{ subjects?: { name?: string } | Array<{ name?: string }> }>;
  }>;

  const duplicateTargets = allSchedules.map((schedule) => {
    const className = Array.isArray(schedule.classes) ? schedule.classes[0]?.name : schedule.classes?.name;
    const classId = Array.isArray(schedule.classes) ? schedule.classes[0]?.id : schedule.classes?.id;
    const classSeries = Array.isArray(schedule.classes) ? schedule.classes[0]?.series : schedule.classes?.series;
    const classSubject = Array.isArray(schedule.class_subjects) ? schedule.class_subjects[0] : schedule.class_subjects;
    const subjectName = Array.isArray(classSubject?.subjects) ? classSubject?.subjects[0]?.name : classSubject?.subjects?.name;
    const weekdayLabel = getWeekdayLabel(schedule.day_of_week);
    return {
      scheduleId: schedule.id,
      classId: classId ?? schedule.class_id,
      className: className ?? "Turma",
      classSeries: classSeries ?? null,
      dayOfWeek: schedule.day_of_week,
      label: `${weekdayLabel} · ${schedule.starts_at.slice(0, 5)} · ${subjectName ?? "Disciplina"}`,
    };
  });

  return (
    <ModuleShell title="Planejamento de Aulas" description="Calendário semanal de planejamento do professor">
      <div id="planning-grid-zone" className="relative">
        <div
          data-loading-overlay
          className="pointer-events-none absolute inset-0 z-30 hidden rounded-2xl border border-[var(--line)] bg-white/70 backdrop-blur-sm"
        >
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--brand-blue)] shadow-[0_10px_24px_rgba(8,33,63,0.12)]">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--brand-blue)]" />
              Carregando semana de planejamento...
            </div>
          </div>
        </div>
        <PlanningWeekGrid
        weekStartIso={weekStartIso}
        weekEndIso={weekEndIso}
        previousWeekIso={previousWeekIso}
        nextWeekIso={nextWeekIso}
        teacherName={teacher.full_name}
        days={days}
          timeSlots={timeSlots}
          entries={entries}
          showPillars={Boolean(schoolSettings?.planning_pillars_enabled)}
          duplicateTargets={duplicateTargets}
          duplicateDateMin={activeSchoolYear?.starts_at ?? null}
          duplicateDateMax={activeSchoolYear?.ends_at ?? null}
          initialOpenScheduleId={initialOpenScheduleId}
          initialOpenLessonDate={initialOpenLessonDate}
        />
      </div>
    </ModuleShell>
  );
}


