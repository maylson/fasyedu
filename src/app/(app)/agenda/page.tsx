import Link from "next/link";
import { ModuleShell } from "@/components/module-shell";
import { ClassSelectAutoSubmit } from "@/components/class-select-auto-submit";
import { getUserContext } from "@/lib/app-context";
import { addDays, getDateOnly, getFamilyStudents, getWeekStart } from "@/lib/family";

type AgendaPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type EventType = "FERIADO" | "COMEMORACAO" | "PROGRAMACAO";
type AgendaFilter = "ALL" | "AULAS" | "TAREFAS" | "EVENTOS";

function weekLink(week: string, studentId: string, filter: AgendaFilter) {
  const params = new URLSearchParams();
  params.set("week", week);
  if (studentId) params.set("student_id", studentId);
  params.set("filter", filter);
  return `/agenda?${params.toString()}`;
}

function eventTypeLabel(type: EventType) {
  if (type === "FERIADO") return "Feriado";
  if (type === "COMEMORACAO") return "Comemoração";
  return "Programação";
}

export default async function AgendaPage({ searchParams }: AgendaPageProps) {
  const { supabase, activeSchoolId, user, roles } = await getUserContext();
  const params = await searchParams;

  if (!activeSchoolId) {
    return (
      <ModuleShell title="Agenda" description="Semana atual do aluno">
        <p className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-4 text-sm">Nenhuma escola ativa para exibir agenda.</p>
      </ModuleShell>
    );
  }

  const canAccess = roles.includes("PAI") || roles.includes("ALUNO");
  if (!canAccess) {
    return (
      <ModuleShell title="Agenda" description="Semana atual do aluno">
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Esta área é exclusiva para pais e alunos.</p>
      </ModuleShell>
    );
  }

  const { data: school } = await supabase
    .from("schools")
    .select("student_agenda_enabled")
    .eq("id", activeSchoolId)
    .maybeSingle();

  if (!school?.student_agenda_enabled) {
    return (
      <ModuleShell title="Agenda" description="Semana atual do aluno">
        <p className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-4 text-sm">
          O colégio ainda não habilitou a agenda para pais e alunos.
        </p>
      </ModuleShell>
    );
  }

  const familyStudents = await getFamilyStudents(supabase, activeSchoolId, user.id, roles);
  if (familyStudents.length === 0) {
    return (
      <ModuleShell title="Agenda" description="Semana atual do aluno">
        <p className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-4 text-sm">Nenhum aluno vinculado foi encontrado para este usuário.</p>
      </ModuleShell>
    );
  }

  const requestedStudentId = typeof params.student_id === "string" ? params.student_id : "";
  const selectedStudent = familyStudents.find((item) => item.studentId === requestedStudentId) ?? familyStudents[0];

  const requestedWeek = typeof params.week === "string" ? params.week : undefined;
  const weekStart = getWeekStart(requestedWeek);
  const weekStartIso = getDateOnly(weekStart);
  const weekEndIso = getDateOnly(addDays(weekStart, 6));
  const previousWeekIso = getDateOnly(addDays(weekStart, -7));
  const nextWeekIso = getDateOnly(addDays(weekStart, 7));

  const filterParam = typeof params.filter === "string" ? params.filter : "ALL";
  const filter: AgendaFilter = ["ALL", "AULAS", "TAREFAS", "EVENTOS"].includes(filterParam)
    ? (filterParam as AgendaFilter)
    : "ALL";

  if (!selectedStudent.classId) {
    return (
      <ModuleShell title="Agenda" description="Semana atual do aluno">
        <form method="get" className="rounded-2xl border border-[var(--line)] bg-white p-4">
          <ClassSelectAutoSubmit
            name="student_id"
            defaultValue={selectedStudent.studentId}
            options={familyStudents.map((item) => ({ id: item.studentId, name: `${item.studentName} · ${item.className}` }))}
            className="fasy-input"
          />
        </form>
        <p className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-4 text-sm">O aluno selecionado está sem turma ativa.</p>
      </ModuleShell>
    );
  }

  const [schedulesResult, eventsResult] = await Promise.all([
    supabase
      .from("class_schedules")
      .select("id, day_of_week, starts_at, ends_at, teachers(full_name), class_subjects(subjects(name))")
      .eq("school_id", activeSchoolId)
      .eq("class_id", selectedStudent.classId)
      .eq("entry_type", "AULA")
      .order("day_of_week")
      .order("starts_at"),
    supabase
      .from("events")
      .select("id, title, description, starts_at, event_type, is_administrative, target_stages, target_series, target_class_ids")
      .eq("school_id", activeSchoolId)
      .gte("starts_at", `${weekStartIso}T00:00:00`)
      .lte("starts_at", `${weekEndIso}T23:59:59`)
      .order("starts_at"),
  ]);

  const schedules = (schedulesResult.data ?? []) as Array<{
    id: string;
    day_of_week: number;
    starts_at: string;
    ends_at: string;
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
          .select("id, class_schedule_id, lesson_date, content, methodology, classroom_activities, home_activities, status")
          .eq("school_id", activeSchoolId)
          .in("class_schedule_id", scheduleIds)
          .eq("status", "APPROVED")
          .gte("lesson_date", weekStartIso)
          .lte("lesson_date", weekEndIso)
      : { data: [], error: null };

  const plans = (plansResult.data ?? []) as Array<{
    id: string;
    class_schedule_id: string | null;
    lesson_date: string | null;
    content: string | null;
    methodology: string | null;
    classroom_activities: string | null;
    home_activities: string | null;
  }>;

  const plansBySlot = new Map<string, (typeof plans)[number]>();
  for (const plan of plans) {
    if (!plan.class_schedule_id || !plan.lesson_date) continue;
    plansBySlot.set(`${plan.class_schedule_id}-${plan.lesson_date}`, plan);
  }

  const eventRows = (eventsResult.data ?? []) as Array<{
    id: string;
    title: string;
    description: string | null;
    starts_at: string;
    event_type: EventType;
    is_administrative: boolean;
    target_stages: string[] | null;
    target_series: string[] | null;
    target_class_ids: string[] | null;
  }>;

  const visibleEvents = eventRows.filter((event) => {
    if (event.is_administrative) return false;
    const targetStages = event.target_stages ?? [];
    const targetSeries = event.target_series ?? [];
    const targetClassIds = event.target_class_ids ?? [];
    const hasTargeting = targetStages.length > 0 || targetSeries.length > 0 || targetClassIds.length > 0;
    if (!hasTargeting) return true;
    if (targetClassIds.includes(selectedStudent.classId!)) return true;
    if (selectedStudent.classStage && targetStages.includes(selectedStudent.classStage)) return true;
    if (selectedStudent.classSeries && targetSeries.includes(selectedStudent.classSeries)) return true;
    return false;
  });

  const items: Array<{
    kind: "AULA" | "TAREFA" | "EVENTO";
    date: string;
    sortDate: string;
    title: string;
    subtitle: string;
    details?: string | null;
  }> = [];

  for (const schedule of schedules) {
    const lessonDate = getDateOnly(addDays(weekStart, schedule.day_of_week - 1));
    const key = `${schedule.id}-${lessonDate}`;
    const plan = plansBySlot.get(key);
    const teacherRef = Array.isArray(schedule.teachers) ? schedule.teachers[0] : schedule.teachers;
    const classSubject = Array.isArray(schedule.class_subjects) ? schedule.class_subjects[0] : schedule.class_subjects;
    const subjectRef = Array.isArray(classSubject?.subjects) ? classSubject?.subjects[0] : classSubject?.subjects;

    items.push({
      kind: "AULA",
      date: lessonDate,
      sortDate: `${lessonDate}T${schedule.starts_at}`,
      title: `${subjectRef?.name ?? "Disciplina"}`,
      subtitle: `${schedule.starts_at.slice(0, 5)} - ${schedule.ends_at.slice(0, 5)} · ${teacherRef?.full_name ?? "Professor"}`,
      details: [
        plan?.content ? `Conteúdo: ${plan.content}` : null,
        plan?.methodology ? `Metodologia: ${plan.methodology}` : null,
        plan?.classroom_activities ? `Atividades em sala: ${plan.classroom_activities}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    });

    if (plan?.home_activities && plan.home_activities.trim()) {
      items.push({
        kind: "TAREFA",
        date: lessonDate,
        sortDate: `${lessonDate}T${schedule.ends_at}`,
        title: `Atividade em Casa · ${subjectRef?.name ?? "Disciplina"}`,
        subtitle: `${schedule.starts_at.slice(0, 5)} · ${teacherRef?.full_name ?? "Professor"}`,
      details: `Atividades em casa: ${plan.home_activities}`,
      });
    }
  }

  for (const event of visibleEvents) {
    const eventDate = event.starts_at.slice(0, 10);
    items.push({
      kind: "EVENTO",
      date: eventDate,
      sortDate: event.starts_at,
      title: `${eventTypeLabel(event.event_type)} · ${event.title}`,
      subtitle: new Date(event.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      details: event.description,
    });
  }

  const filteredItems = items
    .filter((item) => {
      if (filter === "ALL") return true;
      if (filter === "AULAS") return item.kind === "AULA";
      if (filter === "TAREFAS") return item.kind === "TAREFA";
      if (filter === "EVENTOS") return item.kind === "EVENTO";
      return true;
    })
    .sort((a, b) => a.sortDate.localeCompare(b.sortDate, "pt-BR"));

  const grouped = new Map<string, typeof filteredItems>();
  for (const item of filteredItems) {
    const current = grouped.get(item.date) ?? [];
    current.push(item);
    grouped.set(item.date, current);
  }

  const weekDates = Array.from({ length: 7 }, (_, index) => getDateOnly(addDays(weekStart, index)));

  return (
    <ModuleShell title="Agenda" description="Aulas, conteúdos, tarefas e eventos da semana">
      <form method="get" className="grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 md:grid-cols-[1fr_auto_auto_auto_auto] md:items-center">
        <ClassSelectAutoSubmit
          name="student_id"
          defaultValue={selectedStudent.studentId}
          options={familyStudents.map((item) => ({ id: item.studentId, name: `${item.studentName} · ${item.className}` }))}
          className="fasy-input"
        />

        <select name="filter" defaultValue={filter} className="fasy-input">
          <option value="ALL">Tudo</option>
          <option value="AULAS">Aulas e conteúdos</option>
          <option value="TAREFAS">Tarefas</option>
          <option value="EVENTOS">Eventos</option>
        </select>

        <Link href={weekLink(previousWeekIso, selectedStudent.studentId, filter)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--panel-soft)]">
          Semana anterior
        </Link>
        <span className="rounded-lg bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--brand-blue)]">{new Date(`${weekStartIso}T12:00:00`).toLocaleDateString("pt-BR")}</span>
        <Link href={weekLink(nextWeekIso, selectedStudent.studentId, filter)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--panel-soft)]">
          Próxima semana
        </Link>
        <input type="hidden" name="week" value={weekStartIso} />
      </form>

      <div className="space-y-4">
        {weekDates.map((date) => {
          const dayItems = grouped.get(date) ?? [];
          return (
            <section key={date} className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <h3 className="text-sm font-semibold text-[var(--brand-blue)]">
                {new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })}
              </h3>
              <div className="mt-3 grid gap-3">
                {dayItems.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--panel-soft)] p-3 text-sm text-[var(--muted)]">Sem itens nesta data.</p>
                ) : (
                  dayItems.map((item, index) => (
                    <article key={`${item.kind}-${item.sortDate}-${index}`} className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-[var(--line)] bg-white px-2 py-0.5 text-[11px] font-semibold text-[var(--brand-blue)]">{item.kind}</span>
                        <strong className="text-sm">{item.title}</strong>
                      </div>
                      <p className="mt-1 text-xs text-[var(--muted)]">{item.subtitle}</p>
                      {item.details ? <p className="mt-2 text-sm whitespace-pre-wrap">{item.details}</p> : null}
                    </article>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </ModuleShell>
  );
}

