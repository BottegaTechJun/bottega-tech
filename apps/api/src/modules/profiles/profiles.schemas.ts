import { matchupReplaySchema, savedProfileSchema } from "@repo/shared";

/** On-disk shapes. Files that fail these are skipped, never served. */
export const profileFileSchema = savedProfileSchema;
export const runFileSchema = matchupReplaySchema;
