import { z } from "zod";
import { requireUser } from "../../lib/auth";
import { parse, type Routes } from "../../lib/http";
import { HttpError } from "../../lib/http-error";
import type { SearchSessionStore } from "./searches.service";

const paramsSchema = z.object({ id: z.string().trim().min(1).max(100) });

export function createSearchRoutes(store: SearchSessionStore, internalSecret?: string): Routes {
  return {
    "/api/search-sessions": {
      GET: async (req) => {
        const userId = requireUser(req, internalSecret);
        return Response.json({ sessions: await store.list(userId) });
      },
    },
    "/api/search-sessions/:id": {
      GET: async (req) => {
        const userId = requireUser(req, internalSecret);
        const { id } = parse(paramsSchema, req.params);
        const session = await store.load(userId, id);
        if (!session) throw new HttpError(404, "not_found", "No investor search with this id");
        return Response.json(session);
      },
      DELETE: async (req) => {
        const userId = requireUser(req, internalSecret);
        const { id } = parse(paramsSchema, req.params);
        if (!(await store.remove(userId, id))) {
          throw new HttpError(404, "not_found", "No investor search with this id");
        }
        return new Response(null, { status: 204 });
      },
    },
  };
}
