import { env } from "./config/env";
import { notFound, withMiddleware } from "./lib/http";
import { createCalaClient } from "./modules/cala/cala.client";
import { createCalaRoutes } from "./modules/cala/cala.routes";
import { createCalaService } from "./modules/cala/cala.service";
import { healthRoutes } from "./modules/health/health.routes";

const calaService = createCalaService(createCalaClient({ apiKey: env.CALA_API_KEY }));

const middleware = { corsOrigin: env.CORS_ORIGIN };

const server = Bun.serve({
  port: env.PORT,
  // Bun closes idle connections after 10s by default; Cala searches can take longer.
  idleTimeout: 120,
  // Mount each module's route table here.
  routes: withMiddleware({ ...healthRoutes, ...createCalaRoutes(calaService) }, middleware),
  fetch: notFound(middleware),
});

console.log(`API listening on ${server.url}`);
