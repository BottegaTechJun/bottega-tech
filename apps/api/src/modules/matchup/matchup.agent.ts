import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";

const CALA_MCP_URL = "https://api.cala.ai/mcp/";

/** Cala's MCP server as AI SDK tools. One client is shared and rebuilt after a failure. */
export function createCalaTools(apiKey: string) {
  let client: Promise<MCPClient> | undefined;

  async function tools(): Promise<ToolSet> {
    client ??= createMCPClient({
      name: "bottega-matchup",
      transport: { type: "http", url: CALA_MCP_URL, headers: { "X-API-KEY": apiKey } },
      maxRetries: 2,
    });
    try {
      return await (await client).tools();
    } catch (err) {
      client = undefined;
      throw err;
    }
  }

  async function close() {
    await (await client)?.close();
  }

  return { tools, close };
}
