export function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Първа буква на първите две думи (напр. „Кирил Александров“ → „КА“). */
export function initialsFromFullName(name: string): string {
  const p = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (p.length >= 2) {
    return (p[0]!.charAt(0) + p[1]!.charAt(0)).toLocaleUpperCase("bg-BG");
  }
  if (p.length === 1) {
    const s = p[0]!;
    if (s.length >= 2) return s.slice(0, 2).toLocaleUpperCase("bg-BG");
    return s.charAt(0).toLocaleUpperCase("bg-BG") + "?";
  }
  return "—";
}
