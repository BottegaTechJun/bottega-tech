import { z } from "zod";

/**
 * Request/response contracts between apps/web and apps/api.
 * The API validates requests with these schemas; the web client validates responses.
 * Add each feature's schemas here and infer the types from them; never write a type twice.
 */

// ---------- Health ----------

export const healthResponseSchema = z.object({ status: z.literal("ok") });
export type HealthResponse = z.infer<typeof healthResponseSchema>;

// ---------- Errors ----------

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

export * from "./matchup";
export * from "./onboarding";
export * from "./profiles";
