import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer, type RawData } from "ws";
import { createAuthService } from "./auth/auth-service.js";
import {
  createDefaultOAuthConfig,
  FetchOAuthTransport,
  OAuthClient,
} from "./auth/oauth.js";
import { startOAuthCallbackServer } from "./auth/callback-server.js";
import { FileTokenStore } from "./auth/token-store.js";
import { ClaudePtyController } from "./runtime/claude-pty.js";
import {
  createRuntimeManager,
  type ProxyController,
  type ProxyRuntimeConfig,
} from "./runtime/runtime-manager.js";
import { createAppState } from "./runtime/state.js";
import { registerControlRoutes } from "./server/control-routes.js";
import { registerProxyRoutes } from "./server/proxy-routes.js";
import { createOpenAICodexTransport } from "./upstream/openai-codex-transport.js";
import type { UpstreamTransport, UpstreamTransportMode } from "./upstream/types.js";

type Logger = Pick<Console, "info" | "warn" | "error">;

function createLogger(appState: ReturnType<typeof createAppState>): Logger {
  return {
    info(message) {
      appState.log("info", message);
      console.info(message);
    },
    warn(message) {
      appState.log("warn", message);
      console.warn(message);
    },
    error(message) {
      appState.log("error", message);
      console.error(message);
    },
  };
}

function resolveProjectRoot(): string {
  let currentDir = path.dirname(fileURLToPath(import.meta.url));

  while (true) {
    if (fs.existsSync(path.join(currentDir, "package.json"))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error("Could not locate project root from backend entrypoint");
    }
    currentDir = parentDir;
  }
}

function resolveAppHome(): string {
  return process.env.HIJACKCLAW_HOME ?? path.join(os.homedir(), ".hijackclaw");
}

function setProxyTransportMode(
  appState: ReturnType<typeof createAppState>,
  mode: UpstreamTransportMode,
): void {
  const current = appState.getState().proxy;
  appState.setProxy({
    ...current,
    upstreamTransport: mode,
  });
}

function createProxyController(deps: {
  upstreamTransport: UpstreamTransport;
  logger: Logger;
}): ProxyController {
  let server: http.Server | null = null;

  return {
    async start(config) {
      if (server) {
        throw new Error("Proxy is already running");
      }

      const proxyApp = express();
      proxyApp.disable("x-powered-by");
      proxyApp.use(express.json({ limit: "4mb" }));
      registerProxyRoutes(proxyApp, {
        upstreamTransport: deps.upstreamTransport,
        models: [config.model, config.smallFastModel],
        logger: deps.logger,
      });

      await new Promise<void>((resolve, reject) => {
        const nextServer = http.createServer(proxyApp);
        const onError = (error: Error) => {
          nextServer.off("error", onError);
          reject(error);
        };

        nextServer.once("error", onError);
        nextServer.listen(config.port, "127.0.0.1", () => {
          nextServer.off("error", onError);
          server = nextServer;
          deps.logger.info(`Proxy listening on http://127.0.0.1:${config.port}`);
          resolve();
        });
      });
    },

    async stop() {
      if (!server) {
        return;
      }

      const runningServer = server;
      server = null;

      await new Promise<void>((resolve, reject) => {
        runningServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          deps.logger.info("Proxy stopped");
          resolve();
        });
      });
      await deps.upstreamTransport.close();
    },
  };
}

function toTextChunk(data: RawData): string {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }
  return data.toString("utf8");
}

async function main(): Promise<void> {
  const controlPort = Number(process.env.PORT ?? 8080);
  const controlBaseUrl = `http://127.0.0.1:${controlPort}`;
  const appState = createAppState();
  const logger = createLogger(appState);

  const oauthConfig = createDefaultOAuthConfig();
  oauthConfig.redirectUri = process.env.OPENAI_OAUTH_REDIRECT_URI ?? "http://localhost:1455/auth/callback";
  if (process.env.OPENAI_OAUTH_AUTHORIZE_URL) {
    oauthConfig.endpoints.authorizeUrl = process.env.OPENAI_OAUTH_AUTHORIZE_URL;
  }
  if (process.env.OPENAI_OAUTH_TOKEN_URL) {
    oauthConfig.endpoints.tokenUrl = process.env.OPENAI_OAUTH_TOKEN_URL;
  }

  const authService = createAuthService({
    appState,
    oauthClient: new OAuthClient(oauthConfig, new FetchOAuthTransport()),
    tokenStore: new FileTokenStore(path.join(resolveAppHome(), "auth.json")),
  });
  const oauthCallbackServer = await startOAuthCallbackServer({
    authService,
    redirectUri: oauthConfig.redirectUri,
    logger,
  });
  const openAICodexTransport = createOpenAICodexTransport({
    ws: {
      accessTokenProvider: async () => authService.getAccessToken(),
      baseUrl: process.env.OPENAI_CODEX_WS_BASE_URL,
      logger,
    },
    sse: {
      accessTokenProvider: async () => authService.getAccessToken(),
      baseUrl: process.env.OPENAI_CODEX_BASE_URL,
      logger,
    },
    logger,
    onModeChange(mode) {
      setProxyTransportMode(appState, mode);
    },
  });
  const runtimeManager = createRuntimeManager({
    appState,
    authService,
    proxyController: createProxyController({ upstreamTransport: openAICodexTransport, logger }),
    claudeController: new ClaudePtyController(),
  });

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "4mb" }));
  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });
  registerControlRoutes(app, {
    appState,
    authService,
    runtimeManager,
  });

  const projectRoot = resolveProjectRoot();
  const frontendDistDir = path.join(projectRoot, "dist", "frontend");
  const frontendIndexPath = path.join(frontendDistDir, "index.html");
  if (fs.existsSync(frontendIndexPath)) {
    app.use(express.static(frontendDistDir));
    app.get("/{*rest}", (request, response, next) => {
      if (request.path.startsWith("/api") || request.path === "/health") {
        next();
        return;
      }
      response.sendFile(frontendIndexPath);
    });
  }

  const server = http.createServer(app);
  const terminalServer = new WebSocketServer({
    noServer: true,
  });

  terminalServer.on("connection", (socket) => {
    const session = runtimeManager.getActiveSession();
    if (!session) {
      socket.send(JSON.stringify({ type: "error", message: "No active Claude session" }));
      socket.close();
      return;
    }

    const detachData = session.onData((chunk) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: "data", data: chunk }));
      }
    });
    const detachExit = session.onExit((payload) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "error",
            message: `Claude session exited (${payload.exitCode ?? "unknown"})`,
          }),
        );
        socket.close();
      }
    });

    socket.on("message", (data) => {
      const nextSession = runtimeManager.getActiveSession();
      if (!nextSession) {
        socket.send(JSON.stringify({ type: "error", message: "Claude session is no longer active" }));
        return;
      }
      nextSession.write(toTextChunk(data));
    });

    socket.on("close", () => {
      detachData();
      detachExit();
    });
  });

  server.on("upgrade", (request, socket, head) => {
    if (request.url !== "/ws/terminal") {
      socket.destroy();
      return;
    }

    terminalServer.handleUpgrade(request, socket, head, (client) => {
      terminalServer.emit("connection", client, request);
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(controlPort, "127.0.0.1", () => {
      logger.info(`Control server listening on ${controlBaseUrl}`);
      resolve();
    });
  });

  const shutdown = async () => {
    logger.info("Shutting down");
    try {
      await runtimeManager.stop();
    } catch (error) {
      logger.warn(error instanceof Error ? error.message : String(error));
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await oauthCallbackServer.close();
    terminalServer.close();
  };

  const handleSignal = (signal: NodeJS.Signals) => {
    logger.info(`Received ${signal}`);
    void shutdown().finally(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
