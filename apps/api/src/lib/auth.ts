import { HttpError } from "./http-error";

const USER_HEADER = "x-bottega-user-id";
const SECRET_HEADER = "x-bottega-internal-secret";

/**
 * The web app's server-side proxy authenticates the request and forwards this
 * signed boundary. Browsers never receive the internal secret.
 */
export function requireUser(req: Request, internalSecret?: string): string {
  const userId = req.headers.get(USER_HEADER)?.trim();
  const secret = req.headers.get(SECRET_HEADER);
  if (!internalSecret) {
    throw new HttpError(500, "internal_error", "The API internal secret is not configured");
  }
  if (!userId) {
    throw new HttpError(401, "unauthorized", "Sign in to access saved investor searches");
  }
  if (secret !== internalSecret) {
    throw new HttpError(401, "unauthorized", "The webapp and API internal secrets do not match");
  }
  return userId;
}
