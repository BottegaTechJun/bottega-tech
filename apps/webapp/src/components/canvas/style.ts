import type { ConnectionKind, Role } from "@repo/shared";

/** One hue per entity role; the company keeps the app accent. */
export const roleColor: Record<Role, string> = {
  company: "#c6ec6a",
  investor: "#8fb4ff",
  round: "#f2b36d",
  person: "#f08fb5",
  event: "#6fe0c4",
  other: "#9a9aa2",
};

export const roleLabel: Record<Role, string> = {
  company: "Company",
  investor: "Investor",
  round: "Funding round",
  person: "Person",
  event: "Event",
  other: "Entity",
};

export const kindColor: Record<ConnectionKind, string> = {
  co_invested: "#8fb4ff",
  led: "#c6ec6a",
  invested: "#7d9bd6",
  people: "#f08fb5",
  event: "#6fe0c4",
  other: "#9a9aa2",
};

export const kindLabel: Record<ConnectionKind, string> = {
  co_invested: "Co-invested",
  led: "Led",
  invested: "Invested",
  people: "People",
  event: "Event",
  other: "Related",
};

/** PARTICIPATES_IN_FUNDING_ROUND → "participates in funding round" */
export function relationText(relation: string): string {
  return relation.toLowerCase().replace(/_/g, " ");
}
