export type AuthStatus = "logged_out" | "logging_in" | "logged_in" | "error";
export type RuntimeStatus = "stopped" | "starting" | "running" | "error";
export type ClaudeStatus = "stopped" | "starting" | "running" | "exited" | "error";

export type AuthState = {
  status: AuthStatus;
  email?: string;
  expiresAt?: string;
  canRefresh?: boolean;
  profileStored?: boolean;
  lastRefreshAt?: string;
  error?: string;
};

export type UpstreamTransportMode = "ws" | "sse";

export type ProxyState = {
  status: RuntimeStatus;
  port?: number;
  baseUrl?: string;
  model?: string;
  smallFastModel?: string;
  upstreamTransport?: UpstreamTransportMode;
  error?: string;
};

export type ClaudeState = {
  status: ClaudeStatus;
  pid?: number;
  cwd?: string;
  startedAt?: string;
  exitCode?: number | null;
  error?: string;
};

export type RuntimeState = {
  auth: AuthState;
  proxy: ProxyState;
  claude: ClaudeState;
  guardrails: {
    globalConfigTouched: false;
  };
};

export type RuntimeLogLevel = "info" | "warn" | "error";

export type RuntimeEvent =
  | {
      type: "auth.status_changed";
      timestamp: string;
      data: AuthState;
    }
  | {
      type: "proxy.status_changed";
      timestamp: string;
      data: ProxyState;
    }
  | {
      type: "claude.status_changed";
      timestamp: string;
      data: ClaudeState;
    }
  | {
      type: "runtime.log";
      timestamp: string;
      data: {
        level: RuntimeLogLevel;
        message: string;
      };
    }
  | {
      type: "runtime.error";
      timestamp: string;
      data: {
        message: string;
      };
    };

export type LoginStartRequest = {
  method: "browser";
};

export type LoginStartResponse = {
  flowId: string;
  authorizeUrl: string;
};

export type LoginStatusResponse = {
  status: "pending" | "approved" | "expired" | "error";
  email?: string;
  expiresAt?: string;
  error?: string;
};

export type RuntimeStartRequest = {
  port: number;
  model: string;
  smallFastModel: string;
  claude: {
    cwd: string;
    args?: string[];
  };
};

export type RuntimeStartResponse = {
  ok: true;
  proxy: {
    status: "running";
    baseUrl: string;
    port: number;
  };
  claude: {
    status: "running";
    pid: number;
  };
};

export type RuntimeStopResponse = {
  ok: true;
  proxyStopped: boolean;
  claudeStopped: boolean;
};
