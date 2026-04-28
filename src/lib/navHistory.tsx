import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type NavRestore = () => void;

type NavSnapshot = {
  restore: NavRestore;
  scrollTop: number;
};

export type NavApi = {
  push: (snap: { restore: NavRestore }) => void;
  back: () => boolean;
  clear: () => void;
  depth: number;
  registerScrollEl: (el: HTMLElement | null) => void;
};

const NavContext = createContext<NavApi | null>(null);

const NOOP_API: NavApi = {
  push: () => {},
  back: () => false,
  clear: () => {},
  depth: 0,
  registerScrollEl: () => {},
};

const SCROLL_RESTORE_TIMEOUT_MS = 600;
const SCROLL_RESTORE_INTERVAL_MS = 50;

export function NavProvider({ children }: { children: ReactNode }) {
  const stackRef = useRef<NavSnapshot[]>([]);
  const scrollElRef = useRef<HTMLElement | null>(null);
  const [depth, setDepth] = useState(0);

  const registerScrollEl = useCallback((el: HTMLElement | null) => {
    scrollElRef.current = el;
  }, []);

  const push = useCallback((snap: { restore: NavRestore }) => {
    const scrollTop = scrollElRef.current?.scrollTop ?? 0;
    stackRef.current.push({ restore: snap.restore, scrollTop });
    setDepth(stackRef.current.length);
  }, []);

  const clear = useCallback(() => {
    if (stackRef.current.length === 0) return;
    stackRef.current = [];
    setDepth(0);
  }, []);

  const restoreScrollTo = useCallback((target: number) => {
    const el = scrollElRef.current;
    if (!el) return;
    const start = performance.now();
    const tick = () => {
      const elNow = scrollElRef.current;
      if (!elNow) return;
      const maxScroll = Math.max(0, elNow.scrollHeight - elNow.clientHeight);
      const desired = Math.min(target, maxScroll);
      elNow.scrollTop = desired;
      const elapsed = performance.now() - start;
      if (
        elNow.scrollTop < desired - 1 &&
        elapsed < SCROLL_RESTORE_TIMEOUT_MS &&
        maxScroll < target
      ) {
        window.setTimeout(tick, SCROLL_RESTORE_INTERVAL_MS);
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(tick));
  }, []);

  const back = useCallback((): boolean => {
    const snap = stackRef.current.pop();
    if (!snap) return false;
    setDepth(stackRef.current.length);
    try {
      snap.restore();
    } catch (e) {
      console.error("nav restore failed", e);
    }
    restoreScrollTo(snap.scrollTop);
    return true;
  }, [restoreScrollTo]);

  const api = useMemo<NavApi>(
    () => ({ push, back, clear, depth, registerScrollEl }),
    [push, back, clear, depth, registerScrollEl]
  );

  return <NavContext.Provider value={api}>{children}</NavContext.Provider>;
}

export function useNav(): NavApi {
  return useContext(NavContext) ?? NOOP_API;
}
