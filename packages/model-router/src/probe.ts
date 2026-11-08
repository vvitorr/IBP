import { ProviderError, type ModelProvider, type Tristate } from "./types";

export interface ProbeResult {
  streaming: Tristate;
  tools: Tristate;
}

const TIME_TOOL = {
  name: "get_time",
  description: "Returns the current time.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
};

/**
 * Checks what a model really does. Costs two small requests, so it only runs when the user
 * asks. A 400 means "not supported"; other errors (auth, limits, network) are rethrown.
 * No `tool_choice`: Ollama does not support it.
 */
export async function probeModel(
  provider: ModelProvider,
  model: string,
  signal?: AbortSignal,
): Promise<ProbeResult> {
  const run = async (
    request: Parameters<ModelProvider["chat"]>[0],
    wanted: "text" | "tool_call",
  ) => {
    try {
      for await (const chunk of provider.chat(request, signal)) {
        if (chunk.type === wanted) return "yes" as const;
      }
      return "no" as const;
    } catch (error) {
      if (error instanceof ProviderError && error.code === "bad_request") return "no" as const;
      throw error;
    }
  };

  const streaming = await run(
    {
      model,
      messages: [{ role: "user", content: "Reply with the single word OK." }],
      maxTokens: 5,
    },
    "text",
  );
  const tools = await run(
    {
      model,
      messages: [{ role: "user", content: "What time is it? Use the get_time tool." }],
      tools: [TIME_TOOL],
      maxTokens: 60,
    },
    "tool_call",
  );
  return { streaming, tools };
}
