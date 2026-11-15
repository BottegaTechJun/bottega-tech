import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";

const CALA_MCP_URL = "https://api.cala.ai/mcp/";

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
      return await (await current).tools();
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
