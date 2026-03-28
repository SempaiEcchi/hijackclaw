# OpenAI Auth Proxy MVP Design

## Goal

Build a local app that lets a user run Claude Code against OpenAI models using OpenAI OAuth, without changing OS settings, shell profiles, Claude config, or Sheen user configuration. The behavior change must exist only while the app is running.

## Approved Direction

### Runtime Model

- The app is a local TypeScript application with:
  - a backend process that owns OAuth, the Anthropic-compatible proxy, the embedded terminal PTY, and the managed `claude` child process
  - a frontend operator console for login, runtime control, and session visibility
- The backend launches `claude` as a managed child process with an ephemeral `ANTHROPIC_*` environment overlay injected into that child only.
- The backend binds control and proxy surfaces to `127.0.0.1` only.
- `Stop All` kills the managed Claude process, closes the PTY, and stops the proxy.
- No shell profile edits, config-file edits, or global environment changes are allowed.

### Control Plane and Data Plane

The backend exposes two distinct surfaces:

- Control plane for the frontend UI:
  - `GET /api/state`
  - `POST /api/auth/login/start`
  - `GET /api/auth/login/status`
  - `POST /api/runtime/start`
  - `POST /api/runtime/stop`
  - `GET /api/events`
- Data plane for Claude Code:
  - `POST /v1/messages`
  - `GET /v1/models`
  - `GET /health`

The frontend may call only `/api/*`. The managed Claude process may call only `/v1/*`.

### Auth and Storage

- MVP uses browser-based OAuth PKCE first.
- The backend is the only component allowed to touch tokens.
- Frontend state contains only redacted session metadata such as email, expiry, and auth status.
- Tokens are stored in an app-owned location with restricted permissions, never in Sheen config or Claude config.
- Logs must redact bearer tokens, auth headers, callback codes, and other credential material.

### Lifecycle Rules

- `runtime/start` is all-or-nothing:
  - start the proxy
  - open the embedded PTY
  - launch `claude`
  - if any step fails, roll back the already-started pieces
- MVP supports exactly one managed Claude session.
- Shutdown must be explicit and complete:
  - stop Claude
  - close PTY
  - stop proxy
  - release listeners and ports

## Translation Scope

### First Vertical Slice

Implement the smallest real path first:

1. User logs in with OpenAI OAuth
2. User starts the runtime
3. Backend launches managed `claude`
4. Claude sends `POST /v1/messages`
5. Backend translates a text-only Anthropic request to OpenAI
6. Backend streams the response back as Claude-compatible SSE
7. User stops the runtime and the effect disappears entirely

### Second Slice

After the text-only streaming path is stable in a real Claude session, add:

- tool definitions
- tool calls
- tool results

Unsupported Anthropic features must fail explicitly instead of being silently degraded.

## Testing and QA

### Required Automated Coverage

- unit tests for pure request/response translation
- unit tests for token expiry and refresh behavior
- integration tests for `/v1/messages` using a mocked OpenAI upstream
- integration tests for SSE event conversion
- integration tests for runtime lifecycle rollback and shutdown behavior

### Required Manual Proof

- verify login flow reaches authenticated state
- verify runtime start launches the managed Claude PTY session
- verify runtime stop tears down Claude and the proxy
- verify no shell profiles, Claude config, or Sheen user config were modified

## Initial Technical Shape

- TypeScript for backend and frontend
- Node backend with localhost HTTP APIs and WebSocket support for terminal streaming
- React frontend with an embedded terminal surface
- Shared API types between backend and frontend
- Pure translator modules isolated from server wiring for testability

## Risks and Guardrails

### Primary Risks

- OpenAI OAuth plus the chosen upstream endpoint may not perfectly match expected Claude Code behavior
- Claude SSE semantics are stricter than a naive OpenAI passthrough
- tool-calling translation is the highest-risk mapping area
- token leakage through logs or UI debug surfaces

### Guardrails

- backend-only token ownership
- redacted logging by default
- localhost-only binding
- single-session MVP
- explicit rejection for unsupported request shapes
- kill-switch shutdown that stops both the proxy and managed Claude session

