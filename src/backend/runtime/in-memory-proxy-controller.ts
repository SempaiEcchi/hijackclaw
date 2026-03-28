import type { ProxyController, ProxyRuntimeConfig } from "./runtime-manager.js";

export class InMemoryProxyController implements ProxyController {
  private running = false;
  private config: ProxyRuntimeConfig | null = null;

  async start(config: ProxyRuntimeConfig): Promise<void> {
    if (this.running) {
      throw new Error("Proxy is already running");
    }
    this.running = true;
    this.config = { ...config };
  }

  async stop(): Promise<void> {
    this.running = false;
    this.config = null;
  }

  getConfig(): ProxyRuntimeConfig | null {
    return this.config ? { ...this.config } : null;
  }
}
