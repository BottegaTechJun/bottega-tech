/** Precomputes the demo company so the onboarding flow is instant. Run: bun run snapshot */
import { env } from "../../config/env";
import { createCalaClient } from "../cala/cala.client";
import type { Snapshot } from "./onboarding.schemas";
import { createOnboardingService } from "./onboarding.service";

const DEMO = { name: "In Parallel", id: "6ebd9536-fcc5-5921-8938-ce3497eb6262" };

const service = createOnboardingService(createCalaClient({ apiKey: env.CALA_API_KEY }));
const key = DEMO.name.toLowerCase();
const snapshot: Snapshot = {
  searches: { [key]: await service.searchCompanies(DEMO.name) },
  profiles: { [DEMO.id]: await service.getProfile(DEMO.id) },
};

const file = new URL("./fixtures/demo.json", import.meta.url);
await Bun.write(file, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Wrote ${file.pathname}`);
