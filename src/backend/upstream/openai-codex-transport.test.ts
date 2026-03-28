import { describe, expect, it, vi } from "vitest";
import { OpenAICodexTransport } from "./openai-codex-transport.js";

describe("OpenAICodexTransport", () => {
  it("falls back to SSE when websocket transport fails", async () => {
    const modes: string[] = [];
    const transport = new OpenAICodexTransport({
      ws: {
        accessTokenProvider: async () => "token",
        createSocket: (() => {
          throw new Error("ws unavailable");
        }) as never,
      },
      sse: {
        accessTokenProvider: async () => "token",
        fetchImpl: vi.fn(async () =>
          new Response(
            [
              'data: {"type":"response.created","response":{"id":"resp_sse","model":"gpt-5"}}',
              "",
              'data: {"type":"response.completed","response":{"id":"resp_sse","model":"gpt-5","output_text":"fallback","usage":{"input_tokens":5,"output_tokens":1},"stop_reason":"end_turn"}}',
              "",
            ].join("\n"),
            {
              status: 200,
              headers: {
                "Content-Type": "text/event-stream",
              },
            },
          )) as unknown as typeof fetch,
      },
      logger: console,
      onModeChange: (mode) => {
        modes.push(mode);
      },
    });

    const response = await transport.createMessage({
      model: "gpt-5",
      input: [{ role: "user", content: [{ type: "input_text", text: "Hi" }] }],
    });

    expect(response.outputText).toBe("fallback");
    expect(modes).toEqual(["ws", "sse"]);
  });
});
