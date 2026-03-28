import http from "node:http";
import express, { type Application } from "express";
import type { AuthService } from "./auth-service.js";

type Logger = Pick<Console, "info" | "warn" | "error">;

export type OAuthCallbackServer = {
  close: () => Promise<void>;
};

export type OAuthCallbackServerDeps = {
  authService: AuthService;
  redirectUri: string;
  logger?: Logger;
};

function buildHtml(title: string, message: string): string {
  return `<!doctype html><html><body style="font-family: sans-serif; padding: 24px; background: #0b1222; color: #e6eeff;"><h1>${title}</h1><p>${message}</p></body></html>`;
}

function resolveListenPort(callbackUrl: URL): number {
  if (callbackUrl.port) {
    return Number(callbackUrl.port);
  }

  return callbackUrl.protocol === "https:" ? 443 : 80;
}

export function registerOAuthCallbackRoute(
  app: Application,
  deps: Pick<OAuthCallbackServerDeps, "authService">,
  callbackPath: string,
): void {
  app.get(callbackPath, async (request, response) => {
    const code = request.query.code;
    const state = request.query.state;
    const oauthError = request.query.error;

    if (typeof oauthError === "string" && oauthError.length > 0) {
      deps.authService.failLogin({
        state: typeof state === "string" ? state : undefined,
        message: `OAuth login failed: ${oauthError}`,
      });
      response
        .status(400)
        .type("html")
        .send(buildHtml("Login failed", "OAuth login could not be completed."));
      return;
    }

    if (typeof code !== "string" || typeof state !== "string") {
      response
        .status(400)
        .type("html")
        .send(buildHtml("Login failed", "Missing OAuth callback parameters."));
      return;
    }

    try {
      await deps.authService.completeLogin({ code, state });
      response
        .status(200)
        .type("html")
        .send(buildHtml("Login complete", "You can close this tab and return to HijackClaw."));
    } catch (error) {
      const message = error instanceof Error ? error.message : "OAuth callback failed";
      deps.authService.failLogin({ state, message });
      response
        .status(400)
        .type("html")
        .send(buildHtml("Login failed", "OAuth login could not be completed."));
    }
  });
}

export async function startOAuthCallbackServer(
  deps: OAuthCallbackServerDeps,
): Promise<OAuthCallbackServer> {
  const callbackUrl = new URL(deps.redirectUri);
  if (callbackUrl.protocol !== "http:") {
    throw new Error(`Unsupported OAuth callback protocol: ${callbackUrl.protocol}`);
  }

  const app = express();
  app.disable("x-powered-by");
  registerOAuthCallbackRoute(app, deps, callbackUrl.pathname);

  const server = http.createServer(app);
  const host = callbackUrl.hostname;
  const port = resolveListenPort(callbackUrl);

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("error", onError);
      reject(error);
    };

    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      deps.logger?.info(`OAuth callback server listening on ${callbackUrl.toString()}`);
      resolve();
    });
  });

  return {
    close: async () =>
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}
