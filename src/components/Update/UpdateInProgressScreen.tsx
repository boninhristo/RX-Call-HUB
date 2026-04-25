import { useEffect, useRef, useState } from "react";
import type { AppUpdateInfo } from "../../lib/updater";
import { applyAutomaticUpdate } from "../../lib/updater";

type Props = {
  info: AppUpdateInfo;
  onSkip: () => void;
};

/**
 * Пълноекранен „Актуализиране“: веднъж при mount стартира apply_automatic_update (сваля, тих NSIS, рестарт).
 */
export function UpdateInProgressScreen({ info, onSkip }: Props) {
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    setError(null);
    applyAutomaticUpdate(info.downloadUrl).catch((e) => {
      setError(String(e));
    });
  }, [info.downloadUrl]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-bg-primary)] p-6">
        <div className="w-full max-w-md rounded-xl border border-[var(--color-bg-card)] bg-[var(--color-bg-secondary)] p-8 shadow-lg text-center">
          <h1 className="text-lg font-medium text-[var(--color-text-bright)] mb-2">Обновяване неуспешно</h1>
          <p className="text-sm text-red-400/90 mb-4 whitespace-pre-wrap break-words">{error}</p>
          <p className="text-[10px] text-[var(--color-accent)]/80 mb-4">
            Можеш да опиташ пак, като рестартираш RXG call hub, или да ползваш тази версия докато не се оправи връзката/линкът.
          </p>
          <button
            type="button"
            onClick={onSkip}
            className="w-full py-3 rounded-lg text-sm font-medium bg-[var(--color-bg-card)] text-[var(--color-text-bright)]"
          >
            Продължи с текущата версия
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-bg-primary)] p-6">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-bg-card)] bg-[var(--color-bg-secondary)] p-8 shadow-lg text-center">
        <h1 className="text-lg font-medium text-[var(--color-text-bright)] mb-1">Актуализиране</h1>
        <p className="text-sm text-[var(--color-text)] mb-1">
          Версия {info.current} → {info.latest}
        </p>
        <p className="text-xs text-[var(--color-accent)] mb-6">Сваляне и тиха инсталация. Прозорецът ще се затвори, след което RXG call hub ще стартира наново.</p>
        <div
          className="mx-auto h-8 w-8 border-2 border-[var(--color-bg-card)] border-t-[var(--color-accent)] rounded-full animate-spin"
          aria-hidden
        />
        <p className="mt-4 text-[10px] text-[var(--color-accent)]/70">Моля не затваряй — може няколко минути при бавен интернет.</p>
      </div>
    </div>
  );
}
