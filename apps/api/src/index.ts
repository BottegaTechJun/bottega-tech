import { env } from "./config/env";
import { createCache } from "./lib/cache";
import { notFound, withMiddleware } from "./lib/http";
import { createCalaClient } from "./modules/cala/cala.client";
import { healthRoutes } from "./modules/health/health.routes";
import demo from "./modules/onboarding/fixtures/demo.json";
import { createOnboardingRoutes } from "./modules/onboarding/onboarding.routes";
import { createOnboardingService } from "./modules/onboarding/onboarding.service";

/** Shared Cala client (timeout, 429 retry, Valkey cache). Pass it into each feature's service. */
const cala = createCalaClient({
  apiKey: env.CALA_API_KEY,
  cache: createCache({ valkeyUrl: env.VALKEY_URL }),
});

const onboarding = createOnboardingService(cala, { snapshot: demo });

const middleware = { corsOrigin: env.CORS_ORIGIN };

const server = Bun.serve({
  port: env.PORT,
  // Bun closes idle connections after 10s by default; Cala searches can take longer.
  idleTimeout: 120,
  // Mount each feature's route table here.
  routes: withMiddleware({ ...healthRoutes, ...createOnboardingRoutes(onboarding) }, middleware),
  fetch: notFound(middleware),
});

console.log(`API listening on ${server.url}`);
