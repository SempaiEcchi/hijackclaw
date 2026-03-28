import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RuntimeState } from "../shared/api";
import { connectEvents, fetchState, getLoginStatus, startLogin, startRuntime, stopRuntime } from "./apiClient";
import { AuthPanel } from "./components/AuthPanel";
import { EventsPanel, type UiEvent } from "./components/EventsPanel";
import { RuntimePanel, type RuntimeConfig } from "./components/RuntimePanel";
import { TerminalPanel } from "./components/TerminalPanel";

const defaultState: RuntimeState = {
  auth: { status: "logged_out" },
  proxy: { status: "stopped" },
  claude: { status: "stopped" },
  guardrails: { globalConfigTouched: false },
};

const defaultConfig: RuntimeConfig = {
  port: 8082,
  model: "gpt-5",
  smallFastModel: "gpt-5-mini",
  cwd: "",
  args: "",
};

function makeEvent(level: UiEvent["level"], title: string, message: string, timestamp = new Date().toISOString()): UiEvent {
  return {
    id: `${timestamp}-${Math.random().toString(36).slice(2, 10)}`,
    timestamp,
    level,
    title,
    message,
  };
}

export function App() {
  const [state, setState] = useState<RuntimeState>(defaultState);
  const [config, setConfig] = useState<RuntimeConfig>(defaultConfig);
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [bootLoading, setBootLoading] = useState(true);
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginFlowId, setLoginFlowId] = useState<string | null>(null);
  const [loginFlowStatus, setLoginFlowStatus] = useState<"idle" | "pending" | "approved" | "expired" | "error">("idle");
  const pollInFlightRef = useRef(false);

  const pushEvent = useCallback((next: UiEvent) => {
    startTransition(() => {
      setEvents((prev) => [next, ...prev].slice(0, 250));
    });
  }, []);

  const syncState = useCallback(async () => {
    const next = await fetchState();
    setState(next);
    setConfig((prev) => ({
      ...prev,
      port: next.proxy.port ?? prev.port,
      model: next.proxy.model ?? prev.model,
      smallFastModel: next.proxy.smallFastModel ?? prev.smallFastModel,
      cwd: next.claude.cwd ?? prev.cwd,
    }));
    return next;
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await syncState();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to bootstrap state";
        pushEvent(makeEvent("error", "state.bootstrap_failed", message));
      } finally {
        setBootLoading(false);
      }
    })();
  }, [pushEvent, syncState]);

  useEffect(() => {
    const disconnect = connectEvents(
      (event) => {
        setState((prev) => {
          if (event.type === "auth.status_changed") {
            return { ...prev, auth: event.data };
          }
          if (event.type === "proxy.status_changed") {
            return { ...prev, proxy: event.data };
          }
          if (event.type === "claude.status_changed") {
            return { ...prev, claude: event.data };
          }
          return prev;
        });
        if (event.type === "proxy.status_changed") {
          setConfig((prev) => ({
            ...prev,
            port: event.data.port ?? prev.port,
            model: event.data.model ?? prev.model,
            smallFastModel: event.data.smallFastModel ?? prev.smallFastModel,
          }));
        }
        if (event.type === "claude.status_changed") {
          setConfig((prev) => ({
            ...prev,
            cwd: event.data.cwd ?? prev.cwd,
          }));
        }
        if (event.type === "runtime.log") {
          pushEvent(makeEvent(event.data.level, event.type, event.data.message, event.timestamp));
        } else if (event.type === "runtime.error") {
          pushEvent(makeEvent("error", event.type, event.data.message, event.timestamp));
        } else {
          pushEvent(makeEvent("system", event.type, JSON.stringify(event.data), event.timestamp));
        }
      },
      (error) => {
        pushEvent(makeEvent("warn", "events.disconnected", error));
      },
    );

    return () => {
      disconnect();
    };
  }, [pushEvent]);

  useEffect(() => {
    if (!loginFlowId) {
      return;
    }

    let cancelled = false;
    const timer = window.setInterval(() => {
      if (cancelled || pollInFlightRef.current) {
        return;
      }
      pollInFlightRef.current = true;
      void (async () => {
        try {
          const status = await getLoginStatus(loginFlowId);
          if (cancelled) {
            return;
          }
          setLoginFlowStatus(status.status);
          if (status.status === "approved") {
            pushEvent(makeEvent("info", "auth.approved", status.email ?? "Authenticated"));
            setLoginFlowId(null);
            await syncState();
            setLoginBusy(false);
            return;
          }
          if (status.status === "expired" || status.status === "error") {
            pushEvent(makeEvent("warn", "auth.login_flow", status.error ?? status.status));
            setLoginFlowId(null);
            setLoginBusy(false);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Login status polling failed";
          pushEvent(makeEvent("warn", "auth.poll_failed", message));
        } finally {
          pollInFlightRef.current = false;
        }
      })();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [loginFlowId, pushEvent, syncState]);

  const handleLogin = useCallback(() => {
    setLoginBusy(true);
    setLoginFlowStatus("pending");
    void (async () => {
      try {
        const login = await startLogin();
        setLoginFlowId(login.flowId);
        pushEvent(makeEvent("info", "auth.login_started", `Flow ${login.flowId} created`));
        window.open(login.authorizeUrl, "_blank", "noopener,noreferrer");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to start login";
        setLoginFlowStatus("error");
        setLoginBusy(false);
        pushEvent(makeEvent("error", "auth.login_failed", message));
      }
    })();
  }, [pushEvent]);

  const handleRuntimeStart = useCallback(() => {
    setRuntimeBusy(true);
    void (async () => {
      try {
        const args = config.args
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        await startRuntime({
          port: config.port,
          model: config.model,
          smallFastModel: config.smallFastModel,
          claude: {
            cwd: config.cwd.trim() || ".",
            args,
          },
        });
        pushEvent(makeEvent("info", "runtime.started", "Runtime start requested"));
        await syncState();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Runtime start failed";
        pushEvent(makeEvent("error", "runtime.start_failed", message));
      } finally {
        setRuntimeBusy(false);
      }
    })();
  }, [config.args, config.cwd, config.model, config.port, config.smallFastModel, pushEvent, syncState]);

  const handleRuntimeStop = useCallback(() => {
    setRuntimeBusy(true);
    void (async () => {
      try {
        await stopRuntime();
        pushEvent(makeEvent("info", "runtime.stopped", "Stop all requested"));
        await syncState();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Runtime stop failed";
        pushEvent(makeEvent("error", "runtime.stop_failed", message));
      } finally {
        setRuntimeBusy(false);
      }
    })();
  }, [pushEvent, syncState]);

  const canStart = useMemo(() => {
    return state.auth.status === "logged_in" && state.proxy.status !== "running" && state.claude.status !== "running";
  }, [state.auth.status, state.claude.status, state.proxy.status]);

  const canStop = useMemo(() => {
    return state.proxy.status === "running" || state.proxy.status === "starting" || state.claude.status === "running" || state.claude.status === "starting";
  }, [state.claude.status, state.proxy.status]);

  const handleTerminalSystemEvent = useCallback(
    (title: string, message: string) => {
      pushEvent(makeEvent("system", title, message));
    },
    [pushEvent],
  );

  const authExtras = state.auth as typeof state.auth & Record<string, unknown>;
  const proxyExtras = state.proxy as typeof state.proxy & Record<string, unknown>;
  const authTransport =
    typeof authExtras.transport === "string"
      ? authExtras.transport
      : typeof authExtras.transportMode === "string"
        ? authExtras.transportMode
        : undefined;
  const authProfile =
    typeof authExtras.profile === "string"
      ? authExtras.profile
      : typeof authExtras.profileId === "string"
        ? authExtras.profileId
        : undefined;
  const authProfileStored =
    typeof authExtras.profileStored === "boolean" ? authExtras.profileStored : undefined;
  const authLastRefreshAt =
    typeof authExtras.lastRefreshAt === "string" ? authExtras.lastRefreshAt : undefined;
  const proxyTransport =
    typeof proxyExtras.upstreamTransport === "string" ? proxyExtras.upstreamTransport : undefined;

  return (
    <main className="control-room">
      <section className="hero">
        <p className="hero-kicker">HijackClaw</p>
        <h1>Claude Code on Codex Sessions</h1>
      </section>

      {bootLoading ? <p className="boot-copy">Bootstrapping local runtime state...</p> : null}

      <section className="top-grid">
        <AuthPanel
          auth={state.auth}
          loginFlowStatus={loginFlowStatus}
          loginBusy={loginBusy}
          authTransport={authTransport}
          authProfile={authProfile}
          authProfileStored={authProfileStored}
          authLastRefreshAt={authLastRefreshAt}
          onLogin={handleLogin}
        />
        <RuntimePanel
          config={config}
          busy={runtimeBusy}
          canStart={canStart}
          canStop={canStop}
          proxyTransport={proxyTransport}
          onConfigChange={(patch) => setConfig((prev) => ({ ...prev, ...patch }))}
          onStart={handleRuntimeStart}
          onStop={handleRuntimeStop}
        />
      </section>

      <TerminalPanel enabled={state.claude.status === "running"} onSystemEvent={handleTerminalSystemEvent} />

      <details className="events-fold">
        <summary className="events-fold__summary">Event Log ({events.length})</summary>
        <EventsPanel events={events} />
      </details>
    </main>
  );
}
