import { describe, expect, mock, test } from "bun:test";
import { createBrandsService } from "./brands.service";

const A = "7de3d7d6-af8f-4e95-a949-2befc86938a0";
const B = "c000070c-b1b5-5e2f-bed5-302831fb6e8e";

function fake() {
  return mock(async (id: string) => ({
    id,
    name: "x",
    entity_type: "Company",
    properties: id === A ? { website: { value: "https://www.Earlybird.com/about" } } : {},
    relationships: { outgoing: {}, incoming: {} },
  }));
}

describe("brands", () => {
  test("returns domains only for entities with a website", async () => {
    const retrieve = fake();
    const service = createBrandsService({ entity_retrieval: retrieve } as never);
    expect(await service.sites([A, B])).toEqual({ sites: { [A]: "earlybird.com" } });
  });

  test("looks each id up once", async () => {
    const retrieve = fake();
    const service = createBrandsService({ entity_retrieval: retrieve } as never);
    await service.sites([A, A, B]);
    await service.sites([A, B]);
    expect(retrieve).toHaveBeenCalledTimes(2);
  });

  test("a failed lookup leaves the id out", async () => {
    const retrieve = mock(async () => {
      throw new Error("down");
    });
    const service = createBrandsService({ entity_retrieval: retrieve } as never);
    expect(await service.sites([A])).toEqual({ sites: {} });
  });
});
