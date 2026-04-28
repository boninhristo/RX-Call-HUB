import { WebviewWindow, getAllWebviewWindows } from "@tauri-apps/api/webviewWindow";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Етикет на отделния прозорец за КСБ. */
export const KSB_WINDOW_LABEL = "ksb";
export const STATS_CONVERSATIONS_WINDOW_LABEL = "stats-conversations";

/** URL query параметър, по който приложението разпознава „samostoyatelen“ КСБ изглед. */
export const STANDALONE_WINDOW_PARAM = "window";

export type StandaloneWindow = "ksb" | "stats-conversations";

/** Връща стойността на ?window=… от URL-а на текущия webview (ако има). */
export function readStandaloneWindowParam(): StandaloneWindow | null {
  try {
    const v = new URLSearchParams(window.location.search).get(STANDALONE_WINDOW_PARAM);
    if (v === "ksb") return "ksb";
    if (v === "stats-conversations") return "stats-conversations";
    return null;
  } catch {
    return null;
  }
}

/** Денят, за който да се покажат разговорите в standalone статистически прозорец. */
export function readStandaloneDayParam(): string | null {
  try {
    const v = new URLSearchParams(window.location.search).get("day");
    if (!v) return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** Истина само в Tauri runtime (има IPC). */
function isTauriRuntime(): boolean {
  try {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  } catch {
    return false;
  }
}

/**
 * Отваря (или фокусира, ако вече съществува) отделен Tauri прозорец, в който се
 * показва само `KsbRegisterView`. Сесията (фирма + служител) се чете автоматично
 * от `localStorage`, който е общ за всички webview на същия origin.
 */
export async function openKsbWindow(): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error("Отделен прозорец е достъпен само в десктоп приложението.");
  }
  try {
    const existing = (await getAllWebviewWindows()).find((w) => w.label === KSB_WINDOW_LABEL);
    if (existing) {
      await existing.unminimize().catch(() => {});
      await existing.setFocus().catch(() => {});
      return;
    }
  } catch {
    /* при грешка в getAllWebviewWindows опитваме да създадем нов */
  }
  const wv = new WebviewWindow(KSB_WINDOW_LABEL, {
    url: `/index.html?${STANDALONE_WINDOW_PARAM}=ksb`,
    title: "КСБ — регистър",
    width: 1100,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    theme: "dark",
    backgroundColor: "#0f172a",
  });
  await new Promise<void>((resolve, reject) => {
    wv.once("tauri://created", () => resolve()).catch(() => {});
    wv.once("tauri://error", (e) => {
      reject(new Error(typeof e.payload === "string" ? e.payload : "Грешка при създаване на прозорец."));
    }).catch(() => {});
  });
}

/** Отваря (или префокусира) прозорец със списък разговори за конкретен ден. */
export async function openDayConversationsWindow(dayKey: string): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error("Отделен прозорец е достъпен само в десктоп приложението.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    throw new Error("Невалиден ден за прозореца с разговори.");
  }
  try {
    const existing = (await getAllWebviewWindows()).find(
      (w) => w.label === STATS_CONVERSATIONS_WINDOW_LABEL
    );
    if (existing) {
      // Ако вече е отворен, затваряме и отваряме наново с новия query.
      await existing.close().catch(() => {});
    }
  } catch {
    /* ignore */
  }
  const wv = new WebviewWindow(STATS_CONVERSATIONS_WINDOW_LABEL, {
    url: `/index.html?${STANDALONE_WINDOW_PARAM}=stats-conversations&day=${encodeURIComponent(dayKey)}`,
    title: `Разговори за ${dayKey}`,
    width: 980,
    height: 760,
    minWidth: 760,
    minHeight: 520,
    theme: "dark",
    backgroundColor: "#0f172a",
  });
  await new Promise<void>((resolve, reject) => {
    wv.once("tauri://created", () => resolve()).catch(() => {});
    wv.once("tauri://error", (e) => {
      reject(
        new Error(
          typeof e.payload === "string" ? e.payload : "Грешка при създаване на прозорец."
        )
      );
    }).catch(() => {});
  });
}

/** Излъчва глобално, че списъкът с клиенти е променен (за презареждане в други прозорци). */
export async function emitClientsChanged(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await emit("clients-changed");
  } catch {
    /* без значение, ако IPC не е готов */
  }
}

/** Регистрира callback при промяна на клиенти в произволен прозорец. */
export async function onClientsChanged(cb: () => void): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => {};
  try {
    return await listen("clients-changed", () => cb());
  } catch {
    return () => {};
  }
}

export interface OpenClientPayload {
  id: number;
  label: string;
}

/** Излъчва заявка „отвори клиент #id“ — слуша се от главния прозорец. */
export async function emitOpenClient(payload: OpenClientPayload): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await emit("open-client", payload);
  } catch {
    /* ignore */
  }
}

/** Регистрира callback за заявка „отвори клиент“. */
export async function onOpenClient(
  cb: (payload: OpenClientPayload) => void
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => {};
  try {
    return await listen<OpenClientPayload>("open-client", (e) => {
      const p = e.payload;
      if (p && typeof p.id === "number" && typeof p.label === "string") {
        cb(p);
      }
    });
  } catch {
    return () => {};
  }
}
