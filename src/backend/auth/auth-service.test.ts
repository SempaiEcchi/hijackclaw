import { describe, expect, it, vi } from "vitest";
import { createAppState } from "../runtime/state.js";
import { createAuthService } from "./auth-service.js";
import { OAuthClient, type OAuthConfig, type OAuthTransport } from "./oauth.js";
import { InMemoryTokenStore } from "./token-store.js";

class FakeTransport implements OAuthTransport {
  constructor(
    private readonly tokenResponse: {
      access_token: string;
      refresh_token?: string;
      id_token?: string;
      expires_in: number;
    },
  ) {}

  async postForm(): Promise<{
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in: number;
  }> {
    return this.tokenResponse;
  }

  async postJson(): Promise<{
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in: number;
  }> {
    return this.tokenResponse;
  }
}

function buildOAuthClient(): OAuthClient {
  const config: OAuthConfig = {
    clientId: "client-123",
    redirectUri: "http://127.0.0.1:8080/api/auth/callback",
    scopes: ["openid", "profile", "email"],
    endpoints: {
      authorizeUrl: "https://auth.example.com/authorize",
      tokenUrl: "https://auth.example.com/token",
    },
  };
  const claims = Buffer.from(JSON.stringify({ email: "test@example.com" })).toString(
    "base64url",
  );
  return new OAuthClient(
    config,
    new FakeTransport({
      access_token: "access-token",
      refresh_token: "refresh-token",
      id_token: `x.${claims}.y`,
      expires_in: 3600,
    }),
  );
}

describe("auth service", () => {
  it("starts browser login flow and exposes pending status", async () => {
    const appState = createAppState();
    const browserOpener = { open: vi.fn(async () => undefined) };
    const service = createAuthService({
      appState,
      oauthClient: buildOAuthClient(),
      tokenStore: new InMemoryTokenStore(),
      browserOpener,
      createFlowId: () => "flow_fixed",
    });

    const started = await service.startLogin({ method: "browser" });
    expect(started.flowId).toBe("flow_fixed");
    expect(started.authorizeUrl).toContain("code_challenge=");
    expect(browserOpener.open).toHaveBeenCalledTimes(1);

    const status = service.getLoginStatus("flow_fixed");
    expect(status.status).toBe("pending");
    expect(appState.getState().auth.status).toBe("logging_in");
  });

  it("completes login and sets redacted public auth state", async () => {
    const appState = createAppState();
    const service = createAuthService({
      appState,
      oauthClient: buildOAuthClient(),
      tokenStore: new InMemoryTokenStore(),
      createFlowId: () => "flow_fixed",
    });

    const started = await service.startLogin({ method: "browser" });
    const stateParam = new URL(started.authorizeUrl).searchParams.get("state");
    expect(stateParam).toBeTruthy();

    await service.completeLogin({
      state: stateParam!,
      code: "auth-code",
    });

    const status = service.getLoginStatus("flow_fixed");
    expect(status.status).toBe("approved");
    expect(appState.getState().auth).toMatchObject({
      status: "logged_in",
      email: "test@example.com",
      canRefresh: true,
    });
  });
});
