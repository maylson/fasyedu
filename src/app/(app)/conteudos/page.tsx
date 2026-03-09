import { redirect } from "next/navigation";

type ConteudosPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function asParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function ConteudosPage({ searchParams }: ConteudosPageProps) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  const studentId = asParam(params.student_id);
  const week = asParam(params.week);

  if (studentId) qs.set("student_id", studentId);
  if (week) qs.set("week", week);
  if (!qs.has("filter")) qs.set("filter", "AULAS");

  redirect(`/agenda?${qs.toString()}`);
}
