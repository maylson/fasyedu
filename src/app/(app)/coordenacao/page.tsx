import { CoordinationWeekGrid } from "@/components/coordination-week-grid";
import { ModuleShell } from "@/components/module-shell";
import { getUserContext } from "@/lib/app-context";
import { getWeekdayLabel, WEEKDAY_OPTIONS } from "@/lib/constants";

type CoordenacaoPageProps = {
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

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export default async function CoordenacaoPage({ searchParams }: CoordenacaoPageProps) {
  const { supabase, activeSchoolId, roles } = await getUserContext();
  const canAccess = roles.includes("SUPPORT") || roles.includes("DIRECAO") || roles.includes("COORDENACAO");
  const params = await searchParams;
  const selectedClassId = typeof params.class_id === "string" ? params.class_id : "";
  const selectedTeacherId = typeof params.teacher_id === "string" ? params.teacher_id : "";
  const requestedWeek = typeof params.week === "string" ? params.week : undefined;

  const weekStart = getWeekStart(requestedWeek);
  const weekStartIso = getDateOnly(weekStart);
  const weekEndIso = getDateOnly(addDays(weekStart, 6));
  const previousWeekIso = getDateOnly(addDays(weekStart, -7));
  const nextWeekIso = getDateOnly(addDays(weekStart, 7));
  const previousMonthIso = getDateOnly(getWeekStart(getDateOnly(addMonths(weekStart, -1))));
  const nextMonthIso = getDateOnly(getWeekStart(getDateOnly(addMonths(weekStart, 1))));

  if (!canAccess) {
    return (
      <ModuleShell title="Coordenação" description="Acompanhamento global dos planejamentos por turma">
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Esta área é exclusiva para os perfis Direção e Coordenação.
        </p>
      </ModuleShell>
    );
  }

  const classesResult = await supabase.from("classes").select("id, name, stage, series").eq("school_id", activeSchoolId).limit(500);
  const classes = (classesResult.data ?? []) as Array<{ id: string; name: string; stage: string; series: string | null }>;
  const teachersResult = await supabase.from("teachers").select("id, full_name").eq("school_id", activeSchoolId).order("full_name");
  const teachers = (teachersResult.data ?? []) as Array<{ id: string; full_name: string }>;

  const classStageOrder = new Map<string, number>([
    ["EDUCACAO_INFANTIL", 0],
    ["FUNDAMENTAL_1", 1],
    ["FUNDAMENTAL_2", 2],
    ["ENSINO_MEDIO", 3],
    ["CURSO_LIVRE", 4],
  ]);
  const classesSorted = [...classes].sort((a, b) => {
    const stageDiff = (classStageOrder.get(a.stage) ?? 999) - (classStageOrder.get(b.stage) ?? 999);
    if (stageDiff !== 0) return stageDiff;
    return a.name.localeCompare(b.name, "pt-BR");
  });

  const selectedClass = classesSorted.find((item) => item.id === selectedClassId) ?? null;
  const selectedTeacher = teachers.find((item) => item.id === selectedTeacherId) ?? null;

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

  let entries: Array<{
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
      status: PlanStatus | "MISSING";
    };
  }> = [];

  let days: Array<{ value: number; label: string; lessonDate: string }> = [];
  let timeSlots: string[] = [];
  let duplicateTargets: Array<{
    classId: string;
    className: string;
    classSeries: string | null;
  }> = [];

  if (selectedClassId || selectedTeacherId) {
    let schedulesQuery = supabase
      .from("class_schedules")
      .select("id, class_id, day_of_week, starts_at, ends_at, classes(id,name,series), teachers(full_name), class_subjects(subjects(name))")
      .eq("school_id", activeSchoolId)
      .eq("entry_type", "AULA")
      .order("day_of_week")
      .order("starts_at");
    if (selectedClassId) schedulesQuery = schedulesQuery.eq("class_id", selectedClassId);
    if (selectedTeacherId) schedulesQuery = schedulesQuery.eq("teacher_id", selectedTeacherId);

    const schedulesResult = await schedulesQuery;

    const schedules = (schedulesResult.data ?? []) as Array<{
      id: string;
      class_id: string;
      day_of_week: number;
      starts_at: string;
      ends_at: string;
      classes?: { id?: string; name?: string; series?: string | null } | Array<{ id?: string; name?: string; series?: string | null }>;
      teachers?: { full_name?: string } | Array<{ full_name?: string }>;
      class_subjects?:
        | { subjects?: { name?: string } | Array<{ name?: string }> }
        | Array<{ subjects?: { name?: string } | Array<{ name?: string }> }>;
    }>;

    const scheduleIds = schedules.map((item) => item.id);
    const plansResult =
      scheduleIds.length > 0
        ? await supabase
            .from("lesson_plans")
            .select(
              "id, class_schedule_id, lesson_date, content, objective, methodology, pillars, resources, classroom_activities, home_activities, ai_feedback, reviewer_comment, status",
            )
            .eq("school_id", activeSchoolId)
            .in("class_schedule_id", scheduleIds)
            .gte("lesson_date", weekStartIso)
            .lte("lesson_date", weekEndIso)
        : { data: [], error: null };

    const plans = (plansResult.data ?? []) as Array<{
      id: string;
      class_schedule_id: string | null;
      lesson_date: string | null;
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
    }>;

    const plansBySlot = new Map<string, (typeof plans)[number]>();
    plans.forEach((plan) => {
      if (plan.class_schedule_id && plan.lesson_date) {
        plansBySlot.set(`${plan.class_schedule_id}-${plan.lesson_date}`, plan);
      }
    });

    const hasSaturdayOrSundayClass = schedules.some((entry) => entry.day_of_week === 6 || entry.day_of_week === 7);
    const hasSundayClass = schedules.some((entry) => entry.day_of_week === 7);
    const visibleWeekdays = WEEKDAY_OPTIONS.filter((day) => {
      if (day.value <= 5) return true;
      if (day.value === 6) return hasSaturdayOrSundayClass;
      if (day.value === 7) return hasSundayClass;
      return false;
    });

    days = visibleWeekdays.map((day) => {
      const lessonDate = getDateOnly(addDays(weekStart, day.value - 1));
      return { value: day.value, label: getWeekdayLabel(day.value), lessonDate };
    });

    entries = schedules.map((schedule) => {
      const lessonDate = getDateOnly(addDays(weekStart, schedule.day_of_week - 1));
      const key = `${schedule.id}-${lessonDate}`;
      const plan = plansBySlot.get(key);
      const classInfo = Array.isArray(schedule.classes) ? schedule.classes[0] : schedule.classes;
      const teacherInfo = Array.isArray(schedule.teachers) ? schedule.teachers[0] : schedule.teachers;
      const classSubject = Array.isArray(schedule.class_subjects) ? schedule.class_subjects[0] : schedule.class_subjects;
      const subjectName = Array.isArray(classSubject?.subjects) ? classSubject?.subjects[0]?.name : classSubject?.subjects?.name;

      return {
        scheduleId: schedule.id,
        classId: classInfo?.id ?? schedule.class_id,
        classSeries: classInfo?.series ?? null,
        dayOfWeek: schedule.day_of_week,
        startsAt: schedule.starts_at,
        endsAt: schedule.ends_at,
        className: classInfo?.name ?? selectedClass?.name ?? "Turma",
        subjectName: subjectName ?? "Disciplina",
        teacherName: teacherInfo?.full_name ?? "Professor",
        lessonDate,
        plan: {
          id: plan?.id ?? null,
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
      };
    });

    timeSlots = Array.from(new Set(schedules.map((schedule) => schedule.starts_at))).sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    );

    duplicateTargets = classesSorted.map((item) => ({
      classId: item.id,
      className: item.name,
      classSeries: (item as { series?: string | null }).series ?? null,
    }));
  }

  return (
    <ModuleShell title="Coordenação" description="Visão semanal dos planejamentos por turma">
      <form method="get" className="grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
        <div className="grid gap-1">
          <span className="text-xs font-medium text-[var(--muted)]">Turma (opcional)</span>
          <select name="class_id" defaultValue={selectedClassId} className="fasy-input">
            <option value="">Todas as turmas</option>
            {classesSorted.map((item) => (
              <option key={`class-${item.id}`} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <span className="text-xs font-medium text-[var(--muted)]">Professor (opcional)</span>
          <select name="teacher_id" defaultValue={selectedTeacherId} className="fasy-input">
            <option value="">Todos os professores</option>
            {teachers.map((teacher) => (
              <option key={`teacher-${teacher.id}`} value={teacher.id}>
                {teacher.full_name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="fasy-btn-primary px-4 py-2 text-sm">
          Aplicar filtros
        </button>
        <a href="/coordenacao" className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm text-center hover:bg-[var(--panel-soft)]">
          Limpar
        </a>
      </form>

      <div id="coord-grid-zone" className="relative">
        <div
          data-loading-overlay
          className="pointer-events-none absolute inset-0 z-30 hidden rounded-2xl border border-[var(--line)] bg-white/70 backdrop-blur-sm"
        >
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--brand-blue)] shadow-[0_10px_24px_rgba(8,33,63,0.12)]">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--brand-blue)]" />
              Carregando planejamentos da turma...
            </div>
          </div>
        </div>

        {!selectedClassId && !selectedTeacherId ? (
          <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white p-8 text-center text-sm text-[var(--muted)]">
            Selecione uma turma e/ou um professor para visualizar e revisar os planejamentos da semana.
          </div>
        ) : (
          <CoordinationWeekGrid
            classId={selectedClassId}
            className={
              selectedClass?.name ??
              (selectedTeacher ? `Professor: ${selectedTeacher.full_name}` : "Turmas")
            }
            teacherId={selectedTeacherId || null}
            weekStartIso={weekStartIso}
            weekEndIso={weekEndIso}
            previousWeekIso={previousWeekIso}
            nextWeekIso={nextWeekIso}
            previousMonthIso={previousMonthIso}
            nextMonthIso={nextMonthIso}
            days={days}
            timeSlots={timeSlots}
            entries={entries}
            showPillars={Boolean(schoolSettings?.planning_pillars_enabled)}
            duplicateClassTargets={duplicateTargets}
            duplicateDateMin={activeSchoolYear?.starts_at ?? null}
            duplicateDateMax={activeSchoolYear?.ends_at ?? null}
          />
        )}
      </div>
    </ModuleShell>
  );
}


