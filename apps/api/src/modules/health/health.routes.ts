import type { Routes } from "../../lib/http";

export const healthRoutes: Routes = {
  "/health": {
    GET: () => Response.json({ status: "ok" }),
  },
};
