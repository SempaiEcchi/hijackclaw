# OpenAI Auth Proxy MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local app that authenticates with OpenAI, runs a localhost Anthropic-compatible proxy, and launches Claude Code inside an embedded terminal with transient `ANTHROPIC_*` overrides only for that managed session.

**Architecture:** Use a TypeScript Node backend for OAuth, runtime orchestration, proxying, SSE translation, and PTY management. Serve a React frontend that acts as a local operator console and renders the managed Claude terminal over WebSocket.

**Tech Stack:** TypeScript, Node.js, Express, React, Vite, WebSocket, node-pty, Vitest, Supertest

---

### Task 1: Scaffold The Shared App

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/shared/api.ts`
- Create: `src/frontend/main.tsx`
- Create: `src/frontend/App.tsx`
- Create: `src/frontend/styles.css`
- Create: `src/backend/main.ts`

**Step 1: Write the minimal package and config files**

Create scripts for `dev`, `build`, `test`, and `start`, plus TypeScript and Vite config that can build both the backend and frontend.

**Step 2: Add the shared API types**

Define the frontend/backend contract in `src/shared/api.ts`:

```ts
export type RuntimeState = {
  auth: { status: "logged_out" | "logging_in" | "logged_in" | "error"; email?: string; expiresAt?: string };
  proxy: { status: "stopped" | "starting" | "running" | "error"; port?: number; baseUrl?: string; model?: string; smallFastModel?: string };
  claude: { status: "stopped" | "starting" | "running" | "exited" | "error"; pid?: number; cwd?: string; startedAt?: string; exitCode?: number | null };
  guardrails: { globalConfigTouched: false };
};
```

**Step 3: Create the initial app shell**

Render a frontend shell with status panels and placeholder controls bound to `GET /api/state`.

**Step 4: Verify the build boots**

Run: `npm run build`
Expected: frontend and backend build successfully

### Task 2: Implement Auth And Control Plane

**Files:**
- Create: `src/backend/auth/pkce.ts`
- Create: `src/backend/auth/oauth.ts`
- Create: `src/backend/auth/token-store.ts`
- Create: `src/backend/runtime/state.ts`
- Create: `src/backend/runtime/runtime-manager.ts`
- Create: `src/backend/server/control-routes.ts`
- Modify: `src/backend/main.ts`
- Test: `src/backend/auth/oauth.test.ts`

**Step 1: Write failing tests for PKCE and token lifecycle**

Create tests that assert verifier/challenge generation, auth URL shape, token persistence shape, and expiry checks.

**Step 2: Implement browser OAuth PKCE**

Add backend-only login endpoints:

```ts
app.post("/api/auth/login/start", startLoginHandler);
app.get("/api/auth/login/status", getLoginStatusHandler);
app.get("/api/state", getStateHandler);
```

**Step 3: Implement runtime state and event broadcasting**

Create a single in-memory state object plus an event bus for auth, proxy, Claude, and log events.

**Step 4: Verify auth tests pass**

Run: `npm run test -- oauth`
Expected: PKCE and token lifecycle tests pass

### Task 3: Implement Proxy And Translation

**Files:**
- Create: `src/backend/openai/client.ts`
- Create: `src/backend/proxy/claude-to-openai.ts`
- Create: `src/backend/proxy/openai-to-claude.ts`
- Create: `src/backend/proxy/openai-stream-to-claude-sse.ts`
- Create: `src/backend/server/proxy-routes.ts`
- Modify: `src/backend/main.ts`
- Test: `src/backend/proxy/translation.test.ts`
- Test: `src/backend/server/proxy-routes.test.ts`

**Step 1: Write failing translation tests**

Cover text-only requests first:

```ts
expect(toOpenAIRequest(claudeRequest).messages[0]).toEqual({ role: "system", content: "..." });
expect(toClaudeResponse(openaiResponse).stop_reason).toBe("end_turn");
```

**Step 2: Implement non-stream translation**

Map Anthropic-style request and response payloads to the OpenAI chat completion payloads needed for MVP.

**Step 3: Implement streaming translation**

Convert OpenAI SSE deltas into Claude-compatible SSE event ordering for text content.

**Step 4: Wire proxy routes**

Expose:

```ts
app.post("/v1/messages", handleMessages);
app.get("/v1/models", handleModels);
app.get("/health", handleHealth);
```

**Step 5: Verify integration tests pass**

Run: `npm run test -- proxy-routes`
Expected: mocked upstream integration passes for streaming and non-streaming responses

### Task 4: Implement Managed Claude PTY Runtime

**Files:**
- Create: `src/backend/runtime/claude-pty.ts`
- Create: `src/backend/server/terminal-routes.ts`
- Modify: `src/backend/runtime/runtime-manager.ts`
- Modify: `src/backend/main.ts`
- Test: `src/backend/runtime/runtime-manager.test.ts`

**Step 1: Write failing lifecycle tests**

Assert:

- proxy start and Claude launch happen together
- launch failure rolls back the proxy
- stop tears down Claude, PTY, and proxy

**Step 2: Implement PTY-backed Claude launch**

Spawn `claude` with transient environment variables:

```ts
ANTHROPIC_BASE_URL
ANTHROPIC_AUTH_TOKEN
ANTHROPIC_MODEL
ANTHROPIC_SMALL_FAST_MODEL
```

**Step 3: Expose terminal streaming endpoint**

Add WebSocket support for PTY output and terminal input.

**Step 4: Verify runtime tests pass**

Run: `npm run test -- runtime-manager`
Expected: lifecycle rollback and shutdown behavior pass

### Task 5: Build The Frontend Operator Console

**Files:**
- Modify: `src/frontend/App.tsx`
- Create: `src/frontend/components/AuthPanel.tsx`
- Create: `src/frontend/components/RuntimePanel.tsx`
- Create: `src/frontend/components/SessionPanel.tsx`
- Create: `src/frontend/components/EventsPanel.tsx`
- Create: `src/frontend/components/TerminalPanel.tsx`
- Modify: `src/frontend/styles.css`

**Step 1: Implement the authenticated control flow**

The UI should support:

- login
- start runtime
- stop runtime
- live status display

**Step 2: Implement embedded terminal rendering**

Connect xterm to the PTY WebSocket and fit it within the app shell.

**Step 3: Apply a distinctive, production-grade control-room visual design**

Use a deliberate visual direction, not a default dashboard look.

**Step 4: Verify the frontend builds**

Run: `npm run build`
Expected: frontend and backend build successfully

### Task 6: Verify The MVP End To End

**Files:**
- Create: `src/backend/server/app.test.ts`
- Modify: `README.md`

**Step 1: Write an end-to-end smoke test with mocks**

Verify:

- login state can become authenticated
- runtime start returns running proxy and running Claude session state
- `Stop All` returns the app to a stopped state

**Step 2: Run the full test suite**

Run: `npm run test`
Expected: all tests pass

**Step 3: Run the production build**

Run: `npm run build`
Expected: production build succeeds

**Step 4: Document local usage**

Add a concise `README.md` covering install, run, test, and the no-global-config guardrail.
