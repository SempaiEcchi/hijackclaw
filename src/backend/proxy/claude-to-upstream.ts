import type { UpstreamInputMessage, UpstreamRequest } from "../upstream/types.js";
import { ProxyValidationError, UnsupportedAnthropicFeatureError } from "./errors.js";
import type { ClaudeContent, ClaudeMessagesRequest, ClaudeTextBlock } from "./types.js";

function toTextFromBlocks(blocks: ClaudeTextBlock[], context: string): string {
  return blocks
    .map((block, index) => {
      if (block.type !== "text") {
        throw new UnsupportedAnthropicFeatureError(`${context}[${index}].type=${block.type}`);
      }
      return block.text;
    })
    .join("");
}

function toTextContent(content: ClaudeContent, context: string): string {
  if (typeof content === "string") {
    return content;
  }

  return content
    .map((block, index) => {
      if (block.type !== "text") {
        throw new UnsupportedAnthropicFeatureError(`${context}[${index}].type=${block.type}`);
      }
      return block.text;
    })
    .join("");
}

function toInputMessage(role: "system" | "user" | "assistant", text: string): UpstreamInputMessage {
  return {
    role,
    content: [{ type: "input_text", text }],
  };
}

export function translateClaudeRequestToUpstream(request: ClaudeMessagesRequest): UpstreamRequest {
  if (!request || typeof request !== "object") {
    throw new ProxyValidationError("Request body must be a JSON object");
  }

  if (!request.model || typeof request.model !== "string") {
    throw new ProxyValidationError("model is required");
  }

  if (!Array.isArray(request.messages) || request.messages.length === 0) {
    throw new ProxyValidationError("messages must contain at least one message");
  }

  if (request.tools !== undefined) {
    throw new UnsupportedAnthropicFeatureError("tools");
  }
  if (request.tool_choice !== undefined) {
    throw new UnsupportedAnthropicFeatureError("tool_choice");
  }

  const input: UpstreamInputMessage[] = [];

  if (typeof request.system === "string" && request.system.length > 0) {
    input.push(toInputMessage("system", request.system));
  } else if (Array.isArray(request.system) && request.system.length > 0) {
    input.push(toInputMessage("system", toTextFromBlocks(request.system, "system")));
  }

  for (const [index, message] of request.messages.entries()) {
    if (message.role !== "user" && message.role !== "assistant") {
      throw new UnsupportedAnthropicFeatureError(`messages[${index}].role=${message.role}`);
    }

    input.push(
      toInputMessage(
        message.role,
        toTextContent(message.content, `messages[${index}].content`),
      ),
    );
  }

  return {
    model: request.model,
    input,
    maxOutputTokens: request.max_tokens,
    temperature: request.temperature,
    topP: request.top_p,
    stopSequences: request.stop_sequences,
  };
}
