import { describe, expect, it } from "vitest";
import { UnsupportedAnthropicFeatureError } from "./errors.js";
import { translateClaudeRequestToUpstream } from "./claude-to-upstream.js";

describe("translateClaudeRequestToUpstream", () => {
  it("maps a text-only Claude request into an upstream responses-style request", () => {
    const result = translateClaudeRequestToUpstream({
      model: "gpt-5",
      system: "You are concise.",
      max_tokens: 128,
      temperature: 0.2,
      top_p: 0.9,
      stop_sequences: ["###"],
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Hello proxy" }],
        },
      ],
      stream: false,
    });

    expect(result).toEqual({
      model: "gpt-5",
      input: [
        { role: "system", content: [{ type: "input_text", text: "You are concise." }] },
        { role: "user", content: [{ type: "input_text", text: "Hello proxy" }] },
      ],
      maxOutputTokens: 128,
      temperature: 0.2,
      topP: 0.9,
      stopSequences: ["###"],
    });
  });

  it("throws explicit unsupported errors for non-text content blocks", () => {
    expect(() =>
      translateClaudeRequestToUpstream({
        model: "gpt-5",
        messages: [
          {
            role: "user",
            content: [{ type: "image", source: { type: "base64", data: "abc" } }],
          },
        ],
      }),
    ).toThrowError(UnsupportedAnthropicFeatureError);
  });

  it("throws explicit unsupported errors for tools in MVP", () => {
    expect(() =>
      translateClaudeRequestToUpstream({
        model: "gpt-5",
        tools: [{ name: "tool" }],
        messages: [{ role: "user", content: "hello" }],
      }),
    ).toThrowError(UnsupportedAnthropicFeatureError);
  });
});
