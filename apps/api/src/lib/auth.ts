import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "./http-error";

const USER_HEADER = "x-bottega-user-id";
const SECRET_HEADER = "x-bottega-internal-secret";

/** Signs `user.expiry`; the webapp mints the same token for direct streams. */
export function signToken(userId: string, expiry: number, secret: string): string {
  const user = Buffer.from(userId, "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(`${user}.${expiry}`).digest("base64url");
  return `${user}.${expiry}.${sig}`;
}

/** Returns the user id of a valid, unexpired token, else null. */
export function verifyToken(token: string, secret: string, now = Date.now()): string | null {
  const [user, exp, sig] = token.split(".");
  if (!user || !exp || !sig || !(Number(exp) > now)) return null;
  const want = createHmac("sha256", secret).update(`${user}.${exp}`).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  return Buffer.from(user, "base64url").toString("utf8") || null;
}

/**
 * The webapp's server-side proxy forwards the user id and internal secret.
 * Long streams skip the proxy and send a short-lived signed bearer token instead.
 */
export function requireUser(req: Request, internalSecret?: string): string {
  if (!internalSecret) {
    throw new HttpError(500, "internal_error", "The API internal secret is not configured");
  }
  const bearer = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (bearer) {
    const user = verifyToken(bearer, internalSecret);
    if (!user) throw new HttpError(401, "unauthorized", "The stream token is invalid or expired");
    return user;
  }
  const userId = req.headers.get(USER_HEADER)?.trim();
  const secret = req.headers.get(SECRET_HEADER);
  if (!userId) {
    throw new HttpError(401, "unauthorized", "Sign in to access saved investor searches");
  }
  if (secret !== internalSecret) {
    throw new HttpError(401, "unauthorized", "The webapp and API internal secrets do not match");
  }
  return userId;
}
