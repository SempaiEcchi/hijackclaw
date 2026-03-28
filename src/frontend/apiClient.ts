import type {
  LoginStartResponse,
  LoginStatusResponse,
  RuntimeEvent,
  RuntimeStartRequest,
  RuntimeStartResponse,
  RuntimeState,
  RuntimeStopResponse,
} from "../shared/api";

async function parseJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    let message = `${fallbackMessage}: ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      message = body.error ?? body.message ?? message;
    } catch {
      // noop: keep default message
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function fetchState(): Promise<RuntimeState> {
  const response = await fetch("/api/state");
  return parseJsonResponse<RuntimeState>(response, "Failed to load runtime state");
}

export async function startLogin(): Promise<LoginStartResponse> {
  const response = await fetch("/api/auth/login/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method: "browser" }),
  });
  return parseJsonResponse<LoginStartResponse>(response, "Failed to start login flow");
}

export async function getLoginStatus(flowId: string): Promise<LoginStatusResponse> {
  const response = await fetch(`/api/auth/login/status?flowId=${encodeURIComponent(flowId)}`);
  return parseJsonResponse<LoginStatusResponse>(response, "Failed to fetch login status");
}

export async function startRuntime(payload: RuntimeStartRequest): Promise<RuntimeStartResponse> {
  const response = await fetch("/api/runtime/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse<RuntimeStartResponse>(response, "Failed to start runtime");
}

export async function stopRuntime(): Promise<RuntimeStopResponse> {
  const response = await fetch("/api/runtime/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return parseJsonResponse<RuntimeStopResponse>(response, "Failed to stop runtime");
}

function safeParseEvent(data: string): unknown {
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return undefined;
  }
}

export function connectEvents(onEvent: (event: RuntimeEvent) => void, onError: (error: string) => void): () => void {
  const eventSource = new EventSource("/api/events");

  const handleData = (rawData: string) => {
    const parsed = safeParseEvent(rawData);
    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
      return;
    }
    onEvent(parsed as RuntimeEvent);
  };

  const handleMessage = (event: MessageEvent<string>) => {
    handleData(event.data);
  };

  eventSource.onmessage = handleMessage;
  eventSource.onerror = () => {
    onError("Live event stream disconnected");
  };

  const eventTypes = [
    "auth.status_changed",
    "proxy.status_changed",
    "claude.status_changed",
    "runtime.log",
    "runtime.error",
  ] as const;

  for (const eventType of eventTypes) {
    eventSource.addEventListener(eventType, (event) => {
      const typedEvent = event as MessageEvent<string>;
      handleData(typedEvent.data);
    });
  }

  return () => {
    eventSource.close();
  };
}
