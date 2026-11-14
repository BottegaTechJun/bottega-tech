import { env } from "../config/env";
import { createDatabase } from "../lib/db";
import demo from "../modules/onboarding/fixtures/demo.json";
import { snapshotSchema } from "../modules/onboarding/onboarding.schemas";

async function main() {
  if (!env.DATABASE_URL) {
    console.error("DATABASE_URL is not set in apps/api/.env");
    process.exit(1);
  }

  const db = createDatabase(env.DATABASE_URL);
  if (!db) {
    console.error("Could not initialize database client");
    process.exit(1);
  }

  try {
    console.log("Applying PostgreSQL schema migration...");
    await db.migrate();
    console.log("Schema migration complete.");

    const snapshot = snapshotSchema.parse(demo);
    const profiles = Object.values(snapshot.profiles);
    for (const profile of profiles) {
      await db.saveProfile(profile);
      console.log(
        `Seeded company "${profile.name}" (${profile.id}) — ${profile.rounds.length} rounds, ${profile.investors.length} investors, ${profile.people.length} people.`,
      );
    }
  } finally {
    await db.close();
  }
}

await main();
