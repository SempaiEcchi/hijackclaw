import type { IPty } from "node-pty";
import pty from "node-pty";

export type ClaudeLaunchConfig = {
  cwd: string;
  args: string[];
  env: NodeJS.ProcessEnv;
};

export type ClaudeExitPayload = {
  exitCode: number | null;
};

export interface ManagedClaudeSession {
  readonly pid: number;
  stop(): Promise<void>;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  onData(listener: (chunk: string) => void): () => void;
  onExit(listener: (payload: ClaudeExitPayload) => void): () => void;
}

export interface ClaudeSessionController {
  start(config: ClaudeLaunchConfig): Promise<ManagedClaudeSession>;
}

export interface PtyLike {
  readonly pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(listener: (data: string) => void): { dispose(): void };
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): {
    dispose(): void;
  };
}

export interface PtyAdapter {
  spawn(file: string, args: string[], options: pty.IPtyForkOptions): PtyLike;
}

export class NodePtyAdapter implements PtyAdapter {
  spawn(file: string, args: string[], options: pty.IPtyForkOptions): PtyLike {
    return pty.spawn(file, args, options) as unknown as IPty;
  }
}

class ClaudePtySession implements ManagedClaudeSession {
  constructor(private readonly process: PtyLike) {}

  get pid(): number {
    return this.process.pid;
  }

  async stop(): Promise<void> {
    this.process.kill("SIGTERM");
  }

  write(data: string): void {
    this.process.write(data);
  }

  resize(cols: number, rows: number): void {
    this.process.resize(cols, rows);
  }

  onData(listener: (chunk: string) => void): () => void {
    const disposable = this.process.onData(listener);
    return () => disposable.dispose();
  }

  onExit(listener: (payload: ClaudeExitPayload) => void): () => void {
    const disposable = this.process.onExit((event) => {
      listener({ exitCode: Number.isNaN(event.exitCode) ? null : event.exitCode });
    });
    return () => disposable.dispose();
  }
}

export class ClaudePtyController implements ClaudeSessionController {
  constructor(private readonly adapter: PtyAdapter = new NodePtyAdapter()) {}

  async start(config: ClaudeLaunchConfig): Promise<ManagedClaudeSession> {
    const child = this.adapter.spawn("claude", config.args, {
      name: "xterm-color",
      cwd: config.cwd,
      env: config.env,
      cols: 100,
      rows: 30,
    });
    return new ClaudePtySession(child);
  }
}
