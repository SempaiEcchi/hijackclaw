import type { AuthState } from "../../shared/api";
import { StatusPill } from "./StatusPill";

type AuthPanelProps = {
  auth: AuthState;
  loginFlowStatus: "idle" | "pending" | "approved" | "expired" | "error";
  loginBusy: boolean;
  authTransport?: string;
  authProfile?: string;
  authProfileStored?: boolean;
  authLastRefreshAt?: string;
  onLogin: () => void;
};

function authTone(status: AuthState["status"]): "neutral" | "active" | "warning" | "danger" {
  if (status === "logged_in") {
    return "active";
  }
  if (status === "logging_in") {
    return "warning";
  }
  if (status === "error") {
    return "danger";
  }
  return "neutral";
}

function prettyDate(value?: string): string {
  if (!value) {
    return "n/a";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function AuthPanel({
  auth,
  loginFlowStatus,
  loginBusy,
  authTransport,
  authProfile,
  authProfileStored,
  authLastRefreshAt,
  onLogin,
}: AuthPanelProps) {
  return (
    <section className="console-card auth-panel">
      <header className="console-card__header">
        <p className="card-kicker">Subscription Session</p>
        <h2>ChatGPT / Codex Login</h2>
      </header>

      <div className="stack-sm">
        <div className="row-between">
          <span className="muted-label">Session</span>
          <StatusPill label={auth.status} tone={authTone(auth.status)} />
        </div>
        <p className="mono-line">{auth.email ?? "No authenticated account"}</p>
        <p className="muted-copy">Expires: {prettyDate(auth.expiresAt)}</p>
      </div>

      <div className="stack-sm">
        <div className="row-between">
          <span className="muted-label">Login</span>
          <StatusPill
            label={loginFlowStatus === "idle" ? "ready" : loginFlowStatus}
            tone={
              loginFlowStatus === "approved"
                ? "active"
                : loginFlowStatus === "error" || loginFlowStatus === "expired"
                  ? "danger"
                : loginFlowStatus === "pending"
                  ? "warning"
                  : "neutral"
            }
          />
        </div>
        {(authTransport || authProfile || auth.canRefresh || typeof authProfileStored === "boolean" || authLastRefreshAt) && (
          <div className="detail-list">
            {authTransport ? (
              <div className="detail-chip">
                <span className="muted-label">Transport</span>
                <span className="mono-line">{authTransport}</span>
              </div>
            ) : null}
            {authProfile ? (
              <div className="detail-chip">
                <span className="muted-label">Profile</span>
                <span className="mono-line">{authProfile}</span>
              </div>
            ) : null}
            {auth.canRefresh ? (
              <div className="detail-chip">
                <span className="muted-label">Refreshable</span>
                <span className="mono-line">yes</span>
              </div>
            ) : null}
            {typeof authProfileStored === "boolean" ? (
              <div className="detail-chip">
                <span className="muted-label">Profile stored</span>
                <span className="mono-line">{authProfileStored ? "yes" : "no"}</span>
              </div>
            ) : null}
            {authLastRefreshAt ? (
              <div className="detail-chip">
                <span className="muted-label">Last refresh</span>
                <span className="mono-line">{prettyDate(authLastRefreshAt)}</span>
              </div>
            ) : null}
          </div>
        )}
        {auth.error ? <p className="error-copy">{auth.error}</p> : null}
      </div>

      <button className="primary-button" type="button" onClick={onLogin} disabled={loginBusy || auth.status === "logging_in"}>
        {loginBusy ? "Signing in..." : auth.status === "logged_in" ? "Re-authenticate" : "Sign in with ChatGPT"}
      </button>
    </section>
  );
}
