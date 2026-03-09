import Link from "next/link";
import { ModuleShell } from "@/components/module-shell";
import { getUserContext } from "@/lib/app-context";

type PlanStatus = "DRAFT" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "HUMAN_REVIEW";

type ScheduleRow = {
  id: string;
  class_id: string;
  teacher_id: string | null;
  day_of_week: number;
  starts_at: string;
  ends_at: string;
  classes?: { id?: string; name?: string } | Array<{ id?: string; name?: string }>;
  teachers?: { id?: string; full_name?: string } | Array<{ id?: string; full_name?: string }>;
  class_subjects?:
    | { subjects?: { name?: string } | Array<{ name?: string }> }
    | Array<{ subjects?: { name?: string } | Array<{ name?: string }> }>;
};

type LessonPlanRow = {
  id: string;
  class_schedule_id: string | null;
  lesson_date: string | null;
  status: PlanStatus | null;
  reviewer_comment: string | null;
  ai_feedback: string | null;
  classes?: { name?: string } | Array<{ name?: string }>;
  class_subjects?:
    | { subjects?: { name?: string } | Array<{ name?: string }> }
    | Array<{ subjects?: { name?: string } | Array<{ name?: string }> }>;
};

function getDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getWeekStart(date = new Date()) {
  const baseDate = new Date(date);
  baseDate.setHours(12, 0, 0, 0);
  const day = baseDate.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(baseDate);
  start.setDate(baseDate.getDate() + mondayOffset);
  return start;
}

function getRoleView(roles: string[]) {
  if (roles.includes("DIRECAO")) return "DIRECAO";
  if (roles.includes("COORDENACAO")) return "COORDENACAO";
  if (roles.includes("PROFESSOR")) return "PROFESSOR";
  return "GERAL";
}

function card(label: string, value: number | string, hint?: string) {
  return (
    <article key={label} className="rounded-2xl border border-[var(--line)] bg-[var(--panel-soft)] p-4">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[var(--brand-blue)]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p> : null}
    </article>
  );
}

function formatPct(numerator: number, denominator: number) {
  if (denominator <= 0) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function uniqueByKey<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sanitizeFeedbackHtml(input: string) {
  if (!input) return "";
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

export default async function DashboardPage() {
  const { supabase, activeSchoolId, roles, user } = await getUserContext();

  if (!activeSchoolId) {
    return (
      <ModuleShell title="Dashboard" description="Visão geral da escola">
        <p className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-4 text-sm">Nenhuma escola ativa para exibir dados.</p>
      </ModuleShell>
    );
  }

  const roleView = getRoleView(roles);
  const weekStart = getWeekStart();
  const weekStartIso = getDateOnly(weekStart);
  const weekEndIso = getDateOnly(addDays(weekStart, 6));
  const previousWeekStartIso = getDateOnly(addDays(weekStart, -7));
  const previousWeekEndIso = getDateOnly(addDays(weekStart, -1));

  const [students, teachers, classes, announcements] = await Promise.all([
    supabase.from("students").select("*", { head: true, count: "exact" }).eq("school_id", activeSchoolId),
    supabase.from("teachers").select("*", { head: true, count: "exact" }).eq("school_id", activeSchoolId),
    supabase.from("classes").select("*", { head: true, count: "exact" }).eq("school_id", activeSchoolId),
    supabase.from("announcements").select("*", { head: true, count: "exact" }).eq("school_id", activeSchoolId),
  ]);

  if (roleView === "PROFESSOR") {
    const { data: teacher } = await supabase
      .from("teachers")
      .select("id, full_name")
      .eq("school_id", activeSchoolId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!teacher) {
      return (
        <ModuleShell title="Dashboard" description="Painel do professor">
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Seu usuário não está vinculado a um cadastro de professor nesta escola.
          </p>
        </ModuleShell>
      );
    }

    const schedulesResult = await supabase
      .from("class_schedules")
      .select("id, day_of_week, starts_at, classes(name), class_subjects(subjects(name))")
      .eq("school_id", activeSchoolId)
      .eq("teacher_id", teacher.id)
      .eq("entry_type", "AULA")
      .order("day_of_week")
      .order("starts_at");

    const schedules = (schedulesResult.data ?? []) as Array<{
      id: string;
      day_of_week: number;
      starts_at: string;
      ends_at?: string;
      classes?: { name?: string } | Array<{ name?: string }>;
      class_subjects?:
        | { subjects?: { name?: string } | Array<{ name?: string }> }
        | Array<{ subjects?: { name?: string } | Array<{ name?: string }> }>;
    }>;

    const scheduleMetaById = new Map(
      schedules.map((schedule) => {
        const classRef = Array.isArray(schedule.classes) ? schedule.classes[0] : schedule.classes;
        const classSubjectRef = Array.isArray(schedule.class_subjects) ? schedule.class_subjects[0] : schedule.class_subjects;
        const subjectRef = Array.isArray(classSubjectRef?.subjects) ? classSubjectRef?.subjects[0] : classSubjectRef?.subjects;
        return [
          schedule.id,
          {
            className: classRef?.name ?? "Turma não informada",
            subjectName: subjectRef?.name ?? "Disciplina não informada",
            startsAt: schedule.starts_at,
          },
        ] as const;
      }),
    );

    const scheduleIds = schedules.map((item) => item.id);
    const plansResult =
      scheduleIds.length > 0
        ? await supabase
            .from("lesson_plans")
            .select("id, class_schedule_id, lesson_date, status, reviewer_comment, ai_feedback")
            .eq("school_id", activeSchoolId)
            .in("class_schedule_id", scheduleIds)
            .gte("lesson_date", weekStartIso)
            .lte("lesson_date", weekEndIso)
        : { data: [], error: null };

    const plans = (plansResult.data ?? []) as LessonPlanRow[];
    const planBySlot = new Map<string, LessonPlanRow>();
    plans.forEach((plan) => {
      if (!plan.class_schedule_id || !plan.lesson_date) return;
      planBySlot.set(`${plan.class_schedule_id}-${plan.lesson_date}`, plan);
    });

    const expectedSlots = schedules.map((schedule) => {
      const lessonDate = getDateOnly(addDays(weekStart, schedule.day_of_week - 1));
      return `${schedule.id}-${lessonDate}`;
    });

    const expectedCount = expectedSlots.length;
    const plannedCount = expectedSlots.filter((key) => planBySlot.has(key)).length;
    const missingCount = expectedCount - plannedCount;
    const rejectedCount = plans.filter((plan) => plan.status === "REJECTED").length;
    const reviewCount = plans.filter((plan) => plan.status === "HUMAN_REVIEW" || plan.status === "UNDER_REVIEW").length;

    const latestFeedbacks = plans
      .filter((plan) => (plan.reviewer_comment && plan.reviewer_comment.trim().length > 0) || (plan.ai_feedback && plan.ai_feedback.trim().length > 0))
      .sort((a, b) => (b.lesson_date ?? "").localeCompare(a.lesson_date ?? "", "pt-BR"))
      .slice(0, 4);

    return (
      <ModuleShell title="Dashboard" description="Painel do professor">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {card("Aulas da semana", expectedCount)}
          {card("Planejadas", plannedCount, `${formatPct(plannedCount, expectedCount)} de cobertura`)}
          {card("Sem planejamento", missingCount)}
          {card("Pendentes de ajuste", rejectedCount + reviewCount)}
        </div>

        <section className="rounded-2xl border border-[var(--line)] bg-white p-4">
          <h3 className="text-sm font-semibold text-[var(--brand-blue)]">Atalhos</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/planejamento" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--panel-soft)]">Abrir planejamento</Link>
            <Link href="/calendario" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--panel-soft)]">Calendário</Link>
            <Link href="/mural" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--panel-soft)]">Mural</Link>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--line)] bg-white p-4">
          <h3 className="text-sm font-semibold text-[var(--brand-blue)]">Últimos feedbacks</h3>
          <div className="mt-3 space-y-2">
            {latestFeedbacks.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Sem feedback recente nesta semana.</p>
            ) : (
              latestFeedbacks.map((item) => {
                const rawFeedback = item.reviewer_comment || item.ai_feedback || "Feedback disponível";
                const isHtml = /<\/?[a-z][\s\S]*>/i.test(rawFeedback);
                const safeFeedback = sanitizeFeedbackHtml(rawFeedback);
                const scheduleMeta = item.class_schedule_id ? scheduleMetaById.get(item.class_schedule_id) : null;

                return (
                <Link
                  key={item.id}
                  href={
                    item.class_schedule_id && item.lesson_date
                      ? `/planejamento?week=${item.lesson_date}&open_schedule_id=${item.class_schedule_id}&open_lesson_date=${item.lesson_date}`
                      : "/planejamento"
                  }
                  className="block rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3 transition hover:border-[var(--primary)] hover:bg-white"
                >
                  <p className="text-xs text-[var(--muted)]">{item.lesson_date ? new Date(`${item.lesson_date}T12:00:00`).toLocaleDateString("pt-BR") : "Sem data"}</p>
                  <p className="mt-1 text-xs text-[var(--brand-blue)]">
                    {scheduleMeta
                      ? `${scheduleMeta.className} · ${scheduleMeta.subjectName} · ${scheduleMeta.startsAt.slice(0, 5)}`
                      : "Aula sem vínculo de horário"}
                  </p>
                  {isHtml ? (
                    <div
                      className="mt-1 line-clamp-2 text-sm [&_p]:m-0 [&_strong]:font-semibold"
                      dangerouslySetInnerHTML={{ __html: safeFeedback }}
                    />
                  ) : (
                    <p className="mt-1 text-sm line-clamp-2">{safeFeedback}</p>
                  )}
                </Link>
                );
              })
            )}
          </div>
        </section>
      </ModuleShell>
    );
  }

  if (roleView === "COORDENACAO") {
    const schedulesResult = await supabase
      .from("class_schedules")
      .select("id, day_of_week, starts_at, teacher_id, classes(name), teachers(full_name), class_subjects(subjects(name))")
      .eq("school_id", activeSchoolId)
      .eq("entry_type", "AULA");

    const schedules = (schedulesResult.data ?? []) as ScheduleRow[];
    const scheduleIds = schedules.map((item) => item.id);
    const plansResult =
      scheduleIds.length > 0
        ? await supabase
            .from("lesson_plans")
            .select("id, class_schedule_id, lesson_date, status")
            .eq("school_id", activeSchoolId)
            .in("class_schedule_id", scheduleIds)
            .gte("lesson_date", weekStartIso)
            .lte("lesson_date", weekEndIso)
        : { data: [], error: null };

    const plans = (plansResult.data ?? []) as LessonPlanRow[];
    const uniquePlans = uniqueByKey(plans, (item) => `${item.class_schedule_id}-${item.lesson_date}`);

    const planBySlot = new Set(
      uniquePlans
        .filter((item) => item.class_schedule_id && item.lesson_date)
        .map((item) => `${item.class_schedule_id}-${item.lesson_date}`),
    );

    const expectedKeys = schedules.map((schedule) => {
      const lessonDate = getDateOnly(addDays(weekStart, schedule.day_of_week - 1));
      return `${schedule.id}-${lessonDate}`;
    });

    const expectedCount = expectedKeys.length;
    const plannedCount = expectedKeys.filter((key) => planBySlot.has(key)).length;
    const missingCount = expectedCount - plannedCount;
    const underReviewCount = uniquePlans.filter((plan) => plan.status === "HUMAN_REVIEW" || plan.status === "UNDER_REVIEW").length;
    const rejectedCount = uniquePlans.filter((plan) => plan.status === "REJECTED").length;

    const teacherTotals = new Map<string, { teacherName: string; expected: number; planned: number }>();
    for (const schedule of schedules) {
      const teacherRef = Array.isArray(schedule.teachers) ? schedule.teachers[0] : schedule.teachers;
      const teacherId = schedule.teacher_id ?? teacherRef?.id ?? "sem-professor";
      const teacherName = teacherRef?.full_name ?? "Professor não vinculado";
      const lessonDate = getDateOnly(addDays(weekStart, schedule.day_of_week - 1));
      const key = `${schedule.id}-${lessonDate}`;
      const current = teacherTotals.get(teacherId) ?? { teacherName, expected: 0, planned: 0 };
      current.expected += 1;
      if (planBySlot.has(key)) current.planned += 1;
      teacherTotals.set(teacherId, current);
    }

    const teacherRanking = Array.from(teacherTotals.values())
      .sort((a, b) => b.expected - b.planned - (a.expected - a.planned))
      .slice(0, 5);

    return (
      <ModuleShell title="Dashboard" description="Painel de coordenação pedagógica">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {card("Aulas previstas (semana)", expectedCount)}
          {card("Planejamentos feitos", plannedCount, `${formatPct(plannedCount, expectedCount)} de cobertura`)}
          {card("Sem planejamento", missingCount)}
          {card("Fila de revisão", underReviewCount + rejectedCount)}
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-2xl border border-[var(--line)] bg-white p-4">
            <h3 className="text-sm font-semibold text-[var(--brand-blue)]">Gargalos por professor</h3>
            <div className="mt-3 space-y-2">
              {teacherRanking.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">Sem dados de horários nesta semana.</p>
              ) : (
                teacherRanking.map((item) => (
                  <article key={item.teacherName} className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
                    <p className="text-sm font-medium text-[var(--brand-blue)]">{item.teacherName}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {item.planned}/{item.expected} planejadas · pendentes: {item.expected - item.planned}
                    </p>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--line)] bg-white p-4">
            <h3 className="text-sm font-semibold text-[var(--brand-blue)]">Atalhos da coordenação</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/coordenacao" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--panel-soft)]">Abrir coordenação</Link>
              <Link href="/horarios" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--panel-soft)]">Horários</Link>
              <Link href="/turmas" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--panel-soft)]">Turmas</Link>
              <Link href="/usuarios" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--panel-soft)]">Usuários</Link>
            </div>
          </section>
        </div>
      </ModuleShell>
    );
  }

  if (roleView === "DIRECAO") {
    const schedulesResult = await supabase
      .from("class_schedules")
      .select("id, day_of_week")
      .eq("school_id", activeSchoolId)
      .eq("entry_type", "AULA");

    const schedules = (schedulesResult.data ?? []) as Array<{ id: string; day_of_week: number }>;
    const scheduleIds = schedules.map((item) => item.id);

    const [plansCurrentResult, plansPreviousResult] = await Promise.all([
      scheduleIds.length > 0
        ? supabase
            .from("lesson_plans")
            .select("id, class_schedule_id, lesson_date, status")
            .eq("school_id", activeSchoolId)
            .in("class_schedule_id", scheduleIds)
            .gte("lesson_date", weekStartIso)
            .lte("lesson_date", weekEndIso)
        : Promise.resolve({ data: [], error: null }),
      scheduleIds.length > 0
        ? supabase
            .from("lesson_plans")
            .select("id, class_schedule_id, lesson_date, status")
            .eq("school_id", activeSchoolId)
            .in("class_schedule_id", scheduleIds)
            .gte("lesson_date", previousWeekStartIso)
            .lte("lesson_date", previousWeekEndIso)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const plansCurrent = uniqueByKey((plansCurrentResult.data ?? []) as LessonPlanRow[], (item) => `${item.class_schedule_id}-${item.lesson_date}`);
    const plansPrevious = uniqueByKey((plansPreviousResult.data ?? []) as LessonPlanRow[], (item) => `${item.class_schedule_id}-${item.lesson_date}`);

    const expectedCurrent = schedules.length;
    const coverageCurrent = formatPct(plansCurrent.length, expectedCurrent);
    const coveragePrevious = formatPct(plansPrevious.length, expectedCurrent);

    const approvedCurrent = plansCurrent.filter((plan) => plan.status === "APPROVED").length;
    const rejectedCurrent = plansCurrent.filter((plan) => plan.status === "REJECTED").length;
    const reviewCurrent = plansCurrent.filter((plan) => plan.status === "HUMAN_REVIEW" || plan.status === "UNDER_REVIEW").length;

    const cards = [
      { label: "Alunos", value: students.count ?? 0 },
      { label: "Professores", value: teachers.count ?? 0 },
      { label: "Turmas", value: classes.count ?? 0 },
      { label: "Avisos", value: announcements.count ?? 0 },
    ];

    return (
      <ModuleShell title="Dashboard" description="Painel executivo da direção">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map((item) => card(item.label, item.value))}</div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {card("Cobertura da semana", coverageCurrent, `Semana anterior: ${coveragePrevious}`)}
          {card("Aprovados", approvedCurrent)}
          {card("Rejeitados", rejectedCurrent)}
          {card("Revisão humana", reviewCurrent)}
        </div>

        <section className="rounded-2xl border border-[var(--line)] bg-white p-4">
          <h3 className="text-sm font-semibold text-[var(--brand-blue)]">Atalhos de gestão</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/configuracoes" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--panel-soft)]">Configurações</Link>
            <Link href="/configuracoes/ano-letivo" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--panel-soft)]">Ano letivo</Link>
            <Link href="/coordenacao" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--panel-soft)]">Coordenação</Link>
            <Link href="/usuarios" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--panel-soft)]">Usuários</Link>
          </div>
        </section>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell title="Dashboard" description="Resumo da escola">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {card("Alunos", students.count ?? 0)}
        {card("Professores", teachers.count ?? 0)}
        {card("Turmas", classes.count ?? 0)}
        {card("Avisos", announcements.count ?? 0)}
      </div>
    </ModuleShell>
  );
}
