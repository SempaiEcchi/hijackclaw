import { describe, expect, it } from "vitest";
import {
  createPkcePair,
  generateCodeChallenge,
  generateCodeVerifier,
  generateRandomState,
} from "./pkce.js";

describe("pkce helpers", () => {
  it("creates verifier and challenge pairs", () => {
    const { verifier, challenge } = createPkcePair();
    expect(verifier.length).toBeGreaterThan(10);
    expect(challenge).toEqual(generateCodeChallenge(verifier));
  });

  it("creates url-safe random values", () => {
    const verifier = generateCodeVerifier();
    const state = generateRandomState();
    expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(state).toMatch(/^[A-Za-z0-9\-_]+$/);
  });
});
