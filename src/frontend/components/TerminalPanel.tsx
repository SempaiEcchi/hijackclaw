import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { StatusPill } from "./StatusPill";

type TerminalPanelProps = {
  enabled: boolean;
  onSystemEvent: (title: string, message: string) => void;
};

function resolveTerminalWebSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/terminal`;
}

function decodePayload(data: unknown): Promise<string> {
  if (typeof data === "string") {
    return Promise.resolve(data);
  }
  if (data instanceof Blob) {
    return data.text();
  }
  if (data instanceof ArrayBuffer) {
    return Promise.resolve(new TextDecoder().decode(data));
  }
  return Promise.resolve("");
}

export function TerminalPanel({ enabled, onSystemEvent }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const unmountedRef = useRef(false);
  const enabledRef = useRef(enabled);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "closed">("idle");
  const socketUrl = useMemo(() => resolveTerminalWebSocketUrl(), []);
  enabledRef.current = enabled;

  useEffect(() => {
    unmountedRef.current = false;
    if (!containerRef.current || terminalRef.current) {
      return () => {
        unmountedRef.current = true;
      };
    }

    const terminal = new Terminal({
      fontFamily: "\"IBM Plex Mono\", \"SFMono-Regular\", Menlo, monospace",
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      convertEol: true,
      theme: {
        background: "#06070d",
        foreground: "#e4edff",
        cursor: "#f37f57",
        selectionBackground: "rgba(72, 130, 255, 0.35)",
        black: "#070a14",
        red: "#ff5a66",
        green: "#5cf2ad",
        yellow: "#f4c95b",
        blue: "#6da6ff",
        magenta: "#ca88ff",
        cyan: "#46d3ff",
        white: "#d5def4",
        brightBlack: "#4f5f86",
        brightRed: "#ff8c97",
        brightGreen: "#88ffd0",
        brightYellow: "#ffe28e",
        brightBlue: "#9ec2ff",
        brightMagenta: "#e4bcff",
        brightCyan: "#8be7ff",
        brightWhite: "#f3f7ff",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();
    terminal.write("\u001b[38;5;81moperator terminal ready\u001b[0m\r\n");

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        // fit can fail during hidden layout transitions
      }
    });
    observer.observe(containerRef.current);

    return () => {
      unmountedRef.current = true;
      observer.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!terminalRef.current) {
      return;
    }

    const clearTimer = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const closeSocket = () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };

    if (!enabled) {
      clearTimer();
      closeSocket();
      setStatus("idle");
      return;
    }

    const terminal = terminalRef.current;
    const connect = () => {
      clearTimer();
      setStatus("connecting");
      const socket = new WebSocket(socketUrl);
      socketRef.current = socket;

      const disposable = terminal.onData((chunk) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(chunk);
        }
      });

      socket.onopen = () => {
        setStatus("connected");
        onSystemEvent("terminal.connected", "Terminal websocket connected");
      };

      socket.onmessage = (event) => {
        void decodePayload(event.data).then((payload) => {
          if (!payload || !terminalRef.current) {
            return;
          }
          try {
            const parsed = JSON.parse(payload) as { data?: string; type?: string; message?: string };
            if (parsed.type === "error") {
              terminalRef.current.write(`\r\n\u001b[31m${parsed.message ?? "terminal error"}\u001b[0m\r\n`);
              return;
            }
            if (typeof parsed.data === "string") {
              terminalRef.current.write(parsed.data);
              return;
            }
          } catch {
            // plaintext passthrough
          }
          terminalRef.current.write(payload);
        });
      };

      socket.onclose = () => {
        disposable.dispose();
        setStatus("closed");
        if (!unmountedRef.current && enabledRef.current) {
          reconnectTimerRef.current = window.setTimeout(() => {
            connect();
          }, 1500);
        }
      };

      socket.onerror = () => {
        onSystemEvent("terminal.error", "Terminal websocket error");
      };
    };

    connect();

    return () => {
      clearTimer();
      closeSocket();
    };
  }, [enabled, onSystemEvent, socketUrl]);

  return (
    <section className="console-card terminal-panel">
      <header className="console-card__header">
        <p className="card-kicker">Managed PTY</p>
        <h2>Embedded Claude Terminal</h2>
        <StatusPill
          label={status}
          tone={status === "connected" ? "active" : status === "connecting" ? "warning" : status === "closed" ? "danger" : "neutral"}
        />
      </header>
      <div className="terminal-frame">
        <div ref={containerRef} className="terminal-canvas" />
      </div>
    </section>
  );
}
