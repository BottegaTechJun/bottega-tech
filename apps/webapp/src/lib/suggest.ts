import type { Fact, Prefs } from "@repo/shared";
import type { Run } from "./matchup";
import { answer } from "./prefs";

const YEAR = 365 * 24 * 60 * 60 * 1000;
const JOINED = "PARTICIPATES_IN_FUNDING_ROUND";

/**
 * When a round relation was first reported: its earliest dated source. Later dates are often
 * re-crawls of a portfolio page. The API reads round dates the same way for the agent.
 */
function dealDate(fact: Fact): number | null {
  const dates = fact.sources.flatMap((s) => (s.date ? [Date.parse(s.date)] : []));
  return dates.length ? Math.min(...dates) : null;
}

interface Options {
  /** Questions already asked on the way to this answer; they are not offered again */
  asked?: string[];
  now?: number;
}

/**
 * Follow-up chips worth offering for this answer. Each one is checked against the sourced
 * round records the run holds on its suggested investors and left out when every pick already
 * passes, so a chip never asks for something the answer shows. A missing is_lead is unknown,
 * so it counts as "not shown". Region is never offered: the run holds no investor HQ.
 */
export function suggestions(prefs: Prefs, run: Run, options: Options = {}): string[] {
  const { asked = [], now = Date.now() } = options;
  const graph = run.graph;
  if (!graph?.investors.length) return [];
  // Connection facts are kept whole; the streamed ones are capped per tool result.
  const facts = [...Object.values(run.facts), ...graph.connections.flatMap((c) => c.facts)];
  const joined = (id: string) =>
    facts.filter((f) => f.from === id && f.relation === JOINED && f.role === "INVESTOR");
  const ids = graph.investors.map((pick) => pick.id);
  const chips: string[] = [];

  // The first run only treats the founder's round as a hint.
  const round = answer(prefs, "round");
  const led = (id: string) =>
    joined(id).some(
      (f) => f.lead && run.entities[f.to]?.name.toLowerCase() === round.toLowerCase(),
    );
  if (round && !ids.every(led)) chips.push(`Only those that led a ${round}`);

  const linked = (id: string) =>
    graph.connections.some((c) => c.kind === "co_invested" && (c.from === id || c.to === id));
  if (!ids.every(linked)) chips.push("Only those that co-invest with our backers");

  // Search sources carry no date, so only a dated round record counts as recent activity.
  const active = (id: string) =>
    joined(id).some((f) => {
      const date = dealDate(f);
      return date !== null && now - date <= YEAR;
    });
  if (!ids.every(active)) chips.push("Only those active in the last 12 months");

  const done = new Set(asked.map((q) => q.trim().toLowerCase()));
  return chips.filter((chip) => !done.has(chip.toLowerCase()));
}
