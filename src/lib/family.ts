import type { SupabaseClient } from "@supabase/supabase-js";
import type { EducationStage, UserRole } from "@/lib/constants";

export type FamilyStudentItem = {
  studentId: string;
  studentName: string;
  classId: string | null;
  className: string;
  classSeries: string | null;
  classStage: EducationStage | null;
};

export function getDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function getWeekStart(dateInput?: string) {
  const baseDate = dateInput ? new Date(`${dateInput}T12:00:00`) : new Date();
  const day = baseDate.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(baseDate);
  start.setDate(baseDate.getDate() + mondayOffset);
  start.setHours(12, 0, 0, 0);
  return start;
}

export async function getFamilyStudents(
  supabase: SupabaseClient,
  schoolId: string,
  userId: string,
  roles: UserRole[],
): Promise<FamilyStudentItem[]> {
  let studentIds: string[] = [];

  if (roles.includes("ALUNO")) {
    const { data: ownStudents } = await supabase
      .from("students")
      .select("id")
      .eq("school_id", schoolId)
      .eq("user_id", userId);
    studentIds = [...studentIds, ...((ownStudents ?? []).map((row) => row.id))];
  }

  if (roles.includes("PAI")) {
    const { data: guardians } = await supabase
      .from("guardians")
      .select("id")
      .eq("school_id", schoolId)
      .eq("user_id", userId);

    const guardianIds = (guardians ?? []).map((row) => row.id);
    if (guardianIds.length > 0) {
      const { data: guardianStudents } = await supabase
        .from("student_guardians")
        .select("student_id")
        .eq("school_id", schoolId)
        .in("guardian_id", guardianIds);

      studentIds = [...studentIds, ...((guardianStudents ?? []).map((row) => row.student_id))];
    }
  }

  const uniqueStudentIds = Array.from(new Set(studentIds.filter(Boolean)));
  if (uniqueStudentIds.length === 0) {
    return [];
  }

  const [{ data: students }, { data: enrollments }] = await Promise.all([
    supabase
      .from("students")
      .select("id, full_name")
      .eq("school_id", schoolId)
      .in("id", uniqueStudentIds),
    supabase
      .from("enrollments")
      .select("student_id, class_id, classes(id,name,series,stage)")
      .eq("school_id", schoolId)
      .eq("status", "ATIVA")
      .in("student_id", uniqueStudentIds),
  ]);

  const enrollmentByStudent = new Map<
    string,
    { classId: string | null; className: string; classSeries: string | null; classStage: EducationStage | null }
  >();

  for (const row of enrollments ?? []) {
    if (enrollmentByStudent.has(row.student_id)) continue;
    const classRef = Array.isArray(row.classes) ? row.classes[0] : row.classes;
    enrollmentByStudent.set(row.student_id, {
      classId: row.class_id ?? classRef?.id ?? null,
      className: classRef?.name ?? "Turma não informada",
      classSeries: classRef?.series ?? null,
      classStage: (classRef?.stage as EducationStage | undefined) ?? null,
    });
  }

  const result = (students ?? [])
    .map((student) => {
      const enrollment = enrollmentByStudent.get(student.id);
      return {
        studentId: student.id,
        studentName: student.full_name,
        classId: enrollment?.classId ?? null,
        className: enrollment?.className ?? "Sem turma ativa",
        classSeries: enrollment?.classSeries ?? null,
        classStage: enrollment?.classStage ?? null,
      };
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName, "pt-BR"));

  return result;
}

