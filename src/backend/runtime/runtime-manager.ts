import type {
  RuntimeStartRequest,
  RuntimeStartResponse,
  RuntimeStopResponse,
} from "../../shared/api.js";
import type { AuthService } from "../auth/auth-service.js";
import type {
  ClaudeSessionController,
  ManagedClaudeSession,
} from "./claude-pty.js";
import type { AppState } from "./state.js";

export type ProxyRuntimeConfig = {
  port: number;
  model: string;
  smallFastModel: string;
};

export interface ProxyController {
  start(config: ProxyRuntimeConfig): Promise<void>;
  stop(): Promise<void>;
}

export type RuntimeManagerDeps = {
  appState: AppState;
  authService: AuthService;
  proxyController: ProxyController;
  claudeController: ClaudeSessionController;
  now?: () => Date;
};

export class RuntimeManager {
  private activeSession: ManagedClaudeSession | null = null;
  private startedProxy = false;
  private readonly now: () => Date;

  constructor(private readonly deps: RuntimeManagerDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async start(request: RuntimeStartRequest): Promise<RuntimeStartResponse> {
    const state = this.deps.appState.getState();
    if (state.proxy.status === "starting" || state.proxy.status === "running") {
      throw new Error("Runtime is already active");
    }
    if (state.claude.status === "starting" || state.claude.status === "running") {
      throw new Error("Claude session is already active");
    }
    if (!this.deps.authService.isAuthenticated()) {
      throw new Error("Authentication required");
    }

    this.deps.appState.setProxy({
      status: "starting",
      model: request.model,
      smallFastModel: request.smallFastModel,
    });
    this.deps.appState.setClaude({
      status: "starting",
      cwd: request.claude.cwd,
    });

    let session: ManagedClaudeSession | null = null;
    try {
      await this.deps.proxyController.start({
        port: request.port,
        model: request.model,
        smallFastModel: request.smallFastModel,
      });
      this.startedProxy = true;
      this.deps.appState.setProxy({
        status: "running",
        port: request.port,
        baseUrl: `http://127.0.0.1:${request.port}`,
        model: request.model,
        smallFastModel: request.smallFastModel,
      });

      session = await this.deps.claudeController.start({
        cwd: request.claude.cwd,
        args: request.claude.args ?? [],
        env: {
          ...process.env,
          ANTHROPIC_BASE_URL: `http://127.0.0.1:${request.port}`,
          ANTHROPIC_AUTH_TOKEN: "dummy",
          ANTHROPIC_MODEL: request.model,
          ANTHROPIC_SMALL_FAST_MODEL: request.smallFastModel,
        },
      });
      this.activeSession = session;
      this.attachExitHandler(session);

      this.deps.appState.setClaude({
        status: "running",
        pid: session.pid,
        cwd: request.claude.cwd,
        startedAt: this.now().toISOString(),
      });

      return {
        ok: true,
        proxy: {
          status: "running",
          baseUrl: `http://127.0.0.1:${request.port}`,
          port: request.port,
        },
        claude: {
          status: "running",
          pid: session.pid,
        },
      };
    } catch (error) {
      await this.rollbackStart(session);
      const message = error instanceof Error ? error.message : "Runtime start failed";
      this.deps.appState.setProxy({
        status: "error",
        model: request.model,
        smallFastModel: request.smallFastModel,
        error: message,
      });
      this.deps.appState.setClaude({
        status: "error",
        cwd: request.claude.cwd,
        error: message,
      });
      this.deps.appState.error(message);
      throw error;
    }
  }

  async stop(): Promise<RuntimeStopResponse> {
    let claudeStopped = false;
    let proxyStopped = false;

    if (this.activeSession) {
      await this.activeSession.stop();
      this.activeSession = null;
      claudeStopped = true;
    }

    if (this.startedProxy) {
      await this.deps.proxyController.stop();
      this.startedProxy = false;
      proxyStopped = true;
    }

    this.deps.appState.setClaude({ status: "stopped" });
    this.deps.appState.setProxy({ status: "stopped" });

    return {
      ok: true,
      proxyStopped,
      claudeStopped,
    };
  }

  getActiveSession(): ManagedClaudeSession | null {
    return this.activeSession;
  }

  private attachExitHandler(session: ManagedClaudeSession): void {
    session.onExit((payload) => {
      this.activeSession = null;
      this.deps.appState.setClaude({
        status: "exited",
        exitCode: payload.exitCode,
      });
      if (this.startedProxy) {
        void this.deps.proxyController
          .stop()
          .then(() => {
            this.startedProxy = false;
            this.deps.appState.setProxy({ status: "stopped" });
          })
          .catch((error) => {
            const message =
              error instanceof Error ? error.message : "Failed to stop proxy after Claude exit";
            this.deps.appState.setProxy({
              status: "error",
              error: message,
            });
            this.deps.appState.error(message);
          });
      }
    });
  }

  private async rollbackStart(session: ManagedClaudeSession | null): Promise<void> {
    if (session) {
      await session.stop();
    }
    this.activeSession = null;

    if (this.startedProxy) {
      await this.deps.proxyController.stop();
      this.startedProxy = false;
    }
  }
}

export function createRuntimeManager(deps: RuntimeManagerDeps): RuntimeManager {
  return new RuntimeManager(deps);
}
