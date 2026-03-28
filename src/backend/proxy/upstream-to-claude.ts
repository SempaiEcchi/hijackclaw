import type { UpstreamResponse, UpstreamStopReason } from "../upstream/types.js";
import type { ClaudeMessagesResponse, ClaudeStopReason } from "./types.js";

export function mapUpstreamStopReasonToClaude(reason: UpstreamStopReason): ClaudeStopReason {
  if (reason === "max_tokens") {
    return "max_tokens";
  }
  if (reason === "stop_sequence") {
    return "stop_sequence";
  }
  if (reason === "tool_use") {
    return "tool_use";
  }
  return "end_turn";
}

export function translateUpstreamResponseToClaude(response: UpstreamResponse): ClaudeMessagesResponse {
  return {
    id: response.id,
    type: "message",
    role: "assistant",
    content: [
      {
        type: "text",
        text: response.outputText,
      },
    ],
    model: response.model,
    stop_reason: mapUpstreamStopReasonToClaude(response.stopReason),
    stop_sequence: response.stopSequence,
    usage: {
      input_tokens: response.usage.inputTokens,
      output_tokens: response.usage.outputTokens,
    },
  };
}
