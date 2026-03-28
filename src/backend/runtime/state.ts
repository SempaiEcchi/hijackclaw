import { EventEmitter } from "node:events";
import type {
  AuthState,
  ClaudeState,
  ProxyState,
  RuntimeEvent,
  RuntimeLogLevel,
  RuntimeState,
} from "../../shared/api.js";
import { redactSensitiveText } from "./redaction.js";

const MAX_EVENT_HISTORY = 500;

function nowIso(): string {
  return new Date().toISOString();
}

function cloneState(state: RuntimeState): RuntimeState {
  return JSON.parse(JSON.stringify(state)) as RuntimeState;
}

export type AppState = {
  getState: () => RuntimeState;
  getEvents: () => RuntimeEvent[];
  subscribe: (listener: (event: RuntimeEvent) => void) => () => void;
  setAuth: (next: AuthState) => void;
  setProxy: (next: ProxyState) => void;
  setClaude: (next: ClaudeState) => void;
  log: (level: RuntimeLogLevel, message: string) => void;
  error: (message: string) => void;
};

class RuntimeStore {
  private readonly emitter = new EventEmitter();
  private readonly events: RuntimeEvent[] = [];
  private state: RuntimeState = {
    auth: { status: "logged_out" },
    proxy: { status: "stopped" },
    claude: { status: "stopped" },
    guardrails: { globalConfigTouched: false },
  };

  getState(): RuntimeState {
    return cloneState(this.state);
  }

  getEvents(): RuntimeEvent[] {
    return [...this.events];
  }

  subscribe(listener: (event: RuntimeEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => {
      this.emitter.off("event", listener);
    };
  }

  setAuth(next: AuthState): void {
    this.state = {
      ...this.state,
      auth: { ...next },
    };
    this.publish({
      type: "auth.status_changed",
      timestamp: nowIso(),
      data: { ...next },
    });
  }

  setProxy(next: ProxyState): void {
    this.state = {
      ...this.state,
      proxy: { ...next },
    };
    this.publish({
      type: "proxy.status_changed",
      timestamp: nowIso(),
      data: { ...next },
    });
  }

  setClaude(next: ClaudeState): void {
    this.state = {
      ...this.state,
      claude: { ...next },
    };
    this.publish({
      type: "claude.status_changed",
      timestamp: nowIso(),
      data: { ...next },
    });
  }

  log(level: RuntimeLogLevel, message: string): void {
    const sanitizedMessage = redactSensitiveText(message);
    this.publish({
      type: "runtime.log",
      timestamp: nowIso(),
      data: { level, message: sanitizedMessage },
    });
  }

  error(message: string): void {
    const sanitizedMessage = redactSensitiveText(message);
    this.publish({
      type: "runtime.error",
      timestamp: nowIso(),
      data: { message: sanitizedMessage },
    });
  }

  private publish(event: RuntimeEvent): void {
    this.events.push(event);
    if (this.events.length > MAX_EVENT_HISTORY) {
      this.events.splice(0, this.events.length - MAX_EVENT_HISTORY);
    }
    this.emitter.emit("event", event);
  }
}

export function createAppState(): AppState {
  return new RuntimeStore();
}
