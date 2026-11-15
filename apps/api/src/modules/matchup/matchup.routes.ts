import { type MatchupEvent, matchupRequestSchema } from "@repo/shared";
import { requireUser } from "../../lib/auth";
import { parseJson, type Routes } from "../../lib/http";
import { HttpError } from "../../lib/http-error";
import type { MatchupService } from "./matchup.service";

const encoder = new TextEncoder();

function frame(event: MatchupEvent): Uint8Array {
  return encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

/** `service` is null when GEMINI_API_KEY is missing; the route then answers 503. */
export function createMatchupRoutes(
  service: MatchupService | null,
  internalSecret?: string,
): Routes {
  return {
    "/api/matchup": {
      POST: async (req) => {
        const userId = requireUser(req, internalSecret);
        if (!service) {
          throw new HttpError(503, "upstream_error", "Matchup agent is off: set GEMINI_API_KEY");
        }
        const body = await parseJson(req, matchupRequestSchema);
        const stop = new AbortController();
        req.signal.addEventListener("abort", () => stop.abort());

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            // A write to a stream the client closed throws, and uncaught it kills the server.
            const send = (chunk: Uint8Array) => {
              if (stop.signal.aborted) return;
              try {
                controller.enqueue(chunk);
              } catch {}
            };
            const ping = setInterval(() => send(encoder.encode(": ping\n\n")), 15_000);
            stop.signal.addEventListener("abort", () => clearInterval(ping));
            try {
              await service.run(body, (event) => send(frame(event)), stop.signal, userId);
            } catch (err) {
              console.error("Matchup stream failed:", err);
            } finally {
              clearInterval(ping);
              try {
                if (!stop.signal.aborted) controller.close();
              } catch {}
            }
          },
          cancel() {
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
