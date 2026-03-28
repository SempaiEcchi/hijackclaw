# OpenAI Codex Subscription Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the default API-billed OpenAI path with an `openai-codex` subscription transport while preserving the managed Claude PTY and localhost Anthropic-compatible proxy.

**Architecture:** Keep the current control server, runtime manager, and Claude-facing proxy surface, but replace the chat-completions client with a transport-neutral upstream layer backed by app-owned Codex auth/profile storage plus WebSocket-first and SSE-fallback transports.

**Tech Stack:** TypeScript, Node.js, Express, React, Vitest, ws

---

### Task 1: Introduce the new backend boundaries

**Files:**
- Create: `src/backend/upstream/types.ts`
- Modify: `src/backend/server/proxy-routes.ts`
- Modify: `src/backend/main.ts`
- Test: `src/backend/server/proxy-routes.test.ts`

**Step 1: Write the failing test**

Update the proxy route tests so they depend on an `UpstreamTransport` mock instead of `OpenAIClient`.

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/backend/server/proxy-routes.test.ts`
Expected: type or runtime failures referencing removed `OpenAIClient` assumptions.

**Step 3: Write minimal implementation**

Create `UpstreamTransport` and rewire `registerProxyRoutes()` to call `createMessage()` / `streamMessage()`.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/backend/server/proxy-routes.test.ts`
Expected: PASS

### Task 2: Add persistent auth profile storage

**Files:**
- Create: `src/backend/upstream/openai-codex-profile.ts`
- Modify: `src/backend/auth/token-store.ts`
- Modify: `src/backend/auth/auth-service.ts`
- Test: `src/backend/auth/auth-service.test.ts`
- Test: `src/backend/upstream/openai-codex-profile.test.ts`

**Step 1: Write the failing tests**

Add tests for:
- loading a stored profile into auth state
- persisting new login tokens
- persisting refreshed tokens without losing refresh state

**Step 2: Run tests to verify they fail**

Run: `npm run test -- src/backend/auth/auth-service.test.ts src/backend/upstream/openai-codex-profile.test.ts`
Expected: FAIL because no persistent profile store exists yet.

**Step 3: Write minimal implementation**

Implement an app-owned file-backed profile store and teach the auth path to update it atomically.

**Step 4: Run tests to verify they pass**

Run: `npm run test -- src/backend/auth/auth-service.test.ts src/backend/upstream/openai-codex-profile.test.ts`
Expected: PASS

### Task 3: Replace chat-completions translation with upstream translation

**Files:**
- Create: `src/backend/proxy/claude-to-upstream.ts`
- Create: `src/backend/proxy/upstream-to-claude.ts`
- Create: `src/backend/proxy/upstream-stream-to-claude-sse.ts`
- Delete: `src/backend/proxy/claude-to-openai.ts`
- Delete: `src/backend/proxy/openai-to-claude.ts`
- Delete: `src/backend/proxy/openai-stream-to-claude-sse.ts`
- Test: `src/backend/proxy/claude-to-upstream.test.ts`
- Test: `src/backend/proxy/upstream-to-claude.test.ts`
- Test: `src/backend/proxy/upstream-stream-to-claude-sse.test.ts`

**Step 1: Write the failing tests**

Cover:
- text-only Claude request normalization
- unsupported block rejection
- streamed text delta mapping
- final usage/stop mapping

**Step 2: Run tests to verify they fail**

Run: `npm run test -- src/backend/proxy/claude-to-upstream.test.ts src/backend/proxy/upstream-to-claude.test.ts src/backend/proxy/upstream-stream-to-claude-sse.test.ts`
Expected: FAIL because the new translators do not exist yet.

**Step 3: Write minimal implementation**

Implement upstream normalization around a Responses-style request and event stream.

**Step 4: Run tests to verify they pass**

Run: `npm run test -- src/backend/proxy/claude-to-upstream.test.ts src/backend/proxy/upstream-to-claude.test.ts src/backend/proxy/upstream-stream-to-claude-sse.test.ts`
Expected: PASS

### Task 4: Implement SSE transport

**Files:**
- Create: `src/backend/upstream/openai-codex-sse.ts`
- Modify: `src/backend/main.ts`
- Test: `src/backend/upstream/openai-codex-sse.test.ts`

**Step 1: Write the failing tests**

Cover:
- POST to the Codex subscription backend instead of `api.openai.com/v1/chat/completions`
- auth header injection from the stored profile
- SSE event parsing into normalized upstream events
- non-streaming request completion

**Step 2: Run tests to verify they fail**

Run: `npm run test -- src/backend/upstream/openai-codex-sse.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

Implement the HTTPS/SSE transport against the Codex subscription base URL with a small parser for responses stream events.

**Step 4: Run tests to verify they pass**

Run: `npm run test -- src/backend/upstream/openai-codex-sse.test.ts`
Expected: PASS

### Task 5: Implement WebSocket-first transport orchestration

**Files:**
- Create: `src/backend/upstream/openai-codex-ws.ts`
- Create: `src/backend/upstream/openai-codex-transport.ts`
- Modify: `src/backend/runtime/state.ts`
- Test: `src/backend/upstream/openai-codex-ws.test.ts`
- Test: `src/backend/upstream/openai-codex-transport.test.ts`

**Step 1: Write the failing tests**

Cover:
- WS request path and auth header setup
- normalized event handling from a mocked socket
- fallback to SSE on connection failure
- last transport mode recorded in app state

**Step 2: Run tests to verify they fail**

Run: `npm run test -- src/backend/upstream/openai-codex-ws.test.ts src/backend/upstream/openai-codex-transport.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

Implement a WS client, then add an orchestrator that falls back to SSE and exposes one transport interface.

**Step 4: Run tests to verify they pass**

Run: `npm run test -- src/backend/upstream/openai-codex-ws.test.ts src/backend/upstream/openai-codex-transport.test.ts`
Expected: PASS

### Task 6: Rewire runtime boot and delete the default API-billed path

**Files:**
- Modify: `src/backend/main.ts`
- Delete: `src/backend/openai/client.ts`
- Delete: `src/backend/openai/types.ts`
- Delete: `src/backend/openai/client.test.ts`
- Modify: `src/backend/runtime/runtime-manager.ts`
- Test: `src/backend/runtime/runtime-manager.test.ts`

**Step 1: Write the failing test**

Add runtime coverage proving upstream transport disposal happens on stop and failed startup rollback.

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/backend/runtime/runtime-manager.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

Wire `main.ts` to the new transport and remove the old API-billed client from the default path.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/backend/runtime/runtime-manager.test.ts`
Expected: PASS

### Task 7: Simplify the operator UI

**Files:**
- Modify: `src/frontend/App.tsx`
- Modify: `src/frontend/components/AuthPanel.tsx`
- Modify: `src/frontend/components/RuntimePanel.tsx`
- Delete: `src/frontend/components/SessionPanel.tsx`
- Modify: `src/frontend/apiClient.ts`
- Modify: `src/frontend/styles.css`
- Modify: `src/shared/api.ts`

**Step 1: Write the failing test or compile target**

Use TypeScript/build breakage as the guardrail after changing shared state and removing `SessionPanel`.

**Step 2: Run build to verify it fails**

Run: `npm run build`
Expected: type/build failures until the simplified UI is updated.

**Step 3: Write minimal implementation**

Retitle auth around ChatGPT/Codex subscription, remove verbose flow UI, and keep runtime controls + terminal intact.

**Step 4: Run build to verify it passes**

Run: `npm run build`
Expected: PASS

### Task 8: Verify the integrated pivot

**Files:**
- Modify: `README.md`
- Modify: `docs/plans/2026-03-28-openai-auth-proxy-design.md`
- Modify: `docs/plans/2026-03-28-openai-auth-proxy-mvp.md`

**Step 1: Run focused backend tests**

Run: `npm run test -- src/backend`
Expected: PASS

**Step 2: Run full test suite**

Run: `npm run test`
Expected: PASS

**Step 3: Run type/build checks**

Run: `npm run check`
Run: `npm run build`
Expected: PASS

**Step 4: Smoke-check local server behavior**

Run the app locally and verify:
- `/api/state` shows subscription auth state
- `/api/auth/login/start` emits a loopback callback URL on `127.0.0.1:1455`
- runtime start still launches Claude with only transient `ANTHROPIC_*` overrides

**Step 5: Update docs**

Refresh README and superseded plan docs so they no longer claim the default path uses `api.openai.com/v1/chat/completions`.
