import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";

const CALA_MCP_URL = "https://api.cala.ai/mcp/";

/**
 * Cala calls allowed in flight at once, across every run. The agent sends a whole step's calls
 * together, and a step of 8 got 7 of them rejected with HTTP 429.
 */
const CONCURRENCY = 3;
/**
 * Waits before each retry of a call Cala turned away. Every call waits, not only the failed
 * one: retries of 1.2 and 3 seconds per call came back as a burst and were rejected again.
 */
const RETRY_DELAYS = [2000, 5000, 10000];
const TRANSIENT = /HTTP error (429|5\d\d)|too many requests|rate.?limit/i;

/**
 * At most `size` Cala calls in flight, the rest queued first come first served, plus a shared
 * pause: once Cala says it is busy, no call goes out until the pause ends.
 */
export function createGate(size: number) {
  let active = 0;
  let until = 0;
  const waiting: (() => void)[] = [];
  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      if (active < size) active++;
      // A finishing task hands its slot straight to the next one in line.
      else await new Promise<void>((resolve) => waiting.push(resolve));
      try {
        return await task();
      } finally {
        const next = waiting.shift();
        if (next) next();
        else active--;
      }
    },
    /** Holds every call for the next `ms`. */
    pause(ms: number) {
      until = Math.max(until, Date.now() + ms);
    },
    /** How long a call must still wait before it may go out. */
    wait(): number {
      return Math.max(0, until - Date.now());
    },
  };
}
export type Gate = ReturnType<typeof createGate>;

/** A tool result or thrown error that says Cala was busy, not that the call was wrong. */
function transient(value: unknown): boolean {
  if (value instanceof Error) return TRANSIENT.test(value.message);
  if (!value || typeof value !== "object") return false;
  const record = value as { isError?: unknown; error?: unknown; content?: unknown };
  if (record.isError !== true) return false;
  const text = [
    typeof record.error === "string" ? record.error : "",
    ...(Array.isArray(record.content)
      ? record.content.map((part) => String((part as { text?: unknown } | null)?.text ?? ""))
      : []),
  ].join(" ");
  return TRANSIENT.test(text);
}

interface Pacing {
  /** Shared by every tool and run, so bursts queue and a 429 slows everyone down */
  gate?: Gate;
  delays?: number[];
  sleep?: (ms: number) => Promise<unknown>;
}

/**
 * Wraps Cala's tools so calls go out a few at a time, and a call Cala turns away for being
 * busy (429 or 5xx) pauses every call, then is retried. Any other result, or the last try,
 * reaches the agent unchanged.
 */
export function paced(tools: ToolSet, options: Pacing = {}): ToolSet {
  const {
    gate = createGate(CONCURRENCY),
    delays = RETRY_DELAYS,
    sleep = (ms: number) => Bun.sleep(ms),
  } = options;
  const out: ToolSet = {};
  for (const [name, original] of Object.entries(tools)) {
    const run = original.execute;
    if (!run) {
      out[name] = original;
      continue;
    }
    const execute: typeof run = (input, context) =>
      gate.run(async () => {
        for (let attempt = 0; ; attempt++) {
          const hold = gate.wait();
          if (hold > 0) await sleep(hold);
          const last = attempt >= delays.length || context.abortSignal?.aborted === true;
          try {
            const result = await run(input, context);
            if (last || !transient(result)) return result;
          } catch (err) {
            if (last || !transient(err)) throw err;
          }
          // Jitter, so calls that were held together don't all go out at the same moment.
          const delay = (delays[attempt] ?? 0) + Math.random() * 1000;
          gate.pause(delay);
          await sleep(delay);
        }
      });
    out[name] = { ...original, execute };
  }
  return out;
}

/** Cala's MCP server as AI SDK tools. One client is shared and rebuilt after a failure. */
export function createCalaTools(apiKey: string) {
  let client: Promise<MCPClient> | undefined;
  // One gate for the whole server: two searches running at once share Cala's limit too.
  const gate = createGate(CONCURRENCY);

  function connect(): Promise<MCPClient> {
    const pending = createMCPClient({
      name: "bottega-matchup",
      transport: {
        type: "http",
        url: CALA_MCP_URL,
        headers: { "X-API-KEY": apiKey },
        onSessionExpired: () => {
          if (client === pending) client = undefined;
        },
      },
      onUncaughtError: (err) => {
        console.error("Cala MCP client error:", err);
      },
      maxRetries: 2,
    });
    pending.catch(() => {
      if (client === pending) client = undefined;
    });
    return pending;
  }

  async function load(): Promise<ToolSet> {
    if (!client) client = connect();
    const current = client;
    try {
      return paced(await (await current).tools(), { gate });
    } catch (err) {
      if (client === current) client = undefined;
      throw err;
    }
  }

  async function tools(): Promise<ToolSet> {
    try {
      return await load();
    } catch {
      return await load();
    }
  }

  async function close() {
    const prev = client;
    client = undefined;
    await (await prev)?.close().catch(() => undefined);
  }

  return { tools, close };
}
