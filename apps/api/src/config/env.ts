import { z } from "zod";

/** Empty values in .env count as unset. */
const optional = z.preprocess(
  (v) => (v === "" ? undefined : v),
  z.string().trim().min(1).optional(),
);
const withDefault = (value: string) =>
  z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().min(1).default(value));

const envSchema = z.object({
  CALA_API_KEY: z
    .string({ error: "CALA_API_KEY is required (set it in apps/api/.env)" })
    .min(1, "CALA_API_KEY is required (set it in apps/api/.env)"),
  VALKEY_URL: optional,
  DATABASE_URL: optional,
  INTERNAL_API_SECRET: optional,
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:3000"),
  // Matchup agent: off when the key is missing.
  GEMINI_API_KEY: optional,
  MATCHUP_MODEL: withDefault("gemini-4-carbon"),
  MATCHUP_MAX_STEPS: z.coerce.number().int().min(2).default(16),
  // Langfuse tracing: off when either key is missing.
  LANGFUSE_PUBLIC_KEY: optional,
  LANGFUSE_SECRET_KEY: optional,
  LANGFUSE_BASE_URL: withDefault("https://cloud.langfuse.com"),
  LANGFUSE_PROJECT_ID: optional,
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

export const env = parsed.data;
