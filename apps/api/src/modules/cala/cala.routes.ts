import {
  entitiesQuerySchema,
  entityParamsSchema,
  queryRequestSchema,
  searchRequestSchema,
} from "@repo/shared";
import { parse, parseJson, parseQuery, type Routes } from "../../lib/http";
import type { CalaService } from "./cala.service";

export function createCalaRoutes(service: CalaService): Routes {
  return {
    "/api/search": {
      POST: async (req) => {
        const { input } = await parseJson(req, searchRequestSchema);
        return Response.json(await service.search(input));
      },
    },
    "/api/query": {
      POST: async (req) => {
        const { input } = await parseJson(req, queryRequestSchema);
        return Response.json(await service.query(input));
      },
    },
    "/api/entities": {
      GET: async (req) => {
        const { name, limit } = parseQuery(req, entitiesQuerySchema);
        return Response.json(await service.searchEntities(name, limit));
      },
    },
    "/api/entities/:id": {
      GET: async (req) => {
        const { id } = parse(entityParamsSchema, req.params);
        return Response.json(await service.getEntity(id));
      },
    },
  };
}
