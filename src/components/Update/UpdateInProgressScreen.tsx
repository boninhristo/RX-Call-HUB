import { useEffect, useRef, useState } from "react";
import type { AppUpdateInfo } from "../../lib/updater";
import { applyAutomaticUpdate } from "../../lib/updater";

type Props = {
  info: AppUpdateInfo;
  onSkip: () => void;
};

const COUNTDOWN_SECONDS = 5;

/**
 * Пълноекранно актуализиране: кратко предупреждение и обратно броене,
 * после apply_automatic_update (сваляне, тих NSIS, рестарт).
 */
export function UpdateInProgressScreen({ info, onSkip }: Props) {
  const [error, setError] = useState<string | null>(null);
  /** Секунди до старт на свалянето; при 0 започва инсталацията */
  const [tick, setTick] = useState(COUNTDOWN_SECONDS);
  const applyStarted = useRef(false);

  useEffect(() => {
    if (tick <= 0) return;
    const id = window.setTimeout(() => setTick((t) => t - 1), 1000);
    return () => window.clearTimeout(id);
  }, [tick]);

  useEffect(() => {
    if (tick > 0) return;
    if (applyStarted.current) return;
    applyStarted.current = true;
    setError(null);
    applyAutomaticUpdate(info.downloadUrl).catch((e) => {
      setError(String(e));
    });
  }, [tick, info.downloadUrl]);

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

  if (tick > 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-bg-primary)] p-6">
        <div className="w-full max-w-md rounded-xl border border-[var(--color-bg-card)] bg-[var(--color-bg-secondary)] p-8 shadow-lg">
          <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-left mb-6">
            <p className="text-sm font-medium text-amber-100/95 mb-2">Преди актуализиране</p>
            <ul className="text-xs text-[var(--color-text)]/95 space-y-2 list-disc list-inside leading-relaxed">
              <li>След малко ще се свали и инсталира новата версия ({info.current} → {info.latest}).</li>
              <li>Прозорецът на RXG call hub ще се затвори за кратко — така работи тихият инсталатор.</li>
              <li>Моля не изключвай компютъра и не стартирай програмата ръчно, докато не мине инсталацията.</li>
            </ul>
          </div>
          <h1 className="text-lg font-medium text-[var(--color-text-bright)] text-center mb-1">Подготовка за актуализиране</h1>
          <p className="text-sm text-[var(--color-text)] text-center mb-4">
            Автоматичен старт след{" "}
            <span className="tabular-nums font-semibold text-[var(--color-accent)]">{tick}</span>{" "}
            {tick === 1 ? "секунда" : "секунди"}…
          </p>
          <button
            type="button"
            onClick={() => setTick(0)}
            className="w-full py-2.5 rounded-lg text-sm font-medium bg-[var(--color-accent)] text-[var(--color-bg-primary)] hover:opacity-90"
          >
            Започни веднага
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="mt-3 w-full py-2 rounded-lg text-xs text-[var(--color-accent)] hover:bg-[var(--color-bg-card)]/50"
          >
            Не сега — остани на текущата версия
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
        <p className="text-xs text-[var(--color-accent)] mb-6">
          Сваляне и тиха инсталация. Прозорецът ще се затвори, след което RXG call hub ще стартира наново.
        </p>
        <div
          className="mx-auto h-8 w-8 border-2 border-[var(--color-bg-card)] border-t-[var(--color-accent)] rounded-full animate-spin"
          aria-hidden
        />
        <p className="mt-4 text-[10px] text-[var(--color-accent)]/70">Моля не затваряй — може няколко минути при бавен интернет.</p>
      </div>
    </div>
  );
}
