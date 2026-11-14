import { describe, expect, mock, test } from "bun:test";
import { createCache, sha256Key, type ValkeyStore } from "../../lib/cache";
import { HttpError } from "../../lib/http-error";
import { createCalaClient } from "./cala.client";

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

  test("entity_search passes name, limit, and entity_types query params", async () => {
    const fetch = mockFetch(
      json({
        entities: [
          {
            id: "e1",
            name: "OpenAI",
            entity_type: "Company",
            description: "AI company",
          },
        ],
      }),
    );
    const result = await clientWith(fetch).entity_search("OpenAI", {
      limit: 10,
      entityTypes: ["Company", "Organization"],
    });

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://api.cala.ai/v1/entities?name=OpenAI&limit=10&entity_types=Company&entity_types=Organization",
    );
    expect(init?.method).toBe("GET");
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]?.name).toBe("OpenAI");
  });

  test("entity_introspection calls GET /v1/entities/{id}/introspection and parses schema", async () => {
    const introspectionFixture = {
      properties: ["name", "employee_count"],
      relationships: {
        outgoing: ["IS_REGISTERED_IN"],
        incoming: ["IS_CEO_OF"],
      },
      numerical_observations: {
        FinancialMetric: [
          {
            id: "1d3eae40-0ba8-5baf-9907-6a4823b067bb",
            name: "Cash and Cash Equivalents",
            unit: "USD",
          },
        ],
      },
    };
    const fetch = mockFetch(json(introspectionFixture));
    const result = await clientWith(fetch).entity_introspection(
      "c6772802-bdbc-4778-91e9-cd3d27d008d5",
    );

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://api.cala.ai/v1/entities/c6772802-bdbc-4778-91e9-cd3d27d008d5/introspection",
    );
    expect(init?.method).toBe("GET");
    expect(result).toEqual(introspectionFixture);
  });

  test("entity_retrieval sends relationship and metric projections in POST body", async () => {
    const entityFixture = {
      id: "c6772802-bdbc-4778-91e9-cd3d27d008d5",
      name: "APPLE INC",
      entity_type: "Company",
      properties: { name: { value: "APPLE INC", sources: [] } },
      relationships: {
        outgoing: { IS_REGISTERED_IN: [] },
        incoming: { IS_BOARD_MEMBER_OF: [] },
      },
      numerical_observations: [
        {
          id: "1d3eae40-0ba8-5baf-9907-6a4823b067bb",
          name: "Cash",
          type: "FinancialMetric",
          data: [],
        },
      ],
    };
    const projection = {
      properties: ["name", "employee_count"],
      relationships: {
        outgoing: { IS_REGISTERED_IN: { limit: 2, offset: 0 } },
        incoming: { IS_BOARD_MEMBER_OF: { limit: 2, offset: 2 } },
      },
      numerical_observations: {
        FinancialMetric: ["1d3eae40-0ba8-5baf-9907-6a4823b067bb"],
      },
    };
    const fetch = mockFetch(json(entityFixture));
    const result = await clientWith(fetch).entity_retrieval(
      "c6772802-bdbc-4778-91e9-cd3d27d008d5",
      projection,
    );

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://api.cala.ai/v1/entities/c6772802-bdbc-4778-91e9-cd3d27d008d5",
    );
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual(projection);
    expect(result.id).toBe("c6772802-bdbc-4778-91e9-cd3d27d008d5");
    expect(result.numerical_observations).toHaveLength(1);
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

  test("caches Cala responses by SHA-256 hash in Valkey and falls back to memory", async () => {
    const remote = new Map<string, string>();
    const store: ValkeyStore = {
      get: mock(async (key: string) => remote.get(key) ?? null),
      set: mock(async (key: string, val: string) => {
        remote.set(key, val);
      }),
    };
    const fetch = mockFetch(json(searchFixture));
    const cache = createCache({ store });
    const client = createCalaClient({ apiKey: "k", fetch, cache });

    const first = await client.search("climate rounds");
    const second = await client.search("climate rounds");

    expect(first).toEqual(second);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.set).toHaveBeenCalledTimes(1);

    const expectedHash = sha256Key({
      method: "POST",
      path: "/v1/knowledge/search",
      query: {},
      body: { input: "climate rounds", explainability: true, return_entities: true },
    });
    expect(remote.has(`cala:${expectedHash}`)).toBe(true);
  });

  test("falls back to in-memory cache when Valkey store throws", async () => {
    const failingStore: ValkeyStore = {
      get: mock(async () => {
        throw new Error("Valkey connection lost");
      }),
      set: mock(async () => {
        throw new Error("Valkey connection lost");
      }),
    };
    const fetch = mockFetch(
      json({ entities: [{ id: "e1", name: "OpenAI", entity_type: "Company" }] }),
    );
    const cache = createCache({ store: failingStore });
    const client = createCalaClient({ apiKey: "k", fetch, cache });

    const first = await client.entity_search("OpenAI", 5);
    const second = await client.entity_search("OpenAI", 5);

    expect(first).toEqual(second);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
