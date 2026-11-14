import { companyParamsSchema, type MatchupEvent, matchupRequestSchema } from "@repo/shared";
import { parse, parseJson, type Routes } from "../../lib/http";
import { HttpError } from "../../lib/http-error";
import type { MatchupService } from "./matchup.service";

const encoder = new TextEncoder();

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
        req.signal.addEventListener("abort", () => stop.abort());

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const ping = setInterval(
              () => controller.enqueue(encoder.encode(": ping\n\n")),
              15_000,
            );
            await service.run(
              body,
              (event) => {
                if (!stop.signal.aborted) controller.enqueue(frame(event));
              },
              stop.signal,
            );
            clearInterval(ping);
            if (!stop.signal.aborted) controller.close();
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
