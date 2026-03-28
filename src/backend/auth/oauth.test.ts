import { describe, expect, it, vi } from "vitest";
import { OAuthClient, type OAuthConfig, type OAuthTransport } from "./oauth.js";

describe("oauth client", () => {
  it("builds authorize URLs from configurable endpoints", () => {
    const transport: OAuthTransport = {
      postForm: vi.fn(async () => ({
        access_token: "token",
        expires_in: 3600,
      })),
      postJson: vi.fn(async () => ({
        access_token: "token",
        expires_in: 3600,
      })),
    };
    const client = new OAuthClient(
      {
        clientId: "client-id",
        redirectUri: "http://127.0.0.1:8080/api/auth/callback",
        scopes: ["openid", "email"],
        endpoints: {
          authorizeUrl: "https://auth.example.com/authorize",
          tokenUrl: "https://auth.example.com/token",
        },
      } as OAuthConfig,
      transport,
    );

    const url = client.createAuthorizeUrl({
      state: "state-1",
      codeChallenge: "challenge-1",
    });
    expect(url).toContain("https://auth.example.com/authorize?");
    expect(url).toContain("client_id=client-id");
    expect(url).toContain("code_challenge=challenge-1");
  });
});
