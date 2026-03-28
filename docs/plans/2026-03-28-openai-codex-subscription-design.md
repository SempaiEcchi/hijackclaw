# OpenAI Codex Subscription Transport Design

## Goal

Replace the default API-billed OpenAI path with an `openai-codex` subscription transport while preserving the local operator app shape that matters:

- embedded managed Claude PTY
- localhost Anthropic-compatible proxy for Claude Code
- no shell profile edits, Claude config edits, or Sheen/OS config changes

The new default runtime path is:

1. sign in with ChatGPT/Codex-style PKCE on `127.0.0.1:1455`
2. store a refreshable app-owned auth profile
3. proxy Claude `POST /v1/messages` requests into the Codex subscription backend
4. use WebSocket first when available, then fall back to SSE/HTTPS

## Constraints

- Keep the Claude-facing surface at `POST /v1/messages`
- Stop routing through `https://api.openai.com/v1/chat/completions`
- Preserve transient runtime-only `ANTHROPIC_*` injection into the managed Claude process
- Simplify the UI if it reduces implementation risk
- Make transport lifecycle explicit so runtime stop tears down both local proxy state and any upstream connection state

## Approaches

### 1. Reuse Codex CLI as the upstream engine

Run the official `codex` CLI or app-server behind this app and treat it as the subscription transport.

Pros:
- less reverse engineering
- highest chance of matching upstream behavior

Cons:
- hides the transport contract behind another program
- weakens local control over request shaping and fallback behavior
- does not satisfy the requested “new openai-codex subscription transport layer” cleanly

### 2. Native subscription transport in this app

Implement app-owned auth/profile handling and an upstream transport abstraction that targets the Codex subscription backend directly.

Pros:
- clear control over auth/profile storage, request translation, and WS/SSE fallback
- preserves the current local runtime architecture
- simplest long-term backend boundary

Cons:
- more code than delegating to the official CLI
- carries compatibility risk if upstream protocol details change

Recommended.

### 3. Browser-session piggyback

Drive a visible browser session and tunnel requests through that session.

Pros:
- no token persistence layer

Cons:
- user already rejected it
- not how OpenClaw documents `openai-codex`
- more brittle than PKCE + refresh tokens

Rejected.

## Chosen Design

### Auth and profile model

Keep the existing PKCE primitives and callback listener, but shift token persistence from in-memory-only storage to an app-owned auth profile file that mirrors the useful parts of Codex auth state:

- `auth_mode: "chatgpt"`
- `tokens.access_token`
- `tokens.refresh_token`
- `tokens.id_token`
- `tokens.account_id` when present
- `last_refresh`

The app will not write to `~/.codex/auth.json`. It will keep its own profile file and treat it as runtime state owned by this app.

On startup:

- load the stored profile if present
- hydrate auth state optimistically
- refresh tokens before runtime start when needed

On login/refresh:

- update the stored profile atomically
- keep the UI state in sync with refreshability and expiry

### Upstream transport boundary

Introduce a transport-neutral backend contract that is independent of chat completions:

- `UpstreamRequest`
- `UpstreamResponse`
- `UpstreamStreamEvent`
- `UpstreamTransport`

`UpstreamTransport` exposes:

- `createMessage(request)`
- `streamMessage(request)`
- `close()`
- lightweight mode reporting for `ws` or `sse`

The concrete implementation is `OpenAICodexTransport`, which composes:

- `OpenAICodexWsTransport`
- `OpenAICodexSseTransport`

Behavior:

- try WS first for streaming and non-streaming request execution
- if connection establishment or stream processing fails with a transport-level error, fall back to SSE
- remember the effective mode in app state for diagnostics

### Request and response translation

The local Claude-facing API remains Anthropic-compatible:

- `GET /v1/models`
- `POST /v1/messages`

Internally:

- `claude-to-upstream.ts` converts Claude message content into the minimum supported Codex input format
- `upstream-to-claude.ts` converts completed upstream responses into Claude message JSON
- `upstream-stream-to-claude-sse.ts` converts upstream stream events into Anthropic-style SSE

MVP scope stays intentionally narrow:

- text in, text out
- no tool calling
- no image/audio blocks
- explicit validation errors for unsupported content

Because Claude Code sends full conversation history on each request, the MVP can remain stateless at the upstream layer and does not need persistent upstream conversation ids.

### Runtime integration

The managed Claude PTY and localhost proxy stay intact.

`main.ts` will wire:

- auth service
- persistent auth profile store
- openai-codex auth adapter
- openai-codex transport
- proxy controller
- runtime manager

`runtime-manager.ts` remains responsible for:

- starting the proxy
- launching Claude with temporary `ANTHROPIC_*` overrides
- stopping Claude and the proxy together

The only runtime addition is explicit upstream transport disposal during shutdown/rollback.

### UI simplification

Keep:

- auth card
- runtime controls
- event log
- embedded terminal

Remove or fold in:

- `SessionPanel`
- verbose login flow mechanics

The auth card should show operator-relevant state:

- subscription session status
- email/account
- expiry / refreshable
- last transport mode when available

The runtime card should keep:

- cwd
- args
- port

Model fields can stay but do not need to dominate the UI.

## Error handling

- OAuth callback errors move auth state to `error`
- expired non-refreshable profiles force logout
- WS handshake/stream errors emit a log event and trigger SSE fallback
- upstream non-success responses become Claude-compatible proxy errors
- unsupported Claude input content fails before any upstream request is sent

## Testing strategy

- unit tests for auth profile load/save/hydration
- unit tests for auth refresh persistence
- unit tests for Claude-to-upstream and upstream-to-Claude translation
- transport tests with mocked WS and SSE upstreams
- proxy route tests for streaming and non-streaming behavior against the new transport interface
- runtime smoke checks to confirm the managed Claude process still only sees transient `ANTHROPIC_*` overrides

## Open risks

- the exact subscription backend protocol is less stable than the official API path
- WebSocket transport may need upstream-specific framing adjustments beyond the initial MVP
- OAuth UX may still inherit wording from OpenAI’s own consent screen even when the downstream transport uses ChatGPT/Codex subscription routing
