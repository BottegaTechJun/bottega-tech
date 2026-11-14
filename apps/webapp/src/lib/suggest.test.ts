import { describe, expect, test } from "bun:test";
import type { Cite, Fact } from "@repo/shared";
import { idle, type Run } from "./matchup";
import { emptyPrefs } from "./prefs";
import { suggestions } from "./suggest";

const now = Date.parse("2026-11-14");
const prefs = { ...emptyPrefs, round: ["A"] };

const LED = "Only those that led a Series A";
const LINKED = "Only those that co-invest with our backers";
const ACTIVE = "Only those active in the last 12 months";

interface Pick {
  led: boolean;
  /** Source dates on the investor's one round relation; none for a pick found by search only */
  dates: (string | null)[];
  linked: boolean;
}

const cite = (date: string | null): Cite => ({
  name: "press.example",
  url: `https://press.example/${date}`,
  date,
  rank: "PRESS",
});

/** A finished run with two suggested investors, "a" and "b", that joined one Series A. */
function run(a: Pick, b: Pick): Run {
  const fact = (from: string, p: Pick): Fact => ({
    from,
    to: "round",
    relation: "PARTICIPATES_IN_FUNDING_ROUND",
    role: "INVESTOR",
    lead: p.led ? true : null,
    sources: p.dates.map(cite),
  });
  const link = (id: string) => ({
    id: `c-${id}`,
    from: id,
    to: "company",
    via: [],
    kind: "co_invested" as const,
    label: "",
    reasoning: "",
    factors: [],
    evidence: [],
    facts: [],
  });
  return {
    ...idle,
    status: "done",
    entities: { round: { id: "round", name: "Series A", type: "FundingRound", role: "round" } },
    facts: { a: fact("a", a), b: fact("b", b) },
    graph: {
      sessionId: "s",
      companyId: "company",
      summary: "",
      entities: [],
      investors: [
        // Undated search sources on the pick itself never count as recent activity.
        { id: "a", why: "", evidence: [cite(null)] },
        { id: "b", why: "", evidence: [cite(null)] },
      ],
      connections: [...(a.linked ? [link("a")] : []), ...(b.linked ? [link("b")] : [])],
      dropped: 0,
    },
  };
}

const full: Pick = { led: true, dates: ["2026-06-01"], linked: true };

describe("suggestions", () => {
  test("leave out what every suggested investor already shows", () => {
    expect(suggestions(prefs, run(full, full), { now })).toEqual([]);
  });

  test("offer a check when a pick has no sourced lead at the founder's round", () => {
    const answer = run(full, { ...full, led: false });
    expect(suggestions(prefs, answer, { now })).toEqual([LED]);
    expect(suggestions(emptyPrefs, answer, { now })).toEqual([]);
  });

  test("offer a co-investment filter when a pick has no such path", () => {
    expect(suggestions(prefs, run(full, { ...full, linked: false }), { now })).toEqual([LINKED]);
  });

  test("offer a recency filter when a pick's newest round is over a year old", () => {
    const stale = run(full, { ...full, dates: ["2025-05-28"] });
    expect(suggestions(prefs, stale, { now })).toEqual([ACTIVE]);
  });

  test("date a round by its first report, not by a later re-crawl", () => {
    const recrawled = run(full, { ...full, dates: ["2026-11-13", "2021-05-12"] });
    expect(suggestions(prefs, recrawled, { now })).toEqual([ACTIVE]);
  });

  test("do not count a pick known only from undated search sources as active", () => {
    const searched = run(full, { ...full, dates: [] });
    expect(suggestions(prefs, searched, { now })).toContain(ACTIVE);
  });

  test("do not offer a question that was already asked on the way to this answer", () => {
    const stale = run(full, { ...full, dates: ["2025-05-28"], led: false });
    expect(suggestions(prefs, stale, { now, asked: [ACTIVE.toUpperCase()] })).toEqual([LED]);
  });

  test("offer nothing without an answer", () => {
    expect(suggestions(prefs, idle, { now })).toEqual([]);
  });
});
