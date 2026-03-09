import { ClassSelectAutoSubmit } from "@/components/class-select-auto-submit";
import { ModuleShell } from "@/components/module-shell";
import { ScheduleCreateForm } from "@/components/schedule-create-form";
import {
  createClassScheduleAction,
  deleteClassScheduleAction,
  updateClassScheduleAction,
} from "@/lib/actions/academic";
import { getUserContext } from "@/lib/app-context";
import { getWeekdayLabel, WEEKDAY_OPTIONS } from "@/lib/constants";

export const dynamic = "force-dynamic";

type HorariosPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HorariosPage({ searchParams }: HorariosPageProps) {
  const { supabase, activeSchoolId, roles } = await getUserContext();
  const params = await searchParams;
  const selectedClassId = typeof params.class_id === "string" ? params.class_id : "";
  const effectiveClassId = selectedClassId || "";
  const editScheduleId = typeof params.edit_schedule_id === "string" ? params.edit_schedule_id : "";
  const deleteScheduleId = typeof params.delete_schedule_id === "string" ? params.delete_schedule_id : "";
  const error = typeof params.error === "string" ? params.error : null;
  const canManageSchedules = roles.includes("SUPPORT") || roles.includes("DIRECAO") || roles.includes("COORDENACAO");

  const schedulesQuery = supabase
    .from("class_schedules")
    .select("id, class_id, class_subject_id, teacher_id, entry_type, title, day_of_week, starts_at, ends_at")
    .eq("school_id", activeSchoolId)
    .order("day_of_week")
    .order("starts_at")
    .limit(5000);

  const [classesResult, classSubjectsResult, teachersResult, schedulesResult] = await Promise.all([
    supabase.from("classes").select("id, name, stage").eq("school_id", activeSchoolId).limit(300),
    supabase.from("class_subjects").select("id, class_id, subjects(name)").eq("school_id", activeSchoolId),
    supabase.from("teachers").select("id, full_name").eq("school_id", activeSchoolId).order("full_name"),
    (effectiveClassId ? schedulesQuery.eq("class_id", effectiveClassId) : schedulesQuery),
  ]);

  const classes = (classesResult.data ?? []) as Array<{ id: string; name: string; stage: string }>;
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

  const classSubjects = (classSubjectsResult.data ?? []) as Array<{
    id: string;
    class_id: string;
    subjects?: { name?: string } | Array<{ name?: string }>;
  }>;
  const teachers = (teachersResult.data ?? []) as Array<{ id: string; full_name: string }>;
  const teacherNameById = new Map(teachers.map((item) => [item.id, item.full_name]));
  const schedules = (schedulesResult.data ?? []) as Array<{
    id: string;
    class_id: string;
    class_subject_id: string | null;
    teacher_id: string | null;
    entry_type: "AULA" | "INTERVALO";
    title: string | null;
    day_of_week: number;
    starts_at: string;
    ends_at: string;
  }>;

  const subjectsOfClass = classSubjects.filter((item) => item.class_id === effectiveClassId);
  const schedulesOfClass = schedules.filter((item) => item.class_id === effectiveClassId);
  const hasSaturdayOrSundayClass = schedulesOfClass.some((entry) => entry.day_of_week === 6 || entry.day_of_week === 7);
  const hasSundayClass = schedulesOfClass.some((entry) => entry.day_of_week === 7);

  const visibleWeekdays = WEEKDAY_OPTIONS.filter((day) => {
    if (day.value <= 5) return true;
    if (day.value === 6) return hasSaturdayOrSundayClass;
    if (day.value === 7) return hasSundayClass;
    return false;
  });

  const timeSlots = Array.from(new Set(schedulesOfClass.map((entry) => entry.starts_at))).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const entriesByDayAndSlot = new Map<string, typeof schedulesOfClass>();
  for (const entry of schedulesOfClass) {
    const key = `${entry.day_of_week}|${entry.starts_at}`;
    const existing = entriesByDayAndSlot.get(key) ?? [];
    existing.push(entry);
    entriesByDayAndSlot.set(key, existing);
  }

  return (
    <ModuleShell title="Horários Semanais" description="Gestão visual de horários por turma">
      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <form method="get" className="rounded-2xl border border-[var(--line)] bg-white p-4">
        <ClassSelectAutoSubmit
          name="class_id"
          defaultValue={effectiveClassId}
          options={classesSorted.map((item) => ({ id: item.id, name: item.name }))}
          className="fasy-input"
          placeholder="Selecione uma turma"
          loadingTargetId="schedule-grid-zone"
        />
      </form>

      {effectiveClassId && canManageSchedules ? (
        <ScheduleCreateForm
          classId={effectiveClassId}
          action={createClassScheduleAction}
          subjects={subjectsOfClass.map((item) => ({
            id: item.id,
            name: Array.isArray(item.subjects) ? item.subjects[0]?.name ?? "-" : item.subjects?.name ?? "-",
          }))}
          teachers={teachers.map((item) => ({ id: item.id, fullName: item.full_name }))}
        />
      ) : (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-4 text-sm">
          {effectiveClassId
            ? "Somente Direção e Coordenação podem editar horários."
            : "Selecione uma turma para visualizar a grade semanal."}
        </p>
      )}

      <div id="schedule-grid-zone" className="relative">
        <div
          data-loading-overlay
          className="pointer-events-none absolute inset-0 z-30 hidden rounded-2xl border border-[var(--line)] bg-white/70 backdrop-blur-sm"
        >
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--brand-blue)] shadow-[0_10px_24px_rgba(8,33,63,0.12)]">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--brand-blue)]" />
              Carregando grade da turma...
            </div>
          </div>
        </div>

        {effectiveClassId ? (
          <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--panel-soft)] text-[var(--muted)]">
                <tr>
                  <th className="w-24 px-3 py-2">Horário</th>
                  {visibleWeekdays.map((day) => (
                    <th key={`head-${day.value}`} className="px-3 py-2">
                      {day.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timeSlots.length === 0 ? (
                  <tr className="border-t border-[var(--line)]">
                    <td colSpan={visibleWeekdays.length + 1} className="px-3 py-6 text-center text-[var(--muted)]">
                      Sem horários cadastrados para esta turma.
                    </td>
                  </tr>
                ) : null}
                {timeSlots.map((slot) => (
                  <tr key={`row-${slot}`} className="border-t border-[var(--line)] align-top">
                    <td className="px-3 py-3 text-xs font-semibold text-[var(--brand-blue)] whitespace-nowrap">{slot.slice(0, 5)}</td>
                    {visibleWeekdays.map((day) => {
                      const slotEntries = entriesByDayAndSlot.get(`${day.value}|${slot}`) ?? [];
                      return (
                        <td key={`cell-${day.value}-${slot}`} className="px-2 py-2">
                          <div className="space-y-2">
                            {slotEntries.length === 0 ? (
                              <div className="min-h-14 rounded-lg border border-dashed border-[var(--line)] bg-[var(--panel-soft)]/40" />
                            ) : null}
                            {slotEntries.map((entry) => {
                    const subject = classSubjects.find((item) => item.id === entry.class_subject_id);
                    const subjectName = Array.isArray(subject?.subjects) ? subject?.subjects[0]?.name : subject?.subjects?.name;
                    const teacherName = entry.teacher_id ? teacherNameById.get(entry.teacher_id) ?? "Professor" : null;
                    const isInterval = entry.entry_type === "INTERVALO";
                    const cardTitle = isInterval ? entry.title || "Intervalo" : subjectName ?? "Disciplina";
                    const isEditing = editScheduleId === entry.id;
                    const isDeleting = deleteScheduleId === entry.id;
                    const cardStateClass = isDeleting
                      ? "border-rose-300 bg-rose-50 shadow-[0_0_0_2px_rgba(225,29,72,0.12)]"
                      : isEditing
                        ? "border-sky-300 bg-sky-50 shadow-[0_0_0_2px_rgba(14,165,233,0.12)]"
                        : "border-[var(--line)] bg-[var(--panel-soft)]";
                    const cardTransitionClass = isEditing || isDeleting
                      ? "transition duration-200"
                      : "transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(8,33,63,0.14)]";

                    return (
                      <article
                        key={entry.id}
                        className={`rounded-xl border p-2 ${cardStateClass} ${cardTransitionClass}`}
                      >
                        <p className="text-xs font-semibold">{cardTitle}</p>
                        {isInterval ? <p className="text-xs text-amber-700">Intervalo</p> : <p className="text-xs text-[var(--muted)]">{teacherName ?? "Professor"}</p>}
                        <p className="mt-1 text-xs text-[var(--brand-blue)]">
                          {entry.starts_at.slice(0, 5)} - {entry.ends_at.slice(0, 5)}
                        </p>

                        {!isEditing && !isDeleting && canManageSchedules ? (
                          <div className="mt-2 flex items-center gap-2">
                            <a
                              href={`/horarios?class_id=${encodeURIComponent(effectiveClassId)}&edit_schedule_id=${encodeURIComponent(entry.id)}`}
                              className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs hover:bg-white"
                            >
                              Editar
                            </a>
                            <a
                              href={`/horarios?class_id=${encodeURIComponent(effectiveClassId)}&delete_schedule_id=${encodeURIComponent(entry.id)}`}
                              className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                            >
                              Excluir
                            </a>
                          </div>
                        ) : null}

                        {isEditing && canManageSchedules ? (
                          <form action={updateClassScheduleAction} className="mt-2 grid gap-1">
                            <input type="hidden" name="id" value={entry.id} />
                            <input type="hidden" name="entry_type" value={entry.entry_type} />
                            <select name="day_of_week" defaultValue={entry.day_of_week} className="fasy-input text-xs">
                              {WEEKDAY_OPTIONS.map((weekday) => (
                                <option key={weekday.value} value={weekday.value}>
                                  {getWeekdayLabel(weekday.value)}
                                </option>
                              ))}
                            </select>
                            <input name="starts_at" type="time" defaultValue={entry.starts_at.slice(0, 5)} className="fasy-input text-xs" />
                            <input name="ends_at" type="time" defaultValue={entry.ends_at.slice(0, 5)} className="fasy-input text-xs" />
                            {isInterval ? (
                              <input
                                name="title"
                                defaultValue={entry.title ?? ""}
                                placeholder="Ex.: Recreio, Lanche, Almoço..."
                                className="fasy-input text-xs"
                              />
                            ) : (
                              <>
                                <select name="class_subject_id" defaultValue={entry.class_subject_id ?? ""} className="fasy-input text-xs">
                                  <option value="">Disciplina</option>
                                  {subjectsOfClass.map((item) => {
                                    const itemSubjectName = Array.isArray(item.subjects) ? item.subjects[0]?.name : item.subjects?.name;
                                    return (
                                      <option key={`edit-subject-${entry.id}-${item.id}`} value={item.id}>
                                        {itemSubjectName ?? "-"}
                                      </option>
                                    );
                                  })}
                                </select>
                                <select name="teacher_id" defaultValue={entry.teacher_id ?? ""} className="fasy-input text-xs">
                                  <option value="">Professor</option>
                                  {teachers.map((item) => (
                                    <option key={`edit-teacher-${entry.id}-${item.id}`} value={item.id}>
                                      {item.full_name}
                                    </option>
                                  ))}
                                </select>
                              </>
                            )}
                            <div className="mt-1 flex items-center gap-2">
                              <button type="submit" className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs hover:bg-white">
                                Salvar
                              </button>
                              <a
                                href={`/horarios?class_id=${encodeURIComponent(effectiveClassId)}`}
                                className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs hover:bg-white"
                              >
                                Cancelar
                              </a>
                            </div>
                          </form>
                        ) : null}

                        {isDeleting && canManageSchedules ? (
                          <div className="mt-2 space-y-2">
                            <p className="text-xs text-rose-700">Confirma excluir este horário?</p>
                            <form action={deleteClassScheduleAction} className="flex items-center gap-2">
                              <input type="hidden" name="id" value={entry.id} />
                              <button type="submit" className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50">
                                Confirmar
                              </button>
                              <a
                                href={`/horarios?class_id=${encodeURIComponent(effectiveClassId)}`}
                                className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs hover:bg-white"
                              >
                                Cancelar
                              </a>
                            </form>
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
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white p-8 text-center text-sm text-[var(--muted)]">
            Selecione uma turma para carregar a grade semanal.
          </div>
        )}
      </div>
    </ModuleShell>
  );
}

