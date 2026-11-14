import type { Prefs } from "@repo/shared";

/** Investor preference questions. Each one is a single short step in the flow. */

export type { Prefs };

export interface Option {
  id: string;
  label: string;
  hint?: string;
}

export interface Question {
  id: keyof Prefs;
  title: string;
  multi: boolean;
  /** Shown as large cards instead of chips */
  cards?: boolean;
  options: (prefs: Prefs) => Option[];
}

export const emptyPrefs: Prefs = { round: [], size: [], geo: [], lead: [], sector: [], timing: [] };

const sizes: Record<string, string[]> = {
  A: ["Under €5M", "€5-10M", "€10-20M", "€20M+"],
  B: ["Under €15M", "€15-30M", "€30-60M", "€60M+"],
  C: ["Under €40M", "€40-80M", "€80-150M", "€150M+"],
};

export const questions: Question[] = [
  {
    id: "round",
    title: "Which round are you raising?",
    multi: false,
    cards: true,
    options: () => [
      { id: "A", label: "Series A", hint: "First institutional lead" },
      { id: "B", label: "Series B", hint: "Scale what works" },
      { id: "C", label: "Series C", hint: "Expand and dominate" },
    ],
  },
  {
    id: "size",
    title: "How much?",
    multi: false,
    options: (prefs) => (sizes[prefs.round[0] ?? "A"] ?? []).map((label) => ({ id: label, label })),
  },
  {
    id: "geo",
    title: "Where should investors be?",
    multi: true,
    options: () =>
      ["Nordics", "Europe", "UK", "US", "Anywhere"].map((label) => ({ id: label, label })),
  },
  {
    id: "lead",
    title: "What role should they take?",
    multi: false,
    cards: true,
    options: () => [
      { id: "lead", label: "Lead", hint: "Sets terms, takes the board seat" },
      { id: "co-lead", label: "Co-lead", hint: "Shares the lead" },
      { id: "follow", label: "Follow", hint: "Joins a led round" },
    ],
  },
  {
    id: "sector",
    title: "Sector focus",
    multi: true,
    options: () =>
      [
        "Software",
        "AI",
        "B2B SaaS",
        "Fintech",
        "Climate",
        "Health",
        "Deep tech",
        "Industrial",
        "Consumer",
      ].map((label) => ({ id: label, label })),
  },
  {
    id: "timing",
    title: "When do you start?",
    multi: false,
    options: () => [
      { id: "now", label: "Now" },
      { id: "3m", label: "In 3 months" },
      { id: "6m", label: "In 6 months" },
      { id: "later", label: "Later" },
    ],
  },
];

/** Readable label for a saved answer. */
export function answer(prefs: Prefs, id: keyof Prefs): string {
  const question = questions.find((q) => q.id === id);
  const options = question?.options(prefs) ?? [];
  return prefs[id].map((value) => options.find((o) => o.id === value)?.label ?? value).join(", ");
}

/** Short line for the sidebar, e.g. "Series A · €5-10M · Nordics". */
export function summary(prefs: Prefs): string {
  const parts = (["round", "size", "geo", "lead"] as const).map((id) => answer(prefs, id));
  return parts.filter(Boolean).join(" · ") || "No preferences yet";
}

/** Sensible defaults from the company's facts: next round and sector. */
export function suggest(stage: string | null, industries: string[]): Partial<Prefs> {
  const next: Record<string, string> = { PRE_SEED: "A", SEED: "A", SERIES_A: "B", SERIES_B: "C" };
  const round = stage ? next[stage] : undefined;
  const sector = industries.some((code) => code.startsWith("SOFTWARE")) ? ["Software"] : [];
  return { ...(round ? { round: [round] } : {}), sector };
}
