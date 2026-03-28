export type OAuthEndpoints = {
  authorizeUrl: string;
  tokenUrl: string;
};

export type OAuthConfig = {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  endpoints: OAuthEndpoints;
};

export type OAuthTokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  account_id?: string;
  expires_in: number;
};

export interface OAuthTransport {
  postForm(url: string, body: URLSearchParams): Promise<OAuthTokenResponse>;
  postJson(url: string, body: Record<string, string>): Promise<OAuthTokenResponse>;
}

export class FetchOAuthTransport implements OAuthTransport {
  async postForm(url: string, body: URLSearchParams): Promise<OAuthTokenResponse> {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`OAuth token request failed: ${response.status}`);
    }

    return (await response.json()) as OAuthTokenResponse;
  }

  async postJson(url: string, body: Record<string, string>): Promise<OAuthTokenResponse> {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`OAuth token request failed: ${response.status}`);
    }

    return (await response.json()) as OAuthTokenResponse;
  }
}

export function createDefaultOAuthConfig(): OAuthConfig {
  return {
    clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
    redirectUri: "http://localhost:1455/auth/callback",
    scopes: [
      "openid",
      "profile",
      "email",
      "offline_access",
      "api.connectors.read",
      "api.connectors.invoke",
    ],
    endpoints: {
      authorizeUrl: "https://auth.openai.com/oauth/authorize",
      tokenUrl: "https://auth.openai.com/oauth/token",
    },
  };
}

export class OAuthClient {
  constructor(
    private readonly config: OAuthConfig,
    private readonly transport: OAuthTransport,
  ) {}

  createAuthorizeUrl(input: {
    state: string;
    codeChallenge: string;
  }): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(" "),
      state: input.state,
      code_challenge: input.codeChallenge,
      code_challenge_method: "S256",
      id_token_add_organizations: "true",
      codex_cli_simplified_flow: "true",
      originator: "codex_cli_rs",
    });

    return `${this.config.endpoints.authorizeUrl}?${params.toString()}`;
  }

  exchangeAuthorizationCode(input: {
    code: string;
    codeVerifier: string;
  }): Promise<OAuthTokenResponse> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      code_verifier: input.codeVerifier,
    });
    return this.transport.postForm(this.config.endpoints.tokenUrl, body);
  }

  refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
    return this.transport.postJson(this.config.endpoints.tokenUrl, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.config.clientId,
    });
  }
}

export function parseJwtClaims(idToken: string): Record<string, unknown> {
  const parts = idToken.split(".");
  if (parts.length < 2) {
    return {};
  }

  const payload = parts[1]
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, "=");
  const decoded = Buffer.from(padded, "base64").toString("utf8");

  try {
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return {};
  }
}
