import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { env } from "./config/env";
import { createCache } from "./lib/cache";
import { notFound, withMiddleware } from "./lib/http";
import { startTelemetry } from "./lib/telemetry";
import { createBrandsRoutes } from "./modules/brands/brands.routes";
import { createBrandsService } from "./modules/brands/brands.service";
import { createCalaClient } from "./modules/cala/cala.client";
import { healthRoutes } from "./modules/health/health.routes";
import { createCalaTools } from "./modules/matchup/matchup.agent";
import { createMatchupRoutes } from "./modules/matchup/matchup.routes";
import { createMatchupService } from "./modules/matchup/matchup.service";
import { createFileRunStore } from "./modules/matchup/matchup.store";
import demo from "./modules/onboarding/fixtures/demo.json";
import { createOnboardingRoutes } from "./modules/onboarding/onboarding.routes";
import { createOnboardingService } from "./modules/onboarding/onboarding.service";
import { createProfileRoutes } from "./modules/profiles/profiles.routes";
import { createProfileService } from "./modules/profiles/profiles.service";

/** Shared Cala client (timeout, 429 retry, Valkey cache). Pass it into each feature's service. */
const cala = createCalaClient({
  apiKey: env.CALA_API_KEY,
  cache: createCache({ valkeyUrl: env.VALKEY_URL }),
});

const onboarding = createOnboardingService(cala, { snapshot: demo });
const brands = createBrandsService(cala);

// Saved profiles and their runs (apps/api/data/profiles, gitignored).
const profiles = createProfileService({ dir: `${import.meta.dir}/../data/profiles` });

// Langfuse first, so the agent's spans have somewhere to go.
const telemetry = startTelemetry({
  publicKey: env.LANGFUSE_PUBLIC_KEY,
  secretKey: env.LANGFUSE_SECRET_KEY,
  baseUrl: env.LANGFUSE_BASE_URL,
  projectId: env.LANGFUSE_PROJECT_ID,
});

const matchup = env.GEMINI_API_KEY
  ? createMatchupService({
      model: createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY })(env.MATCHUP_MODEL),
      modelId: env.MATCHUP_MODEL,
      tools: createCalaTools(env.CALA_API_KEY).tools,
      maxSteps: env.MATCHUP_MAX_STEPS,
      sessionUrl: telemetry.sessionUrl,
      after: telemetry.flush,
      // Last run per company, replayed by the board (apps/api/.runs, gitignored).
      store: createFileRunStore(`${import.meta.dir}/../.runs`),
      profiles,
    })
  : null;

const middleware = { corsOrigin: env.CORS_ORIGIN };

const server = Bun.serve({
  port: env.PORT,
  // Bun closes idle connections after 10s by default; Cala searches can take longer.
  idleTimeout: 120,
  // Mount each feature's route table here.
  routes: withMiddleware(
    {
      ...healthRoutes,
      ...createOnboardingRoutes(onboarding),
      ...createMatchupRoutes(matchup),
      ...createProfileRoutes(profiles),
      ...createBrandsRoutes(brands),
    },
    middleware,
  ),
  fetch: notFound(middleware),
});

console.log(`API listening on ${server.url}`);
console.log(
  `Matchup agent: ${matchup ? env.MATCHUP_MODEL : "off (no GEMINI_API_KEY)"} · Langfuse: ${telemetry.enabled ? "on" : "off"}`,
);
