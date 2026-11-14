import { z } from "zod";

const envSchema = z.object({
  CALA_API_KEY: z
    .string({ error: "CALA_API_KEY is required (set it in apps/api/.env)" })
    .min(1, "CALA_API_KEY is required (set it in apps/api/.env)"),
  VALKEY_URL: z.string().trim().min(1).optional(),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:3000"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

export const env = parsed.data;
