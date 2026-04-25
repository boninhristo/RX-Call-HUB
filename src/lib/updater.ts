import { invoke } from "@tauri-apps/api/core";

export type AppUpdateInfo = {
  current: string;
  latest: string;
  downloadUrl: string;
  releaseNotes: string | null;
};

/**
 * @returns null = няма update или проверката е изключена; иначе по-нова продукционна версия.
 * В dev (Vite) винаги null, за да не блокираме разработката.
 */
export async function checkForAppUpdate(): Promise<AppUpdateInfo | null> {
  if (import.meta.env.DEV) return null;
  try {
    return await invoke<AppUpdateInfo | null>("check_for_updates");
  } catch {
    return null;
  }
}

/**
 * Тих NSIS ( /S ) във фон, после стартира същия .exe. Текущата инстанция приключва.
 * (Само Windows, release; в dev – грешка от Rust.)
 */
export async function applyAutomaticUpdate(downloadUrl: string): Promise<void> {
  await invoke("apply_automatic_update", { downloadUrl });
}
