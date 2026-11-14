import { profileInputSchema, profileParamsSchema, runParamsSchema } from "@repo/shared";
import { parse, parseJson, type Routes } from "../../lib/http";
import { HttpError } from "../../lib/http-error";
import type { ProfileService } from "./profiles.service";

const missing = () => new HttpError(404, "not_found", "No profile with this id");

export function createProfileRoutes(service: ProfileService): Routes {
  return {
    "/api/profiles": {
      GET: async () => Response.json({ profiles: await service.list() }),
      POST: async (req) => {
        const input = await parseJson(req, profileInputSchema);
        return Response.json(await service.create(input), { status: 201 });
      },
    },
    "/api/profiles/:id": {
      GET: async (req) => {
        const { id } = parse(profileParamsSchema, req.params);
        const profile = await service.get(id);
        if (!profile) throw missing();
        return Response.json(profile);
      },
      PUT: async (req) => {
        const { id } = parse(profileParamsSchema, req.params);
        const profile = await service.update(id, await parseJson(req, profileInputSchema));
        if (!profile) throw missing();
        return Response.json(profile);
      },
      DELETE: async (req) => {
        const { id } = parse(profileParamsSchema, req.params);
        if (!(await service.remove(id))) throw missing();
        return new Response(null, { status: 204 });
      },
    },
    "/api/profiles/:id/runs": {
      GET: async (req) => {
        const { id } = parse(profileParamsSchema, req.params);
        if (!(await service.get(id))) throw missing();
        return Response.json({ runs: await service.listRuns(id) });
      },
    },
    "/api/profiles/:id/runs/:run": {
      GET: async (req) => {
        const { id, run } = parse(runParamsSchema, req.params);
        const saved = await service.run(id, run);
        if (!saved) throw new HttpError(404, "not_found", "No saved run with this id");
        return Response.json(saved);
      },
    },
  };
}
