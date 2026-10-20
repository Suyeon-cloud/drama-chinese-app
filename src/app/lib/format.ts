const pad = (n: number) => String(n).padStart(2, "0");

/** ISO datetime → "2026.10.11 14:05" */
export const formatDateTime = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const formatPercent = (ratio: number) => `${Math.round(ratio * 100)}%`;
