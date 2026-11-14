import { describe, expect, mock, test } from "bun:test";
import { HttpError } from "../../lib/http-error";
import { createCalaClient } from "./cala.client";
import { createCalaService } from "./cala.service";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

/** A fetch mock that returns the given responses in order. */
function mockFetch(...responses: Response[]) {
  const queue = [...responses];
  return mock(async (_url: URL, _init: RequestInit) => {
    const next = queue.shift();
    if (!next) throw new Error("mockFetch: no more responses queued");
    return next;
  });
}

const clientWith = (fetch: ReturnType<typeof mockFetch>) =>
  createCalaClient({ apiKey: "test-key", fetch, retryBaseMs: 1 });

const searchFixture = {
  content: "**Altano Energy** raised €60M.",
  explainability: null,
  context: [
    {
      id: "fact-1",
      content: "Altano Energy - €60m",
      origins: [
        {
          source: { name: "Sifted", url: "https://sifted.eu" },
          document: { name: "Top climate rounds", url: "https://sifted.eu/a" },
          breadcrumb: [],
        },
      ],
    },
    {
      id: "fact-2",
      content: "Same document, different fact",
      origins: [
        {
          source: { name: "Sifted", url: "https://sifted.eu" },
          document: { name: "Top climate rounds", url: "https://sifted.eu/a" },
          breadcrumb: [],
        },
      ],
    },
  ],
  entities: [{ id: "e1", name: "Altano Energy", entity_type: "Company", mentions: ["Altano"] }],
  some_future_field: true,
};

describe("cala client", () => {
  test("sends the API key and JSON body to the search endpoint", async () => {
    const fetch = mockFetch(json(searchFixture));
    await clientWith(fetch).search("climate rounds");

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.cala.ai/v1/knowledge/search");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ "X-API-KEY": "test-key" });
    expect(JSON.parse(String(init?.body))).toEqual({
      input: "climate rounds",
      explainability: true,
      return_entities: true,
    });
  });

  test("passes name and limit as query params when searching entities", async () => {
    const fetch = mockFetch(json({ entities: [] }));
    await clientWith(fetch).searchEntities("Open AI", 5);

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.cala.ai/v1/entities?name=Open+AI&limit=5");
    expect(init?.method).toBe("GET");
  });

  test("retries on 429 and then succeeds", async () => {
    const fetch = mockFetch(json({}, 429), json({}, 429), json({ results: [], entities: null }));
    const result = await clientWith(fetch).query("startups.location=Spain");

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result.results).toEqual([]);
  });

  test("gives up with rate_limited after exhausting retries", async () => {
    const fetch = mockFetch(json({}, 429), json({}, 429), json({}, 429));
    const error = await clientWith(fetch)
      .query("x")
      .catch((e) => e);

    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 429, code: "rate_limited" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test("maps a Cala 422 to bad_request with Cala's message", async () => {
    const fetch = mockFetch(
      json(
        {
          response_type: "ERROR",
          error: { error_type: "search_query_error", message: "Bad query" },
        },
        422,
      ),
    );
    const error = await clientWith(fetch)
      .query("???")
      .catch((e) => e);

    expect(error).toMatchObject({ status: 400, code: "bad_request", message: "Bad query" });
  });

  test("maps entity_not_found_error to not_found", async () => {
    const fetch = mockFetch(
      json({ error: { error_type: "entity_not_found_error", message: "No such entity" } }, 422),
    );
    const error = await clientWith(fetch)
      .getEntity("0abe9580-5abb-46df-9506-5dc784520b69")
      .catch((e) => e);

    expect(error).toMatchObject({ status: 404, code: "not_found" });
  });

  test("rejects responses that do not match the schema", async () => {
    const fetch = mockFetch(json({ unexpected: true }));
    const error = await clientWith(fetch)
      .search("x")
      .catch((e) => e);

    expect(error).toMatchObject({ status: 502, code: "upstream_invalid_response" });
  });

  test("maps network failures to upstream_unreachable", async () => {
    const fetch = mock(async (_url: URL, _init: RequestInit): Promise<Response> => {
      throw new TypeError("fetch failed");
    });
    const error = await createCalaClient({ apiKey: "k", fetch })
      .search("x")
      .catch((e) => e);

    expect(error).toMatchObject({ status: 502, code: "upstream_unreachable" });
  });
});

describe("cala service", () => {
  test("normalizes a search answer: one source per document, camelCase entities", async () => {
    const service = createCalaService(clientWith(mockFetch(json(searchFixture))));

    expect(await service.search("climate rounds")).toEqual({
      answer: "**Altano Energy** raised €60M.",
      sources: [
        {
          name: "Sifted",
          url: "https://sifted.eu",
          document: { name: "Top climate rounds", url: "https://sifted.eu/a" },
        },
      ],
      entities: [{ id: "e1", name: "Altano Energy", entityType: "Company", mentions: ["Altano"] }],
    });
  });

  test("keeps free-form query rows and turns null entities into []", async () => {
    const rows = [{ name: "Acme", funding: 12_000_000, tags: ["ai"] }, { name: "Beta" }];
    const service = createCalaService(
      clientWith(mockFetch(json({ results: rows, entities: null }))),
    );

    expect(await service.query("startups.location=Spain")).toEqual({ rows, entities: [] });
  });

  test("normalizes entity search results", async () => {
    const service = createCalaService(
      clientWith(
        mockFetch(json({ entities: [{ id: "e1", name: "OpenAI", entity_type: "Company" }] })),
      ),
    );

    expect(await service.searchEntities("OpenAI", 20)).toEqual({
      entities: [{ id: "e1", name: "OpenAI", entityType: "Company", description: null }],
    });
  });

  test("normalizes an entity and fills missing sections with defaults", async () => {
    const service = createCalaService(
      clientWith(
        mockFetch(
          json({
            id: "e1",
            name: "OpenAI",
            entity_type: "Company",
            properties: { name: "OpenAI" },
          }),
        ),
      ),
    );

    expect(await service.getEntity("e1")).toEqual({
      id: "e1",
      name: "OpenAI",
      entityType: "Company",
      properties: { name: "OpenAI" },
      relationships: { outgoing: {}, incoming: {} },
      numericalObservations: [],
    });
  });
});
