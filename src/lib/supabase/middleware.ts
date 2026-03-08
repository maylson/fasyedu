import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { UserRole } from "@/lib/constants";
import { isPathAllowedForRoles } from "@/lib/navigation";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const protectedPaths = [
    "/dashboard",
    "/usuarios",
    "/alunos",
    "/turmas",
    "/disciplinas",
    "/matriculas",
    "/planejamento",
    "/avaliacoes",
    "/calendario",
    "/mural",
    "/horarios",
    "/minha-conta",
    "/configuracoes",
  ];
  const isProtectedPath = protectedPaths.some((path) => request.nextUrl.pathname.startsWith(path));

  if (!user && isProtectedPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && ["/login", "/forgot-password", "/reset-password"].includes(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (user && isProtectedPath) {
    const { data: memberships } = await supabase
      .from("user_school_roles")
      .select("school_id, role")
      .eq("is_active", true);

    const activeSchoolCookie = request.cookies.get("active_school_id")?.value;
    const activeMembership = memberships?.find((item) => item.school_id === activeSchoolCookie) ?? memberships?.[0];
    const roles = (memberships ?? [])
      .filter((item) => item.school_id === activeMembership?.school_id)
      .map((item) => item.role as UserRole);

    const allowed = isPathAllowedForRoles(request.nextUrl.pathname, roles);
    if (!allowed) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
