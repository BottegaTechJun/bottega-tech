import { companyParamsSchema, type MatchupEvent, matchupRequestSchema } from "@repo/shared";
import { parse, parseJson, type Routes } from "../../lib/http";
import { HttpError } from "../../lib/http-error";
import type { MatchupService } from "./matchup.service";

const encoder = new TextEncoder();
const PING = encoder.encode(": ping\n\n");

function frame(event: MatchupEvent): Uint8Array {
  return encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

/** `service` is null when GEMINI_API_KEY is missing; the route then answers 503. */
export function createMatchupRoutes(service: MatchupService | null): Routes {
  return {
    "/api/matchup/:id/last": {
      GET: async (req) => {
        const { id } = parse(companyParamsSchema, req.params);
        const saved = await service?.last(id);
        if (!saved) throw new HttpError(404, "not_found", "No saved run for this company");
        return Response.json(saved);
      },
    },
    "/api/matchup": {
      POST: async (req) => {
        if (!service) {
          throw new HttpError(503, "upstream_error", "Matchup agent is off: set GEMINI_API_KEY");
        }
        const body = await parseJson(req, matchupRequestSchema);
        const stop = new AbortController();
        const onAbort = () => stop.abort();
        req.signal.addEventListener("abort", onAbort, { once: true });

        let closed = false;
        let ping: ReturnType<typeof setInterval> | undefined;

        const cleanup = () => {
          closed = true;
          if (ping !== undefined) {
            clearInterval(ping);
            ping = undefined;
          }
          req.signal.removeEventListener("abort", onAbort);
        };

        const safeEnqueue = (
          controller: ReadableStreamDefaultController<Uint8Array>,
          chunk: Uint8Array,
        ) => {
          if (closed || stop.signal.aborted) return;
          try {
            controller.enqueue(chunk);
          } catch {
            cleanup();
            stop.abort();
          }
        };

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            ping = setInterval(() => safeEnqueue(controller, PING), 15_000);
            try {
              await service.run(
                body,
                (event) => safeEnqueue(controller, frame(event)),
                stop.signal,
              );
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              safeEnqueue(controller, frame({ type: "error", message }));
            } finally {
              const alreadyClosed = closed;
              cleanup();
              if (!alreadyClosed) {
                try {
                  controller.close();
                } catch {
                  // Stream was already closed or cancelled by the client/runtime
                }
              }
            }
          },
          cancel() {
            cleanup();
            stop.abort();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      },
    },
  };
}
