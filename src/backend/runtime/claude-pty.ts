import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

function resolveClaudeBinary(env: NodeJS.ProcessEnv): string {
  // node-pty uses posix_spawnp which only searches the child env's PATH.
  // When the backend is launched by tsx/npm, PATH may not include dirs
  // added by the user's shell profile (e.g. ~/.local/bin).  Resolve the
  // absolute path using the user's login shell so the spawn always works.
  const candidates = [
    () => {
      const resolved = execFileSync("/bin/sh", ["-lc", "which claude"], {
        encoding: "utf8",
        env,
        timeout: 3000,
      }).trim();
      return resolved || null;
    },
    () => {
      const home = env.HOME ?? os.homedir();
      const localBin = path.join(home, ".local", "bin", "claude");
      return fs.existsSync(localBin) ? localBin : null;
    },
  ];

  for (const resolve of candidates) {
    try {
      const result = resolve();
      if (result) {
        console.info(`[ClaudePty] Resolved claude binary: ${result}`);
        return result;
      }
    } catch (error) {
      console.warn(`[ClaudePty] Resolve attempt failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  console.warn("[ClaudePty] Could not resolve claude binary, falling back to bare 'claude'");
  return "claude";
}

export class ClaudePtyController implements ClaudeSessionController {
  constructor(private readonly adapter: PtyAdapter = new NodePtyAdapter()) {}

  async start(config: ClaudeLaunchConfig): Promise<ManagedClaudeSession> {
    const claudePath = resolveClaudeBinary(config.env);
    console.info(`[ClaudePty] Spawning ${claudePath} in ${config.cwd} with args: [${config.args.join(", ")}]`);
    const child = this.adapter.spawn(claudePath, config.args, {
      name: "xterm-color",
      cwd: config.cwd,
      env: config.env,
      cols: 100,
      rows: 30,
    });
    console.info(`[ClaudePty] Spawned pid=${child.pid}`);
    return new ClaudePtySession(child);
  }
}
