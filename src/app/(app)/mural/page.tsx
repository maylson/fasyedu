import Link from "next/link";
import { ModuleShell } from "@/components/module-shell";
import { SubmitButton } from "@/components/submit-button";
import {
  createAnnouncementAction,
  deleteAnnouncementAction,
  updateAnnouncementAction,
} from "@/lib/actions/academic";
import { getUserContext } from "@/lib/app-context";
import { type EducationStage, type UserRole } from "@/lib/constants";

type MuralPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type AnnouncementRow = {
  id: string;
  title: string;
  message: string;
  audience: string;
  is_pinned: boolean;
  published_at: string;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
};

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  event_type: "FERIADO" | "COMEMORACAO" | "PROGRAMACAO";
  is_administrative: boolean;
  target_stages: EducationStage[] | null;
  target_series: string[] | null;
  target_class_ids: string[] | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
};

type ClassAudienceRow = {
  class_id: string;
  classes:
    | { id: string; stage: EducationStage; series: string | null }
    | Array<{ id: string; stage: EducationStage; series: string | null }>
    | null;
};

type FeedItem =
  | {
      kind: "announcement";
      id: string;
      date: string;
      title: string;
      body: string;
      audience: string;
      isPinned: boolean;
      attachmentUrl: string | null;
      attachmentName: string | null;
      attachmentMime: string | null;
    }
  | {
      kind: "event";
      id: string;
      date: string;
      title: string;
      body: string | null;
      eventType: EventRow["event_type"];
      isAdministrative: boolean;
      targetStages: EducationStage[];
      targetSeries: string[];
      attachmentUrl: string | null;
      attachmentName: string | null;
      attachmentMime: string | null;
    };

const EVENT_TYPE_LABELS: Record<EventRow["event_type"], string> = {
  FERIADO: "Feriado",
  COMEMORACAO: "Comemoração",
  PROGRAMACAO: "Programação",
};

const STAGE_LABELS: Record<EducationStage, string> = {
  EDUCACAO_INFANTIL: "Educação Infantil",
  FUNDAMENTAL_1: "Fundamental 1",
  FUNDAMENTAL_2: "Fundamental 2",
  ENSINO_MEDIO: "Ensino Médio",
  CURSO_LIVRE: "Curso Livre",
};

function audienceLabel(value: string) {
  if (value === "TODOS") return "Todos";
  if (value === "STAFF") return "Staff";
  if (value === "PROFESSORES") return "Professores";
  if (value === "PAIS") return "Pais";
  if (value === "ALUNOS") return "Alunos";
  return value;
}

function getEventTypeCardStyles(type: EventRow["event_type"]) {
  if (type === "FERIADO") return "border-rose-200 bg-rose-50 text-rose-900";
  if (type === "COMEMORACAO") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-sky-200 bg-sky-50 text-sky-900";
}

function isStaff(roles: UserRole[]) {
  return roles.some((role) =>
    ["SUPPORT", "DIRECAO", "COORDENACAO", "SECRETARIA", "PROFESSOR"].includes(role),
  );
}

function canManageMural(roles: UserRole[]) {
  return roles.includes("SUPPORT") || roles.includes("DIRECAO") || roles.includes("COORDENACAO");
}

function canSeeAnnouncement(audience: string, roles: UserRole[]) {
  if (roles.includes("SUPPORT")) return true;
  if (audience === "TODOS") return true;
  if (audience === "STAFF") return isStaff(roles);
  if (audience === "PROFESSORES") return roles.includes("PROFESSOR");
  if (audience === "PAIS") return roles.includes("PAI");
  if (audience === "ALUNOS") return roles.includes("ALUNO");
  if (audience === "DIRECAO") return roles.includes("DIRECAO");
  if (audience === "COORDENACAO") return roles.includes("COORDENACAO");
  if (audience === "SECRETARIA") return roles.includes("SECRETARIA");
  return true;
}

function canSeeEventByAudience(
  event: EventRow,
  roles: UserRole[],
  classIds: Set<string>,
  classStages: Set<EducationStage>,
  classSeries: Set<string>,
) {
  if (isStaff(roles)) return true;
  if (event.is_administrative) return false;

  const targetStages = event.target_stages ?? [];
  const targetSeries = event.target_series ?? [];
  const targetClassIds = event.target_class_ids ?? [];
  const hasTargeting =
    targetStages.length > 0 || targetSeries.length > 0 || targetClassIds.length > 0;
  if (!hasTargeting) return true;

  if (targetClassIds.some((id) => classIds.has(id))) return true;
  if (targetStages.some((stage) => classStages.has(stage))) return true;
  if (targetSeries.some((series) => classSeries.has(series))) return true;
  return false;
}

export default async function MuralPage({ searchParams }: MuralPageProps) {
  const { supabase, user, activeSchoolId, roles } = await getUserContext();
  const params = await searchParams;

  const error = typeof params.error === "string" ? params.error : null;
  const success = typeof params.success === "string" ? params.success : null;
  const editAnnouncementId =
    typeof params.edit_announcement_id === "string" ? params.edit_announcement_id : "";
  const deleteAnnouncementId =
    typeof params.delete_announcement_id === "string" ? params.delete_announcement_id : "";

  if (!activeSchoolId) {
    return (
      <ModuleShell
        title="Mural"
        description="Timeline de avisos, recados e eventos do calendário"
      >
        <p className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-4 text-sm">
          Nenhuma escola ativa para exibir o mural.
        </p>
      </ModuleShell>
    );
  }

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const rangeStart = new Date(now);
  rangeStart.setMonth(rangeStart.getMonth() - 6);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(now);
  rangeEnd.setMonth(rangeEnd.getMonth() + 6);
  rangeEnd.setHours(23, 59, 59, 999);

  const [announcementsResult, eventsResult] = await Promise.all([
    supabase
      .from("announcements")
      .select(
        "id, title, message, audience, is_pinned, published_at, attachment_path, attachment_name, attachment_mime",
      )
      .eq("school_id", activeSchoolId)
      .gte("published_at", rangeStart.toISOString())
      .lte("published_at", rangeEnd.toISOString())
      .order("published_at", { ascending: false })
      .limit(120),
    supabase
      .from("events")
      .select(
        "id, title, description, starts_at, event_type, is_administrative, target_stages, target_series, target_class_ids, attachment_path, attachment_name, attachment_mime",
      )
      .eq("school_id", activeSchoolId)
      .gte("starts_at", rangeStart.toISOString())
      .lte("starts_at", rangeEnd.toISOString())
      .order("starts_at", { ascending: false })
      .limit(120),
  ]);

  const announcements = (announcementsResult.data ?? []) as AnnouncementRow[];
  const events = (eventsResult.data ?? []) as EventRow[];

  const studentClassIds = new Set<string>();
  const studentClassStages = new Set<EducationStage>();
  const studentClassSeries = new Set<string>();

  if (!isStaff(roles) && (roles.includes("ALUNO") || roles.includes("PAI"))) {
    let studentIds: string[] = [];

    if (roles.includes("ALUNO")) {
      const { data: ownStudents } = await supabase
        .from("students")
        .select("id")
        .eq("school_id", activeSchoolId)
        .eq("user_id", user.id);
      studentIds = ownStudents?.map((item) => item.id) ?? [];
    }

    if (roles.includes("PAI")) {
      const { data: guardians } = await supabase
        .from("guardians")
        .select("id")
        .eq("school_id", activeSchoolId)
        .eq("user_id", user.id);
      const guardianIds = guardians?.map((item) => item.id) ?? [];
      if (guardianIds.length > 0) {
        const { data: guardianStudents } = await supabase
          .from("student_guardians")
          .select("student_id")
          .eq("school_id", activeSchoolId)
          .in("guardian_id", guardianIds);
        studentIds = [
          ...studentIds,
          ...(guardianStudents?.map((item) => item.student_id) ?? []),
        ];
      }
    }

    const uniqueStudentIds = Array.from(new Set(studentIds));
    if (uniqueStudentIds.length > 0) {
      const { data: classesByStudent } = await supabase
        .from("enrollments")
        .select("class_id, classes(id, stage, series)")
        .eq("school_id", activeSchoolId)
        .eq("status", "ATIVA")
        .in("student_id", uniqueStudentIds);

      const classRows = (classesByStudent ?? []) as ClassAudienceRow[];
      for (const item of classRows) {
        const classRelation = Array.isArray(item.classes)
          ? item.classes[0]
          : item.classes;
        if (!item.class_id || !classRelation) continue;
        studentClassIds.add(item.class_id);
        studentClassStages.add(classRelation.stage);
        if (classRelation.series) studentClassSeries.add(classRelation.series);
      }
    }
  }

  const announcementsVisible = announcements.filter((announcement) =>
    canSeeAnnouncement(String(announcement.audience || "TODOS"), roles),
  );
  const eventsVisible = events.filter((event) =>
    canSeeEventByAudience(
      event,
      roles,
      studentClassIds,
      studentClassStages,
      studentClassSeries,
    ),
  );

  const items: FeedItem[] = [];

  for (const announcement of announcementsVisible) {
    let attachmentUrl: string | null = null;
    if (announcement.attachment_path) {
      const signed = await supabase.storage
        .from("announcement-attachments")
        .createSignedUrl(announcement.attachment_path, 3600);
      attachmentUrl = signed.data?.signedUrl ?? null;
    }
    items.push({
      kind: "announcement",
      id: announcement.id,
      date: announcement.published_at,
      title: announcement.title,
      body: announcement.message,
      audience: announcement.audience,
      isPinned: announcement.is_pinned,
      attachmentUrl,
      attachmentName: announcement.attachment_name,
      attachmentMime: announcement.attachment_mime,
    });
  }

  for (const event of eventsVisible) {
    let attachmentUrl: string | null = null;
    if (event.attachment_path) {
      const signed = await supabase.storage
        .from("event-attachments")
        .createSignedUrl(event.attachment_path, 3600);
      attachmentUrl = signed.data?.signedUrl ?? null;
    }
    items.push({
      kind: "event",
      id: event.id,
      date: event.starts_at,
      title: event.title,
      body: event.description,
      eventType: event.event_type,
      isAdministrative: event.is_administrative,
      targetStages: event.target_stages ?? [],
      targetSeries: event.target_series ?? [],
      attachmentUrl,
      attachmentName: event.attachment_name,
      attachmentMime: event.attachment_mime,
    });
  }

  const feed = items.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  const canManage = canManageMural(roles);
  const announcementToEdit = canManage
    ? announcements.find((announcement) => announcement.id === editAnnouncementId) ?? null
    : null;
  const editPublishedDate = announcementToEdit
    ? new Date(announcementToEdit.published_at).toISOString().slice(0, 10)
    : "";

  return (
    <ModuleShell
      title="Mural"
      description="Timeline de avisos, recados e eventos do calendário"
    >
      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {success}
        </p>
      ) : null}

      {canManage ? (
        <section className="rounded-2xl border border-[var(--line)] bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--brand-blue)]">
              {announcementToEdit ? "Editar aviso" : "Novo aviso"}
            </h3>
            {announcementToEdit ? (
              <Link
                href="/mural"
                className="rounded-lg border border-[var(--line)] bg-white px-3 py-1 text-xs hover:bg-[var(--panel-soft)]"
              >
                Cancelar edição
              </Link>
            ) : null}
          </div>
          <form
            action={announcementToEdit ? updateAnnouncementAction : createAnnouncementAction}
            className="mt-3 grid gap-3"
          >
            {announcementToEdit ? (
              <input type="hidden" name="id" value={announcementToEdit.id} />
            ) : null}
            <div className="grid gap-3 lg:grid-cols-3">
              <input
                name="title"
                className="fasy-input"
                placeholder="Título do aviso"
                defaultValue={announcementToEdit?.title ?? ""}
                required
              />
              <input
                name="published_date"
                type="date"
                className="fasy-input"
                defaultValue={announcementToEdit ? editPublishedDate : ""}
              />
              <select
                name="audience"
                defaultValue={announcementToEdit?.audience ?? "TODOS"}
                className="fasy-input"
              >
                <option value="TODOS">Todos</option>
                <option value="STAFF">Staff</option>
                <option value="PROFESSORES">Professores</option>
                <option value="PAIS">Pais</option>
                <option value="ALUNOS">Alunos</option>
              </select>
            </div>
            <textarea
              name="message"
              className="fasy-input min-h-24"
              placeholder="Descrição / recado"
              defaultValue={announcementToEdit?.message ?? ""}
              required
            />
            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="is_pinned"
                  className="h-4 w-4"
                  defaultChecked={Boolean(announcementToEdit?.is_pinned)}
                />
                <span>Fixar no topo do mural</span>
              </label>
              <input
                type="file"
                name="attachment_file"
                accept=".pdf,image/*"
                className="fasy-input text-sm"
              />
            </div>
            {announcementToEdit?.attachment_name ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="remove_attachment" className="h-4 w-4" />
                <span>Remover anexo atual ({announcementToEdit.attachment_name})</span>
              </label>
            ) : null}
            <div>
              <SubmitButton
                className="fasy-btn-primary px-4 py-2 text-sm"
                pendingLabel={announcementToEdit ? "Salvando..." : "Publicando..."}
              >
                {announcementToEdit ? "Salvar alterações" : "Publicar aviso"}
              </SubmitButton>
            </div>
          </form>
        </section>
      ) : null}

      <section className="relative space-y-4">
        <div className="pointer-events-none absolute bottom-1 left-[13px] top-1 w-px bg-[var(--line)]" />
        {feed.length === 0 ? (
          <p className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-4 text-sm text-[var(--muted)]">
            Nenhum item no mural para este período.
          </p>
        ) : (
          feed.map((item) => (
            <article
              key={`${item.kind}-${item.id}`}
              className={`relative ml-7 rounded-2xl border bg-white p-4 shadow-[0_10px_24px_rgba(8,33,63,0.06)] ${
                new Date(item.date) >= weekStart && new Date(item.date) <= weekEnd
                  ? "border-[var(--brand-blue)] ring-2 ring-[var(--brand-blue)]/15"
                  : "border-[var(--line)]"
              }`}
            >
              <span className="absolute -left-[26px] top-4 h-3 w-3 rounded-full bg-[var(--brand-blue)] ring-4 ring-white" />
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-[var(--brand-blue)]">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {new Date(item.date).toLocaleDateString("pt-BR")} ·{" "}
                    {new Date(item.date).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                {item.kind === "announcement" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[var(--line)] bg-[var(--panel-soft)] px-2 py-0.5 text-[10px]">
                      Aviso · {audienceLabel(item.audience)}
                    </span>
                    {item.isPinned ? (
                      <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-semibold text-[#113c66]">
                        Fixado
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] ${getEventTypeCardStyles(item.eventType)}`}
                    >
                      Evento · {EVENT_TYPE_LABELS[item.eventType]}
                    </span>
                    {item.isAdministrative ? (
                      <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700">
                        Administrativo
                      </span>
                    ) : null}
                  </div>
                )}
              </div>

              {item.body ? (
                <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--text)]">
                  {item.body}
                </p>
              ) : null}

              {item.kind === "event" &&
              (item.targetStages.length > 0 || item.targetSeries.length > 0) ? (
                <div className="mt-3 flex flex-wrap gap-1">
                  {item.targetStages.map((stage) => (
                    <span
                      key={`${item.id}-${stage}`}
                      className="rounded-full border border-[var(--line)] bg-[var(--panel-soft)] px-2 py-0.5 text-[10px]"
                    >
                      {STAGE_LABELS[stage]}
                    </span>
                  ))}
                  {item.targetSeries.map((series) => (
                    <span
                      key={`${item.id}-${series}`}
                      className="rounded-full border border-[var(--line)] bg-[var(--panel-soft)] px-2 py-0.5 text-[10px]"
                    >
                      {series}
                    </span>
                  ))}
                </div>
              ) : null}

              {item.attachmentUrl ? (
                <div className="mt-3 space-y-2">
                  {item.attachmentMime?.startsWith("image/") ? (
                    <img
                      src={item.attachmentUrl}
                      alt={item.attachmentName ?? "Anexo"}
                      className="max-h-56 w-full rounded-xl border border-[var(--line)] object-cover"
                    />
                  ) : item.attachmentMime === "application/pdf" ? (
                    <iframe
                      src={`${item.attachmentUrl}#toolbar=0&navpanes=0&scrollbar=0&page=1`}
                      className="h-56 w-full rounded-xl border border-[var(--line)]"
                      title={item.attachmentName ?? "Pré-visualização do PDF"}
                    />
                  ) : null}
                  <a
                    href={item.attachmentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs underline"
                  >
                    {item.attachmentName ?? "Abrir anexo"}
                  </a>
                </div>
              ) : null}

              {canManage && item.kind === "announcement" ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link
                    href={`/mural?edit_announcement_id=${item.id}`}
                    className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs hover:bg-[var(--panel-soft)]"
                  >
                    Editar
                  </Link>
                  {deleteAnnouncementId === item.id ? (
                    <>
                      <form action={deleteAnnouncementAction}>
                        <input type="hidden" name="id" value={item.id} />
                        <SubmitButton
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100"
                          pendingLabel="Excluindo..."
                        >
                          Confirmar exclusão
                        </SubmitButton>
                      </form>
                      <Link
                        href="/mural"
                        className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs hover:bg-[var(--panel-soft)]"
                      >
                        Cancelar
                      </Link>
                    </>
                  ) : (
                    <Link
                      href={`/mural?delete_announcement_id=${item.id}`}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100"
                    >
                      Excluir
                    </Link>
                  )}
                </div>
              ) : null}
            </article>
          ))
        )}
      </section>
    </ModuleShell>
  );
}

