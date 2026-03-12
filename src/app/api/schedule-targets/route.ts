import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const WEEKDAY_LABELS: Record<number, string> = {
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sábado",
  7: "Domingo",
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const classId = String(url.searchParams.get("class_id") ?? "").trim();

  if (!classId) {
    return NextResponse.json({ error: "Turma de destino inválida." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("user_school_roles")
    .select("school_id")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (membershipsError) {
    return NextResponse.json({ error: membershipsError.message }, { status: 500 });
  }

  if (!memberships?.length) {
    return NextResponse.json({ error: "Sem escola ativa." }, { status: 403 });
  }

  const schoolIds = memberships.map((item) => item.school_id);
  const cookieStore = await cookies();
  const activeSchoolCookie = cookieStore.get("active_school_id")?.value;
  const activeSchoolId = schoolIds.includes(activeSchoolCookie ?? "") ? activeSchoolCookie! : schoolIds[0];

  const { data: targetClass, error: classError } = await supabase
    .from("classes")
    .select("id")
    .eq("id", classId)
    .eq("school_id", activeSchoolId)
    .maybeSingle();

  if (classError) {
    return NextResponse.json({ error: classError.message }, { status: 500 });
  }

  if (!targetClass) {
    return NextResponse.json({ error: "Turma não encontrada na escola ativa." }, { status: 404 });
  }

  const { data: schedules, error: schedulesError } = await supabase
    .from("class_schedules")
    .select("id, class_id, day_of_week, starts_at, class_subjects(subjects(name))")
    .eq("school_id", activeSchoolId)
    .eq("class_id", classId)
    .eq("entry_type", "AULA")
    .order("day_of_week")
    .order("starts_at");

  if (schedulesError) {
    return NextResponse.json({ error: schedulesError.message }, { status: 500 });
  }

  const targets = ((schedules ?? []) as Array<{
    id: string;
    class_id: string;
    day_of_week: number;
    starts_at: string;
    class_subjects?:
      | { subjects?: { name?: string } | Array<{ name?: string }> }
      | Array<{ subjects?: { name?: string } | Array<{ name?: string }> }>;
  }>).map((schedule) => {
    const classSubject = Array.isArray(schedule.class_subjects) ? schedule.class_subjects[0] : schedule.class_subjects;
    const subjectName = Array.isArray(classSubject?.subjects) ? classSubject?.subjects[0]?.name : classSubject?.subjects?.name;
    const weekdayLabel = WEEKDAY_LABELS[schedule.day_of_week] ?? "Dia";
    return {
      scheduleId: schedule.id,
      classId: schedule.class_id,
      dayOfWeek: schedule.day_of_week,
      label: `${weekdayLabel} · ${schedule.starts_at.slice(0, 5)} · ${subjectName ?? "Disciplina"}`,
    };
  });

  return NextResponse.json({ targets });
}

