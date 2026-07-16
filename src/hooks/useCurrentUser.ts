import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CurrentUserProfile {
  id: string;
  email: string | null;
  fullName: string | null;
  hospitalId: string | null;
  stockCenterId: string | null;
  hospitalName: string | null;
  stockCenterName: string | null;
  roles: string[];
}

async function fetchCurrentUser(): Promise<CurrentUserProfile | null> {
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) return null;

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, email, full_name, hospital_id, stock_center_id, hospitals(name), stock_centers(name)",
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);

  return {
    id: user.id,
    email: profile?.email ?? user.email ?? null,
    fullName: profile?.full_name ?? null,
    hospitalId: profile?.hospital_id ?? null,
    stockCenterId: profile?.stock_center_id ?? null,
    hospitalName:
      (profile?.hospitals as { name?: string } | null | undefined)?.name ?? null,
    stockCenterName:
      (profile?.stock_centers as { name?: string } | null | undefined)?.name ?? null,
    roles: (roleRows ?? []).map((r) => r.role as string),
  };
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: fetchCurrentUser,
    staleTime: 60_000,
  });
}
