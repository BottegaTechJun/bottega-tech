import { z } from "zod";

/** The one field brands reads from a Cala entity: its website property. */
export const websiteSchema = z.looseObject({
  properties: z
    .looseObject({ website: z.looseObject({ value: z.unknown() }).nullish() })
    .default({}),
});
