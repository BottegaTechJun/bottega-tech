import { companyParamsSchema, companySearchQuerySchema, upsertUserSchema } from "@repo/shared";
import { parse, parseJson, parseQuery, type Routes } from "../../lib/http";
import type { OnboardingService } from "./onboarding.service";

export function createOnboardingRoutes(service: OnboardingService): Routes {
  return {
    "/api/onboarding/companies": {
      GET: async (req) => {
        const { name } = parseQuery(req, companySearchQuerySchema);
        return Response.json(await service.searchCompanies(name));
      },
    },
    "/api/onboarding/companies/:id": {
      GET: async (req) => {
        const { id } = parse(companyParamsSchema, req.params);
        return Response.json(await service.getProfile(id));
      },
    },
    "/api/onboarding/users": {
      POST: async (req) => {
        const body = await parseJson(req, upsertUserSchema);
        return Response.json(await service.saveUser(body));
      },
    },
  };
}
