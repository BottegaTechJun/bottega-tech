import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function forward(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const secret = process.env.INTERNAL_API_SECRET;
  if (!userId || !secret) {
    return Response.json(
      { error: { code: "unauthorized", message: "Sign in to access saved investor searches" } },
      { status: 401 },
    );
  }

  const { path } = await context.params;
  const incoming = new URL(request.url);
  const target = new URL(`/api/${path.join("/")}`, API_URL);
  target.search = incoming.search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.set("x-bottega-user-id", userId);
  headers.set("x-bottega-internal-secret", secret);

  const body =
    request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  const response = await fetch(target, {
    method: request.method,
    headers,
    body,
    cache: "no-store",
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export const GET = forward;
export const POST = forward;
export const DELETE = forward;
