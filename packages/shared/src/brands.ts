import { z } from "zod";

/** Contracts for entity websites, used for logos on the warm paths canvas. */

export const brandsRequestSchema = z.object({
  ids: z.array(z.uuid("ids must be UUIDs")).min(1).max(100),
});
export type BrandsRequest = z.infer<typeof brandsRequestSchema>;

/** Domain per entity id, only for entities Cala has a website for. */
export const brandsResponseSchema = z.object({
  sites: z.record(z.string(), z.string()),
});
export type BrandsResponse = z.infer<typeof brandsResponseSchema>;
