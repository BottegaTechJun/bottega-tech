import { type MatchupEvent, type MatchupStarted, matchupRequestSchema } from "@repo/shared";
import { z } from "zod";
import { requireUser } from "../../lib/auth";
import { parse, parseJson, type Routes } from "../../lib/http";
import { HttpError } from "../../lib/http-error";
import { createRuns, type Live, type Runs } from "./matchup.runs";
import type { MatchupService } from "./matchup.service";

const encoder = new TextEncoder();

// Each events connection closes itself before the host's 300s cap; the client reconnects.
const WINDOW_MS = 240_000;

const paramsSchema = z.object({ runId: z.string().trim().min(1).max(100) });

function frame(id: number, event: MatchupEvent): Uint8Array {
  return encoder.encode(`id: ${id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

// Tool results reach the browser without their entities and facts; the saved run keeps them.
function slim(event: MatchupEvent): MatchupEvent {
  return event.type === "tool-result" ? { ...event, entities: [], facts: [] } : event;
}

/** Event ids are indexes; `Last-Event-ID` names the last one the client got. */
function after(req: Request): number {
  const last = Number(req.headers.get("last-event-id"));
  return req.headers.has("last-event-id") && Number.isInteger(last) && last >= 0 ? last + 1 : 0;
}

/** Replays events from `next`, then streams live ones until the run ends or the window closes. */
function events(live: Live, next: number, signal: AbortSignal): Response {
  let close = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: Uint8Array) => {
        try {
          controller.enqueue(chunk);
        } catch {
          close();
        }
      };
      const read = () => {
        while (!closed && next < live.events.length) {
          const event = live.events[next];
          if (event) send(frame(next, event));
          next++;
        }
        if (live.finished) close();
      };
      const ping = setInterval(() => send(encoder.encode(": ping\n\n")), 15_000);
      const timer = setTimeout(() => close(), WINDOW_MS);
      close = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        clearTimeout(timer);
        live.readers.delete(read);
        try {
          controller.close();
        } catch {}
      };
      signal.addEventListener("abort", () => close());
      live.readers.add(read);
      read();
    },
    cancel() {
      close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/** `service` is null when GEMINI_API_KEY is missing; the route then answers 503. */
export function createMatchupRoutes(
  service: MatchupService | null,
  internalSecret?: string,
  runs: Runs = createRuns(),
): Routes {
  const owned = (req: Bun.BunRequest) => {
    const userId = requireUser(req, internalSecret);
    const { runId } = parse(paramsSchema, req.params);
    const live = runs.get(runId, userId);
    if (!live) throw new HttpError(404, "not_found", "This run is gone");
    return live;
  };

  return {
    "/api/matchup": {
      POST: async (req) => {
        const userId = requireUser(req, internalSecret);
        if (!service) {
          throw new HttpError(503, "upstream_error", "Matchup agent is off: set GEMINI_API_KEY");
        }
        const body = await parseJson(req, matchupRequestSchema);
        // The run is not tied to this request, so a dropped connection does not stop it.
        const runId = runs.start(userId, (emit, signal) =>
          service.run(body, (event) => emit(slim(event)), signal, userId),
        );
        return Response.json({ runId } satisfies MatchupStarted);
      },
    },
    "/api/matchup/:runId": {
      DELETE: (req) => {
        owned(req).stop.abort();
        return new Response(null, { status: 204 });
      },
    },
    "/api/matchup/:runId/events": {
      GET: (req) => {
        const live = owned(req);
        const next = after(req);
        if (live.finished && next >= live.events.length) return new Response(null, { status: 204 });
        return events(live, next, req.signal);
      },
    },
  };
}
