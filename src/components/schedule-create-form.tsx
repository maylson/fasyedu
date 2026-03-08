"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";

type SubjectOption = {
  id: string;
  name: string;
};

type TeacherOption = {
  id: string;
  fullName: string;
};

type ScheduleCreateFormProps = {
  classId: string;
  subjects: SubjectOption[];
  teachers: TeacherOption[];
  action: (formData: FormData) => void | Promise<void>;
};

export function ScheduleCreateForm({ classId, subjects, teachers, action }: ScheduleCreateFormProps) {
  const [entryType, setEntryType] = useState<"AULA" | "INTERVALO">("AULA");
  const isInterval = entryType === "INTERVALO";

  return (
    <form action={action} className="grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 md:grid-cols-7">
      <input type="hidden" name="class_id" value={classId} />
      <select
        name="entry_type"
        value={entryType}
        onChange={(event) => setEntryType(event.target.value as "AULA" | "INTERVALO")}
        className="fasy-input md:col-span-1"
      >
        <option value="AULA">Aula</option>
        <option value="INTERVALO">Intervalo</option>
      </select>

      {isInterval ? (
        <input name="title" placeholder="Ex.: Recreio, Lanche, Almoço..." className="fasy-input md:col-span-2" />
      ) : null}

      {!isInterval ? (
        <>
          <select name="class_subject_id" className="fasy-input md:col-span-2">
            <option value="">Disciplina da turma</option>
            {subjects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select name="teacher_id" className="fasy-input md:col-span-1">
            <option value="">Professor</option>
            {teachers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.fullName}
              </option>
            ))}
          </select>
        </>
      ) : (
        <>
          <input type="hidden" name="class_subject_id" value="" />
          <input type="hidden" name="teacher_id" value="" />
        </>
      )}

      <select name="day_of_week" defaultValue={1} className="fasy-input md:col-span-1">
        <option value={1}>Segunda</option>
        <option value={2}>Terça</option>
        <option value={3}>Quarta</option>
        <option value={4}>Quinta</option>
        <option value={5}>Sexta</option>
        <option value={6}>Sábado</option>
        <option value={7}>Domingo</option>
      </select>
      <input name="starts_at" type="time" required className="fasy-input md:col-span-1" />
      <input name="ends_at" type="time" required className="fasy-input md:col-span-1" />
      <div className="md:col-span-7">
        <SubmitButton className="fasy-btn-primary px-4 py-2 text-sm" pendingLabel="Adicionando...">
          Adicionar horário
        </SubmitButton>
      </div>
    </form>
  );
}
