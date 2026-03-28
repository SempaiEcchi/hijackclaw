export class ProxyValidationError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, options?: { statusCode?: number; code?: string }) {
    super(message);
    this.name = "ProxyValidationError";
    this.statusCode = options?.statusCode ?? 400;
    this.code = options?.code ?? "invalid_request";
  }
}

export class UnsupportedAnthropicFeatureError extends ProxyValidationError {
  constructor(feature: string) {
    super(`Unsupported Anthropic feature for MVP: ${feature}`, {
      statusCode: 400,
      code: "unsupported_feature",
    });
    this.name = "UnsupportedAnthropicFeatureError";
  }
}

export function isProxyValidationError(error: unknown): error is ProxyValidationError {
  return error instanceof ProxyValidationError;
}
