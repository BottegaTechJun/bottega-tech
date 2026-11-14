import { env } from "./config/env";
import { createCache } from "./lib/cache";
import { notFound, withMiddleware } from "./lib/http";
import { createCalaClient } from "./modules/cala/cala.client";
import { healthRoutes } from "./modules/health/health.routes";

/** Shared Cala client (timeout, 429 retry, Valkey cache). Pass it into each feature's service. */
// biome-ignore lint/correctness/noUnusedVariables: used once the first feature module is mounted.
const cala = createCalaClient({
  apiKey: env.CALA_API_KEY,
  cache: createCache({ valkeyUrl: env.VALKEY_URL }),
});

const middleware = { corsOrigin: env.CORS_ORIGIN };

const server = Bun.serve({
  port: env.PORT,
  // Bun closes idle connections after 10s by default; Cala searches can take longer.
  idleTimeout: 120,
  // Mount each feature's route table here, e.g. `...createCompanyRoutes(createCompanyService(cala))`.
  routes: withMiddleware({ ...healthRoutes }, middleware),
  fetch: notFound(middleware),
});

console.log(`API listening on ${server.url}`);
