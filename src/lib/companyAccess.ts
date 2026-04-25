import { getSupabase } from "./supabase";

export async function lookupCompanyByCode(code: string): Promise<{ id: number; name: string } | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const sb = getSupabase();
  const { data, error } = await sb.rpc("lookup_company_by_code", { p_code: trimmed });
  if (error) throw new Error(error.message);
  const rows = data as { id: number; name: string }[] | null;
  if (!rows?.length) return null;
  return { id: rows[0]!.id, name: rows[0]!.name };
}

export type AdminPinProfileResult =
  | { ok: true; kind: "main" }
  | { ok: true; kind: "alternate"; label: string }
  | { ok: false };

/**
 * Определя дали PIN е валиден; за алтернативен връща етикет (напр. за статистика и сесия).
 * Изисква миграция `030_resolve_company_admin_pin_profile.sql` в Supabase.
 */
export async function resolveCompanyAdminPinProfile(companyId: number, pin: string): Promise<AdminPinProfileResult> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc("resolve_company_admin_pin_profile", {
    p_company_id: companyId,
    p_pin: pin.trim(),
  });
  if (error) throw new Error(error.message);
  const o = data as { ok?: boolean; kind?: string; label?: string } | null;
  if (!o || o.ok === false) return { ok: false };
  if (o.kind === "main") return { ok: true, kind: "main" };
  if (o.kind === "alternate" && typeof o.label === "string" && o.label.trim()) {
    return { ok: true, kind: "alternate", label: o.label.trim() };
  }
  return { ok: false };
}

export async function verifyCompanyAdminPin(companyId: number, pin: string): Promise<boolean> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc("verify_company_admin_pin", {
    p_company_id: companyId,
    p_pin: pin.trim(),
  });
  if (error) throw new Error(error.message);
  return data === true;
}
