import { LangfuseSpanProcessor } from "@langfuse/otel";
import { LangfuseVercelAiSdkIntegration } from "@langfuse/vercel-ai-sdk";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { registerTelemetry } from "ai";

export interface LangfuseOptions {
  publicKey?: string;
  secretKey?: string;
  baseUrl: string;
  projectId?: string;
}

/** Sends AI SDK spans to Langfuse when both keys are set; otherwise tracing stays off. */
export function startTelemetry(options: LangfuseOptions) {
  const { publicKey, secretKey, baseUrl, projectId } = options;
  if (!publicKey || !secretKey) {
    return { enabled: false, flush: async () => {}, sessionUrl: () => null };
  }

  const processor = new LangfuseSpanProcessor({ publicKey, secretKey, baseUrl });
  new NodeSDK({ spanProcessors: [processor] }).start();
  registerTelemetry(new LangfuseVercelAiSdkIntegration());

  return {
    enabled: true,
    flush: () => processor.forceFlush(),
    sessionUrl: (sessionId: string) =>
      projectId
        ? `${baseUrl.replace(/\/$/, "")}/project/${projectId}/sessions/${encodeURIComponent(sessionId)}`
        : null,
  };
}
