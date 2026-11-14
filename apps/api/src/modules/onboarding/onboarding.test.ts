import { describe, expect, mock, test } from "bun:test";
import { createCalaClient } from "../cala/cala.client";
import { createOnboardingService, repair, SLUSH_2026 } from "./onboarding.service";

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

const src = (rank: string, doc: string) => ({
  name: doc,
  document: `https://${doc}/`,
  source_rank: rank,
});

const COMPANY = "6ebd9536-fcc5-5921-8938-ce3497eb6262";
const ROUND = "81a35997-c8e2-59de-8a9f-021d97e4f6a9";

/** Routes mocked Cala calls by path and requested properties. */
function fakeCala(sites: Record<string, string>) {
  return mock(async (url: URL, init: RequestInit) => {
    const body = init.body ? JSON.parse(String(init.body)) : {};
    if (url.pathname.endsWith("/introspection")) {
      return json({
        properties: ["name", "website", "founding_date"],
        relationships: {
          outgoing: ["PARTICIPATES_IN_FUNDING_ROUND", "PARTICIPATES_IN_EVENT"],
          incoming: ["FOUNDED", "IS_CEO_OF", "INVESTED_IN"],
        },
      });
    }
    const id = url.pathname.split("/").pop() ?? "";
    if (id === COMPANY) {
      return json({
        id,
        name: "In Parallel",
        entity_type: "Company",
        properties: {
          website: { value: "in-parallel.com", sources: [src("PRIMARY", "in-parallel.com")] },
          founding_date: { value: "2023-10-10", sources: [src("FILING", "prh.fi")] },
        },
        relationships: {
          outgoing: {
            PARTICIPATES_IN_FUNDING_ROUND: [
              {
                id: ROUND,
                name: "Seed",
                entity_type: "FundingRound",
                properties: { role: "ISSUER", sources: [src("PRESS", "bebeez.eu")] },
              },
            ],
            PARTICIPATES_IN_EVENT: [
              {
                id: SLUSH_2026,
                name: "Slush 2026",
                entity_type: "Event",
                properties: { sources: [] },
              },
            ],
          },
          incoming: {
            IS_CEO_OF: [
              { id: "p1", name: "Markku", entity_type: "Person", properties: { sources: [] } },
            ],
            FOUNDED: [
              { id: "p1", name: "Markku", entity_type: "Person", properties: { sources: [] } },
            ],
            INVESTED_IN: [
              {
                id: "lv2",
                name: "Lifeline Ventures Oy",
                entity_type: "Organization",
                properties: { sources: [] },
              },
            ],
          },
        },
      });
    }
    if (id === ROUND) {
      return json({
        id,
        name: "Seed",
        entity_type: "FundingRound",
        properties: {
          round_label: { value: "SEED", sources: [] },
          announcement_date: { value: "2024-11-12", sources: [] },
          transaction_value_units: { value: "EUR", sources: [] },
        },
        relationships: {
          incoming: {
            PARTICIPATES_IN_FUNDING_ROUND: [
              {
                id: "lv1",
                name: "Lifeline Ventures",
                entity_type: "Organization",
                properties: { role: "INVESTOR", is_lead: true },
              },
              {
                id: "nc",
                name: "Notion Capital",
                entity_type: "Company",
                properties: { role: "INVESTOR" },
              },
              {
                id: "junk",
                name: "Co-founder",
                entity_type: "Organization",
                properties: { role: "INVESTOR" },
              },
              {
                id: COMPANY,
                name: "In Parallel",
                entity_type: "Company",
                properties: { role: "ISSUER" },
              },
            ],
          },
        },
      });
    }
    expect(body.properties).toEqual(["website"]);
    const site = sites[id];
    return json({
      id,
      name: id,
      entity_type: "Organization",
      properties: site ? { website: { value: site, sources: [] } } : {},
    });
  });
}

describe("onboarding service", () => {
  test("builds a sourced profile and follows the data rules", async () => {
    const fetch = fakeCala({
      lv1: "https://www.lifelineventures.com",
      lv2: "lifelineventures.com/",
    });
    const service = createOnboardingService(createCalaClient({ apiKey: "k", fetch }));
    const profile = await service.getProfile(COMPANY);

    expect(profile.founded?.sources[0]?.rank).toBe("FILING");
    expect(profile.slush.listed).toBe(true);
    expect(profile.people).toEqual([
      { id: "p1", name: "Markku", roles: ["CEO", "FOUNDER"], sources: [] },
    ]);

    const [round] = profile.rounds;
    expect(round?.amount).toBeNull();
    expect(round?.backers.map((b) => [b.name, b.lead])).toEqual([
      ["Lifeline Ventures", true],
      ["Notion Capital", null],
    ]);

    // Two Lifeline records merge by website; a missing is_lead stays unknown.
    expect(profile.investors.map((i) => [i.name, i.ids.length, i.led])).toEqual([
      ["Lifeline Ventures Oy", 2, ["SEED"]],
      ["Notion Capital", 1, []],
    ]);
  });

  test("serves snapshot data without calling Cala", async () => {
    const fetch = mock(async () => json({}));
    const service = createOnboardingService(createCalaClient({ apiKey: "k", fetch }), {
      snapshot: { searches: { acme: { companies: [] } }, profiles: {} },
    });
    expect(await service.searchCompanies("  ACME ")).toEqual({ companies: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  test("dedupes search results by website", async () => {
    const fetch = mock(async (url: URL) => {
      if (url.pathname === "/v1/entities") {
        expect(url.searchParams.get("entity_types")).toBe("Company");
        return json({
          entities: [
            { id: "a", name: "Foo", entity_type: "Company" },
            { id: "b", name: "Foo Oy", entity_type: "Company" },
          ],
        });
      }
      return json({
        id: "x",
        name: "x",
        entity_type: "Company",
        properties: { website: { value: "https://foo.com", sources: [] } },
      });
    });
    const service = createOnboardingService(createCalaClient({ apiKey: "k", fetch }));
    const { companies } = await service.searchCompanies("foo");
    expect(companies.map((c) => [c.id, c.website])).toEqual([["a", "foo.com"]]);
  });

  test("repairs double-encoded text", () => {
    expect(repair("whatâ\u0080\u0099s")).toBe("what’s");
    expect(repair("London‑based")).toBe("London‑based");
  });
});
