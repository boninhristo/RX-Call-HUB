import { getStoredRole } from "./auth";
import { getAdminActorProfile, getStaffUserId, getStaffUsername } from "./session";

/**
 * Composite owner ключ за личния TO DO list. Записва се на всеки ред и осигурява
 * пълна изолация между потребителите в рамките на една фирма.
 *
 * - staff       → staff_users.id (като текст)
 * - admin_main  → константа "*"
 * - admin_named → label от company_admin_pin_alternates (уникален per company)
 */
export type TodoOwnerKind = "staff" | "admin_main" | "admin_named";

export interface TodoOwner {
  kind: TodoOwnerKind;
  key: string;
  displayName: string;
}

const ADMIN_MAIN_KEY = "*";
const ADMIN_MAIN_LABEL = "Главен администратор";

/**
 * Връща идентификация на текущия акаунт за TO DO собственост или null,
 * ако още няма достатъчно сесийна информация (напр. логнат admin без actor profile).
 */
export function getCurrentTodoOwner(): TodoOwner | null {
  const role = getStoredRole();

  if (role === "clients") {
    const id = getStaffUserId();
    if (id == null) return null;
    const username = (getStaffUsername() ?? "").trim();
    return {
      kind: "staff",
      key: String(id),
      displayName: username || `Служител #${id}`,
    };
  }

  if (role === "admin") {
    const profile = getAdminActorProfile();
    if (!profile) return null;
    if (profile.kind === "main") {
      return {
        kind: "admin_main",
        key: ADMIN_MAIN_KEY,
        displayName: ADMIN_MAIN_LABEL,
      };
    }
    if (profile.kind === "named") {
      const label = profile.label.trim();
      if (!label) return null;
      return {
        kind: "admin_named",
        key: label,
        displayName: label,
      };
    }
  }

  return null;
}

export function isSameTodoOwner(a: TodoOwner | null, b: TodoOwner | null): boolean {
  if (!a || !b) return false;
  return a.kind === b.kind && a.key === b.key;
}
