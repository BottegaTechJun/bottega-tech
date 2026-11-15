// API entry point.
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { env } from "./config/env";
import { createCache } from "./lib/cache";
import { createDatabase } from "./lib/db";
import { notFound, withMiddleware } from "./lib/http";
import { startTelemetry } from "./lib/telemetry";
import { createBrandsRoutes } from "./modules/brands/brands.routes";
import { createBrandsService } from "./modules/brands/brands.service";
import { createCalaClient } from "./modules/cala/cala.client";
import { healthRoutes } from "./modules/health/health.routes";
import { createCalaTools } from "./modules/matchup/matchup.agent";
import { createMatchupRoutes } from "./modules/matchup/matchup.routes";
import { createMatchupService } from "./modules/matchup/matchup.service";
import demo from "./modules/onboarding/fixtures/demo.json";
import { createOnboardingRoutes } from "./modules/onboarding/onboarding.routes";
import { createOnboardingService } from "./modules/onboarding/onboarding.service";
import { createSearchRoutes } from "./modules/searches/searches.routes";
import { createSearchSessionStore } from "./modules/searches/searches.service";

/** Shared Aiven Postgres client (auto-migrates schema when DATABASE_URL is configured). */
const db = createDatabase(env.DATABASE_URL);
if (db) {
  db.migrate().catch((err) => console.error("Database migration failed:", err));
}

/** Shared Cala client (timeout, 429 retry, Valkey cache). Pass it into each feature's service. */
const cala = createCalaClient({
  apiKey: env.CALA_API_KEY,
  cache: createCache({ valkeyUrl: env.VALKEY_URL }),
});

const onboarding = createOnboardingService(cala, { snapshot: demo, db });
const brands = createBrandsService(cala);

// Saved investor searches are owned by the authenticated user.
const searches = createSearchSessionStore(db);

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
      sessions: searches,
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
      ...createMatchupRoutes(matchup, env.INTERNAL_API_SECRET),
      ...createSearchRoutes(searches, env.INTERNAL_API_SECRET),
      ...createBrandsRoutes(brands),
    },
    middleware,
  ),
  fetch: notFound(middleware),
});

console.log(`API listening on ${server.url}`);
console.log(
  `Database: ${db ? "on (Aiven Postgres)" : "off"} · Matchup agent: ${matchup ? env.MATCHUP_MODEL : "off (no GEMINI_API_KEY)"} · Langfuse: ${telemetry.enabled ? "on" : "off"}`,
);
