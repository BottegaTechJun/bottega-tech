import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";

const CALA_MCP_URL = "https://api.cala.ai/mcp/";

/** Waits before the second and third try of a call Cala turned away. */
const RETRY_DELAYS = [1200, 3000];
const TRANSIENT = /HTTP error (429|5\d\d)|too many requests|rate.?limit/i;

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

interface Patience {
  delays?: number[];
  sleep?: (ms: number) => Promise<unknown>;
}

/**
 * Retries a Cala call that hit the rate limit or a server error, so a burst of parallel calls
 * doesn't reach the agent as failures. Any other result, or the last try, passes through.
 */
export function patient(tools: ToolSet, options: Patience = {}): ToolSet {
  const { delays = RETRY_DELAYS, sleep = Bun.sleep } = options;
  const out: ToolSet = {};
  for (const [name, original] of Object.entries(tools)) {
    const run = original.execute;
    if (!run) {
      out[name] = original;
      continue;
    }
    const execute: typeof run = async (input, context) => {
      for (let attempt = 0; ; attempt++) {
        const last = attempt >= delays.length || context.abortSignal?.aborted === true;
        try {
          const result = await run(input, context);
          if (last || !transient(result)) return result;
        } catch (err) {
          if (last || !transient(err)) throw err;
        }
        // Spread retries of calls that failed together.
        await sleep((delays[attempt] ?? 0) + Math.random() * 400);
      }
    };
    out[name] = { ...original, execute };
  }
  return out;
}

/** Cala's MCP server as AI SDK tools. One client is shared and rebuilt after a failure. */
export function createCalaTools(apiKey: string) {
  let client: Promise<MCPClient> | undefined;

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
      const { knowledge_search: _slow, ...rest } = await (await current).tools();
      return patient(rest);
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
