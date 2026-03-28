import { createHash, randomBytes } from "node:crypto";

function toBase64Url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function generateCodeVerifier(byteLength = 32): string {
  return toBase64Url(randomBytes(byteLength));
}

export function generateCodeChallenge(verifier: string): string {
  return toBase64Url(createHash("sha256").update(verifier).digest());
}

export function generateRandomState(byteLength = 24): string {
  return toBase64Url(randomBytes(byteLength));
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = generateCodeVerifier();
  return {
    verifier,
    challenge: generateCodeChallenge(verifier),
  };
}
