import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AuthService } from "../auth/auth-service.js";
import type { RuntimeManager } from "../runtime/runtime-manager.js";
import { createAppState } from "../runtime/state.js";
import { registerControlRoutes } from "./control-routes.js";

describe("control routes", () => {
  it("returns api state and starts runtime", async () => {
    const appState = createAppState();
    const authService = {
      startLogin: vi.fn(async () => ({
        flowId: "flow_1",
        authorizeUrl: "https://auth.example.com",
      })),
      getLoginStatus: vi.fn(() => ({ status: "pending" })),
      completeLogin: vi.fn(async () => undefined),
    } as unknown as AuthService;
    const runtimeManager = {
      start: vi.fn(async () => ({
        ok: true,
        proxy: { status: "running", baseUrl: "http://127.0.0.1:8082", port: 8082 },
        claude: { status: "running", pid: 3333 },
      })),
      stop: vi.fn(async () => ({
        ok: true,
        proxyStopped: true,
        claudeStopped: true,
      })),
    } as unknown as RuntimeManager;

    const app = express();
    app.use(express.json());
    registerControlRoutes(app, { appState, authService, runtimeManager });

    const stateResponse = await request(app).get("/api/state");
    expect(stateResponse.status).toBe(200);
    expect(stateResponse.body.guardrails.globalConfigTouched).toBe(false);

    const loginResponse = await request(app)
      .post("/api/auth/login/start")
      .send({ method: "browser" });
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body).toMatchObject({ flowId: "flow_1" });

    const runtimeStartResponse = await request(app).post("/api/runtime/start").send({
      port: 8082,
      model: "gpt-5",
      smallFastModel: "gpt-5-mini",
      claude: { cwd: "/tmp/work" },
    });
    expect(runtimeStartResponse.status).toBe(200);
    expect(runtimeStartResponse.body.ok).toBe(true);
  });

  it("validates missing flow id and invalid runtime payload", async () => {
    const appState = createAppState();
    const authService = {
      startLogin: vi.fn(async () => ({
        flowId: "flow_1",
        authorizeUrl: "https://auth.example.com",
      })),
      getLoginStatus: vi.fn(() => ({ status: "pending" })),
      completeLogin: vi.fn(async () => undefined),
    } as unknown as AuthService;
    const runtimeManager = {
      start: vi.fn(async () => {
        throw new Error("should not execute");
      }),
      stop: vi.fn(async () => ({
        ok: true,
        proxyStopped: true,
        claudeStopped: true,
      })),
    } as unknown as RuntimeManager;

    const app = express();
    app.use(express.json());
    registerControlRoutes(app, { appState, authService, runtimeManager });

    const missingFlow = await request(app).get("/api/auth/login/status");
    expect(missingFlow.status).toBe(400);
    expect(missingFlow.body.error).toContain("flowId");

    const invalidRuntime = await request(app).post("/api/runtime/start").send({
      model: "gpt-5",
    });
    expect(invalidRuntime.status).toBe(400);
    expect(invalidRuntime.body.error).toContain("Invalid");
  });

  it("streams historical and live events over /api/events", async () => {
    const appState = createAppState();
    const authService = {
      startLogin: vi.fn(async () => ({
        flowId: "flow_1",
        authorizeUrl: "https://auth.example.com",
      })),
      getLoginStatus: vi.fn(() => ({ status: "pending" })),
      completeLogin: vi.fn(async () => undefined),
    } as unknown as AuthService;
    const runtimeManager = {
      start: vi.fn(async () => ({
        ok: true,
        proxy: { status: "running", baseUrl: "http://127.0.0.1:8082", port: 8082 },
        claude: { status: "running", pid: 3333 },
      })),
      stop: vi.fn(async () => ({
        ok: true,
        proxyStopped: true,
        claudeStopped: true,
      })),
    } as unknown as RuntimeManager;

    appState.log("info", "seed-event");

    const app = express();
    app.use(express.json());
    registerControlRoutes(app, { appState, authService, runtimeManager });

    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => {
      server.once("listening", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Unable to read test server address");
    }

    const abortController = new AbortController();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/events`, {
      signal: abortController.signal,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const reader = response.body?.getReader();
    expect(reader).toBeTruthy();
    const firstChunk = await reader!.read();
    const text = new TextDecoder().decode(firstChunk.value);
    expect(text).toContain("runtime.log");
    expect(text).toContain("seed-event");

    abortController.abort();
    server.close();
  });
});
