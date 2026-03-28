import type {
  AuthState,
  LoginStartRequest,
  LoginStartResponse,
  LoginStatusResponse,
} from "../../shared/api.js";
import { createPkcePair, generateRandomState } from "./pkce.js";
import { isTokenExpired, type TokenStore } from "./token-store.js";
import { OAuthClient, parseJwtClaims } from "./oauth.js";
import type { AppState } from "../runtime/state.js";

export interface BrowserOpener {
  open(url: string): Promise<void>;
}

type LoginFlow = {
  flowId: string;
  state: string;
  codeVerifier: string;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "approved" | "expired" | "error";
  email?: string;
  error?: string;
};

function resolveAccountId(claims: Record<string, unknown>): string | undefined {
  const direct =
    typeof claims.chatgpt_account_id === "string"
      ? claims.chatgpt_account_id
      : typeof claims.account_id === "string"
        ? claims.account_id
        : undefined;
  return direct;
}

function isPersistentStore(store: TokenStore): boolean {
  return store.isPersistent?.() ?? false;
}

export type AuthServiceDeps = {
  appState: AppState;
  oauthClient: OAuthClient;
  tokenStore: TokenStore;
  browserOpener?: BrowserOpener;
  now?: () => Date;
  createFlowId?: () => string;
  flowTimeoutMs?: number;
};

const DEFAULT_FLOW_TIMEOUT_MS = 10 * 60 * 1000;

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export class AuthService {
  private readonly flows = new Map<string, LoginFlow>();
  private readonly now: () => Date;
  private readonly createFlowId: () => string;
  private readonly flowTimeoutMs: number;

  constructor(private readonly deps: AuthServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.createFlowId = deps.createFlowId ?? (() => randomId("flow"));
    this.flowTimeoutMs = deps.flowTimeoutMs ?? DEFAULT_FLOW_TIMEOUT_MS;
    this.hydrateFromStore();
  }

  getState(): AuthState {
    return this.deps.appState.getState().auth;
  }

  isAuthenticated(): boolean {
    return this.getState().status === "logged_in";
  }

  async startLogin(request: LoginStartRequest): Promise<LoginStartResponse> {
    if (request.method !== "browser") {
      throw new Error(`Unsupported login method: ${request.method}`);
    }

    const pkce = createPkcePair();
    const flowId = this.createFlowId();
    const state = `${flowId}.${generateRandomState(16)}`;
    const now = this.now();
    const expiresAt = new Date(now.getTime() + this.flowTimeoutMs);
    const authorizeUrl = this.deps.oauthClient.createAuthorizeUrl({
      state,
      codeChallenge: pkce.challenge,
    });

    this.flows.set(flowId, {
      flowId,
      state,
      codeVerifier: pkce.verifier,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: "pending",
    });
    this.deps.appState.setAuth({ status: "logging_in" });

    if (this.deps.browserOpener) {
      await this.deps.browserOpener.open(authorizeUrl);
    }

    return {
      flowId,
      authorizeUrl,
    };
  }

  getLoginStatus(flowId: string): LoginStatusResponse {
    const flow = this.flows.get(flowId);
    if (!flow) {
      return { status: "error", error: "Unknown flowId" };
    }

    if (this.isExpired(flow)) {
      flow.status = "expired";
      this.deps.appState.setAuth({
        status: "error",
        error: "Login flow expired",
      });
      return {
        status: "expired",
        expiresAt: flow.expiresAt,
      };
    }

    return {
      status: flow.status,
      email: flow.email,
      expiresAt: flow.expiresAt,
      error: flow.error,
    };
  }

  async completeLogin(input: { state: string; code: string }): Promise<void> {
    const flow = this.findFlowByState(input.state);
    if (!flow) {
      throw new Error("Unknown OAuth state");
    }
    if (this.isExpired(flow)) {
      flow.status = "expired";
      throw new Error("Login flow expired");
    }

    const tokenResponse = await this.deps.oauthClient.exchangeAuthorizationCode({
      code: input.code,
      codeVerifier: flow.codeVerifier,
    });
    const expiresAt = new Date(
      this.now().getTime() + tokenResponse.expires_in * 1000,
    ).toISOString();
    const claims = tokenResponse.id_token
      ? parseJwtClaims(tokenResponse.id_token)
      : {};
    const email =
      typeof claims.email === "string"
        ? claims.email
        : flow.email;
    const lastRefreshAt = this.now().toISOString();
    const profileStored = isPersistentStore(this.deps.tokenStore);

    this.deps.tokenStore.set({
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      idToken: tokenResponse.id_token,
      expiresAt,
      email,
      accountId: tokenResponse.account_id ?? resolveAccountId(claims),
      lastRefreshAt,
      profileStored,
    });

    flow.status = "approved";
    flow.email = email;
    this.deps.appState.setAuth({
      status: "logged_in",
      email,
      expiresAt,
      canRefresh: Boolean(tokenResponse.refresh_token),
      profileStored,
      lastRefreshAt,
    });
  }

  failLogin(input: { state?: string; message: string }): void {
    if (input.state) {
      const flow = this.findFlowByState(input.state);
      if (flow) {
        flow.status = "error";
        flow.error = input.message;
      }
    }

    this.deps.appState.setAuth({
      status: "error",
      error: input.message,
    });
  }

  async getAccessToken(): Promise<string> {
    const current = this.deps.tokenStore.get();
    if (!current) {
      throw new Error("Not authenticated");
    }

    if (!isTokenExpired(current, this.now())) {
      return current.accessToken;
    }

    if (!current.refreshToken) {
      this.logout("Session expired");
      throw new Error("Session expired and cannot refresh");
    }

    const refreshed = await this.deps.oauthClient.refreshAccessToken(
      current.refreshToken,
    );
    const expiresAt = new Date(
      this.now().getTime() + refreshed.expires_in * 1000,
    ).toISOString();
    const claims = refreshed.id_token ? parseJwtClaims(refreshed.id_token) : {};
    const email =
      typeof claims.email === "string" ? claims.email : current.email;
    const lastRefreshAt = this.now().toISOString();
    const profileStored = isPersistentStore(this.deps.tokenStore);
    this.deps.tokenStore.set({
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? current.refreshToken,
      idToken: refreshed.id_token ?? current.idToken,
      expiresAt,
      email,
      accountId: refreshed.account_id ?? resolveAccountId(claims) ?? current.accountId,
      lastRefreshAt,
      profileStored,
    });

    this.deps.appState.setAuth({
      status: "logged_in",
      email,
      expiresAt,
      canRefresh: true,
      profileStored,
      lastRefreshAt,
    });
    return refreshed.access_token;
  }

  logout(errorMessage?: string): void {
    this.deps.tokenStore.clear();
    this.deps.appState.setAuth(
      errorMessage
        ? { status: "error", error: errorMessage }
        : { status: "logged_out" },
    );
  }

  private findFlowByState(state: string): LoginFlow | undefined {
    for (const flow of this.flows.values()) {
      if (flow.state === state) {
        return flow;
      }
    }
    return undefined;
  }

  private isExpired(flow: LoginFlow): boolean {
    return Date.parse(flow.expiresAt) <= this.now().getTime();
  }

  private hydrateFromStore(): void {
    const current = this.deps.tokenStore.get();
    if (!current) {
      return;
    }

    this.deps.appState.setAuth({
      status: "logged_in",
      email: current.email,
      expiresAt: current.expiresAt,
      canRefresh: Boolean(current.refreshToken),
      profileStored: current.profileStored ?? isPersistentStore(this.deps.tokenStore),
      lastRefreshAt: current.lastRefreshAt,
    });
  }
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  return new AuthService(deps);
}
