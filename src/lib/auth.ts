import { clearAdminActorProfile, clearStaffUserSession, getCompanyId, getStaffUserId } from "./session";
import type { AdminActorProfileV1 } from "./session";

export type AppRole = "admin" | "clients";

/** Резултат от вход: админ (PIN) или служител (потребител/парола). */
export type LoginSuccessPayload =
  | { role: "admin"; rememberMe: boolean; adminActor: AdminActorProfileV1 }
  | { role: "clients"; staffUserId: number; staffUsername: string; rememberMe: boolean };

const STORAGE_KEY = "klienti_auth_role";

function readRole(): string | null {
  try {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local != null) return local;
  } catch {
    /* ignore */
  }
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getStoredRole(): AppRole | null {
  try {
    if (getCompanyId() == null) return null;
    const v = readRole();
    if (v !== "admin" && v !== "clients") return null;
    if (v === "clients" && getStaffUserId() == null) return null;
    return v;
  } catch {
    /* private mode */
  }
  return null;
}

export function setStoredRole(role: AppRole, rememberMe = true): void {
  try {
    if (rememberMe) {
      localStorage.setItem(STORAGE_KEY, role);
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      sessionStorage.setItem(STORAGE_KEY, role);
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function clearStoredRole(): void {
  clearStaffUserSession();
  clearAdminActorProfile();
  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
