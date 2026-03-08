import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/constants";

export type Membership = {
  school_id: string;
  role: UserRole;
  schools: { id: string; name: string } | null;
};

export async function getUserContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: memberships, error } = await supabase
    .from("user_school_roles")
    .select("school_id, role, schools(id, name)")
    .eq("is_active", true);

  if (error) {
    throw new Error(error.message);
  }

  const normalizedMemberships: Membership[] = (memberships ?? []).map((membership) => {
    const schoolRelation = Array.isArray(membership.schools) ? membership.schools[0] : membership.schools;
    return {
      school_id: membership.school_id,
      role: membership.role as UserRole,
      schools: schoolRelation ? { id: schoolRelation.id, name: schoolRelation.name } : null,
    };
  });

  const cookieStore = await cookies();
  const activeCookie = cookieStore.get("active_school_id")?.value;
  const activeMembership =
    normalizedMemberships.find((membership) => membership.school_id === activeCookie) ?? normalizedMemberships[0];

  if (!activeMembership) {
    return {
      user,
      memberships: [] as Membership[],
      activeSchoolId: null,
      roles: [] as UserRole[],
      supabase,
    };
  }

  const activeSchoolId = activeMembership.school_id;
  const roles = normalizedMemberships
    .filter((membership) => membership.school_id === activeSchoolId)
    .map((membership) => membership.role as UserRole);

  return {
    user,
    memberships: normalizedMemberships,
    activeSchoolId,
    roles,
    supabase,
  };
}
