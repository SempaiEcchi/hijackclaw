export type ClaudeRole = "user" | "assistant" | "system" | "tool";

export type ClaudeTextBlock = {
  type: "text";
  text: string;
};

export type ClaudeUnknownBlock = {
  type: string;
  [key: string]: unknown;
};

export type ClaudeContent = string | Array<ClaudeTextBlock | ClaudeUnknownBlock>;

export type ClaudeMessage = {
  role: ClaudeRole;
  content: ClaudeContent;
};

export type ClaudeMessagesRequest = {
  model: string;
  messages: ClaudeMessage[];
  system?: string | ClaudeTextBlock[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
  stream?: boolean;
  tools?: unknown;
  tool_choice?: unknown;
};

export type ClaudeStopReason = "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | null;

export type ClaudeMessagesResponse = {
  id: string;
  type: "message";
  role: "assistant";
  content: ClaudeTextBlock[];
  model: string;
  stop_reason: ClaudeStopReason;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
};

export type ClaudeErrorResponse = {
  type: "error";
  error: {
    type: "invalid_request_error";
    message: string;
  };
};
