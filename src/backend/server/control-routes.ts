import type { Application, Request, Response } from "express";
import type {
  LoginStartRequest,
  RuntimeStartRequest,
} from "../../shared/api.js";
import type { AuthService } from "../auth/auth-service.js";
import type { RuntimeManager } from "../runtime/runtime-manager.js";
import type { AppState } from "../runtime/state.js";

export type ControlRouteDeps = {
  appState: AppState;
  authService: AuthService;
  runtimeManager: RuntimeManager;
};

function sendSseEvent(response: Response, payload: unknown): void {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function parseRuntimeStartRequest(input: unknown): RuntimeStartRequest {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid request body");
  }
  const data = input as Partial<RuntimeStartRequest>;
  if (
    typeof data.port !== "number" ||
    typeof data.model !== "string" ||
    typeof data.smallFastModel !== "string" ||
    !data.claude ||
    typeof data.claude.cwd !== "string"
  ) {
    throw new Error("Invalid runtime start payload");
  }
  return {
    port: data.port,
    model: data.model,
    smallFastModel: data.smallFastModel,
    claude: {
      cwd: data.claude.cwd,
      args: Array.isArray(data.claude.args)
        ? data.claude.args.filter((value): value is string => typeof value === "string")
        : undefined,
    },
  };
}

export function registerControlRoutes(app: Application, deps: ControlRouteDeps): void {
  app.get("/api/state", (_request, response) => {
    response.json(deps.appState.getState());
  });

  app.post(
    "/api/auth/login/start",
    async (
      request: Request<Record<string, never>, unknown, LoginStartRequest>,
      response,
    ) => {
      try {
        const payload = request.body;
        const result = await deps.authService.startLogin(payload);
        response.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to start login";
        deps.appState.error(message);
        response.status(400).json({ error: message });
      }
    },
  );

  app.get("/api/auth/login/status", (request, response) => {
    const flowId = request.query.flowId;
    if (typeof flowId !== "string" || flowId.length === 0) {
      response.status(400).json({ error: "flowId query param is required" });
      return;
    }

    response.json(deps.authService.getLoginStatus(flowId));
  });

  app.post("/api/runtime/start", async (request, response) => {
    try {
      const payload = parseRuntimeStartRequest(request.body);
      const result = await deps.runtimeManager.start(payload);
      response.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start runtime";
      deps.appState.error(message);
      response.status(400).json({ error: message });
    }
  });

  app.post("/api/runtime/stop", async (_request, response) => {
    try {
      const result = await deps.runtimeManager.stop();
      response.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to stop runtime";
      deps.appState.error(message);
      response.status(500).json({ error: message });
    }
  });

  app.get("/api/events", (request, response) => {
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");

    for (const event of deps.appState.getEvents()) {
      sendSseEvent(response, event);
    }

    const unsubscribe = deps.appState.subscribe((event) => {
      sendSseEvent(response, event);
    });

    const heartbeat = setInterval(() => {
      response.write(": keepalive\n\n");
    }, 15_000);

    request.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      response.end();
    });
  });
}
