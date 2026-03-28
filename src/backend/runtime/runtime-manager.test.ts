import { describe, expect, it, vi } from "vitest";
import type { AuthService } from "../auth/auth-service.js";
import { createAppState } from "./state.js";
import {
  createRuntimeManager,
  type ProxyController,
} from "./runtime-manager.js";
import type {
  ClaudeLaunchConfig,
  ClaudeSessionController,
  ManagedClaudeSession,
} from "./claude-pty.js";

class FakeSession implements ManagedClaudeSession {
  readonly pid = 4242;
  private exitListeners: Array<(payload: { exitCode: number | null }) => void> = [];
  stopped = false;

  async stop(): Promise<void> {
    this.stopped = true;
  }

  write(): void {}

  resize(): void {}

  onData(): () => void {
    return () => undefined;
  }

  onExit(listener: (payload: { exitCode: number | null }) => void): () => void {
    this.exitListeners.push(listener);
    return () => undefined;
  }

  emitExit(exitCode: number | null): void {
    for (const listener of this.exitListeners) {
      listener({ exitCode });
    }
  }
}

describe("runtime manager", () => {
  it("starts and stops all components", async () => {
    const appState = createAppState();
    const proxyController: ProxyController = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    };
    const session = new FakeSession();
    const claudeController: ClaudeSessionController = {
      start: vi.fn(async (_config: ClaudeLaunchConfig) => session),
    };
    const authService = {
      isAuthenticated: () => true,
    } as AuthService;

    const runtimeManager = createRuntimeManager({
      appState,
      authService,
      proxyController,
      claudeController,
      now: () => new Date("2026-03-28T15:00:00.000Z"),
    });

    const started = await runtimeManager.start({
      port: 8082,
      model: "gpt-5",
      smallFastModel: "gpt-5-mini",
      claude: { cwd: "/tmp/project", args: ["--print"] },
    });
    expect(started.ok).toBe(true);
    expect(appState.getState().proxy.status).toBe("running");
    expect(appState.getState().claude.status).toBe("running");

    const stopped = await runtimeManager.stop();
    expect(stopped).toEqual({
      ok: true,
      proxyStopped: true,
      claudeStopped: true,
    });
    expect(proxyController.stop).toHaveBeenCalledTimes(1);
    expect(session.stopped).toBe(true);
    expect(appState.getState().proxy.status).toBe("stopped");
    expect(appState.getState().claude.status).toBe("stopped");
  });

  it("rolls back proxy if claude launch fails", async () => {
    const appState = createAppState();
    const proxyController: ProxyController = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    };
    const claudeController: ClaudeSessionController = {
      start: vi.fn(async () => {
        throw new Error("claude unavailable");
      }),
    };
    const authService = {
      isAuthenticated: () => true,
    } as AuthService;

    const runtimeManager = createRuntimeManager({
      appState,
      authService,
      proxyController,
      claudeController,
    });

    await expect(
      runtimeManager.start({
        port: 8082,
        model: "gpt-5",
        smallFastModel: "gpt-5-mini",
        claude: { cwd: "/tmp/project" },
      }),
    ).rejects.toThrow("claude unavailable");

    expect(proxyController.start).toHaveBeenCalledTimes(1);
    expect(proxyController.stop).toHaveBeenCalledTimes(1);
    expect(appState.getState().proxy.status).toBe("error");
    expect(appState.getState().claude.status).toBe("error");
  });

  it("stops the proxy when the managed Claude session exits", async () => {
    const appState = createAppState();
    const proxyController: ProxyController = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    };
    const session = new FakeSession();
    const claudeController: ClaudeSessionController = {
      start: vi.fn(async () => session),
    };
    const authService = {
      isAuthenticated: () => true,
    } as AuthService;

    const runtimeManager = createRuntimeManager({
      appState,
      authService,
      proxyController,
      claudeController,
    });

    await runtimeManager.start({
      port: 8082,
      model: "gpt-5",
      smallFastModel: "gpt-5-mini",
      claude: { cwd: "/tmp/project" },
    });

    session.emitExit(0);
    await Promise.resolve();

    expect(proxyController.stop).toHaveBeenCalledTimes(1);
    expect(appState.getState().claude.status).toBe("exited");
    expect(appState.getState().proxy.status).toBe("stopped");
  });
});
