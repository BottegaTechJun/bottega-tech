/** SERIES_A → "Series A", PRE_SEED → "Pre-seed". */
export function roundName(label: string): string {
  const words = label.toLowerCase().split(/[_\s]+/);
  if (words[0] === "series") return `Series ${(words[1] ?? "").toUpperCase()}`.trim();
  const joined = words.join("-");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/** 2800000 EUR → "€2.8M". A missing amount shows "—" (CONTEXT.md §7). */
export function money(amount: number | null, currency: string | null): string {
  if (amount === null) return "—";
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency ?? "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return `${new Intl.NumberFormat("en", { notation: "compact" }).format(amount)} ${currency ?? ""}`;
  }
}

/** "2024-11-12" → "12 Nov 2024"; partial dates keep their precision. */
export function day(value: string | null): string {
  if (!value) return "—";
  const [y, m, d] = value.split("-").map(Number);
  if (!y) return value;
  if (!m) return String(y);
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en", {
    month: "short",
    timeZone: "UTC",
  });
  return d ? `${d} ${month} ${y}` : `${month} ${y}`;
}

/** Whole months between a date and today. */
export function monthsSince(value: string | null): number | null {
  if (!value) return null;
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return null;
  const now = new Date();
  return (now.getFullYear() - then.getFullYear()) * 12 + now.getMonth() - then.getMonth();
}

/** SOFTWARE_AND_SERVICES → "Software and services". */
export function industry(code: string): string {
  const text = code.toLowerCase().replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function initials(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
