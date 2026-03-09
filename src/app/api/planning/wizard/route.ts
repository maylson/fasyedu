import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type WizardStatus = "APPROVED" | "REJECTED" | "HUMAN_REVIEW";
type LlmProvider = "OPENAI" | "OPENAI_COMPAT" | "ANTHROPIC";

type WizardInput = {
  lesson_plan_id?: string;
  class_schedule_id?: string;
  lesson_date?: string;
  previous_feedback?: string;
  content?: string;
  objective?: string;
  methodology?: string;
  pillars?: string;
  resources?: string;
  classroom_activities?: string;
  home_activities?: string;
  context?: {
    className?: string;
    subjectName?: string;
    lessonDate?: string;
    timeRange?: string;
  };
};

type WizardHistory = {
  lesson_plan_id?: string | null;
  prior_status?: string | null;
  prior_feedback?: string | null;
  prior_response_id?: string | null;
  prior_plan?: {
    content?: string | null;
    objective?: string | null;
    methodology?: string | null;
    pillars?: string | null;
    resources?: string | null;
    classroom_activities?: string | null;
    home_activities?: string | null;
  } | null;
};

function fallbackEvaluate(input: WizardInput) {
  const text = [
    input.content ?? "",
    input.objective ?? "",
    input.methodology ?? "",
    input.classroom_activities ?? "",
    input.home_activities ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const missingCore =
    !input.content?.trim() || !input.objective?.trim() || !input.methodology?.trim() || !input.classroom_activities?.trim();

  if (missingCore) {
    return {
      status: "REJECTED" as WizardStatus,
      feedback:
        "<p><strong>Veredito: Rejeitado.</strong></p><p>Plano incompleto. Para uma boa avaliação formativa, preencha conteúdo, objetivo, metodologia e atividades em sala.</p>",
    };
  }

  const sensitiveTerms = ["violencia", "violência", "drogas", "abuso", "sexual", "suicidio", "suicídio"];
  if (sensitiveTerms.some((term) => text.includes(term))) {
    return {
      status: "HUMAN_REVIEW" as WizardStatus,
      feedback:
        "<p><strong>Veredito: Revisão Humana.</strong></p><p>O plano cita tema sensível e requer revisão humana da coordenação antes da aprovação final.</p>",
    };
  }

  return {
    status: "APPROVED" as WizardStatus,
    feedback:
      "<p><strong>Veredito: Aprovado.</strong></p><p>Plano consistente para avaliação formativa. Objetivo, metodologia e atividades estão coerentes com a proposta da aula.</p>",
  };
}

function parseModelJson(raw: string): { status: WizardStatus; feedback: string } | null {
  try {
    const parsed = JSON.parse(raw) as {
      status?: string;
      feedback?: string;
      feedback_html?: string;
    };

    const feedback =
      typeof parsed.feedback_html === "string" && parsed.feedback_html.trim()
        ? parsed.feedback_html.trim()
        : typeof parsed.feedback === "string" && parsed.feedback.trim()
          ? parsed.feedback.trim()
          : null;

    if (!feedback) return null;
    const status = parsed.status;
    if (status !== "APPROVED" && status !== "REJECTED" && status !== "HUMAN_REVIEW") return null;
    return { status, feedback };
  } catch {
    return null;
  }
}

function parseModelJsonRobust(raw: string): { status: WizardStatus; feedback: string } | null {
  const direct = parseModelJson(raw);
  if (direct) return direct;

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const slice = raw.slice(firstBrace, lastBrace + 1);
    const fromSlice = parseModelJson(slice);
    if (fromSlice) return fromSlice;
  }

  return null;
}

function buildDefaultPrompt(input: WizardInput, history: WizardHistory | null) {
  const historyJson = JSON.stringify(history ?? {}, null, 2);
  return [
    "Você é um avaliador pedagógico de planejamento de aula no Brasil.",
    "Analise o plano e devolva APENAS JSON válido com as chaves: status e feedback_html.",
    'status deve ser exatamente um de: "APPROVED", "REJECTED", "HUMAN_REVIEW".',
    "Use HUMAN_REVIEW para temas sensíveis.",
    "feedback_html deve ser em português brasileiro, com HTML simples e legível (p, strong, em, ul, li, br).",
    "Não inclua markdown.",
    "Não inclua bloco de código.",
    "",
    "Histórico (para considerar evolução do professor nesta mesma aula):",
    historyJson,
    "",
    "Contexto da aula:",
    JSON.stringify(input.context ?? {}, null, 2),
    "",
    "Plano de aula:",
    JSON.stringify(
      {
        content: input.content ?? "",
        objective: input.objective ?? "",
        methodology: input.methodology ?? "",
        pillars: input.pillars ?? "",
        resources: input.resources ?? "",
        classroom_activities: input.classroom_activities ?? "",
        home_activities: input.home_activities ?? "",
      },
      null,
      2,
    ),
  ].join("\n");
}

function buildPromptFromTemplate(input: WizardInput, template: string, history: WizardHistory | null) {
  const contextJson = JSON.stringify(input.context ?? {}, null, 2);
  const historyJson = JSON.stringify(history ?? {}, null, 2);
  const planJson = JSON.stringify(
    {
      content: input.content ?? "",
      objective: input.objective ?? "",
      methodology: input.methodology ?? "",
      pillars: input.pillars ?? "",
      resources: input.resources ?? "",
      classroom_activities: input.classroom_activities ?? "",
      home_activities: input.home_activities ?? "",
    },
    null,
    2,
  );

  const usesPlaceholders =
    template.includes("{{context_json}}") ||
    template.includes("{{plan_json}}") ||
    template.includes("{{history_json}}");

  if (usesPlaceholders) {
    return template
      .replaceAll("{{context_json}}", contextJson)
      .replaceAll("{{plan_json}}", planJson)
      .replaceAll("{{history_json}}", historyJson);
  }

  return `${template}\n\nHistórico:\n${historyJson}\n\nContexto da aula:\n${contextJson}\n\nPlano de aula:\n${planJson}`;
}

async function callOpenAiCompatible(config: {
  apiKey: string;
  baseUrl?: string | null;
  model?: string | null;
  prompt: string;
  previousResponseId?: string | null;
}) {
  const base = (config.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const body: Record<string, unknown> = {
    model: config.model || "gpt-4.1-mini",
    temperature: 0.2,
    input: config.prompt,
  };

  if (config.previousResponseId) {
    body.previous_response_id = config.previousResponseId;
  }

  const response = await fetch(`${base}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as {
    id?: string;
    output_text?: string;
    output?: Array<{
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
  };

  const textCandidates: string[] = [];
  if (payload.output_text) textCandidates.push(payload.output_text);
  if (payload.output?.length) {
    for (const item of payload.output) {
      for (const block of item.content ?? []) {
        if ((block.type === "output_text" || block.type === "text") && block.text) {
          textCandidates.push(block.text);
        }
      }
    }
  }

  const combinedText = textCandidates.join("\n").trim();
  const parsed = parseModelJsonRobust(combinedText);
  if (!parsed) return null;
  return { ...parsed, responseId: payload.id ?? null };
}

async function callAnthropic(config: {
  apiKey: string;
  baseUrl?: string | null;
  model?: string | null;
  prompt: string;
}) {
  const base = (config.baseUrl || "https://api.anthropic.com/v1").replace(/\/+$/, "");
  const response = await fetch(`${base}/messages`, {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model || "claude-3-5-sonnet-latest",
      max_tokens: 500,
      temperature: 0.2,
      messages: [{ role: "user", content: config.prompt }],
    }),
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
  const text = payload.content?.find((item) => item.type === "text")?.text ?? "";
  return parseModelJsonRobust(text);
}

async function getActiveSchoolContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: memberships } = await supabase
    .from("user_school_roles")
    .select("school_id")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (!memberships || memberships.length === 0) return null;
  const schoolIds = memberships.map((item) => item.school_id);
  const cookieStore = await cookies();
  const activeSchoolCookie = cookieStore.get("active_school_id")?.value;
  const activeSchoolId = schoolIds.includes(activeSchoolCookie ?? "") ? activeSchoolCookie! : schoolIds[0];

  const { data: school } = await supabase
    .from("schools")
    .select("id, llm_enabled, llm_provider, llm_model, llm_base_url, llm_api_key, llm_prompt_template")
    .eq("id", activeSchoolId)
    .maybeSingle();

  if (!school) return null;
  return {
    supabase,
    schoolId: activeSchoolId,
    config: school as {
      llm_enabled: boolean;
      llm_provider: string | null;
      llm_model: string | null;
      llm_base_url: string | null;
      llm_api_key: string | null;
      llm_prompt_template: string | null;
    },
  };
}

async function getWizardHistory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  schoolId: string,
  body: WizardInput,
): Promise<WizardHistory | null> {
  const lessonPlanId = body.lesson_plan_id?.trim();
  const classScheduleId = body.class_schedule_id?.trim();
  const lessonDate = body.lesson_date?.trim();

  if (!lessonPlanId && (!classScheduleId || !lessonDate)) {
    return body.previous_feedback?.trim() ? { prior_feedback: body.previous_feedback.trim() } : null;
  }

  let query = supabase
    .from("lesson_plans")
    .select(
      "id, status, ai_feedback, ai_last_response_id, content, objective, methodology, pillars, resources, classroom_activities, home_activities",
    )
    .eq("school_id", schoolId);

  if (lessonPlanId) {
    query = query.eq("id", lessonPlanId);
  } else if (classScheduleId && lessonDate) {
    query = query.eq("class_schedule_id", classScheduleId).eq("lesson_date", lessonDate);
  }

  const { data: previousPlan } = await query.maybeSingle();
  const previousFeedback = body.previous_feedback?.trim() || previousPlan?.ai_feedback || null;

  if (!previousPlan && !previousFeedback) return null;

  return {
    lesson_plan_id: previousPlan?.id ?? lessonPlanId ?? null,
    prior_status: previousPlan?.status ?? null,
    prior_feedback: previousFeedback,
    prior_response_id: previousPlan?.ai_last_response_id ?? null,
    prior_plan: previousPlan
      ? {
          content: previousPlan.content,
          objective: previousPlan.objective,
          methodology: previousPlan.methodology,
          pillars: previousPlan.pillars,
          resources: previousPlan.resources,
          classroom_activities: previousPlan.classroom_activities,
          home_activities: previousPlan.home_activities,
        }
      : null,
  };
}

async function persistWizardResponseId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  schoolId: string,
  body: WizardInput,
  responseId: string | null,
) {
  if (!responseId) return;

  const lessonPlanId = body.lesson_plan_id?.trim();
  const classScheduleId = body.class_schedule_id?.trim();
  const lessonDate = body.lesson_date?.trim();

  if (lessonPlanId) {
    await supabase
      .from("lesson_plans")
      .update({ ai_last_response_id: responseId })
      .eq("id", lessonPlanId)
      .eq("school_id", schoolId);
    return;
  }

  if (classScheduleId && lessonDate) {
    await supabase
      .from("lesson_plans")
      .update({ ai_last_response_id: responseId })
      .eq("school_id", schoolId)
      .eq("class_schedule_id", classScheduleId)
      .eq("lesson_date", lessonDate);
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as WizardInput;
  const context = await getActiveSchoolContext();
  const config = context?.config;

  if (!context || !config?.llm_enabled || !config.llm_api_key) {
    return NextResponse.json(fallbackEvaluate(body));
  }

  const history = await getWizardHistory(context.supabase, context.schoolId, body);
  const provider = ((config.llm_provider || "OPENAI") as string).toUpperCase() as LlmProvider;
  const promptTemplate = config.llm_prompt_template?.trim() || "";
  const prompt = promptTemplate
    ? buildPromptFromTemplate(body, promptTemplate, history)
    : buildDefaultPrompt(body, history);

  try {
    let result: { status: WizardStatus; feedback: string; responseId?: string | null } | null = null;

    if (provider === "OPENAI" || provider === "OPENAI_COMPAT") {
      result = await callOpenAiCompatible({
        apiKey: config.llm_api_key,
        baseUrl: config.llm_base_url,
        model: config.llm_model,
        prompt,
        previousResponseId: history?.prior_response_id ?? null,
      });
    } else if (provider === "ANTHROPIC") {
      result = await callAnthropic({
        apiKey: config.llm_api_key,
        baseUrl: config.llm_base_url,
        model: config.llm_model,
        prompt,
      });
    }

    if (result) {
      await persistWizardResponseId(context.supabase, context.schoolId, body, result.responseId ?? null);
      return NextResponse.json({ status: result.status, feedback: result.feedback });
    }

    return NextResponse.json(fallbackEvaluate(body));
  } catch {
    return NextResponse.json(fallbackEvaluate(body));
  }
}
