import { describe, expect, it } from "vitest";
import { createAppState } from "./state.js";

describe("app state", () => {
  it("redacts sensitive values in log and error events", () => {
    const appState = createAppState();
    appState.log("info", "Authorization: Bearer abc123");
    appState.error('{"access_token":"secret-token"}');

    const events = appState.getEvents();
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "runtime.log",
      data: { message: "Authorization: Bearer [REDACTED]" },
    });
    expect(events[1]).toMatchObject({
      type: "runtime.error",
      data: { message: '{"access_token":"[REDACTED]"}' },
    });
  });
});
