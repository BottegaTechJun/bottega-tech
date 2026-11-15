import { describe, expect, test } from "bun:test";
import { requireUser, signToken, verifyToken } from "./auth";

const secret = "s3cret";

describe("stream token", () => {
  test("round-trips the user id", () => {
    const token = signToken("user.with.dots", Date.now() + 60_000, secret);
    expect(verifyToken(token, secret)).toBe("user.with.dots");
  });

  test("rejects an expired token", () => {
    const token = signToken("u1", Date.now() - 1, secret);
    expect(verifyToken(token, secret)).toBeNull();
  });

  test("rejects a wrong secret or tampered user", () => {
    const token = signToken("u1", Date.now() + 60_000, secret);
    expect(verifyToken(token, "other")).toBeNull();
    const [, exp, sig] = token.split(".");
    const forged = `${Buffer.from("u2").toString("base64url")}.${exp}.${sig}`;
    expect(verifyToken(forged, secret)).toBeNull();
  });

  test("requireUser accepts a bearer token", () => {
    const token = signToken("u1", Date.now() + 60_000, secret);
    const req = new Request("http://x", { headers: { authorization: `Bearer ${token}` } });
    expect(requireUser(req, secret)).toBe("u1");
  });

  test("requireUser rejects a bad bearer token", () => {
    const req = new Request("http://x", { headers: { authorization: "Bearer nope" } });
    expect(() => requireUser(req, secret)).toThrow();
  });
});
