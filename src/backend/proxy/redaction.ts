const BEARER_TOKEN_REGEX = /Bearer\s+[A-Za-z0-9._\-]+/gi;
const SECRET_FIELD_REGEX =
  /("?(?:access_token|refresh_token|id_token|authorization|code|code_verifier)"?\s*[:=]\s*"?)([^",\s}]+)("?)/gi;

export function redactSensitiveText(input: string): string {
  return input
    .replace(BEARER_TOKEN_REGEX, "Bearer [REDACTED]")
    .replace(SECRET_FIELD_REGEX, "$1[REDACTED]$3");
}
