import type { HealthResponse } from "@repo/shared";
import type { Routes } from "../../lib/http";

export const healthRoutes: Routes = {
  "/health": {
    GET: () => Response.json({ status: "ok" } satisfies HealthResponse),
  },
};
