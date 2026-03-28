import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AuthService } from "./auth-service.js";
import { createDefaultOAuthConfig } from "./oauth.js";
import { registerOAuthCallbackRoute } from "./callback-server.js";

describe("oauth callback server", () => {
  it("uses the Codex-style loopback redirect URI by default", () => {
    const config = createDefaultOAuthConfig();
    expect(config.redirectUri).toBe("http://localhost:1455/auth/callback");
  });

  it("completes login on the callback path", async () => {
    const authService = {
      completeLogin: vi.fn(async () => undefined),
      failLogin: vi.fn(),
    } as unknown as AuthService;
    const app = express();
    registerOAuthCallbackRoute(app, { authService }, "/auth/callback");

    const response = await request(app).get("/auth/callback?state=state123&code=code123");
    expect(response.status).toBe(200);
    expect(response.text).toContain("Login complete");
    expect(authService.completeLogin).toHaveBeenCalledWith({
      state: "state123",
      code: "code123",
    });
  });

  it("marks the flow as failed when OpenAI returns an auth error", async () => {
    const authService = {
      completeLogin: vi.fn(async () => undefined),
      failLogin: vi.fn(),
    } as unknown as AuthService;
    const app = express();
    registerOAuthCallbackRoute(app, { authService }, "/auth/callback");

    const response = await request(app).get("/auth/callback?state=state123&error=access_denied");
    expect(response.status).toBe(400);
    expect(response.text).toContain("Login failed");
    expect(authService.failLogin).toHaveBeenCalledWith({
      state: "state123",
      message: "OAuth login failed: access_denied",
    });
  });
});
