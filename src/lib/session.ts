const STAFF_ID_KEY = "klienti_staff_user_id";
const STAFF_USERNAME_KEY = "klienti_staff_username";
const COMPANY_ID_KEY = "klienti_company_id";
const LAST_ORG_CODE_KEY = "klienti_last_org_code";
const ADMIN_ACTOR_KEY = "klienti_admin_actor_profile";

export type AdminActorProfileV1 = { v: 1; kind: "main" } | { v: 1; kind: "named"; label: string; initials: string };

function readStorageValue(key: string): string | null {
  try {
    const local = localStorage.getItem(key);
    if (local != null) return local;
  } catch {
    /* ignore */
  }
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Текуща фирма (tenant). Задължително за заявки към базата след избор на код. */
export function getCompanyId(): number | null {
  try {
    const v = readStorageValue(COMPANY_ID_KEY);
    if (!v) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function getLastOrgCode(): string | null {
  try {
    const v = readStorageValue(LAST_ORG_CODE_KEY);
    return v?.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/** Записва контекст след успешен код; запомня кода на това устройство за следващо стартиране. */
export function setCompanyContext(companyId: number, rememberedCode: string): void {
  try {
    localStorage.setItem(COMPANY_ID_KEY, String(companyId));
    localStorage.setItem(LAST_ORG_CODE_KEY, rememberedCode.trim());
    sessionStorage.removeItem(COMPANY_ID_KEY);
    sessionStorage.removeItem(LAST_ORG_CODE_KEY);
  } catch {
    /* ignore */
  }
}

/** Изчиства само контекста на фирма (напр. невалиден код). Не се вика при изход от акаунт. */
export function clearCompanyContext(): void {
  try {
    localStorage.removeItem(COMPANY_ID_KEY);
    localStorage.removeItem(LAST_ORG_CODE_KEY);
    sessionStorage.removeItem(COMPANY_ID_KEY);
    sessionStorage.removeItem(LAST_ORG_CODE_KEY);
  } catch {
    /* ignore */
  }
  clearAdminActorProfile();
}

export function getStaffUserId(): number | null {
  try {
    const v = readStorageValue(STAFF_ID_KEY);
    if (!v) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function getStaffUsername(): string | null {
  try {
    return readStorageValue(STAFF_USERNAME_KEY);
  } catch {
    return null;
  }
}

export function setStaffUserSession(userId: number, username: string, rememberMe = true): void {
  try {
    if (rememberMe) {
      localStorage.setItem(STAFF_ID_KEY, String(userId));
      localStorage.setItem(STAFF_USERNAME_KEY, username);
      sessionStorage.removeItem(STAFF_ID_KEY);
      sessionStorage.removeItem(STAFF_USERNAME_KEY);
    } else {
      sessionStorage.setItem(STAFF_ID_KEY, String(userId));
      sessionStorage.setItem(STAFF_USERNAME_KEY, username);
      localStorage.removeItem(STAFF_ID_KEY);
      localStorage.removeItem(STAFF_USERNAME_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function clearStaffUserSession(): void {
  try {
    localStorage.removeItem(STAFF_ID_KEY);
    localStorage.removeItem(STAFF_USERNAME_KEY);
    sessionStorage.removeItem(STAFF_ID_KEY);
    sessionStorage.removeItem(STAFF_USERNAME_KEY);
  } catch {
    /* ignore */
  }
}

/** За проверка на сесия: трябва и фирма, и роля (ако е clients — и staff id). */
export function hasCompanyContext(): boolean {
  return getCompanyId() != null;
}

/** За лога на активност: само служителите имат id; администраторът (PIN) → null. */
export function getActorUserIdForActivity(): number | null {
  return getStaffUserId();
}

function readJsonProfile(): AdminActorProfileV1 | null {
  const raw = readStorageValue(ADMIN_ACTOR_KEY);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as AdminActorProfileV1 | null;
    if (!o || o.v !== 1) return null;
    if (o.kind === "main") return o;
    if (o.kind === "named" && typeof o.label === "string" && o.label.trim() && typeof o.initials === "string") {
      return o;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * След админ PIN: основен (main) или именуван alternate — за `metadata` в `client_activity_events` и статистика.
 */
export function getAdminActorProfile(): AdminActorProfileV1 | null {
  return readJsonProfile();
}

export function setAdminActorProfile(p: AdminActorProfileV1, rememberMe = true): void {
  const s = JSON.stringify(p);
  try {
    if (rememberMe) {
      localStorage.setItem(ADMIN_ACTOR_KEY, s);
      sessionStorage.removeItem(ADMIN_ACTOR_KEY);
    } else {
      sessionStorage.setItem(ADMIN_ACTOR_KEY, s);
      localStorage.removeItem(ADMIN_ACTOR_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function clearAdminActorProfile(): void {
  try {
    localStorage.removeItem(ADMIN_ACTOR_KEY);
    sessionStorage.removeItem(ADMIN_ACTOR_KEY);
  } catch {
    /* ignore */
  }
}
