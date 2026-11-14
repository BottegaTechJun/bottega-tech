import { brandsRequestSchema } from "@repo/shared";
import { parseJson, type Routes } from "../../lib/http";
import type { BrandsService } from "./brands.service";

export function createBrandsRoutes(service: BrandsService): Routes {
  return {
    "/api/brands": {
      POST: async (req) => {
        const { ids } = await parseJson(req, brandsRequestSchema);
        return Response.json(await service.sites(ids));
      },
    },
  };
}
