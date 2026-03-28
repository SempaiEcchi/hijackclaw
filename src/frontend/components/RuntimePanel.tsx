type RuntimeConfig = {
  port: number;
  model: string;
  smallFastModel: string;
  cwd: string;
  args: string;
};

type RuntimePanelProps = {
  config: RuntimeConfig;
  busy: boolean;
  canStart: boolean;
  canStop: boolean;
  proxyTransport?: string;
  onConfigChange: (patch: Partial<RuntimeConfig>) => void;
  onStart: () => void;
  onStop: () => void;
};

export function RuntimePanel({ config, busy, canStart, canStop, proxyTransport, onConfigChange, onStart, onStop }: RuntimePanelProps) {
  return (
    <section className="console-card runtime-panel">
      <header className="console-card__header">
        <p className="card-kicker">Runtime Command</p>
        <h2>Claude Session</h2>
      </header>

      <div className="form-grid">
        <label>
          Proxy port
          <input
            className="field-input"
            type="number"
            min={1}
            max={65535}
            value={config.port}
            onChange={(event) => onConfigChange({ port: Number(event.target.value) || 8082 })}
          />
        </label>
        <label>
          Claude cwd
          <input
            className="field-input"
            type="text"
            value={config.cwd}
            onChange={(event) => onConfigChange({ cwd: event.target.value })}
          />
        </label>
      </div>

      <label className="stack-xs">
        Claude args (space-separated)
        <input className="field-input" type="text" value={config.args} onChange={(event) => onConfigChange({ args: event.target.value })} />
      </label>

      {proxyTransport ? (
        <div className="detail-chip runtime-telemetry">
          <span className="muted-label">Upstream transport</span>
          <span className="mono-line">{proxyTransport}</span>
        </div>
      ) : null}

      <details className="advanced-settings">
        <summary>Advanced models</summary>
        <div className="form-grid form-grid--advanced">
          <label>
            Primary model
            <input
              className="field-input"
              type="text"
              value={config.model}
              onChange={(event) => onConfigChange({ model: event.target.value })}
            />
          </label>
          <label>
            Small/fast model
            <input
              className="field-input"
              type="text"
              value={config.smallFastModel}
              onChange={(event) => onConfigChange({ smallFastModel: event.target.value })}
            />
          </label>
        </div>
      </details>

      <div className="button-row">
        <button className="primary-button" type="button" onClick={onStart} disabled={!canStart || busy}>
          {busy ? "Starting..." : "Start Runtime"}
        </button>
        <button className="ghost-button" type="button" onClick={onStop} disabled={!canStop || busy}>
          Stop All
        </button>
      </div>

      <p className="muted-copy">
        Injects ANTHROPIC_* env vars into the managed Claude process only.
      </p>
    </section>
  );
}

export type { RuntimeConfig };
