import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const APP_ROLES = [
  "administrator",
  "manager",
  "warehouse",
  "pharmacy",
  "audit",
  "read_only",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  administrator: "Administrador",
  manager: "Gerente",
  warehouse: "Almoxarifado",
  pharmacy: "Farmácia",
  audit: "Auditor",
  read_only: "Somente leitura",
};

const FORBIDDEN_MSG = "Apenas administradores podem gerenciar papéis de usuário.";

async function assertAdmin(supabase: any, userId: string) {
  const { data: isAdmin, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "administrator",
  });
  if (error || !isAdmin) throw new Error(FORBIDDEN_MSG);
}

export interface ManagedUser {
  id: string;
  fullName: string | null;
  email: string | null;
  active: boolean;
  roles: AppRole[];
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: me } = await supabase
      .from("profiles")
      .select("hospital_id")
      .eq("id", userId)
      .single();
    if (!me?.hospital_id) throw new Error("Usuário sem hospital vinculado.");

    const [{ data: profiles, error: pErr }, { data: roleRows, error: rErr }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, active")
          .eq("hospital_id", me.hospital_id)
          .is("deleted_at", null)
          .order("full_name", { ascending: true, nullsFirst: false }),
        supabase
          .from("user_roles")
          .select("user_id, role")
          .eq("hospital_id", me.hospital_id),
      ]);
    if (pErr) throw new Error(pErr.message);
    if (rErr) throw new Error(rErr.message);

    const rolesByUser = new Map<string, AppRole[]>();
    for (const r of roleRows ?? []) {
      const list = rolesByUser.get(r.user_id) ?? [];
      list.push(r.role as AppRole);
      rolesByUser.set(r.user_id, list);
    }

    const users: ManagedUser[] = (profiles ?? []).map((p) => ({
      id: p.id,
      fullName: p.full_name,
      email: p.email,
      active: p.active,
      roles: rolesByUser.get(p.id) ?? [],
    }));
    return users;
  });

const roleInput = z.object({
  user_id: z.string().uuid(),
  role: z.enum(APP_ROLES),
});

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => roleInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: me } = await supabase
      .from("profiles")
      .select("hospital_id")
      .eq("id", userId)
      .single();
    if (!me?.hospital_id) throw new Error("Usuário sem hospital vinculado.");

    const { error } = await supabase.from("user_roles").upsert(
      { user_id: data.user_id, role: data.role, hospital_id: me.hospital_id },
      { onConflict: "user_id,role,hospital_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => roleInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    if (data.role === "administrator") {
      const { data: me } = await supabase
        .from("profiles")
        .select("hospital_id")
        .eq("id", userId)
        .single();
      const { count } = await supabase
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "administrator")
        .eq("hospital_id", me?.hospital_id ?? "");
      if ((count ?? 0) <= 1) {
        throw new Error("Não é possível remover o único administrador do hospital.");
      }
    }

    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .eq("role", data.role);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
