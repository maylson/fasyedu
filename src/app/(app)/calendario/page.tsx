import Link from "next/link";
import { CalendarEventForm } from "@/components/calendar-event-form";
import { ModuleShell } from "@/components/module-shell";
import { SubmitButton } from "@/components/submit-button";
import { createEventAction, deleteEventAction } from "@/lib/actions/academic";
import { getUserContext } from "@/lib/app-context";
import { type EducationStage } from "@/lib/constants";

type CalendarioPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type EventType = "FERIADO" | "COMEMORACAO" | "PROGRAMACAO";
type CalendarViewMode = "cards" | "month-grid";

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  event_type: EventType;
  is_administrative: boolean;
  target_stages: EducationStage[] | null;
  target_series: string[] | null;
  target_class_ids: string[] | null;
  attachment_path: string | null;
  attachment_name: string | null;
};

const STAGE_LABELS: Record<EducationStage, string> = {
  EDUCACAO_INFANTIL: "Educação Infantil",
  FUNDAMENTAL_1: "Fundamental 1",
  FUNDAMENTAL_2: "Fundamental 2",
  ENSINO_MEDIO: "Ensino Médio",
  CURSO_LIVRE: "Curso Livre",
};

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  FERIADO: "Feriado",
  COMEMORACAO: "Comemoração",
  PROGRAMACAO: "Programação",
};

function parseMonthParam(raw?: string) {
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  const [yearText, monthText] = raw.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return { year, month };
}

function formatMonthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function withQuery(baseMonth: string, eventType: string, view: CalendarViewMode) {
  const params = new URLSearchParams();
  params.set("month", baseMonth);
  if (eventType !== "ALL") params.set("event_type", eventType);
  params.set("view", view);
  return `/calendario?${params.toString()}`;
}

function getEventTypeCardStyles(type: EventType) {
  if (type === "FERIADO") return "border-rose-200 bg-rose-50 text-rose-800";
  if (type === "COMEMORACAO") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-sky-200 bg-sky-50 text-sky-800";
}

export default async function CalendarioPage({ searchParams }: CalendarioPageProps) {
  const { supabase, activeSchoolId, roles } = await getUserContext();
  const params = await searchParams;

  if (!activeSchoolId) {
    return (
      <ModuleShell title="Calendário Escolar" description="Eventos, reuniões e atividades institucionais">
        <p className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-4 text-sm">Nenhuma escola ativa para exibir dados.</p>
      </ModuleShell>
    );
  }

  const canManage = roles.includes("DIRECAO") || roles.includes("COORDENACAO") || roles.includes("SECRETARIA");
  const isStaff = roles.some((role) => ["DIRECAO", "COORDENACAO", "SECRETARIA", "PROFESSOR"].includes(role));

  const monthParam = typeof params.month === "string" ? params.month : undefined;
  const eventTypeRaw = typeof params.event_type === "string" ? params.event_type : "ALL";
  const viewRaw = typeof params.view === "string" ? params.view : "cards";
  const eventTypeFilter = ["ALL", "FERIADO", "COMEMORACAO", "PROGRAMACAO"].includes(eventTypeRaw)
    ? eventTypeRaw
    : "ALL";
  const currentView: CalendarViewMode = viewRaw === "month-grid" ? "month-grid" : "cards";

  const { year, month } = parseMonthParam(monthParam);
  const currentMonth = `${year}-${String(month).padStart(2, "0")}`;
  const prevDate = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const nextDate = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const prevMonth = `${prevDate.year}-${String(prevDate.month).padStart(2, "0")}`;
  const nextMonth = `${nextDate.year}-${String(nextDate.month).padStart(2, "0")}`;

  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

  let eventsQuery = supabase
    .from("events")
    .select(
      "id, title, description, starts_at, ends_at, event_type, is_administrative, target_stages, target_series, target_class_ids, attachment_path, attachment_name",
    )
    .eq("school_id", activeSchoolId)
    .gte("starts_at", monthStart.toISOString())
    .lte("starts_at", monthEnd.toISOString())
    .order("starts_at");

  if (!isStaff) {
    eventsQuery = eventsQuery.eq("is_administrative", false);
  }
  if (eventTypeFilter !== "ALL") {
    eventsQuery = eventsQuery.eq("event_type", eventTypeFilter);
  }

  const [eventsResult, classesResult, schoolYearResult] = await Promise.all([
    eventsQuery,
    supabase.from("classes").select("id, name, series, stage").eq("school_id", activeSchoolId).order("name"),
    supabase
      .from("school_years")
      .select("starts_at, ends_at")
      .eq("school_id", activeSchoolId)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  const events = (eventsResult.data ?? []) as EventRow[];
  const classes = (classesResult.data ?? []) as Array<{ id: string; name: string; series: string | null; stage: EducationStage }>;
  const classNameById = new Map(classes.map((item) => [item.id, item.name]));

  const eventsWithAttachmentUrl = await Promise.all(
    events.map(async (event) => {
      if (!event.attachment_path) {
        return { ...event, attachment_url: null as string | null };
      }
      const signed = await supabase.storage.from("event-attachments").createSignedUrl(event.attachment_path, 3600);
      return { ...event, attachment_url: signed.data?.signedUrl ?? null };
    }),
  );

  const deleteEventId = typeof params.delete_event_id === "string" ? params.delete_event_id : "";
  const weekDayLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const localDateKeyFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
  const eventsByDate = new Map<string, Array<(typeof eventsWithAttachmentUrl)[number]>>();
  for (const event of eventsWithAttachmentUrl) {
    const key = localDateKeyFormatter.format(new Date(event.starts_at));
    const current = eventsByDate.get(key) ?? [];
    current.push(event);
    eventsByDate.set(key, current);
  }

  const firstDayIndex = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingDays = Array.from({ length: firstDayIndex }, (_, idx) => {
    const dayNumber = idx - firstDayIndex + 1;
    return new Date(year, month - 1, dayNumber);
  });
  const monthDays = Array.from({ length: daysInMonth }, (_, idx) => new Date(year, month - 1, idx + 1));
  const preGridCount = leadingDays.length + monthDays.length;
  const trailingCount = preGridCount % 7 === 0 ? 0 : 7 - (preGridCount % 7);
  const trailingDays = Array.from({ length: trailingCount }, (_, idx) => new Date(year, month, idx + 1));
  const monthGridDays = [...leadingDays, ...monthDays, ...trailingDays];

  return (
    <ModuleShell title="Calendário Escolar" description="Eventos organizados em cards com segmentação por etapa, série e turma">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--line)] bg-white p-4">
        <div className="flex items-center gap-2">
          <Link href={withQuery(prevMonth, eventTypeFilter, currentView)} className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm hover:bg-[var(--panel-soft)]">
            Mês anterior
          </Link>
          <span className="rounded-lg bg-[var(--panel-soft)] px-3 py-1 text-sm font-medium text-[var(--brand-blue)] capitalize">
            {formatMonthLabel(year, month)}
          </span>
          <Link href={withQuery(nextMonth, eventTypeFilter, currentView)} className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm hover:bg-[var(--panel-soft)]">
            Próximo mês
          </Link>
        </div>

        <form method="get" className="flex items-center gap-2">
          <input type="hidden" name="month" value={currentMonth} />
          <input type="hidden" name="view" value={currentView} />
          <select name="event_type" defaultValue={eventTypeFilter} className="fasy-input text-sm">
            <option value="ALL">Todos os tipos</option>
            <option value="FERIADO">Feriado</option>
            <option value="COMEMORACAO">Comemoração</option>
            <option value="PROGRAMACAO">Programação</option>
          </select>
          <button type="submit" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--panel-soft)]">
            Aplicar filtro
          </button>
        </form>
      </div>

      <div className="flex items-center gap-2">
        <Link
          href={withQuery(currentMonth, eventTypeFilter, "cards")}
          className={`rounded-lg border px-3 py-1.5 text-sm ${currentView === "cards" ? "border-[var(--brand-blue)] bg-[var(--brand-blue)] text-white" : "border-[var(--line)] bg-white hover:bg-[var(--panel-soft)]"}`}
        >
          Cards
        </Link>
        <Link
          href={withQuery(currentMonth, eventTypeFilter, "month-grid")}
          className={`rounded-lg border px-3 py-1.5 text-sm ${currentView === "month-grid" ? "border-[var(--brand-blue)] bg-[var(--brand-blue)] text-white" : "border-[var(--line)] bg-white hover:bg-[var(--panel-soft)]"}`}
        >
          Grade mensal
        </Link>
      </div>

      {canManage ? (
        <CalendarEventForm
          action={createEventAction}
          classes={classes}
          schoolYearStart={schoolYearResult.data?.starts_at ?? null}
          schoolYearEnd={schoolYearResult.data?.ends_at ?? null}
        />
      ) : null}

      <section className="space-y-3">
        {eventsWithAttachmentUrl.length === 0 ? (
          <p className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-4 text-sm text-[var(--muted)]">Nenhum evento para este período.</p>
        ) : currentView === "cards" ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {eventsWithAttachmentUrl.map((event) => {
              const isDeleting = deleteEventId === event.id;
              const targetStages = event.target_stages ?? [];
              const targetSeries = event.target_series ?? [];
              const targetClassIds = event.target_class_ids ?? [];
              const targetClassNames = targetClassIds.map((id) => classNameById.get(id)).filter(Boolean) as string[];

              return (
                <article
                  key={event.id}
                  className={`rounded-2xl border p-4 shadow-[0_10px_24px_rgba(8,33,63,0.06)] ${getEventTypeCardStyles(event.event_type)} ${isDeleting ? "ring-2 ring-rose-300" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold">{event.title}</h3>
                      <p className="mt-1 text-xs opacity-90">{new Date(event.starts_at).toLocaleDateString("pt-BR")}</p>
                    </div>
                    <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium">{EVENT_TYPE_LABELS[event.event_type]}</span>
                  </div>

                  {event.description ? <p className="mt-3 text-sm whitespace-pre-wrap">{event.description}</p> : null}

                  <div className="mt-3 flex flex-wrap gap-1">
                    {event.is_administrative ? (
                      <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">Administrativo</span>
                    ) : null}
                    {targetStages.map((stage) => (
                      <span key={`stage-chip-${event.id}-${stage}`} className="rounded-full border border-[var(--line)] bg-white/70 px-2 py-0.5 text-[10px]">
                        {STAGE_LABELS[stage]}
                      </span>
                    ))}
                    {targetSeries.map((series) => (
                      <span key={`series-chip-${event.id}-${series}`} className="rounded-full border border-[var(--line)] bg-white/70 px-2 py-0.5 text-[10px]">
                        {series}
                      </span>
                    ))}
                    {targetClassNames.slice(0, 2).map((className) => (
                      <span key={`class-chip-${event.id}-${className}`} className="rounded-full border border-[var(--line)] bg-white/70 px-2 py-0.5 text-[10px]">
                        {className}
                      </span>
                    ))}
                    {targetClassNames.length > 2 ? (
                      <span className="rounded-full border border-[var(--line)] bg-white/70 px-2 py-0.5 text-[10px]">+{targetClassNames.length - 2} turmas</span>
                    ) : null}
                    {targetStages.length === 0 && targetSeries.length === 0 && targetClassNames.length === 0 ? (
                      <span className="rounded-full border border-[var(--line)] bg-white/70 px-2 py-0.5 text-[10px]">Toda a escola</span>
                    ) : null}
                  </div>

                  {event.attachment_url ? (
                    <div className="mt-3">
                      <a href={event.attachment_url} target="_blank" rel="noreferrer" className="text-xs underline">
                        Anexo: {event.attachment_name ?? "Arquivo"}
                      </a>
                    </div>
                  ) : null}

                  {canManage ? (
                    <div className="mt-4 flex items-center gap-2">
                      {!isDeleting ? (
                        <Link href={`${withQuery(currentMonth, eventTypeFilter, currentView)}&delete_event_id=${event.id}`} className="rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs text-rose-700 hover:bg-rose-50">
                          Excluir
                        </Link>
                      ) : (
                        <div className="flex items-center gap-2">
                          <form action={deleteEventAction}>
                            <input type="hidden" name="id" value={event.id} />
                            <SubmitButton className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100" pendingLabel="Excluindo...">
                              Confirmar
                            </SubmitButton>
                          </form>
                          <Link href={withQuery(currentMonth, eventTypeFilter, currentView)} className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs hover:bg-[var(--panel-soft)]">
                            Cancelar
                          </Link>
                        </div>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--line)] bg-white p-3">
            <div className="grid grid-cols-7 gap-2">
              {weekDayLabels.map((day) => (
                <div key={day} className="rounded-lg bg-[var(--panel-soft)] px-2 py-1 text-center text-xs font-semibold text-[var(--muted)]">
                  {day}
                </div>
              ))}
              {monthGridDays.map((dateValue) => {
                const dateKey = localDateKeyFormatter.format(dateValue);
                const dayEvents = eventsByDate.get(dateKey) ?? [];
                const isCurrentMonth = dateValue.getMonth() === month - 1;
                return (
                  <div
                    key={`grid-day-${dateKey}`}
                    className={`min-h-32 rounded-xl border p-2 ${isCurrentMonth ? "border-[var(--line)] bg-white" : "border-[var(--line)] bg-[var(--panel-soft)]/40 opacity-80"}`}
                  >
                    <div className="mb-2 text-xs font-semibold text-[var(--brand-blue)]">{dateValue.getDate()}</div>
                    <div className="space-y-1.5">
                      {dayEvents.slice(0, 3).map((event) => (
                        <div key={`event-mini-${event.id}`} className={`rounded-lg border px-2 py-1 text-[11px] ${getEventTypeCardStyles(event.event_type)}`}>
                          <p className="truncate font-semibold">{event.title}</p>
                          <p className="truncate text-[10px] opacity-90">{EVENT_TYPE_LABELS[event.event_type]}</p>
                        </div>
                      ))}
                      {dayEvents.length > 3 ? (
                        <p className="text-[10px] font-medium text-[var(--muted)]">+{dayEvents.length - 3} evento(s)</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </ModuleShell>
  );
}
