import { createHmac } from "node:crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

const TTL = 5 * 60_000;

/** Mints a short-lived token so the browser streams from the API without the Vercel proxy. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const secret = process.env.INTERNAL_API_SECRET;
  if (!userId || !secret) {
    return Response.json(
      { error: { code: "unauthorized", message: "Sign in to access saved investor searches" } },
      { status: 401 },
    );
  }
  const user = Buffer.from(userId, "utf8").toString("base64url");
  const expiry = Date.now() + TTL;
  const sig = createHmac("sha256", secret).update(`${user}.${expiry}`).digest("base64url");
  return Response.json(
    { token: `${user}.${expiry}.${sig}` },
    { headers: { "Cache-Control": "no-store" } },
  );
}
